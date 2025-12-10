/**
 * Secure File Access Module
 *
 * Provides security utilities for file operations:
 * - Symlink detection to prevent symlink attacks
 * - Safe file reading with path traversal and symlink protection
 * - Combines safeJoin() validation with lstat() symlink checks
 *
 * Security features:
 * - Rejects symlinks to prevent reading files outside project
 * - Validates paths using safeJoin() to prevent path traversal
 * - Uses lstat() instead of stat() to detect symlinks
 * - Handles Windows junctions and symbolic links
 */

import * as fs from 'node:fs';
import { safeJoin, normalizePath } from './paths.js';
import { getLogger } from './logger.js';
import { MCPError, ErrorCode, fileNotFound } from '../errors/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a symlink check
 */
export interface SymlinkCheckResult {
  /** Whether the path is a symlink */
  isSymlink: boolean;
  /** The path that was checked */
  path: string;
  /** Target of the symlink (if it is one and could be resolved) */
  target?: string;
}

/**
 * Options for secure file operations
 */
export interface SecureFileOptions {
  /**
   * Behavior when a symlink is encountered:
   * - 'error': Throw an error (default for explicit file access)
   * - 'skip': Return null/false without error (for indexing operations)
   */
  symlinkBehavior: 'error' | 'skip';
}

// ============================================================================
// Symlink Detection
// ============================================================================

/**
 * Check if a path is a symbolic link
 *
 * Uses lstat() to detect symlinks without following them.
 * Handles both Unix symbolic links and Windows junctions/symbolic links.
 *
 * @param filePath - Absolute path to check
 * @returns Promise resolving to true if path is a symlink
 *
 * @example
 * ```typescript
 * const isLink = await isSymlink('/path/to/file');
 * if (isLink) {
 *   console.log('Path is a symbolic link - potential security risk');
 * }
 * ```
 */
export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.lstat(filePath);
    return stats.isSymbolicLink();
  } catch {
    // If we can't stat the file, it's not a symlink (or doesn't exist)
    return false;
  }
}

/**
 * Check if a path is a symbolic link (synchronous version)
 *
 * @param filePath - Absolute path to check
 * @returns true if path is a symlink
 */
export function isSymlinkSync(filePath: string): boolean {
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Detailed symlink check with target resolution
 *
 * @param filePath - Absolute path to check
 * @returns Symlink check result with details
 */
export async function checkSymlink(filePath: string): Promise<SymlinkCheckResult> {
  const result: SymlinkCheckResult = {
    isSymlink: false,
    path: filePath,
  };

  try {
    const stats = await fs.promises.lstat(filePath);
    result.isSymlink = stats.isSymbolicLink();

    if (result.isSymlink) {
      try {
        result.target = await fs.promises.readlink(filePath);
      } catch {
        // Could not resolve target
      }
    }
  } catch {
    // File doesn't exist or can't be accessed
  }

  return result;
}

// ============================================================================
// Secure Path Validation
// ============================================================================

/**
 * Validate and create a secure absolute path
 *
 * Combines path traversal prevention with symlink detection.
 * Returns null if path is invalid or is a symlink.
 *
 * @param basePath - Base directory path
 * @param relativePath - Relative path to join
 * @param options - Security options
 * @returns Validated absolute path, or null if invalid/symlink
 */
export async function secureResolvePath(
  basePath: string,
  relativePath: string,
  options: SecureFileOptions = { symlinkBehavior: 'error' }
): Promise<string | null> {
  const logger = getLogger();

  // Step 1: Use safeJoin for path traversal prevention
  const absolutePath = safeJoin(basePath, relativePath);
  if (absolutePath === null) {
    logger.warn('secureFileAccess', 'Path traversal attempt detected', {
      basePath,
      relativePath,
    });
    return null;
  }

  // Step 2: Check for symlinks
  const symlinkCheck = await isSymlink(absolutePath);
  if (symlinkCheck) {
    logger.warn('secureFileAccess', 'Symlink detected', {
      path: absolutePath,
      relativePath,
    });

    if (options.symlinkBehavior === 'error') {
      throw new MCPError({
        code: ErrorCode.SYMLINK_NOT_ALLOWED,
        userMessage: 'Symbolic links are not allowed for security reasons.',
        developerMessage: `Symlink detected at path: ${absolutePath}`,
      });
    }

    return null; // Skip behavior
  }

  return absolutePath;
}

// ============================================================================
// Secure File Operations
// ============================================================================

/**
 * Safely check if a file exists within a base directory
 *
 * Validates path security and checks existence without following symlinks.
 *
 * @param basePath - Base directory path
 * @param relativePath - Relative path to check
 * @param options - Security options
 * @returns Promise resolving to true if file exists and is not a symlink
 *
 * @example
 * ```typescript
 * const exists = await safeFileExists('/project', 'src/index.ts');
 * if (exists) {
 *   // Safe to read the file
 * }
 * ```
 */
export async function safeFileExists(
  basePath: string,
  relativePath: string,
  options: SecureFileOptions = { symlinkBehavior: 'skip' }
): Promise<boolean> {
  try {
    const absolutePath = await secureResolvePath(basePath, relativePath, {
      ...options,
      symlinkBehavior: 'skip', // Don't throw for existence checks
    });

    if (absolutePath === null) {
      return false;
    }

    // Use lstat to check existence without following symlinks
    await fs.promises.lstat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read a file with path traversal and symlink protection
 *
 * Combines:
 * 1. safeJoin() validation for path traversal prevention
 * 2. lstat() check for symlink detection
 * 3. Actual file read
 *
 * @param basePath - Base directory path
 * @param relativePath - Relative path to the file
 * @param options - Security options
 * @returns Promise resolving to file content as string
 * @throws MCPError with SYMLINK_NOT_ALLOWED if file is a symlink
 * @throws MCPError with FILE_NOT_FOUND if path traversal detected or file doesn't exist
 *
 * @example
 * ```typescript
 * // For explicit file access (errors on symlinks)
 * const content = await safeReadFile('/project', 'src/index.ts', {
 *   symlinkBehavior: 'error'
 * });
 *
 * // For indexing operations (skips symlinks)
 * const content = await safeReadFile('/project', 'src/index.ts', {
 *   symlinkBehavior: 'skip'
 * });
 * ```
 */
export async function safeReadFile(
  basePath: string,
  relativePath: string,
  options: SecureFileOptions = { symlinkBehavior: 'error' }
): Promise<string | null> {
  const logger = getLogger();

  // Step 1: Validate path and check for symlinks
  const absolutePath = await secureResolvePath(basePath, relativePath, options);

  if (absolutePath === null) {
    if (options.symlinkBehavior === 'skip') {
      return null;
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Invalid file path. Please provide a path within the project directory.',
      developerMessage: `Path validation failed for: ${relativePath}`,
    });
  }

  // Step 2: Read the file
  try {
    const content = await fs.promises.readFile(absolutePath, 'utf8');
    return content;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === 'ENOENT') {
      throw fileNotFound(absolutePath);
    }

    if (nodeError.code === 'EACCES') {
      throw new MCPError({
        code: ErrorCode.PERMISSION_DENIED,
        userMessage: 'Access denied. Please check that you have permission to access this file.',
        developerMessage: `Permission denied reading file: ${absolutePath}`,
        cause: nodeError,
      });
    }

    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to read the file.',
      developerMessage: `Failed to read file ${absolutePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }
}

/**
 * Safely read a file as a Buffer with path traversal and symlink protection
 *
 * @param basePath - Base directory path
 * @param relativePath - Relative path to the file
 * @param options - Security options
 * @returns Promise resolving to file content as Buffer
 */
export async function safeReadFileBuffer(
  basePath: string,
  relativePath: string,
  options: SecureFileOptions = { symlinkBehavior: 'error' }
): Promise<Buffer | null> {
  // Validate path and check for symlinks
  const absolutePath = await secureResolvePath(basePath, relativePath, options);

  if (absolutePath === null) {
    if (options.symlinkBehavior === 'skip') {
      return null;
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Invalid file path. Please provide a path within the project directory.',
      developerMessage: `Path validation failed for: ${relativePath}`,
    });
  }

  // Read the file
  try {
    const content = await fs.promises.readFile(absolutePath);
    return content;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === 'ENOENT') {
      throw fileNotFound(absolutePath);
    }

    if (nodeError.code === 'EACCES') {
      throw new MCPError({
        code: ErrorCode.PERMISSION_DENIED,
        userMessage: 'Access denied. Please check that you have permission to access this file.',
        developerMessage: `Permission denied reading file: ${absolutePath}`,
        cause: nodeError,
      });
    }

    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Failed to read the file.',
      developerMessage: `Failed to read file ${absolutePath}: ${nodeError.message}`,
      cause: nodeError,
    });
  }
}

/**
 * Create a secure read stream with symlink protection
 *
 * For streaming large files while maintaining security checks.
 * Note: Symlink check happens before stream creation.
 *
 * @param basePath - Base directory path
 * @param relativePath - Relative path to the file
 * @param options - Security options
 * @returns Promise resolving to read stream, or null if symlink with skip behavior
 * @throws MCPError if symlink with error behavior or invalid path
 */
export async function safeCreateReadStream(
  basePath: string,
  relativePath: string,
  options: SecureFileOptions = { symlinkBehavior: 'error' }
): Promise<fs.ReadStream | null> {
  // Validate path and check for symlinks
  const absolutePath = await secureResolvePath(basePath, relativePath, options);

  if (absolutePath === null) {
    if (options.symlinkBehavior === 'skip') {
      return null;
    }
    throw new MCPError({
      code: ErrorCode.FILE_NOT_FOUND,
      userMessage: 'Invalid file path. Please provide a path within the project directory.',
      developerMessage: `Path validation failed for: ${relativePath}`,
    });
  }

  return fs.createReadStream(absolutePath, { encoding: 'utf8' });
}

// ============================================================================
// Utility Functions for Indexing
// ============================================================================

/**
 * Check if a file should be skipped during indexing due to being a symlink
 *
 * This is a convenience function for indexing operations that want to
 * skip symlinks with a warning rather than throwing an error.
 *
 * @param absolutePath - Absolute path to check
 * @returns true if the file is a symlink and should be skipped
 */
export async function shouldSkipForIndexing(absolutePath: string): Promise<boolean> {
  const logger = getLogger();
  const isLink = await isSymlink(absolutePath);

  if (isLink) {
    logger.warn('secureFileAccess', 'Skipping symlink during indexing', {
      path: absolutePath,
    });
  }

  return isLink;
}

/**
 * Validate an absolute path is not a symlink
 *
 * For use when you already have a validated absolute path but need
 * to add symlink protection.
 *
 * @param absolutePath - Absolute path to validate
 * @param options - Security options
 * @returns true if path is safe, false if it's a symlink (with skip behavior)
 * @throws MCPError if symlink with error behavior
 */
export async function validateNotSymlink(
  absolutePath: string,
  options: SecureFileOptions = { symlinkBehavior: 'error' }
): Promise<boolean> {
  const logger = getLogger();
  const isLink = await isSymlink(absolutePath);

  if (isLink) {
    logger.warn('secureFileAccess', 'Symlink detected during validation', {
      path: absolutePath,
    });

    if (options.symlinkBehavior === 'error') {
      throw new MCPError({
        code: ErrorCode.SYMLINK_NOT_ALLOWED,
        userMessage: 'Symbolic links are not allowed for security reasons.',
        developerMessage: `Symlink detected at path: ${absolutePath}`,
      });
    }

    return false;
  }

  return true;
}
