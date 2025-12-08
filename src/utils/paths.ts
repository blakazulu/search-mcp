/**
 * Path Utilities Module
 *
 * Provides cross-platform path manipulation utilities for:
 * - Path normalization (absolute paths, separator normalization)
 * - Relative path conversion (always forward-slash separated)
 * - Path traversal prevention (security)
 * - Index storage path helpers
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { hashProjectPath } from './hash.js';

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
 * // => '/project/config.ts' (resolved within base, so allowed)
 * ```
 */
export function safeJoin(basePath: string, relativePath: string): string | null {
  // First check for obvious traversal patterns
  if (isPathTraversal(relativePath)) {
    // Special case: allow paths with .. that resolve within base
    // Convert forward slashes to platform separators
    const platformRelative = relativePath.replace(/\//g, path.sep);
    const normalizedBase = normalizePath(basePath);
    const joined = path.resolve(normalizedBase, platformRelative);
    const normalizedJoined = normalizePath(joined);

    // Verify result is still within base directory
    if (!isWithinDirectory(normalizedJoined, normalizedBase)) {
      return null;
    }

    return normalizedJoined;
  }

  // Convert forward slashes to platform separators and join
  const platformRelative = relativePath.replace(/\//g, path.sep);
  const normalizedBase = normalizePath(basePath);
  const joined = path.join(normalizedBase, platformRelative);
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
 * @param projectPath - Absolute path to the project root
 * @returns Absolute path to the project's index directory
 *
 * @example
 * ```typescript
 * getIndexPath('/Users/dev/my-project')
 * // => '/Users/dev/.mcp/search/indexes/a1b2c3d4e5f67890'
 * ```
 */
export function getIndexPath(projectPath: string): string {
  const storageRoot = getStorageRoot();
  const hash = hashProjectPath(projectPath);
  const indexPath = path.join(storageRoot, INDEXES_DIR, hash);

  // Create directory if it doesn't exist
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(indexPath, { recursive: true });
  }

  return indexPath;
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
