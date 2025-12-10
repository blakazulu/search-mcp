/**
 * Path Utilities Module
 *
 * Provides cross-platform path manipulation utilities for:
 * - Path normalization (absolute paths, separator normalization)
 * - Relative path conversion (always forward-slash separated)
 * - Path traversal prevention (security)
 * - Index storage path helpers
 * - Path length validation (Windows MAX_PATH)
 * - Unicode normalization (NFC)
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { hashProjectPath, hashProjectPathLegacy } from './hash.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum path length for Windows (traditional MAX_PATH limit)
 * Note: Long path support exists but is not universally enabled
 */
export const MAX_PATH_LENGTH_WINDOWS = 260;

/**
 * Maximum path length for Unix-like systems (PATH_MAX)
 */
export const MAX_PATH_LENGTH_UNIX = 4096;

// ============================================================================
// Path Normalization
// ============================================================================

/**
 * Normalize a path to absolute form with consistent separators
 *
 * - Resolves to absolute path
 * - Normalizes separators (removes redundant separators)
 * - Removes trailing slashes (except for root paths)
 *
 * @param inputPath - The path to normalize
 * @returns Normalized absolute path using platform-native separators
 *
 * @example
 * ```typescript
 * normalizePath('./src/utils')
 * // => '/Users/dev/project/src/utils' (Unix)
 * // => 'C:\\Users\\dev\\project\\src\\utils' (Windows)
 *
 * normalizePath('C:\\Users\\dev\\project\\')
 * // => 'C:\\Users\\dev\\project' (trailing slash removed)
 * ```
 */
export function normalizePath(inputPath: string): string {
  // Resolve to absolute path (handles ., .., relative paths)
  let normalized = path.resolve(inputPath);

  // Normalize the path (handles redundant separators)
  normalized = path.normalize(normalized);

  // Remove trailing separator (except for root paths like '/' or 'C:\')
  if (normalized.length > 1 && normalized.endsWith(path.sep)) {
    normalized = normalized.slice(0, -1);
  }

  // Handle Windows drive root case (e.g., 'C:' -> 'C:\')
  if (process.platform === 'win32' && /^[A-Za-z]:$/.test(normalized)) {
    normalized = normalized + path.sep;
  }

  return normalized;
}

/**
 * Normalize Unicode characters in a path to NFC form
 *
 * Different operating systems may use different Unicode normalization forms:
 * - macOS uses NFD (decomposed)
 * - Windows and Linux typically use NFC (composed)
 *
 * This function normalizes paths to NFC for consistent comparison and storage.
 *
 * @param filePath - The path to normalize
 * @returns Path with Unicode characters normalized to NFC form
 *
 * @example
 * ```typescript
 * // The character 'e' can be represented as:
 * // - NFC: 'e' (single code point U+00E9)
 * // - NFD: 'e' + combining acute accent (U+0065 + U+0301)
 * normalizeUnicode('cafe\u0301') // => 'cafe' (with composed e)
 * ```
 */
export function normalizeUnicode(filePath: string): string {
  // Normalize to NFC form for consistent comparison
  return filePath.normalize('NFC');
}

/**
 * Validate that a path length is within acceptable limits
 *
 * Windows traditionally has a MAX_PATH limit of 260 characters.
 * Unix-like systems typically allow up to 4096 characters.
 *
 * @param absolutePath - The absolute path to validate
 * @returns true if the path length is acceptable
 *
 * @example
 * ```typescript
 * validatePathLength('/home/user/project/file.ts') // => true
 * validatePathLength('C:\\very\\long\\path...') // => depends on length
 * ```
 */
export function validatePathLength(absolutePath: string): boolean {
  const maxLength = process.platform === 'win32'
    ? MAX_PATH_LENGTH_WINDOWS
    : MAX_PATH_LENGTH_UNIX;

  return absolutePath.length <= maxLength;
}

/**
 * Check if a path is too long for the current platform
 *
 * Returns detailed information about path length issues.
 *
 * @param absolutePath - The absolute path to check
 * @returns Object with validation result and details
 */
export function checkPathLength(absolutePath: string): {
  valid: boolean;
  length: number;
  maxLength: number;
  exceededBy: number;
} {
  const maxLength = process.platform === 'win32'
    ? MAX_PATH_LENGTH_WINDOWS
    : MAX_PATH_LENGTH_UNIX;

  const length = absolutePath.length;
  const valid = length <= maxLength;

  return {
    valid,
    length,
    maxLength,
    exceededBy: valid ? 0 : length - maxLength,
  };
}

/**
 * Convert an absolute path to a relative path with forward slashes
 *
 * Returns a relative path from basePath to absolutePath, always using
 * forward slashes for consistency across platforms (for storage in indexes).
 *
 * @param absolutePath - The absolute path to convert
 * @param basePath - The base path to make relative to
 * @returns Forward-slash separated relative path
 *
 * @example
 * ```typescript
 * toRelativePath('/Users/dev/project/src/utils/hash.ts', '/Users/dev/project')
 * // => 'src/utils/hash.ts'
 *
 * toRelativePath('C:\\Users\\dev\\project\\src\\utils\\hash.ts', 'C:\\Users\\dev\\project')
 * // => 'src/utils/hash.ts'
 * ```
 */
export function toRelativePath(absolutePath: string, basePath: string): string {
  // Normalize both paths first
  const normalizedAbsolute = normalizePath(absolutePath);
  const normalizedBase = normalizePath(basePath);

  // Get relative path using Node's path.relative
  const relativePath = path.relative(normalizedBase, normalizedAbsolute);

  // Convert backslashes to forward slashes for cross-platform consistency
  return relativePath.replace(/\\/g, '/');
}

/**
 * Convert a relative path (with forward slashes) to an absolute path
 *
 * @param relativePath - Forward-slash separated relative path
 * @param basePath - The base path to resolve from
 * @returns Absolute path using platform-native separators
 *
 * @example
 * ```typescript
 * toAbsolutePath('src/utils/hash.ts', '/Users/dev/project')
 * // => '/Users/dev/project/src/utils/hash.ts'
 * ```
 */
export function toAbsolutePath(relativePath: string, basePath: string): string {
  // Convert forward slashes to platform-native separators
  const platformRelative = relativePath.replace(/\//g, path.sep);
  return path.join(normalizePath(basePath), platformRelative);
}

// ============================================================================
// Security Functions
// ============================================================================

/**
 * Check if a relative path contains path traversal patterns
 *
 * Detects attempts to escape the base directory using:
 * - Parent directory references (..)
 * - Absolute paths in relative context
 * - Various encoding tricks
 *
 * @param relativePath - The relative path to check
 * @returns true if path traversal is detected
 *
 * @example
 * ```typescript
 * isPathTraversal('../../../etc/passwd')  // => true
 * isPathTraversal('src/../config.ts')      // => true (contains ..)
 * isPathTraversal('/etc/passwd')           // => true (absolute path)
 * isPathTraversal('src/utils/hash.ts')     // => false
 * ```
 */
export function isPathTraversal(relativePath: string): boolean {
  // Normalize separators to forward slashes for consistent checking
  const normalized = relativePath.replace(/\\/g, '/');

  // Check for absolute paths (Unix or Windows)
  if (path.isAbsolute(relativePath)) {
    return true;
  }

  // Check for Windows drive letters in relative paths
  if (/^[A-Za-z]:/.test(normalized)) {
    return true;
  }

  // Check for parent directory references
  // Split by forward slash and check each segment
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      return true;
    }
  }

  // Check for null bytes (common in path injection attacks)
  if (relativePath.includes('\0')) {
    return true;
  }

  return false;
}

/**
 * Safely join a base path with a relative path
 *
 * Joins the paths and validates that the result stays within the base directory.
 * Returns null if path traversal is detected.
 *
 * SECURITY: This function rejects ALL paths containing:
 * - Parent directory references (..)
 * - Absolute paths
 * - Null bytes (poison null byte attack)
 * - Paths that would escape the base directory
 *
 * @param basePath - The base directory path
 * @param relativePath - The relative path to join
 * @returns The joined absolute path, or null if traversal detected
 *
 * @example
 * ```typescript
 * safeJoin('/project', 'src/utils/hash.ts')
 * // => '/project/src/utils/hash.ts'
 *
 * safeJoin('/project', '../../../etc/passwd')
 * // => null (traversal detected)
 *
 * safeJoin('/project', 'src/../config.ts')
 * // => null (contains .., always rejected for security)
 * ```
 */
export function safeJoin(basePath: string, relativePath: string): string | null {
  // SECURITY: Reject any path containing .. components
  // This is a strict policy to prevent path traversal attacks
  // Even paths that would resolve within base are rejected
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.includes('..')) {
    return null;
  }

  // Reject absolute paths
  if (path.isAbsolute(relativePath)) {
    return null;
  }

  // Reject Windows drive letters in relative paths
  if (/^[A-Za-z]:/.test(normalized)) {
    return null;
  }

  // Reject null bytes (poison null byte attack)
  if (relativePath.includes('\0')) {
    return null;
  }

  // Apply Unicode normalization for consistent handling
  const normalizedPath = normalizeUnicode(relativePath);

  // Convert forward slashes to platform separators and join
  const platformRelative = normalizedPath.replace(/\//g, path.sep);
  const normalizedBase = normalizePath(basePath);
  const joined = path.resolve(normalizedBase, platformRelative);
  const normalizedJoined = normalizePath(joined);

  // Final safety check: ensure result is within base
  if (!isWithinDirectory(normalizedJoined, normalizedBase)) {
    return null;
  }

  return normalizedJoined;
}

/**
 * Check if a path is within a directory
 *
 * @param targetPath - The path to check
 * @param directoryPath - The directory that should contain the target
 * @returns true if targetPath is within directoryPath
 */
export function isWithinDirectory(targetPath: string, directoryPath: string): boolean {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedDir = normalizePath(directoryPath);

  // On Windows, compare case-insensitively
  if (process.platform === 'win32') {
    const lowerTarget = normalizedTarget.toLowerCase();
    const lowerDir = normalizedDir.toLowerCase();
    return lowerTarget === lowerDir || lowerTarget.startsWith(lowerDir + path.sep);
  }

  return normalizedTarget === normalizedDir || normalizedTarget.startsWith(normalizedDir + path.sep);
}

// ============================================================================
// Storage Path Helpers
// ============================================================================

/** Base storage directory under home: ~/.mcp/search/ */
const STORAGE_BASE = '.mcp/search';

/** Indexes subdirectory */
const INDEXES_DIR = 'indexes';

/**
 * Get the global storage root directory
 *
 * Returns ~/.mcp/search/ and creates it if it doesn't exist.
 *
 * @returns Absolute path to the storage root directory
 *
 * @example
 * ```typescript
 * getStorageRoot()
 * // => '/Users/dev/.mcp/search' (Unix)
 * // => 'C:\\Users\\dev\\.mcp\\search' (Windows)
 * ```
 */
export function getStorageRoot(): string {
  const homeDir = os.homedir();
  const storageRoot = path.join(homeDir, STORAGE_BASE);

  // Create directory if it doesn't exist
  if (!fs.existsSync(storageRoot)) {
    fs.mkdirSync(storageRoot, { recursive: true });
  }

  return storageRoot;
}

/**
 * Get the index storage path for a project
 *
 * Returns ~/.mcp/search/indexes/<hash>/ where hash is derived from the project path.
 * Creates the directory if it doesn't exist.
 *
 * SMCP-057: Migration support - checks for existing legacy (16-char) index first.
 * If a legacy index exists, returns that path to avoid breaking existing installations.
 * New indexes are created with 32-char hashes.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Absolute path to the project's index directory
 *
 * @example
 * ```typescript
 * getIndexPath('/Users/dev/my-project')
 * // => '/Users/dev/.mcp/search/indexes/a1b2c3d4e5f6789012345678901234ab' (32 chars)
 * // or '/Users/dev/.mcp/search/indexes/a1b2c3d4e5f67890' (16 chars for legacy)
 * ```
 */
export function getIndexPath(projectPath: string): string {
  const storageRoot = getStorageRoot();

  // SMCP-057: Check for legacy (16-char) index first for backward compatibility
  const legacyHash = hashProjectPathLegacy(projectPath);
  const legacyIndexPath = path.join(storageRoot, INDEXES_DIR, legacyHash);

  // If legacy index exists, use it (migration support)
  if (fs.existsSync(legacyIndexPath)) {
    return legacyIndexPath;
  }

  // Use new 32-char hash for new indexes
  const hash = hashProjectPath(projectPath);
  const indexPath = path.join(storageRoot, INDEXES_DIR, hash);

  // Create directory if it doesn't exist
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(indexPath, { recursive: true });
  }

  return indexPath;
}

/**
 * SMCP-057: Check if an index exists for a project (checking both old and new hash formats)
 *
 * @param projectPath - Absolute path to the project root
 * @returns true if an index exists (either legacy or new format)
 */
export function indexPathExists(projectPath: string): boolean {
  const storageRoot = getStorageRoot();
  const indexesDir = path.join(storageRoot, INDEXES_DIR);

  // Check legacy 16-char hash
  const legacyHash = hashProjectPathLegacy(projectPath);
  const legacyIndexPath = path.join(indexesDir, legacyHash);
  if (fs.existsSync(legacyIndexPath)) {
    return true;
  }

  // Check new 32-char hash
  const newHash = hashProjectPath(projectPath);
  const newIndexPath = path.join(indexesDir, newHash);
  return fs.existsSync(newIndexPath);
}

/**
 * SMCP-057: Check if an index is using the legacy (16-char) hash format
 *
 * @param projectPath - Absolute path to the project root
 * @returns true if the index uses legacy format, false if new format or doesn't exist
 */
export function isLegacyIndex(projectPath: string): boolean {
  const storageRoot = getStorageRoot();
  const indexesDir = path.join(storageRoot, INDEXES_DIR);

  const legacyHash = hashProjectPathLegacy(projectPath);
  const legacyIndexPath = path.join(indexesDir, legacyHash);

  return fs.existsSync(legacyIndexPath);
}

/**
 * Get the indexes directory path (without creating a specific index)
 *
 * @returns Absolute path to the indexes directory
 */
export function getIndexesDir(): string {
  const storageRoot = getStorageRoot();
  const indexesDir = path.join(storageRoot, INDEXES_DIR);

  if (!fs.existsSync(indexesDir)) {
    fs.mkdirSync(indexesDir, { recursive: true });
  }

  return indexesDir;
}

// ============================================================================
// Index Subdirectory Helpers
// ============================================================================

/**
 * Get the logs directory path for an index
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Absolute path to the logs subdirectory
 */
export function getLogsPath(indexPath: string): string {
  return path.join(indexPath, 'logs');
}

/**
 * Get the config file path for an index
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Absolute path to config.json
 */
export function getConfigPath(indexPath: string): string {
  return path.join(indexPath, 'config.json');
}

/**
 * Get the metadata file path for an index
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Absolute path to metadata.json
 */
export function getMetadataPath(indexPath: string): string {
  return path.join(indexPath, 'metadata.json');
}

/**
 * Get the fingerprints file path for an index
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Absolute path to fingerprints.json
 */
export function getFingerprintsPath(indexPath: string): string {
  return path.join(indexPath, 'fingerprints.json');
}

/**
 * Get the LanceDB directory path for an index
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Absolute path to the index.lancedb directory
 */
export function getLanceDbPath(indexPath: string): string {
  return path.join(indexPath, 'index.lancedb');
}

/**
 * Get the docs fingerprints file path for an index
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Absolute path to docs-fingerprints.json
 */
export function getDocsFingerprintsPath(indexPath: string): string {
  return path.join(indexPath, 'docs-fingerprints.json');
}

/**
 * Get the Docs LanceDB directory path for an index
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Absolute path to the docs.lancedb directory
 */
export function getDocsLanceDbPath(indexPath: string): string {
  return path.join(indexPath, 'docs.lancedb');
}

/**
 * Get the dirty files JSON path for an index
 *
 * Used by the lazy indexing strategy to track files pending indexing.
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Absolute path to dirty-files.json
 */
export function getDirtyFilesPath(indexPath: string): string {
  return path.join(indexPath, 'dirty-files.json');
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Expand tilde (~) to home directory in a path
 *
 * @param inputPath - Path that may contain ~
 * @returns Path with ~ expanded to home directory
 */
export function expandTilde(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return inputPath;
}

/**
 * Get the file extension from a path (without the dot)
 *
 * @param filePath - Path to get extension from
 * @returns File extension without dot, or empty string if none
 *
 * @example
 * ```typescript
 * getExtension('/path/to/file.ts')  // => 'ts'
 * getExtension('/path/to/file')     // => ''
 * getExtension('/path/to/.gitignore') // => 'gitignore'
 * ```
 */
export function getExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

/**
 * Get the file name without extension
 *
 * @param filePath - Path to get base name from
 * @returns File name without extension
 */
export function getBaseName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

// ============================================================================
// Path Sanitization (for error messages)
// ============================================================================

/**
 * Sanitize a path for display in error messages
 *
 * Replaces sensitive information like home directory and user names
 * with safe placeholders to prevent information disclosure.
 *
 * @param fullPath - The full path to sanitize
 * @param projectPath - Optional project path to make relative to
 * @returns Sanitized path safe for display in error messages
 *
 * @example
 * ```typescript
 * sanitizePath('/Users/john/.mcp/search/indexes/abc123')
 * // => '~/.mcp/search/indexes/abc123'
 *
 * sanitizePath('/Users/john/projects/myapp/src/file.ts', '/Users/john/projects/myapp')
 * // => './src/file.ts'
 *
 * sanitizePath('C:\\Users\\john\\Documents\\project')
 * // => '~\\Documents\\project' (Windows)
 * ```
 */
export function sanitizePath(fullPath: string, projectPath?: string): string {
  if (!fullPath) {
    return '<unknown>';
  }

  // If project path is provided, try to make it relative
  if (projectPath) {
    const normalizedFull = normalizePath(fullPath);
    const normalizedProject = normalizePath(projectPath);

    if (isWithinDirectory(normalizedFull, normalizedProject)) {
      const relativePath = toRelativePath(normalizedFull, normalizedProject);
      return `./${relativePath}`;
    }
  }

  // Replace home directory with ~
  const homeDir = os.homedir();
  const normalizedHome = normalizePath(homeDir);
  const normalizedPath = normalizePath(fullPath);

  if (isWithinDirectory(normalizedPath, normalizedHome)) {
    // Get relative path from home
    const relativePath = path.relative(normalizedHome, normalizedPath);
    // Use forward slash for consistency in error messages
    const sanitized = '~/' + relativePath.replace(/\\/g, '/');
    return sanitized;
  }

  // If not in home directory, return as-is but replace backslashes for consistency
  return normalizedPath.replace(/\\/g, '/');
}

/**
 * Sanitize an index path for display
 *
 * Specifically handles index paths, showing a generic format
 * without exposing the full hash or system paths.
 *
 * @param indexPath - The index path to sanitize
 * @returns Sanitized index path description
 *
 * @example
 * ```typescript
 * sanitizeIndexPath('/Users/john/.mcp/search/indexes/abc123def456')
 * // => '~/.mcp/search/indexes/<project-hash>'
 * ```
 */
export function sanitizeIndexPath(indexPath: string): string {
  if (!indexPath) {
    return '<unknown index>';
  }

  // Check if it's an index path
  const indexesDir = getIndexesDir();
  const normalizedIndexPath = normalizePath(indexPath);
  const normalizedIndexesDir = normalizePath(indexesDir);

  if (isWithinDirectory(normalizedIndexPath, normalizedIndexesDir)) {
    // It's an index path - replace with generic format
    return '~/.mcp/search/indexes/<project-hash>';
  }

  // Otherwise, use regular path sanitization
  return sanitizePath(indexPath);
}
