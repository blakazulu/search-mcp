/**
 * Hash Utilities Module
 *
 * Provides SHA256 hashing utilities for:
 * - String content hashing (fingerprinting)
 * - File content hashing (delta detection)
 * - Project path hashing (index directory names)
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from './logger.js';
import { MCPError, ErrorCode, fileNotFound, symlinkNotAllowed } from '../errors/index.js';

/**
 * Compute SHA256 hash of a string
 *
 * @param input - The string to hash
 * @returns Full SHA256 hex digest (64 characters)
 *
 * @example
 * ```typescript
 * hashString('hello world')
 * // => 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
 * ```
 */
export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Compute SHA256 hash of a file's content using streaming
 *
 * Uses streaming to handle large files without loading entire content into memory.
 * Falls back to synchronous read for small files for better performance.
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to SHA256 hex digest (64 characters)
 * @throws MCPError with FILE_NOT_FOUND if file doesn't exist
 * @throws MCPError with PERMISSION_DENIED if file can't be read
 *
 * @example
 * ```typescript
 * const hash = await hashFile('/path/to/file.ts');
 * // => 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3...'
 * ```
 */
export async function hashFile(filePath: string): Promise<string> {
  const logger = getLogger();

  // SECURITY: Use lstat to check file exists AND detect symlinks
  let stats: fs.Stats;
  try {
    stats = await fs.promises.lstat(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw fileNotFound(filePath);
    }
    if (nodeError.code === 'EACCES') {
      throw new MCPError({
        code: ErrorCode.PERMISSION_DENIED,
        userMessage: 'Access denied. Please check that you have permission to access this file.',
        developerMessage: `Permission denied reading file: ${filePath}`,
        cause: nodeError,
      });
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to access the file.',
      developerMessage: `Failed to access file ${filePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }

  // SECURITY: Reject symlinks to prevent reading files outside project
  if (stats.isSymbolicLink()) {
    logger.warn('hash', `Rejecting symlink: ${filePath}`);
    throw symlinkNotAllowed(filePath);
  }

  // Verify file is readable
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EACCES') {
      throw new MCPError({
        code: ErrorCode.PERMISSION_DENIED,
        userMessage: 'Access denied. Please check that you have permission to access this file.',
        developerMessage: `Permission denied reading file: ${filePath}`,
        cause: nodeError,
      });
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to access the file.',
      developerMessage: `Failed to access file ${filePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }

  const STREAMING_THRESHOLD = 10 * 1024 * 1024; // 10MB

  try {
    if (stats.size > STREAMING_THRESHOLD) {
      // Use streaming for large files
      logger.debug('hash', `Using streaming for large file: ${filePath}`, { size: stats.size });
      return await hashFileStream(filePath);
    } else {
      // Use direct read for smaller files (more efficient)
      const content = await fs.promises.readFile(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    logger.error('hash', `Failed to hash file: ${filePath}`, { error: nodeError.message });
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to read the file.',
      developerMessage: `Failed to read file ${filePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }
}

/**
 * Internal helper: Hash file using streaming
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to SHA256 hex digest
 */
async function hashFileStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Hash length constants for project path hashing
 *
 * SMCP-057: Increased from 16 to 32 characters for better collision resistance
 * - OLD_HASH_LENGTH (16 chars) = 64 bits of entropy
 * - NEW_HASH_LENGTH (32 chars) = 128 bits of entropy (recommended minimum for security)
 */
export const OLD_HASH_LENGTH = 16;
export const NEW_HASH_LENGTH = 32;

/**
 * Compute SHA256 hash of a project path for index directory naming
 *
 * SMCP-057: Returns a truncated hash (first 32 characters) suitable for directory names.
 * This provides 128 bits of entropy, which is the recommended minimum for security-sensitive
 * applications. Previously used 16 characters (64 bits).
 *
 * The path is normalized before hashing:
 * - Resolved to absolute path
 * - Lowercase on Windows for case-insensitivity
 * - Forward slashes normalized
 *
 * @param projectPath - Path to the project root
 * @returns First 32 characters of SHA256 hex digest
 *
 * @example
 * ```typescript
 * hashProjectPath('/Users/dev/my-project')
 * // => 'a1b2c3d4e5f6789001234567890abcde'
 *
 * // On Windows, paths are normalized:
 * hashProjectPath('C:\\Users\\Dev\\My-Project')
 * // Same as hashProjectPath('c:/users/dev/my-project')
 * ```
 */
export function hashProjectPath(projectPath: string): string {
  // Resolve to absolute path
  let normalizedPath = path.resolve(projectPath);

  // Normalize for cross-platform consistency
  // Convert backslashes to forward slashes
  normalizedPath = normalizedPath.replace(/\\/g, '/');

  // On Windows, lowercase for case-insensitive comparison
  if (process.platform === 'win32') {
    normalizedPath = normalizedPath.toLowerCase();
  }

  // Remove trailing slash if present
  if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  // SMCP-057: Return truncated hash (32 chars provides ~128 bits of entropy)
  // Increased from 16 chars to reduce collision probability
  const fullHash = hashString(normalizedPath);
  return fullHash.substring(0, NEW_HASH_LENGTH);
}

/**
 * SMCP-057: Compute legacy (16-char) hash for backward compatibility
 *
 * Used during migration to support indexes created with the old hash format.
 * Should only be used for migration/compatibility checks.
 *
 * @param projectPath - Path to the project root
 * @returns First 16 characters of SHA256 hex digest (legacy format)
 */
export function hashProjectPathLegacy(projectPath: string): string {
  // Resolve to absolute path
  let normalizedPath = path.resolve(projectPath);

  // Normalize for cross-platform consistency
  normalizedPath = normalizedPath.replace(/\\/g, '/');

  // On Windows, lowercase for case-insensitive comparison
  if (process.platform === 'win32') {
    normalizedPath = normalizedPath.toLowerCase();
  }

  // Remove trailing slash if present
  if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  // Return legacy 16-char hash
  const fullHash = hashString(normalizedPath);
  return fullHash.substring(0, OLD_HASH_LENGTH);
}

/**
 * Compute SHA256 hash synchronously for a file
 *
 * Use this only when async is not possible (e.g., in certain callback contexts).
 * Prefer hashFile for normal operations.
 *
 * @param filePath - Absolute path to the file
 * @returns SHA256 hex digest (64 characters)
 * @throws MCPError with FILE_NOT_FOUND if file doesn't exist
 */
export function hashFileSync(filePath: string): string {
  const logger = getLogger();

  // SECURITY: Use lstat to check file exists AND detect symlinks
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw fileNotFound(filePath);
    }
    if (nodeError.code === 'EACCES') {
      throw new MCPError({
        code: ErrorCode.PERMISSION_DENIED,
        userMessage: 'Access denied. Please check that you have permission to access this file.',
        developerMessage: `Permission denied accessing file: ${filePath}`,
        cause: nodeError,
      });
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to access the file.',
      developerMessage: `Failed to stat file ${filePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }

  // SECURITY: Reject symlinks to prevent reading files outside project
  if (stats.isSymbolicLink()) {
    logger.warn('hash', `Rejecting symlink (sync): ${filePath}`);
    throw symlinkNotAllowed(filePath);
  }

  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw fileNotFound(filePath);
    }
    if (nodeError.code === 'EACCES') {
      throw new MCPError({
        code: ErrorCode.PERMISSION_DENIED,
        userMessage: 'Access denied. Please check that you have permission to access this file.',
        developerMessage: `Permission denied reading file: ${filePath}`,
        cause: nodeError,
      });
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to read the file.',
      developerMessage: `Failed to read file ${filePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }
}
