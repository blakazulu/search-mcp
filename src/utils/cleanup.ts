/**
 * Cleanup Registry Module
 *
 * Provides a centralized cleanup handler registry for graceful shutdown.
 * Resources (FileWatcher, LanceDB, IntegrityEngine, etc.) register their
 * cleanup handlers here, and they are called in LIFO order during shutdown.
 *
 * Features:
 * - Register/unregister cleanup handlers
 * - Run all handlers in reverse order (LIFO) for proper dependency handling
 * - Prevent duplicate cleanup runs
 * - Configurable timeout for cleanup operations
 * - Error isolation (one handler failure doesn't stop others)
 */

import { getLogger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Cleanup handler function type
 * Should clean up resources and return a promise
 */
export type CleanupHandler = () => Promise<void>;

/**
 * Cleanup handler with metadata
 */
interface CleanupHandlerEntry {
  /** The cleanup handler function */
  handler: CleanupHandler;
  /** Name for logging purposes */
  name: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default timeout for cleanup operations in milliseconds (30 seconds)
 */
export const DEFAULT_CLEANUP_TIMEOUT = 30000;

// ============================================================================
// State
// ============================================================================

/**
 * Array of registered cleanup handlers with metadata
 */
const cleanupHandlers: CleanupHandlerEntry[] = [];

/**
 * Flag to prevent multiple cleanup runs
 */
let isShuttingDown = false;

/**
 * Flag to track if cleanup has completed
 */
let cleanupCompleted = false;

// ============================================================================
// Public API
// ============================================================================

/**
 * Register a cleanup handler to be called on shutdown.
 * Handlers are called in reverse order (LIFO) to properly handle dependencies.
 *
 * @param handler - The cleanup handler function
 * @param name - Optional name for logging (defaults to 'anonymous')
 *
 * @example
 * ```typescript
 * // In FileWatcher.start()
 * registerCleanup(async () => {
 *   await this.stop();
 * }, 'FileWatcher');
 * ```
 */
export function registerCleanup(handler: CleanupHandler, name: string = 'anonymous'): void {
  // Don't register during or after shutdown
  if (isShuttingDown || cleanupCompleted) {
    getLogger().warn('cleanup', 'Attempted to register handler during/after shutdown', { name });
    return;
  }

  cleanupHandlers.push({ handler, name });
  getLogger().debug('cleanup', `Registered cleanup handler: ${name}`, {
    totalHandlers: cleanupHandlers.length,
  });
}

/**
 * Unregister a cleanup handler.
 * Used when a resource is explicitly closed before shutdown.
 *
 * @param handler - The cleanup handler function to remove
 *
 * @example
 * ```typescript
 * // In FileWatcher.stop()
 * unregisterCleanup(this.cleanupHandler);
 * ```
 */
export function unregisterCleanup(handler: CleanupHandler): void {
  const index = cleanupHandlers.findIndex((entry) => entry.handler === handler);
  if (index !== -1) {
    const removed = cleanupHandlers.splice(index, 1)[0];
    getLogger().debug('cleanup', `Unregistered cleanup handler: ${removed.name}`, {
      totalHandlers: cleanupHandlers.length,
    });
  }
}

/**
 * Run all cleanup handlers in reverse order (LIFO).
 * This ensures that resources registered later (which may depend on earlier ones)
 * are cleaned up first.
 *
 * @param timeoutMs - Optional timeout in milliseconds (default: 30 seconds)
 * @returns Promise that resolves when all handlers have been called
 *
 * @example
 * ```typescript
 * // In shutdown handler
 * await runCleanup();
 * ```
 */
export async function runCleanup(timeoutMs: number = DEFAULT_CLEANUP_TIMEOUT): Promise<void> {
  // Prevent multiple cleanup runs
  if (isShuttingDown) {
    getLogger().debug('cleanup', 'Cleanup already in progress, skipping');
    return;
  }

  if (cleanupCompleted) {
    getLogger().debug('cleanup', 'Cleanup already completed, skipping');
    return;
  }

  isShuttingDown = true;

  const logger = getLogger();
  const handlerCount = cleanupHandlers.length;

  logger.info('cleanup', `Running ${handlerCount} cleanup handlers...`);

  // Create a copy and reverse it for LIFO order
  const handlersToRun = [...cleanupHandlers].reverse();

  // Clear the original array to prevent re-registration during cleanup
  cleanupHandlers.length = 0;

  // Run each handler with timeout and error isolation
  for (const entry of handlersToRun) {
    try {
      logger.debug('cleanup', `Running cleanup handler: ${entry.name}`);

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Cleanup handler '${entry.name}' timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      });

      // Race the handler against the timeout
      await Promise.race([entry.handler(), timeoutPromise]);

      logger.debug('cleanup', `Cleanup handler completed: ${entry.name}`);
    } catch (error) {
      // Log error but continue with other handlers
      logger.error('cleanup', `Cleanup handler '${entry.name}' failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  cleanupCompleted = true;
  logger.info('cleanup', 'All cleanup handlers completed');
}

/**
 * Check if shutdown is in progress.
 * Useful for resources to skip operations during shutdown.
 *
 * @returns true if runCleanup() has been called but not completed
 */
export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}

/**
 * Check if cleanup has completed.
 *
 * @returns true if runCleanup() has completed
 */
export function isCleanupCompleted(): boolean {
  return cleanupCompleted;
}

/**
 * Get the number of registered cleanup handlers.
 * Useful for testing and debugging.
 *
 * @returns Number of registered handlers
 */
export function getCleanupHandlerCount(): number {
  return cleanupHandlers.length;
}

/**
 * Reset the cleanup registry state.
 * **ONLY FOR TESTING** - do not use in production code.
 */
export function resetCleanupRegistry(): void {
  cleanupHandlers.length = 0;
  isShuttingDown = false;
  cleanupCompleted = false;
}
