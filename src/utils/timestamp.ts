/**
 * Timestamp Utilities Module
 *
 * Provides utilities for handling timestamps safely, addressing edge cases like:
 * - NFS timestamp aliasing (MCP-28)
 * - Clock drift/adjustment (MCP-31)
 * - Future timestamps
 * - Invalid timestamps
 *
 * Uses performance.now() for duration calculations when high precision is needed,
 * and provides validation for file timestamps.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum reasonable timestamp age (1 year in milliseconds)
 * Files older than this are suspicious and may indicate timestamp issues
 */
const MAX_REASONABLE_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Maximum acceptable future timestamp (5 minutes in milliseconds)
 * Files with timestamps this far in the future are suspicious
 */
const MAX_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * NFS timestamp resolution (1 second in milliseconds)
 * NFS v3 has 1-second resolution, which can cause timestamp aliasing
 */
const NFS_TIMESTAMP_RESOLUTION_MS = 1000;

// ============================================================================
// Timestamp Validation
// ============================================================================

/**
 * Result of timestamp validation
 */
export interface TimestampValidationResult {
  /** Whether the timestamp is valid and usable */
  isValid: boolean;
  /** Reason if timestamp is invalid */
  reason?: string;
  /** Whether the timestamp should be treated with caution */
  isSuspicious: boolean;
}

/**
 * Validate a file timestamp
 *
 * Checks for common timestamp issues:
 * - Negative timestamps (invalid)
 * - Zero timestamps (likely uninitialized)
 * - Timestamps far in the future (clock skew)
 * - Timestamps far in the past (suspicious)
 *
 * @param timestamp - Timestamp in milliseconds since epoch
 * @param referenceTime - Reference time (default: Date.now())
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateTimestamp(file.mtimeMs);
 * if (!result.isValid) {
 *   console.warn(`Invalid timestamp: ${result.reason}`);
 * }
 * ```
 */
export function validateTimestamp(
  timestamp: number,
  referenceTime: number = Date.now()
): TimestampValidationResult {
  // Check for invalid timestamps
  if (timestamp < 0) {
    return {
      isValid: false,
      reason: 'Negative timestamp',
      isSuspicious: true,
    };
  }

  if (timestamp === 0) {
    return {
      isValid: false,
      reason: 'Zero timestamp (uninitialized)',
      isSuspicious: true,
    };
  }

  // Check for future timestamps (clock skew)
  if (timestamp > referenceTime + MAX_FUTURE_TOLERANCE_MS) {
    return {
      isValid: false,
      reason: 'Timestamp too far in the future (clock skew detected)',
      isSuspicious: true,
    };
  }

  // Check for very old timestamps
  const age = referenceTime - timestamp;
  if (age > MAX_REASONABLE_AGE_MS) {
    return {
      isValid: true, // Still usable, just suspicious
      reason: 'Timestamp very old',
      isSuspicious: true,
    };
  }

  return {
    isValid: true,
    isSuspicious: false,
  };
}

/**
 * Check if two timestamps could be the same due to NFS aliasing
 *
 * NFS v3 has 1-second timestamp resolution, meaning two different
 * file modifications within the same second will have the same timestamp.
 *
 * @param timestamp1 - First timestamp in milliseconds
 * @param timestamp2 - Second timestamp in milliseconds
 * @returns true if timestamps are within NFS resolution
 *
 * @example
 * ```typescript
 * if (couldBeNfsAliased(oldMtime, newMtime)) {
 *   // Fall back to content hash comparison
 *   const hashChanged = await compareHashes(oldHash, newHash);
 * }
 * ```
 */
export function couldBeNfsAliased(timestamp1: number, timestamp2: number): boolean {
  return Math.abs(timestamp1 - timestamp2) < NFS_TIMESTAMP_RESOLUTION_MS;
}

/**
 * Get a safe timestamp, returning a fallback if the timestamp is invalid
 *
 * @param timestamp - Timestamp to validate
 * @param fallback - Fallback timestamp (default: Date.now())
 * @returns Valid timestamp or fallback
 */
export function getSafeTimestamp(
  timestamp: number,
  fallback: number = Date.now()
): number {
  const validation = validateTimestamp(timestamp);
  return validation.isValid ? timestamp : fallback;
}

// ============================================================================
// Duration Measurement
// ============================================================================

/**
 * Performance timer for measuring durations with high precision
 *
 * Uses performance.now() which is immune to clock adjustments and
 * provides sub-millisecond precision.
 *
 * @example
 * ```typescript
 * const timer = createPerfTimer();
 * await someOperation();
 * console.log(`Operation took ${timer.elapsed()}ms`);
 * ```
 */
export interface PerfTimer {
  /** Get elapsed time in milliseconds */
  elapsed(): number;
  /** Reset the timer */
  reset(): void;
}

/**
 * Create a high-precision performance timer
 *
 * @returns PerfTimer instance
 */
export function createPerfTimer(): PerfTimer {
  let start = performance.now();

  return {
    elapsed(): number {
      return performance.now() - start;
    },
    reset(): void {
      start = performance.now();
    },
  };
}

/**
 * Measure the duration of an async operation with high precision
 *
 * @param operation - Async operation to measure
 * @returns Object with result and duration in milliseconds
 *
 * @example
 * ```typescript
 * const { result, durationMs } = await measureDuration(async () => {
 *   return await searchIndex(query);
 * });
 * console.log(`Search took ${durationMs}ms, found ${result.length} results`);
 * ```
 */
export async function measureDuration<T>(
  operation: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const timer = createPerfTimer();
  const result = await operation();
  return {
    result,
    durationMs: timer.elapsed(),
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  MAX_REASONABLE_AGE_MS,
  MAX_FUTURE_TOLERANCE_MS,
  NFS_TIMESTAMP_RESOLUTION_MS,
};
