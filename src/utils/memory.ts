/**
 * Memory Monitoring Utilities
 *
 * Provides utilities for monitoring memory usage during indexing operations.
 * Helps detect and prevent OOM conditions by providing early warnings and
 * graceful degradation capabilities (MCP-22).
 */

import { getLogger } from './logger.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  /** Heap memory used in bytes */
  heapUsed: number;
  /** Total heap memory allocated in bytes */
  heapTotal: number;
  /** Resident set size (total memory allocated) in bytes */
  rss: number;
  /** External memory used by C++ objects bound to JavaScript */
  external: number;
  /** Percentage of heap used (heapUsed / heapTotal) */
  heapUsedPercent: number;
}

/**
 * Memory warning level
 */
export type MemoryWarningLevel = 'normal' | 'warning' | 'critical';

/**
 * Memory status with warning information
 */
export interface MemoryStatus {
  /** Current memory statistics */
  stats: MemoryStats;
  /** Warning level based on current usage */
  level: MemoryWarningLevel;
  /** Human-readable message about current status */
  message: string;
}

/**
 * Callback for memory warnings
 */
export type MemoryWarningCallback = (status: MemoryStatus) => void;

// ============================================================================
// Constants
// ============================================================================

/**
 * Warning threshold - warn when heap usage exceeds this percentage
 */
export const MEMORY_WARNING_THRESHOLD = 0.70; // 70%

/**
 * Critical threshold - take action when heap usage exceeds this percentage
 */
export const MEMORY_CRITICAL_THRESHOLD = 0.85; // 85%

/**
 * Minimum heap size (in bytes) before percentage-based critical checks apply.
 * V8's heapTotal is dynamic and starts small. We shouldn't consider memory
 * "critical" if the heap is small and V8 can still expand it.
 * 256MB is a reasonable minimum - below this, V8 can easily expand.
 */
export const MIN_HEAP_FOR_CRITICAL_CHECK = 256 * 1024 * 1024; // 256MB

/**
 * Absolute memory threshold (in bytes) - always trigger critical if heapUsed exceeds this.
 * This is a safety net for very large heaps.
 */
export const ABSOLUTE_CRITICAL_THRESHOLD = 3 * 1024 * 1024 * 1024; // 3GB

/**
 * Default interval for periodic memory checks (in milliseconds)
 */
export const DEFAULT_CHECK_INTERVAL = 5000; // 5 seconds

/**
 * Check if memory critical checks are disabled via environment variable.
 * Set SEARCH_MCP_DISABLE_MEMORY_CRITICAL=true to disable critical memory checks.
 * This is useful for testing where memory pressure is expected and safe.
 */
export function isMemoryCriticalCheckDisabled(): boolean {
  return process.env.SEARCH_MCP_DISABLE_MEMORY_CRITICAL === 'true' ||
         process.env.VITEST === 'true' ||
         process.env.NODE_ENV === 'test';
}

// ============================================================================
// Memory Monitoring Functions
// ============================================================================

/**
 * Get current memory usage statistics
 *
 * @returns Current memory statistics
 */
export function getMemoryStats(): MemoryStats {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    rss: usage.rss,
    external: usage.external,
    heapUsedPercent: usage.heapUsed / usage.heapTotal,
  };
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Number of bytes
 * @returns Human-readable string (e.g., "256MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  } else if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }
}

/**
 * Get current memory status with warning level
 *
 * @returns Memory status with warning information
 */
export function getMemoryStatus(): MemoryStatus {
  const stats = getMemoryStats();
  let level: MemoryWarningLevel;
  let message: string;

  if (stats.heapUsedPercent >= MEMORY_CRITICAL_THRESHOLD) {
    level = 'critical';
    message = `Critical: Memory usage at ${Math.round(stats.heapUsedPercent * 100)}% (${formatBytes(stats.heapUsed)} / ${formatBytes(stats.heapTotal)})`;
  } else if (stats.heapUsedPercent >= MEMORY_WARNING_THRESHOLD) {
    level = 'warning';
    message = `Warning: Memory usage at ${Math.round(stats.heapUsedPercent * 100)}% (${formatBytes(stats.heapUsed)} / ${formatBytes(stats.heapTotal)})`;
  } else {
    level = 'normal';
    message = `Normal: Memory usage at ${Math.round(stats.heapUsedPercent * 100)}% (${formatBytes(stats.heapUsed)} / ${formatBytes(stats.heapTotal)})`;
  }

  return { stats, level, message };
}

/**
 * Log current memory usage
 *
 * @param phase - Description of the current operation phase
 */
export function logMemoryUsage(phase: string): void {
  const logger = getLogger();
  const status = getMemoryStatus();

  const logData = {
    heapUsed: formatBytes(status.stats.heapUsed),
    heapTotal: formatBytes(status.stats.heapTotal),
    rss: formatBytes(status.stats.rss),
    heapPercent: `${Math.round(status.stats.heapUsedPercent * 100)}%`,
  };

  switch (status.level) {
    case 'critical':
      logger.error('Memory', `${phase}: ${status.message}`, logData);
      break;
    case 'warning':
      logger.warn('Memory', `${phase}: ${status.message}`, logData);
      break;
    default:
      logger.debug('Memory', phase, logData);
  }
}

/**
 * Check if memory usage is at a critical level.
 *
 * This uses smart thresholds that account for V8's dynamic heap sizing:
 * - Disabled in test environments (VITEST=true, NODE_ENV=test)
 * - Disabled via SEARCH_MCP_DISABLE_MEMORY_CRITICAL=true
 * - Only triggers percentage-based check if heapTotal > MIN_HEAP_FOR_CRITICAL_CHECK
 * - Always triggers if heapUsed > ABSOLUTE_CRITICAL_THRESHOLD (safety net)
 *
 * @returns true if memory usage is critical and action should be taken
 */
export function isMemoryCritical(): boolean {
  // Check if critical checks are disabled (test environment or env var)
  if (isMemoryCriticalCheckDisabled()) {
    return false;
  }

  const stats = getMemoryStats();

  // Safety net: always critical if absolute usage is very high
  if (stats.heapUsed >= ABSOLUTE_CRITICAL_THRESHOLD) {
    return true;
  }

  // Only apply percentage-based check if heap is large enough
  // When heapTotal is small, V8 can easily expand it
  if (stats.heapTotal < MIN_HEAP_FOR_CRITICAL_CHECK) {
    return false;
  }

  // Apply percentage-based critical check
  return stats.heapUsedPercent >= MEMORY_CRITICAL_THRESHOLD;
}

/**
 * Check if memory usage is at warning or critical level
 *
 * @returns true if memory usage requires attention
 */
export function isMemoryWarning(): boolean {
  const status = getMemoryStatus();
  return status.level === 'warning' || status.level === 'critical';
}

/**
 * Request garbage collection if available
 *
 * Note: This only works if Node.js is started with --expose-gc flag.
 * In production, V8 manages GC automatically, so this is mainly useful
 * for testing and debugging.
 *
 * @returns true if GC was requested, false if not available
 */
export function requestGarbageCollection(): boolean {
  if (typeof global.gc === 'function') {
    const logger = getLogger();
    logger.debug('Memory', 'Requesting garbage collection');
    global.gc();
    return true;
  }
  return false;
}

/**
 * Force garbage collection and wait for memory to be released.
 * This is useful between test runs to ensure clean state.
 *
 * If global.gc is not available (no --expose-gc flag), this function
 * still works by clearing module caches and waiting for natural GC.
 *
 * @param delayMs - Time to wait after GC request (default 100ms)
 * @returns Promise that resolves when cleanup is complete
 */
export async function forceGarbageCollection(delayMs: number = 100): Promise<void> {
  const logger = getLogger();

  // Clear any weak references and finalization registries
  // by running multiple GC cycles if available
  for (let i = 0; i < 3; i++) {
    if (typeof global.gc === 'function') {
      global.gc();
    }
    // Small delay between cycles to allow finalizers to run
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Wait for memory to be released
  await new Promise(resolve => setTimeout(resolve, delayMs));

  const stats = getMemoryStats();
  logger.debug('Memory', 'Garbage collection complete', {
    heapUsed: formatBytes(stats.heapUsed),
    heapTotal: formatBytes(stats.heapTotal),
    heapPercent: `${Math.round(stats.heapUsedPercent * 100)}%`,
  });
}

/**
 * Get current memory usage in MB (useful for logging)
 *
 * @returns Current heap used in MB
 */
export function getMemoryUsageMB(): number {
  const stats = getMemoryStats();
  return Math.round(stats.heapUsed / (1024 * 1024));
}

// ============================================================================
// Memory Monitor Class
// ============================================================================

/**
 * Memory monitor that periodically checks memory usage and triggers
 * callbacks when thresholds are exceeded.
 *
 * @example
 * ```typescript
 * const monitor = new MemoryMonitor();
 * monitor.onWarning((status) => {
 *   console.log('Memory warning:', status.message);
 * });
 * monitor.start();
 * // ... do work ...
 * monitor.stop();
 * ```
 */
export class MemoryMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private warningCallbacks: MemoryWarningCallback[] = [];
  private checkInterval: number;
  private lastWarningLevel: MemoryWarningLevel = 'normal';

  /**
   * Create a new memory monitor
   *
   * @param checkInterval - Interval between checks in milliseconds
   */
  constructor(checkInterval: number = DEFAULT_CHECK_INTERVAL) {
    this.checkInterval = checkInterval;
  }

  /**
   * Register a callback for memory warnings
   *
   * @param callback - Function to call when memory reaches warning or critical level
   */
  onWarning(callback: MemoryWarningCallback): void {
    this.warningCallbacks.push(callback);
  }

  /**
   * Start periodic memory monitoring
   */
  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    const logger = getLogger();
    logger.debug('MemoryMonitor', 'Starting memory monitoring', {
      interval: `${this.checkInterval}ms`,
    });

    this.intervalId = setInterval(() => {
      this.check();
    }, this.checkInterval);
  }

  /**
   * Stop periodic memory monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;

      const logger = getLogger();
      logger.debug('MemoryMonitor', 'Stopped memory monitoring');
    }
  }

  /**
   * Perform a single memory check
   */
  check(): void {
    const status = getMemoryStatus();

    // Only notify if level changed or is warning/critical
    if (status.level !== 'normal' || this.lastWarningLevel !== 'normal') {
      if (status.level !== this.lastWarningLevel || status.level !== 'normal') {
        for (const callback of this.warningCallbacks) {
          try {
            callback(status);
          } catch (error) {
            // Ignore callback errors
          }
        }
      }
    }

    this.lastWarningLevel = status.level;
  }

  /**
   * Check if the monitor is currently running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

// ============================================================================
// Adaptive Batch Sizing
// ============================================================================

/**
 * Calculate an adaptive batch size based on current memory usage.
 * Reduces batch size when memory is constrained to prevent OOM.
 *
 * @param defaultBatchSize - The default batch size to use when memory is normal
 * @param minBatchSize - Minimum batch size to use even under memory pressure
 * @returns Adjusted batch size based on current memory status
 */
export function getAdaptiveBatchSize(
  defaultBatchSize: number,
  minBatchSize: number = 10
): number {
  const status = getMemoryStatus();

  switch (status.level) {
    case 'critical':
      // Use minimum batch size under critical memory
      return minBatchSize;
    case 'warning':
      // Use half the default batch size under warning
      return Math.max(minBatchSize, Math.floor(defaultBatchSize / 2));
    default:
      return defaultBatchSize;
  }
}
