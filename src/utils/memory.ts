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
 * Default interval for periodic memory checks (in milliseconds)
 */
export const DEFAULT_CHECK_INTERVAL = 5000; // 5 seconds

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
 * Check if memory usage is at a critical level
 *
 * @returns true if memory usage is critical
 */
export function isMemoryCritical(): boolean {
  const status = getMemoryStatus();
  return status.level === 'critical';
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
 */
export function requestGarbageCollection(): void {
  if (typeof global.gc === 'function') {
    const logger = getLogger();
    logger.debug('Memory', 'Requesting garbage collection');
    global.gc();
  }
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
