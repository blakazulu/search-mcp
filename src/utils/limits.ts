/**
 * Input Validation Limits
 *
 * Defines security limits for input validation across MCP tools.
 * These limits help prevent DoS attacks via malformed or excessive inputs.
 */

import * as fs from 'node:fs';
import { getLogger } from './logger.js';

// ============================================================================
// Query Length Limits
// ============================================================================

/**
 * Maximum length for search query strings (characters)
 *
 * Prevents memory exhaustion and slow embedding generation for very long queries.
 * 1000 characters is sufficient for any reasonable search query while preventing abuse.
 */
export const MAX_QUERY_LENGTH = 1000;

// ============================================================================
// Glob Pattern Limits
// ============================================================================

/**
 * Maximum length for glob patterns (characters)
 *
 * Long patterns can cause performance issues and potential ReDoS.
 * 200 characters is sufficient for any reasonable file pattern.
 */
export const MAX_GLOB_PATTERN_LENGTH = 200;

/**
 * Maximum number of wildcard characters in a glob pattern
 *
 * Excessive wildcards can cause exponential backtracking in pattern matching.
 * 10 wildcards is more than enough for any legitimate use case.
 */
export const MAX_GLOB_PATTERN_WILDCARDS = 10;

/**
 * Maximum number of brace expansion groups in a glob pattern
 *
 * Brace expansion like {a,b,c} can cause combinatorial explosion.
 * Limit to prevent patterns like {a,b}{c,d}{e,f}... from exploding.
 */
export const MAX_GLOB_BRACE_GROUPS = 5;

/**
 * Maximum total items in brace expansion
 *
 * Limits the total number of alternatives across all brace groups.
 * e.g., {a,b,c,d,e} counts as 5 items.
 */
export const MAX_GLOB_BRACE_ITEMS = 20;

// ============================================================================
// Pattern Validation
// ============================================================================

/**
 * Known ReDoS-prone pattern fragments to reject
 *
 * These patterns can cause exponential time complexity in regex engines.
 * While minimatch isn't a regex engine, similar issues can occur.
 */
export const REDOS_PATTERNS = [
  // Nested quantifiers
  /\*\*\*+/,           // Triple or more consecutive stars
  /\?\?\?\?+/,         // Four or more consecutive question marks
  // Pathological patterns
  /(\*\?){3,}/,        // Alternating * and ? repeated
  /(\?\*){3,}/,        // Alternating ? and * repeated
];

/**
 * Validate a glob pattern for safety
 *
 * Checks for:
 * - Length limits
 * - Wildcard count limits
 * - ReDoS-prone patterns
 * - Brace expansion limits
 *
 * @param pattern - The glob pattern to validate
 * @returns Object with valid boolean and optional error message
 */
export function isPatternSafe(pattern: string): { valid: boolean; error?: string } {
  // Check pattern length
  if (pattern.length > MAX_GLOB_PATTERN_LENGTH) {
    return {
      valid: false,
      error: `Pattern too long: ${pattern.length} characters (max: ${MAX_GLOB_PATTERN_LENGTH})`,
    };
  }

  // Count wildcards (* and ?)
  const wildcardCount = (pattern.match(/[*?]/g) || []).length;
  if (wildcardCount > MAX_GLOB_PATTERN_WILDCARDS) {
    return {
      valid: false,
      error: `Too many wildcards: ${wildcardCount} (max: ${MAX_GLOB_PATTERN_WILDCARDS})`,
    };
  }

  // Check for ReDoS-prone patterns
  for (const redosPattern of REDOS_PATTERNS) {
    if (redosPattern.test(pattern)) {
      return {
        valid: false,
        error: 'Pattern contains potentially dangerous wildcard combinations',
      };
    }
  }

  // Count and validate brace expansion
  const braceGroups = pattern.match(/\{[^}]+\}/g) || [];
  if (braceGroups.length > MAX_GLOB_BRACE_GROUPS) {
    return {
      valid: false,
      error: `Too many brace expansion groups: ${braceGroups.length} (max: ${MAX_GLOB_BRACE_GROUPS})`,
    };
  }

  // Count total items in brace expansions
  let totalBraceItems = 0;
  for (const group of braceGroups) {
    // Remove braces and count comma-separated items
    const content = group.slice(1, -1);
    const items = content.split(',').length;
    totalBraceItems += items;
  }

  if (totalBraceItems > MAX_GLOB_BRACE_ITEMS) {
    return {
      valid: false,
      error: `Too many items in brace expansion: ${totalBraceItems} (max: ${MAX_GLOB_BRACE_ITEMS})`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Resource Exhaustion Limits (DoS Protection)
// ============================================================================

/**
 * Maximum number of chunks that can be generated from a single file.
 *
 * Prevents memory exhaustion from maliciously crafted files that would
 * generate an excessive number of chunks. 1000 chunks is sufficient for
 * files up to ~4MB with default chunking settings.
 */
export const MAX_CHUNKS_PER_FILE = 1000;

/**
 * Warning threshold for chunks per file (80% of max).
 *
 * When reached, a warning is logged to help identify files that
 * may be approaching the limit.
 */
export const CHUNKS_WARNING_THRESHOLD = Math.floor(MAX_CHUNKS_PER_FILE * 0.8);

/**
 * Maximum number of pending file watcher events.
 *
 * Prevents memory exhaustion from rapid file changes that could
 * overwhelm the event queue. 1000 events is generous for normal
 * development workflows.
 */
export const MAX_PENDING_FILE_EVENTS = 1000;

/**
 * Warning threshold for pending file events (80% of max).
 */
export const PENDING_EVENTS_WARNING_THRESHOLD = Math.floor(MAX_PENDING_FILE_EVENTS * 0.8);

/**
 * Maximum directory traversal depth for gitignore loading.
 *
 * Prevents stack overflow and excessive recursion from deeply nested
 * directory structures. 20 levels is more than sufficient for any
 * reasonable project structure.
 */
export const MAX_DIRECTORY_DEPTH = 20;

/**
 * Maximum number of files returned from glob operations.
 *
 * Prevents memory exhaustion from glob patterns that match too many files.
 * 100,000 files is a generous limit for even very large projects.
 */
export const MAX_GLOB_RESULTS = 100000;

/**
 * Timeout for glob operations in milliseconds.
 *
 * Prevents indefinite hangs from glob operations on slow filesystems
 * or extremely large directory trees.
 */
export const GLOB_TIMEOUT_MS = 30000;

/**
 * Maximum size for JSON configuration/metadata files in bytes.
 *
 * Prevents memory exhaustion from parsing maliciously large JSON files.
 * 10MB is generous for any reasonable configuration file.
 */
export const MAX_JSON_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// Resource Limit Errors
// ============================================================================

/**
 * Error thrown when a resource limit is exceeded
 */
export class ResourceLimitError extends Error {
  constructor(
    public readonly limitName: string,
    public readonly actualValue: number,
    public readonly maxValue: number,
    message?: string
  ) {
    super(message || `Resource limit exceeded: ${limitName} (${actualValue} > ${maxValue})`);
    this.name = 'ResourceLimitError';
  }
}

// ============================================================================
// Safe JSON Loading
// ============================================================================

/**
 * Safely load and parse a JSON file with size limits.
 *
 * Checks file size before reading to prevent memory exhaustion from
 * maliciously large JSON files.
 *
 * @param filePath - Absolute path to the JSON file
 * @param maxSize - Maximum allowed file size in bytes (default: MAX_JSON_FILE_SIZE)
 * @returns Parsed JSON content
 * @throws ResourceLimitError if file exceeds size limit
 * @throws Error if file doesn't exist or can't be parsed
 *
 * @example
 * ```typescript
 * const config = await safeLoadJSON<Config>('/path/to/config.json');
 * ```
 */
export async function safeLoadJSON<T>(
  filePath: string,
  maxSize: number = MAX_JSON_FILE_SIZE
): Promise<T> {
  const logger = getLogger();

  // Check file size before reading
  const stats = await fs.promises.stat(filePath);

  if (stats.size > maxSize) {
    logger.error('SafeLoadJSON', 'JSON file exceeds size limit', {
      path: filePath,
      size: stats.size,
      maxSize,
    });
    throw new ResourceLimitError(
      'JSON_FILE_SIZE',
      stats.size,
      maxSize,
      `JSON file exceeds size limit: ${stats.size} bytes > ${maxSize} bytes (${filePath})`
    );
  }

  // Warn if file is approaching limit (80%)
  const warningThreshold = Math.floor(maxSize * 0.8);
  if (stats.size > warningThreshold) {
    logger.warn('SafeLoadJSON', 'JSON file approaching size limit', {
      path: filePath,
      size: stats.size,
      maxSize,
      percentUsed: Math.round((stats.size / maxSize) * 100),
    });
  }

  // Read and parse
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Synchronous version of safeLoadJSON.
 *
 * @param filePath - Absolute path to the JSON file
 * @param maxSize - Maximum allowed file size in bytes (default: MAX_JSON_FILE_SIZE)
 * @returns Parsed JSON content
 * @throws ResourceLimitError if file exceeds size limit
 */
export function safeLoadJSONSync<T>(
  filePath: string,
  maxSize: number = MAX_JSON_FILE_SIZE
): T {
  const logger = getLogger();

  // Check file size before reading
  const stats = fs.statSync(filePath);

  if (stats.size > maxSize) {
    logger.error('SafeLoadJSON', 'JSON file exceeds size limit', {
      path: filePath,
      size: stats.size,
      maxSize,
    });
    throw new ResourceLimitError(
      'JSON_FILE_SIZE',
      stats.size,
      maxSize,
      `JSON file exceeds size limit: ${stats.size} bytes > ${maxSize} bytes (${filePath})`
    );
  }

  // Warn if file is approaching limit (80%)
  const warningThreshold = Math.floor(maxSize * 0.8);
  if (stats.size > warningThreshold) {
    logger.warn('SafeLoadJSON', 'JSON file approaching size limit', {
      path: filePath,
      size: stats.size,
      maxSize,
      percentUsed: Math.round((stats.size / maxSize) * 100),
    });
  }

  // Read and parse
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}
