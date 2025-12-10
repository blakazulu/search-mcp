/**
 * Indexing Policy Engine
 *
 * Determines which files should be indexed based on:
 * - Hardcoded deny list (security patterns - cannot be overridden)
 * - User exclude patterns from config
 * - Gitignore rules (including nested .gitignore files)
 * - Binary file detection (extension + content-based)
 * - File size limits
 * - User include patterns from config
 *
 * Priority order (first match wins):
 * 1. Hard Deny List     -> If matches -> SKIP (always)
 * 2. User Exclude       -> If matches config.exclude -> SKIP
 * 3. Gitignore          -> If config.respectGitignore && matches -> SKIP
 * 4. Binary Detection   -> If is binary file -> SKIP
 * 5. Size Check         -> If > config.maxFileSize -> SKIP
 * 6. User Include       -> If matches config.include -> INDEX
 * 7. Default            -> INDEX
 *
 * Security features:
 * - Case-insensitive matching on Windows for deny list
 * - Content-based binary detection for unknown extensions
 * - Unicode path normalization to prevent bypass attacks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import isBinaryPath from 'is-binary-path';
import { minimatch } from 'minimatch';
import { Config, parseFileSize } from '../storage/config.js';
import { toRelativePath, normalizePath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { MAX_DIRECTORY_DEPTH } from '../utils/limits.js';

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Whether the filesystem is case-insensitive (Windows)
 */
export const IS_CASE_INSENSITIVE_FS = process.platform === 'win32';

// ============================================================================
// Unicode Path Normalization (Security)
// ============================================================================

/**
 * Normalize Unicode characters in a path for security
 *
 * This function prevents Unicode-based bypass attacks by:
 * - Normalizing to NFC form for consistent comparison
 * - Removing zero-width characters that could be used to hide content
 * - Removing RTL override characters that could disguise filenames
 *
 * @param p - The path to normalize
 * @returns Normalized path with dangerous Unicode sequences removed
 *
 * @example
 * ```typescript
 * // Remove zero-width characters
 * normalizePathUnicode('file\u200B.env') // => 'file.env'
 *
 * // Remove RTL overrides (could disguise "txt.exe" as "exe.txt")
 * normalizePathUnicode('\u202Efile.txt') // => 'file.txt'
 * ```
 */
export function normalizePathUnicode(p: string): string {
  const logger = getLogger();
  const original = p;

  // Normalize to NFC form (composed characters)
  let normalized = p.normalize('NFC');

  // Remove zero-width characters that could be used to hide content
  // U+200B Zero Width Space
  // U+200C Zero Width Non-Joiner
  // U+200D Zero Width Joiner
  // U+FEFF Zero Width No-Break Space (BOM)
  const zeroWidthPattern = /[\u200B-\u200D\uFEFF]/g;
  normalized = normalized.replace(zeroWidthPattern, '');

  // Remove RTL/LTR override characters that could disguise filenames
  // U+202A Left-to-Right Embedding
  // U+202B Right-to-Left Embedding
  // U+202C Pop Directional Formatting
  // U+202D Left-to-Right Override
  // U+202E Right-to-Left Override
  const rtlPattern = /[\u202A-\u202E]/g;
  normalized = normalized.replace(rtlPattern, '');

  // Log if Unicode tricks were detected (security monitoring)
  if (normalized !== original) {
    logger.warn('IndexPolicy', 'Unicode bypass attempt detected in path', {
      original: JSON.stringify(original),
      normalized: JSON.stringify(normalized),
    });
  }

  return normalized;
}

// Import the CommonJS 'ignore' module using createRequire
const require = createRequire(import.meta.url);
const ignoreFactory = require('ignore') as () => Ignore;

/**
 * Ignore interface from the 'ignore' package
 */
export interface Ignore {
  add(patterns: string | readonly string[]): Ignore;
  filter(pathnames: readonly string[]): string[];
  createFilter(): (pathname: string) => boolean;
  ignores(pathname: string): boolean;
  test(pathname: string): { ignored: boolean; unignored: boolean };
}

// ============================================================================
// Hardcoded Deny List (Cannot be overridden)
// ============================================================================

/**
 * Hardcoded deny patterns organized by category
 *
 * These patterns are ALWAYS excluded for security and performance reasons.
 * They cannot be overridden by user configuration.
 */
export const HARDCODED_DENY_PATTERNS = {
  /** Package manager dependencies */
  dependencies: [
    'node_modules/**',
    'jspm_packages/**',
    'bower_components/**',
    'vendor/**',
    '.venv/**',
    'venv/**',
  ],
  /** Version control system directories */
  versionControl: [
    '.git/**',
    '.hg/**',
    '.svn/**',
  ],
  /** Build output directories */
  buildArtifacts: [
    'dist/**',
    'build/**',
    'out/**',
    'target/**',
    '__pycache__/**',
    '.next/**',
    '.nuxt/**',
  ],
  /** Sensitive files that should never be indexed */
  secrets: [
    '.env',
    '.env.*',
    '*.pem',
    '*.key',
    '*.p12',
    '*.pfx',
  ],
  /** Log files and lock files */
  logsAndLocks: [
    '*.log',
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Gemfile.lock',
    'poetry.lock',
  ],
  /** IDE and editor configuration */
  ideConfig: [
    '.idea/**',
    '.vscode/**',
    '.DS_Store',
    '*.swp',
    '*.swo',
  ],
  /** Test coverage and cache directories */
  testing: [
    'coverage/**',
    '.nyc_output/**',
    '.pytest_cache/**',
  ],
} as const;

/**
 * Flattened list of all hardcoded deny patterns
 */
export const ALL_DENY_PATTERNS: readonly string[] = Object.values(HARDCODED_DENY_PATTERNS).flat();

// ============================================================================
// Policy Result Interface
// ============================================================================

/**
 * Result of a policy check
 */
export interface PolicyResult {
  /** Whether the file should be indexed */
  shouldIndex: boolean;
  /** Reason for exclusion (only set when shouldIndex is false) */
  reason?: string;
  /** Category of exclusion for debugging */
  category?: 'hardcoded' | 'user-exclude' | 'gitignore' | 'binary' | 'size' | 'include-mismatch';
}

// ============================================================================
// Gitignore Loading
// ============================================================================

/**
 * Load gitignore rules from a project directory
 *
 * Loads the root .gitignore and any nested .gitignore files.
 * Rules are applied relative to their containing directory.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Ignore instance with all gitignore rules loaded
 */
export async function loadGitignore(projectPath: string): Promise<Ignore> {
  const logger = getLogger();
  const ig = ignoreFactory();

  // Load root .gitignore
  const rootGitignore = path.join(projectPath, '.gitignore');
  await loadGitignoreFile(ig, rootGitignore, '');

  // Find and load nested .gitignore files
  await loadNestedGitignores(projectPath, projectPath, ig);

  logger.debug('IndexPolicy', 'Loaded gitignore rules', { projectPath });

  return ig;
}

/**
 * Load a single .gitignore file into an Ignore instance
 *
 * SECURITY FIX: Properly prefix nested gitignore patterns for recursive matching.
 * Without this fix, a pattern like `*.key` in `secrets/.gitignore` would only match
 * files directly in `secrets/`, not in `secrets/subdir/`. The fix ensures patterns
 * match at all depths within the gitignore's directory.
 *
 * @param ig - Ignore instance to add rules to
 * @param filePath - Absolute path to the .gitignore file
 * @param relativeDirPath - Relative directory path for rule prefixing
 */
async function loadGitignoreFile(
  ig: Ignore,
  filePath: string,
  relativeDirPath: string
): Promise<void> {
  const logger = getLogger();

  try {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Process each line and prefix with relative directory if needed
    const rules: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Prefix rules with relative directory path for nested gitignores
      if (relativeDirPath) {
        // Handle negation patterns
        const isNegation = trimmed.startsWith('!');
        const pattern = isNegation ? trimmed.slice(1) : trimmed;

        // SECURITY FIX: For patterns that don't already have recursive matching,
        // add both the direct pattern and a recursive variant.
        // This ensures `secrets/*.key` matches both `secrets/api.key` and `secrets/deep/api.key`
        //
        // Patterns that already have ** or start with / don't need modification
        const alreadyRecursive = pattern.includes('**') || pattern.startsWith('/');
        const prefix = isNegation ? '!' : '';

        if (alreadyRecursive || pattern.startsWith('/')) {
          // For patterns starting with /, they're anchored to their gitignore's location
          const cleanPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;
          rules.push(`${prefix}${relativeDirPath}/${cleanPattern}`);
        } else {
          // For non-recursive patterns, add both:
          // 1. Direct match: `subdir/*.key` for files in subdir/
          // 2. Recursive match: `subdir/**/*.key` for files in subdir/deep/
          rules.push(`${prefix}${relativeDirPath}/${pattern}`);
          // Only add recursive variant if it makes sense (has wildcards or is a filename pattern)
          if (!pattern.endsWith('/')) {
            rules.push(`${prefix}${relativeDirPath}/**/${pattern}`);
          }
        }
      } else {
        rules.push(trimmed);
      }
    }

    if (rules.length > 0) {
      ig.add(rules);
      logger.debug('IndexPolicy', 'Loaded gitignore file', {
        filePath,
        ruleCount: rules.length,
      });
    }
  } catch (error) {
    // Log but don't fail - gitignore loading is best effort
    logger.debug('IndexPolicy', 'Failed to load gitignore file', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Recursively find and load nested .gitignore files
 *
 * DoS Protection:
 * - Limits recursion depth to MAX_DIRECTORY_DEPTH to prevent stack overflow
 * - Logs warning when approaching depth limit
 *
 * @param basePath - Project root path
 * @param currentPath - Current directory being scanned
 * @param ig - Ignore instance to add rules to
 * @param depth - Current recursion depth (default: 0)
 * @param maxDepth - Maximum allowed depth (default: MAX_DIRECTORY_DEPTH)
 */
async function loadNestedGitignores(
  basePath: string,
  currentPath: string,
  ig: Ignore,
  depth: number = 0,
  maxDepth: number = MAX_DIRECTORY_DEPTH
): Promise<void> {
  const logger = getLogger();

  // DoS Protection: Check depth limit
  if (depth >= maxDepth) {
    logger.warn('IndexPolicy', 'Maximum directory depth reached for gitignore loading', {
      currentPath,
      depth,
      maxDepth,
    });
    return;
  }

  // Warn when approaching limit (at 80% of max depth)
  const warningDepth = Math.floor(maxDepth * 0.8);
  if (depth === warningDepth) {
    logger.debug('IndexPolicy', 'Approaching maximum directory depth for gitignore loading', {
      currentPath,
      depth,
      maxDepth,
    });
  }

  try {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      // Skip directories that are in the hardcoded deny list
      const dirName = entry.name;
      if (
        dirName === 'node_modules' ||
        dirName === '.git' ||
        dirName === 'dist' ||
        dirName === 'build' ||
        dirName === '.venv' ||
        dirName === 'venv' ||
        dirName === 'vendor' ||
        dirName === '.next' ||
        dirName === '.nuxt' ||
        dirName === '__pycache__' ||
        dirName === 'coverage' ||
        dirName === '.idea' ||
        dirName === '.vscode'
      ) {
        continue;
      }

      const subDirPath = path.join(currentPath, dirName);
      const relativeDirPath = toRelativePath(subDirPath, basePath);

      // Check for .gitignore in this subdirectory
      const gitignorePath = path.join(subDirPath, '.gitignore');
      await loadGitignoreFile(ig, gitignorePath, relativeDirPath);

      // Recursively scan subdirectories with incremented depth
      await loadNestedGitignores(basePath, subDirPath, ig, depth + 1, maxDepth);
    }
  } catch {
    // Ignore errors when scanning directories (permission issues, etc.)
  }
}

// ============================================================================
// Binary Detection
// ============================================================================

/**
 * Known text file extensions that should not be considered binary
 * even if content detection might flag them
 */
const KNOWN_TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'yaml', 'yml', 'toml', 'xml',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'md', 'markdown', 'txt', 'rst', 'adoc',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'scala',
  'c', 'cpp', 'h', 'hpp', 'cs', 'fs',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'sql', 'graphql', 'prisma',
  'vue', 'svelte', 'astro',
  'env', 'gitignore', 'dockerignore', 'editorconfig',
  'eslintrc', 'prettierrc', 'babelrc',
  'lock', 'log',
]);

/**
 * Check if a file extension is known to be a text file
 */
function isKnownTextExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().slice(1); // Remove the dot
  if (KNOWN_TEXT_EXTENSIONS.has(ext)) {
    return true;
  }
  // Also check for dotfiles like .gitignore, .env
  const basename = path.basename(filePath);
  if (basename.startsWith('.') && !basename.includes('.', 1)) {
    // Dotfiles without extension (like .gitignore)
    const name = basename.slice(1).toLowerCase();
    return KNOWN_TEXT_EXTENSIONS.has(name);
  }
  return false;
}

/**
 * Check if a file is a binary file based on its path/extension
 *
 * Uses the 'is-binary-path' package for extension-based detection,
 * which is faster than reading file content.
 *
 * @param filePath - Path to check (can be relative or absolute)
 * @returns true if the file is likely a binary file based on extension
 */
export function isBinaryFile(filePath: string): boolean {
  // If it's a known text extension, it's not binary
  if (isKnownTextExtension(filePath)) {
    return false;
  }
  return isBinaryPath(filePath);
}

/**
 * Check if a file contains binary content by reading its first bytes
 *
 * SECURITY: This provides defense-in-depth against renamed binary files.
 * For example, a malicious .exe renamed to .txt would be detected.
 *
 * @param absolutePath - Absolute path to the file
 * @param maxBytesToCheck - Maximum bytes to read (default: 8192)
 * @returns true if the file contains binary content (null bytes)
 */
export async function isBinaryContent(
  absolutePath: string,
  maxBytesToCheck: number = 8192
): Promise<boolean> {
  const logger = getLogger();

  try {
    // Open file and read first N bytes
    const fd = await fs.promises.open(absolutePath, 'r');
    try {
      const buffer = Buffer.alloc(maxBytesToCheck);
      const { bytesRead } = await fd.read(buffer, 0, maxBytesToCheck, 0);

      if (bytesRead === 0) {
        return false; // Empty file is not binary
      }

      // Check for null bytes in the read portion
      // Null bytes are a strong indicator of binary content
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          logger.debug('IndexPolicy', 'Binary content detected via null byte', {
            absolutePath,
            nullBytePosition: i,
          });
          return true;
        }
      }

      return false;
    } finally {
      await fd.close();
    }
  } catch (error) {
    // If we can't read the file, assume it's not binary
    // (will fail at indexing time anyway)
    logger.debug('IndexPolicy', 'Could not check binary content', {
      absolutePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Comprehensive binary file check using both extension and content detection
 *
 * SECURITY: Uses a two-phase approach:
 * 1. Fast extension-based check for known binary/text extensions
 * 2. Content-based check for unknown extensions to detect renamed binaries
 *
 * @param filePath - Relative path for extension check
 * @param absolutePath - Absolute path for content check
 * @returns true if the file is binary (either by extension or content)
 */
export async function isBinaryFileOrContent(
  filePath: string,
  absolutePath: string
): Promise<boolean> {
  // Phase 1: Fast extension-based check
  if (isKnownTextExtension(filePath)) {
    return false; // Known text extension, skip content check
  }

  if (isBinaryPath(filePath)) {
    return true; // Known binary extension
  }

  // Phase 2: For unknown extensions, check content
  // This catches renamed binaries (e.g., .exe -> .txt)
  return isBinaryContent(absolutePath);
}

// ============================================================================
// File Size Check
// ============================================================================

/**
 * Check if a file is under the size limit
 *
 * @param absolutePath - Absolute path to the file
 * @param maxSizeBytes - Maximum file size in bytes
 * @returns true if file is under the limit, false otherwise
 */
export async function checkFileSize(
  absolutePath: string,
  maxSizeBytes: number
): Promise<{ underLimit: boolean; actualSize: number }> {
  try {
    const stats = await fs.promises.stat(absolutePath);
    return {
      underLimit: stats.size <= maxSizeBytes,
      actualSize: stats.size,
    };
  } catch {
    // If we can't stat the file, assume it's under limit
    // (will fail at read time anyway)
    return { underLimit: true, actualSize: 0 };
  }
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if a path matches any pattern in a list
 *
 * SECURITY: Applies Unicode normalization before matching to prevent bypass attacks.
 *
 * @param relativePath - Forward-slash separated relative path
 * @param patterns - Array of glob patterns
 * @param caseInsensitive - Whether to match case-insensitively (default: false)
 * @returns true if path matches any pattern
 */
export function matchesAnyPattern(
  relativePath: string,
  patterns: readonly string[],
  caseInsensitive: boolean = false
): boolean {
  // SECURITY: Apply Unicode normalization to prevent bypass attacks
  const normalizedPath = normalizePathUnicode(relativePath);

  const matchOptions = { dot: true, nocase: caseInsensitive };

  for (const pattern of patterns) {
    if (minimatch(normalizedPath, pattern, matchOptions)) {
      return true;
    }
    // Also check without leading ./ if present
    const withoutPrefix = normalizedPath.startsWith('./') ? normalizedPath.slice(2) : normalizedPath;
    if (withoutPrefix !== normalizedPath && minimatch(withoutPrefix, pattern, matchOptions)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a path is in the hardcoded deny list
 *
 * SECURITY: Uses case-insensitive matching on Windows to prevent bypasses like .ENV or .Env
 *
 * @param relativePath - Forward-slash separated relative path
 * @returns true if path matches hardcoded deny patterns
 */
export function isHardDenied(relativePath: string): boolean {
  // SECURITY: Use case-insensitive matching on Windows to prevent bypasses
  return matchesAnyPattern(relativePath, ALL_DENY_PATTERNS, IS_CASE_INSENSITIVE_FS);
}

// ============================================================================
// Core Policy Function
// ============================================================================

/**
 * Determine if a file should be indexed
 *
 * Applies the policy rules in priority order:
 * 1. Hard Deny List -> SKIP (always)
 * 2. User Exclude -> SKIP
 * 3. Gitignore -> SKIP (if respectGitignore)
 * 4. Binary Detection -> SKIP (extension + content-based)
 * 5. Size Check -> SKIP (if over limit)
 * 6. User Include -> INDEX (if matches)
 * 7. Default -> INDEX
 *
 * SECURITY: All path checks apply Unicode normalization to prevent bypass attacks.
 *
 * @param relativePath - Forward-slash separated relative path from project root
 * @param absolutePath - Absolute path to the file
 * @param config - Project configuration
 * @param gitignore - Ignore instance with gitignore rules (or null to skip)
 * @returns PolicyResult indicating whether to index and why
 */
export async function shouldIndex(
  relativePath: string,
  absolutePath: string,
  config: Config,
  gitignore: Ignore | null
): Promise<PolicyResult> {
  const logger = getLogger();

  // SECURITY: Apply Unicode normalization to prevent bypass attacks
  const normalizedRelativePath = normalizePathUnicode(relativePath);

  // 1. Hard Deny List (cannot be overridden)
  // Note: isHardDenied already applies Unicode normalization internally
  if (isHardDenied(normalizedRelativePath)) {
    logger.debug('IndexPolicy', 'File denied by hardcoded patterns', { relativePath: normalizedRelativePath });
    return {
      shouldIndex: false,
      reason: 'Matches hardcoded deny pattern (security/performance)',
      category: 'hardcoded',
    };
  }

  // 2. User Exclude patterns
  if (config.exclude && config.exclude.length > 0) {
    if (matchesAnyPattern(normalizedRelativePath, config.exclude)) {
      logger.debug('IndexPolicy', 'File excluded by user pattern', { relativePath: normalizedRelativePath });
      return {
        shouldIndex: false,
        reason: 'Matches user exclude pattern',
        category: 'user-exclude',
      };
    }
  }

  // 3. Gitignore rules
  if (config.respectGitignore && gitignore) {
    if (gitignore.ignores(normalizedRelativePath)) {
      logger.debug('IndexPolicy', 'File ignored by gitignore', { relativePath: normalizedRelativePath });
      return {
        shouldIndex: false,
        reason: 'Matched .gitignore pattern',
        category: 'gitignore',
      };
    }
  }

  // 4. Binary detection (extension-based fast check)
  if (isBinaryFile(normalizedRelativePath)) {
    logger.debug('IndexPolicy', 'File skipped as binary (extension)', { relativePath: normalizedRelativePath });
    return {
      shouldIndex: false,
      reason: 'Binary file detected (by extension)',
      category: 'binary',
    };
  }

  // 5. File size check
  const maxSizeBytes = parseFileSize(config.maxFileSize);
  const sizeResult = await checkFileSize(absolutePath, maxSizeBytes);
  if (!sizeResult.underLimit) {
    logger.debug('IndexPolicy', 'File exceeds size limit', {
      relativePath: normalizedRelativePath,
      actualSize: sizeResult.actualSize,
      maxSize: maxSizeBytes,
    });
    return {
      shouldIndex: false,
      reason: `File size (${formatBytes(sizeResult.actualSize)}) exceeds limit (${config.maxFileSize})`,
      category: 'size',
    };
  }

  // 5b. Content-based binary detection for unknown extensions
  // This catches renamed binaries (e.g., .exe renamed to .unknown)
  // Only run for files that passed extension check but have unknown extensions
  if (!isKnownTextExtension(normalizedRelativePath)) {
    const isBinary = await isBinaryContent(absolutePath);
    if (isBinary) {
      logger.debug('IndexPolicy', 'File skipped as binary (content)', { relativePath: normalizedRelativePath });
      return {
        shouldIndex: false,
        reason: 'Binary file detected (by content)',
        category: 'binary',
      };
    }
  }

  // 6. User Include patterns (if specified, file must match)
  if (config.include && config.include.length > 0) {
    // Check if include is not just the default ['**/*']
    const isDefaultInclude =
      config.include.length === 1 && config.include[0] === '**/*';

    if (!isDefaultInclude) {
      if (!matchesAnyPattern(normalizedRelativePath, config.include)) {
        logger.debug('IndexPolicy', 'File not matched by include patterns', { relativePath: normalizedRelativePath });
        return {
          shouldIndex: false,
          reason: 'Does not match include patterns',
          category: 'include-mismatch',
        };
      }
    }
  }

  // 7. Default: INDEX
  return { shouldIndex: true };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ============================================================================
// IndexingPolicy Class
// ============================================================================

/**
 * Indexing Policy Manager
 *
 * Provides a convenient interface for checking indexing policy.
 * Handles gitignore loading and caching.
 *
 * @example
 * ```typescript
 * const policy = new IndexingPolicy('/path/to/project', config);
 * await policy.initialize();
 *
 * const result = await policy.shouldIndex('src/utils/hash.ts', '/path/to/project/src/utils/hash.ts');
 * if (!result.shouldIndex) {
 *   console.log('Skipping:', result.reason);
 * }
 * ```
 */
export class IndexingPolicy {
  private readonly projectPath: string;
  private readonly config: Config;
  private gitignore: Ignore | null = null;
  private initialized = false;

  /**
   * Create a new IndexingPolicy instance
   *
   * @param projectPath - Absolute path to the project root
   * @param config - Project configuration
   */
  constructor(projectPath: string, config: Config) {
    this.projectPath = normalizePath(projectPath);
    this.config = config;
  }

  /**
   * Initialize the policy engine
   *
   * Loads gitignore rules if respectGitignore is enabled.
   * Must be called before using shouldIndex.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.respectGitignore) {
      this.gitignore = await loadGitignore(this.projectPath);
    }

    this.initialized = true;
  }

  /**
   * Check if a file should be indexed
   *
   * @param relativePath - Forward-slash separated relative path
   * @param absolutePath - Absolute path to the file
   * @returns PolicyResult
   */
  async shouldIndex(relativePath: string, absolutePath: string): Promise<PolicyResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    return shouldIndex(relativePath, absolutePath, this.config, this.gitignore);
  }

  /**
   * Check if a path is in the hardcoded deny list
   *
   * This is a synchronous check that doesn't require initialization.
   *
   * @param relativePath - Forward-slash separated relative path
   * @returns true if path matches hardcoded deny patterns
   */
  isHardDenied(relativePath: string): boolean {
    return isHardDenied(relativePath);
  }

  /**
   * Get the project path
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Get the configuration
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Check if the policy has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reload gitignore rules
   *
   * Useful when gitignore files have changed.
   */
  async reloadGitignore(): Promise<void> {
    if (this.config.respectGitignore) {
      this.gitignore = await loadGitignore(this.projectPath);
    }
  }
}
