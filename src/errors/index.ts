/**
 * Error Handling System
 *
 * Provides a standardized error handling system with dual-message format:
 * - userMessage: Friendly message for end users (no technical details)
 * - developerMessage: Technical details for debugging
 *
 * All errors across the codebase use this system for consistent error reporting.
 */

import { getLogger } from '../utils/logger.js';
import { sanitizeIndexPath, sanitizePath } from '../utils/paths.js';

/**
 * Error codes for all MCP errors
 * Based on RFC Section 6: Error Handling
 */
export enum ErrorCode {
  /** Index not found for the given project path */
  INDEX_NOT_FOUND = 'INDEX_NOT_FOUND',
  /** Failed to download or initialize the embedding model */
  MODEL_DOWNLOAD_FAILED = 'MODEL_DOWNLOAD_FAILED',
  /** Index data is corrupted or unreadable */
  INDEX_CORRUPT = 'INDEX_CORRUPT',
  /** File count exceeds recommended limit (warning, not error) */
  FILE_LIMIT_WARNING = 'FILE_LIMIT_WARNING',
  /** Insufficient permissions to access path */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** Insufficient disk space for operation */
  DISK_FULL = 'DISK_FULL',
  /** Requested file does not exist */
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  /** Invalid glob or regex pattern */
  INVALID_PATTERN = 'INVALID_PATTERN',
  /** Could not detect project root from given path */
  PROJECT_NOT_DETECTED = 'PROJECT_NOT_DETECTED',
  /** Symbolic link not allowed for security reasons */
  SYMLINK_NOT_ALLOWED = 'SYMLINK_NOT_ALLOWED',
  /** Invalid file or directory path */
  INVALID_PATH = 'INVALID_PATH',
  /** Failed to extract data from file */
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
}

/**
 * Interface for MCP error structure
 */
export interface MCPErrorOptions {
  code: ErrorCode;
  userMessage: string;
  developerMessage: string;
  cause?: Error;
}

/**
 * Custom error class for MCP errors with dual messages
 *
 * Extends Error to provide:
 * - Separate user-friendly and developer messages
 * - Proper stack trace capture
 * - JSON serialization for MCP responses
 * - Integration with logging system
 */
export class MCPError extends Error {
  /** Error code for programmatic handling */
  readonly code: ErrorCode;

  /** User-friendly message (safe to display to end users) */
  readonly userMessage: string;

  /** Technical message with debugging details */
  readonly developerMessage: string;

  /** Original error that caused this error */
  readonly cause?: Error;

  constructor(options: MCPErrorOptions) {
    // Use developerMessage as the Error.message for logging
    super(options.developerMessage);

    this.code = options.code;
    this.userMessage = options.userMessage;
    this.developerMessage = options.developerMessage;
    this.cause = options.cause;

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, MCPError.prototype);

    // Capture stack trace, excluding constructor
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPError);
    }

    // Set the error name to include the code for easier debugging
    this.name = `MCPError[${this.code}]`;

    // Log the error automatically at ERROR level
    this.logError();
  }

  /**
   * Log the error using the logger system
   */
  private logError(): void {
    const logger = getLogger();
    const meta: Record<string, unknown> = {
      code: this.code,
      userMessage: this.userMessage,
    };

    if (this.cause) {
      meta.cause = {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      };
    }

    logger.error('MCPError', this.developerMessage, meta);
  }

  /**
   * Convert error to JSON for MCP responses
   */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      userMessage: this.userMessage,
      developerMessage: this.developerMessage,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
          }
        : undefined,
    };
  }

  /**
   * Get a string representation suitable for logging
   */
  toString(): string {
    return `${this.name}: ${this.developerMessage}`;
  }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create an INDEX_NOT_FOUND error
 *
 * Used when no index exists for a project path.
 *
 * @param indexPath - The path where the index was expected
 */
export function indexNotFound(indexPath: string): MCPError {
  return new MCPError({
    code: ErrorCode.INDEX_NOT_FOUND,
    userMessage:
      'No search index exists for this project. Please create one first using the create_index tool.',
    developerMessage: `Index not found at path: ${sanitizeIndexPath(indexPath)}`,
  });
}

/**
 * Create a MODEL_DOWNLOAD_FAILED error
 *
 * Used when the embedding model fails to download or initialize.
 *
 * @param error - The underlying error that caused the failure
 */
export function modelDownloadFailed(error: Error): MCPError {
  return new MCPError({
    code: ErrorCode.MODEL_DOWNLOAD_FAILED,
    userMessage:
      'Failed to download the AI model needed for search. Please check your internet connection and try again.',
    developerMessage: `Failed to download/initialize embedding model: ${error.message}`,
    cause: error,
  });
}

/**
 * Create an INDEX_CORRUPT error
 *
 * Used when index data is corrupted or unreadable.
 *
 * @param details - Technical details about the corruption
 */
export function indexCorrupt(details: string): MCPError {
  return new MCPError({
    code: ErrorCode.INDEX_CORRUPT,
    userMessage:
      'The search index appears to be corrupted. Please rebuild it using the reindex_project tool.',
    developerMessage: `Index corruption detected: ${details}`,
  });
}

/**
 * Create a FILE_LIMIT_WARNING error
 *
 * Used when file count exceeds recommended limits.
 * Note: This is a warning, not a blocking error.
 *
 * @param count - Current number of files
 * @param limit - Recommended file limit
 */
export function fileLimitWarning(count: number, limit: number): MCPError {
  return new MCPError({
    code: ErrorCode.FILE_LIMIT_WARNING,
    userMessage: `This project has ${count.toLocaleString()} files, which exceeds the recommended limit of ${limit.toLocaleString()}. Indexing may be slow.`,
    developerMessage: `File count (${count}) exceeds recommended limit (${limit}). Performance may be impacted.`,
  });
}

/**
 * Create a PERMISSION_DENIED error
 *
 * Used when access to a path is denied.
 *
 * @param filePath - The path that could not be accessed
 */
export function permissionDenied(filePath: string): MCPError {
  return new MCPError({
    code: ErrorCode.PERMISSION_DENIED,
    userMessage:
      'Access denied. Please check that you have permission to access this location.',
    developerMessage: `Permission denied accessing path: ${sanitizePath(filePath)}`,
  });
}

/**
 * Create a DISK_FULL error
 *
 * Used when there is insufficient disk space.
 *
 * @param needed - Bytes needed for the operation
 * @param available - Bytes currently available
 */
export function diskFull(needed: number, available: number): MCPError {
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return new MCPError({
    code: ErrorCode.DISK_FULL,
    userMessage: `Not enough disk space. Please free up some space and try again.`,
    developerMessage: `Insufficient disk space. Needed: ${formatBytes(needed)}, Available: ${formatBytes(available)}`,
  });
}

/**
 * Create a FILE_NOT_FOUND error
 *
 * Used when a requested file does not exist.
 *
 * @param filePath - The path to the missing file
 */
export function fileNotFound(filePath: string): MCPError {
  return new MCPError({
    code: ErrorCode.FILE_NOT_FOUND,
    userMessage: 'The requested file could not be found.',
    developerMessage: `File not found: ${sanitizePath(filePath)}`,
  });
}

/**
 * Create an INVALID_PATTERN error
 *
 * Used when a glob or regex pattern is invalid.
 *
 * @param pattern - The invalid pattern
 * @param errorDetail - Description of what's wrong with the pattern
 */
export function invalidPattern(pattern: string, errorDetail: string): MCPError {
  return new MCPError({
    code: ErrorCode.INVALID_PATTERN,
    userMessage: `The search pattern is invalid. Please check the syntax and try again.`,
    developerMessage: `Invalid pattern "${pattern}": ${errorDetail}`,
  });
}

/**
 * Create a PROJECT_NOT_DETECTED error
 *
 * Used when a project root cannot be determined.
 *
 * @param searchedPath - The path that was searched
 */
export function projectNotDetected(searchedPath: string): MCPError {
  return new MCPError({
    code: ErrorCode.PROJECT_NOT_DETECTED,
    userMessage:
      'Could not detect a project in this location. Make sure you are in a project directory with a package.json, .git, or similar project marker.',
    developerMessage: `Project root not detected from path: ${sanitizePath(searchedPath)}. No project markers (package.json, .git, etc.) found in path hierarchy.`,
  });
}

/**
 * Create a SYMLINK_NOT_ALLOWED error
 *
 * Used when a symbolic link is detected where it's not allowed for security reasons.
 * Symlinks can be used to read files outside the project directory.
 *
 * @param filePath - The path to the symlink
 */
export function symlinkNotAllowed(filePath: string): MCPError {
  return new MCPError({
    code: ErrorCode.SYMLINK_NOT_ALLOWED,
    userMessage:
      'Symbolic links are not allowed for security reasons. Please use actual files instead.',
    developerMessage: `Symbolic link detected at path: ${sanitizePath(filePath)}. Symlinks are rejected to prevent reading files outside the project.`,
  });
}

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Type guard to check if an error is an MCPError
 */
export function isMCPError(error: unknown): error is MCPError {
  return error instanceof MCPError;
}

/**
 * Wrap an unknown error as an MCPError if it isn't already
 *
 * Useful for catch blocks where you want to ensure consistent error handling.
 *
 * @param error - The error to wrap
 * @param defaultCode - Error code to use if wrapping a non-MCPError
 * @param context - Additional context for the error message
 */
export function wrapError(
  error: unknown,
  defaultCode: ErrorCode = ErrorCode.INDEX_CORRUPT,
  context: string = 'An unexpected error occurred'
): MCPError {
  if (isMCPError(error)) {
    return error;
  }

  const originalError =
    error instanceof Error ? error : new Error(String(error));

  return new MCPError({
    code: defaultCode,
    userMessage: 'An unexpected error occurred. Please try again.',
    developerMessage: `${context}: ${originalError.message}`,
    cause: originalError,
  });
}
