/**
 * Indexing Policy Engine
 *
 * Determines which files should be indexed based on:
 * - Hardcoded deny list (security patterns - cannot be overridden)
 * - User exclude patterns from config
 * - Gitignore rules (including nested .gitignore files)
 * - Binary file detection
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
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import isBinaryPath from 'is-binary-path';
import { minimatch } from 'minimatch';
import { Config, parseFileSize } from '../storage/config.js';
import { toRelativePath, normalizePath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';

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
        if (trimmed.startsWith('!')) {
          rules.push(`!${relativeDirPath}/${trimmed.slice(1)}`);
        } else {
          rules.push(`${relativeDirPath}/${trimmed}`);
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
 * @param basePath - Project root path
 * @param currentPath - Current directory being scanned
 * @param ig - Ignore instance to add rules to
 */
async function loadNestedGitignores(
  basePath: string,
  currentPath: string,
  ig: Ignore
): Promise<void> {
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

      // Recursively scan subdirectories
      await loadNestedGitignores(basePath, subDirPath, ig);
    }
  } catch {
    // Ignore errors when scanning directories (permission issues, etc.)
  }
}

// ============================================================================
// Binary Detection
// ============================================================================

/**
 * Check if a file is a binary file based on its path/extension
 *
 * Uses the 'is-binary-path' package for extension-based detection,
 * which is faster than reading file content.
 *
 * @param filePath - Path to check (can be relative or absolute)
 * @returns true if the file is likely a binary file
 */
export function isBinaryFile(filePath: string): boolean {
  return isBinaryPath(filePath);
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
 * @param relativePath - Forward-slash separated relative path
 * @param patterns - Array of glob patterns
 * @returns true if path matches any pattern
 */
export function matchesAnyPattern(relativePath: string, patterns: readonly string[]): boolean {
  for (const pattern of patterns) {
    if (minimatch(relativePath, pattern, { dot: true })) {
      return true;
    }
    // Also check without leading ./ if present
    const normalizedPath = relativePath.startsWith('./') ? relativePath.slice(2) : relativePath;
    if (normalizedPath !== relativePath && minimatch(normalizedPath, pattern, { dot: true })) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a path is in the hardcoded deny list
 *
 * @param relativePath - Forward-slash separated relative path
 * @returns true if path matches hardcoded deny patterns
 */
export function isHardDenied(relativePath: string): boolean {
  return matchesAnyPattern(relativePath, ALL_DENY_PATTERNS);
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
 * 4. Binary Detection -> SKIP
 * 5. Size Check -> SKIP (if over limit)
 * 6. User Include -> INDEX (if matches)
 * 7. Default -> INDEX
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

  // 1. Hard Deny List (cannot be overridden)
  if (isHardDenied(relativePath)) {
    logger.debug('IndexPolicy', 'File denied by hardcoded patterns', { relativePath });
    return {
      shouldIndex: false,
      reason: 'Matches hardcoded deny pattern (security/performance)',
      category: 'hardcoded',
    };
  }

  // 2. User Exclude patterns
  if (config.exclude && config.exclude.length > 0) {
    if (matchesAnyPattern(relativePath, config.exclude)) {
      logger.debug('IndexPolicy', 'File excluded by user pattern', { relativePath });
      return {
        shouldIndex: false,
        reason: 'Matches user exclude pattern',
        category: 'user-exclude',
      };
    }
  }

  // 3. Gitignore rules
  if (config.respectGitignore && gitignore) {
    if (gitignore.ignores(relativePath)) {
      logger.debug('IndexPolicy', 'File ignored by gitignore', { relativePath });
      return {
        shouldIndex: false,
        reason: 'Matched .gitignore pattern',
        category: 'gitignore',
      };
    }
  }

  // 4. Binary detection
  if (isBinaryFile(relativePath)) {
    logger.debug('IndexPolicy', 'File skipped as binary', { relativePath });
    return {
      shouldIndex: false,
      reason: 'Binary file detected',
      category: 'binary',
    };
  }

  // 5. File size check
  const maxSizeBytes = parseFileSize(config.maxFileSize);
  const sizeResult = await checkFileSize(absolutePath, maxSizeBytes);
  if (!sizeResult.underLimit) {
    logger.debug('IndexPolicy', 'File exceeds size limit', {
      relativePath,
      actualSize: sizeResult.actualSize,
      maxSize: maxSizeBytes,
    });
    return {
      shouldIndex: false,
      reason: `File size (${formatBytes(sizeResult.actualSize)}) exceeds limit (${config.maxFileSize})`,
      category: 'size',
    };
  }

  // 6. User Include patterns (if specified, file must match)
  if (config.include && config.include.length > 0) {
    // Check if include is not just the default ['**/*']
    const isDefaultInclude =
      config.include.length === 1 && config.include[0] === '**/*';

    if (!isDefaultInclude) {
      if (!matchesAnyPattern(relativePath, config.include)) {
        logger.debug('IndexPolicy', 'File not matched by include patterns', { relativePath });
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
