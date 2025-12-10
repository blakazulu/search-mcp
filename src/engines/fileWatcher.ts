/**
 * File Watcher Engine
 *
 * Provides real-time filesystem monitoring using chokidar. Watches for file changes
 * and triggers incremental index updates. Includes debouncing to handle rapid saves
 * and policy filtering to ignore unwanted changes.
 *
 * Features:
 * - Real-time file add/change/delete detection
 * - Debouncing for rapid changes (500ms)
 * - Policy filtering to ignore unwanted files
 * - Fingerprint comparison to detect actual content changes
 * - Graceful error handling (watcher errors don't crash server)
 */

import chokidar from 'chokidar';
import { IndexManager } from './indexManager.js';
import { DocsIndexManager } from './docsIndexManager.js';
import { IndexingPolicy, ALL_DENY_PATTERNS, isHardDenied } from './indexPolicy.js';
import { isDocFile } from './docsChunking.js';
import { FingerprintsManager } from '../storage/fingerprints.js';
import { DocsFingerprintsManager } from '../storage/docsFingerprints.js';
import { toRelativePath, toAbsolutePath, normalizePath } from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { registerCleanup, unregisterCleanup, isShutdownInProgress, CleanupHandler } from '../utils/cleanup.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Watch event types from chokidar
 */
export type WatchEvent = 'add' | 'change' | 'unlink';

/**
 * File event information
 */
export interface FileEvent {
  /** Type of file system event */
  type: WatchEvent;
  /** Absolute path to the file */
  path: string;
  /** Relative path from project root (forward-slash separated) */
  relativePath: string;
}

/**
 * Watcher statistics
 */
export interface WatcherStats {
  /** Number of events processed since start */
  eventsProcessed: number;
  /** Number of events skipped (policy/fingerprint) */
  eventsSkipped: number;
  /** Number of index updates triggered */
  indexUpdates: number;
  /** Number of errors encountered */
  errors: number;
  /** Timestamp when watcher was started */
  startedAt: number | null;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default debounce delay in milliseconds
 */
export const DEFAULT_DEBOUNCE_DELAY = 500;

/**
 * Stability threshold for awaitWriteFinish
 */
export const STABILITY_THRESHOLD = 500;

/**
 * Poll interval for awaitWriteFinish
 */
export const POLL_INTERVAL = 100;

/**
 * Windows polling interval in milliseconds
 * Used when usePolling is enabled (Windows file watching)
 * 300ms is a good balance between responsiveness and CPU usage
 */
export const WINDOWS_POLL_INTERVAL = 300;

/**
 * Windows binary file polling interval in milliseconds
 * Can be higher since binary files change less frequently
 */
export const WINDOWS_BINARY_POLL_INTERVAL = 500;

/**
 * Maximum restart attempts on error
 */
export const MAX_RESTART_ATTEMPTS = 3;

/**
 * Delay before restart attempt in milliseconds
 */
export const RESTART_DELAY_MS = 5000;

/**
 * Convert hardcoded deny patterns to chokidar-compatible patterns
 */
function getDenyPatternsForChokidar(): string[] {
  // chokidar uses anymatch, which supports globs
  // We need to convert our patterns to work with chokidar's ignored option
  const patterns: string[] = [];

  for (const pattern of ALL_DENY_PATTERNS) {
    // chokidar's ignored option works with both globs and regex
    patterns.push(`**/${pattern}`);
    // Also add the pattern without the leading **/
    patterns.push(pattern);
  }

  return patterns;
}

/**
 * Chokidar watcher options
 *
 * Windows-specific configuration:
 * - usePolling: Required for Windows/network drives for reliable change detection
 * - interval: Throttle polling to avoid high CPU usage (Bug #18)
 * - binaryInterval: Higher interval for binary files which change less frequently
 */
export const WATCHER_OPTIONS: chokidar.WatchOptions = {
  ignored: getDenyPatternsForChokidar(),
  persistent: true,
  ignoreInitial: true, // Don't trigger events on startup scan
  awaitWriteFinish: {
    stabilityThreshold: STABILITY_THRESHOLD,
    pollInterval: POLL_INTERVAL,
  },
  followSymlinks: false,
  // Use polling on Windows for better reliability with network drives
  usePolling: process.platform === 'win32',
  // Windows polling throttling to avoid high CPU usage (Bug #18)
  interval: process.platform === 'win32' ? WINDOWS_POLL_INTERVAL : undefined,
  binaryInterval: process.platform === 'win32' ? WINDOWS_BINARY_POLL_INTERVAL : undefined,
  // Ignore permission errors
  ignorePermissionErrors: true,
};

// ============================================================================
// FileWatcher Class
// ============================================================================

/**
 * File Watcher for real-time filesystem monitoring
 *
 * Watches a project directory for file changes and triggers incremental
 * index updates. Includes debouncing and policy filtering.
 *
 * @example
 * ```typescript
 * const watcher = new FileWatcher(
 *   '/path/to/project',
 *   '/path/to/index',
 *   indexManager,
 *   policy,
 *   fingerprints
 * );
 *
 * await watcher.start();
 *
 * // Later, when done
 * await watcher.stop();
 * ```
 */
export class FileWatcher {
  private readonly projectPath: string;
  private readonly indexPath: string;
  private readonly indexManager: IndexManager;
  private readonly policy: IndexingPolicy;
  private readonly fingerprints: FingerprintsManager;
  private readonly debounceDelay: number;

  /** Optional DocsIndexManager for routing doc file changes */
  private readonly docsIndexManager?: DocsIndexManager;
  /** Optional docs fingerprints for doc file change detection */
  private readonly docsFingerprints?: DocsFingerprintsManager;

  private watcher: chokidar.FSWatcher | null = null;
  private isRunning = false;
  private stats: WatcherStats = {
    eventsProcessed: 0,
    eventsSkipped: 0,
    indexUpdates: 0,
    errors: 0,
    startedAt: null,
  };

  /**
   * Map of pending events for debouncing
   * Key: relative path, Value: timeout handle
   */
  private pendingEvents = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Queue of events being processed to avoid concurrent updates to same file
   */
  private processingQueue = new Set<string>();

  /**
   * Reference to cleanup handler for unregistration
   */
  private cleanupHandler: CleanupHandler | null = null;

  /**
   * Number of restart attempts after errors
   */
  private restartAttempts = 0;

  /**
   * Timer for scheduled restart
   */
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Create a new FileWatcher instance
   *
   * @param projectPath - Absolute path to the project root
   * @param indexPath - Absolute path to the index directory
   * @param indexManager - IndexManager instance for updates
   * @param policy - IndexingPolicy instance for filtering
   * @param fingerprints - FingerprintsManager instance for change detection
   * @param debounceDelay - Debounce delay in milliseconds (default: 500)
   * @param docsIndexManager - Optional DocsIndexManager for doc file routing
   * @param docsFingerprints - Optional DocsFingerprintsManager for doc file change detection
   */
  constructor(
    projectPath: string,
    indexPath: string,
    indexManager: IndexManager,
    policy: IndexingPolicy,
    fingerprints: FingerprintsManager,
    debounceDelay: number = DEFAULT_DEBOUNCE_DELAY,
    docsIndexManager?: DocsIndexManager,
    docsFingerprints?: DocsFingerprintsManager
  ) {
    this.projectPath = normalizePath(projectPath);
    this.indexPath = normalizePath(indexPath);
    this.indexManager = indexManager;
    this.policy = policy;
    this.fingerprints = fingerprints;
    this.debounceDelay = debounceDelay;
    this.docsIndexManager = docsIndexManager;
    this.docsFingerprints = docsFingerprints;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Start watching the project directory
   *
   * @throws Error if watcher is already running
   */
  async start(): Promise<void> {
    const logger = getLogger();

    if (this.isRunning) {
      logger.warn('FileWatcher', 'Watcher already running, ignoring start request');
      return;
    }

    logger.info('FileWatcher', 'Starting file watcher', {
      projectPath: this.projectPath,
    });

    // Ensure fingerprints are loaded
    if (!this.fingerprints.isLoaded()) {
      await this.fingerprints.load();
    }

    // Ensure docs fingerprints are loaded (if provided)
    if (this.docsFingerprints && !this.docsFingerprints.isLoaded()) {
      await this.docsFingerprints.load();
    }

    // Ensure policy is initialized
    if (!this.policy.isInitialized()) {
      await this.policy.initialize();
    }

    // Create watcher
    this.watcher = chokidar.watch(this.projectPath, WATCHER_OPTIONS);

    // Bind event handlers
    this.watcher.on('add', (path) => this.onAdd(path));
    this.watcher.on('change', (path) => this.onChange(path));
    this.watcher.on('unlink', (path) => this.onUnlink(path));
    this.watcher.on('error', (error) => this.onError(error));

    // Wait for ready event
    await new Promise<void>((resolve) => {
      this.watcher!.on('ready', () => {
        logger.info('FileWatcher', 'File watcher ready');
        resolve();
      });
    });

    this.isRunning = true;
    this.stats.startedAt = Date.now();
    this.restartAttempts = 0; // Reset restart counter on successful start

    // Register cleanup handler for graceful shutdown
    this.cleanupHandler = async () => {
      await this.stop();
    };
    registerCleanup(this.cleanupHandler, 'FileWatcher');
  }

  /**
   * Stop watching the project directory
   */
  async stop(): Promise<void> {
    const logger = getLogger();

    if (!this.isRunning || !this.watcher) {
      logger.debug('FileWatcher', 'Watcher not running, ignoring stop request');
      return;
    }

    logger.info('FileWatcher', 'Stopping file watcher');

    // Unregister cleanup handler (avoid double cleanup)
    if (this.cleanupHandler) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }

    // Clear restart timer if pending
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    // Clear all pending events
    for (const timeout of this.pendingEvents.values()) {
      clearTimeout(timeout);
    }
    this.pendingEvents.clear();

    // Close the watcher
    await this.watcher.close();
    this.watcher = null;
    this.isRunning = false;

    logger.info('FileWatcher', 'File watcher stopped', {
      stats: this.stats,
    });
  }

  /**
   * Check if the watcher is currently running
   *
   * @returns true if watcher is running
   */
  isWatching(): boolean {
    return this.isRunning;
  }

  /**
   * Get watcher statistics
   *
   * @returns WatcherStats object
   */
  getStats(): WatcherStats {
    return { ...this.stats };
  }

  /**
   * Get the project path being watched
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Get the index path
   */
  getIndexPath(): string {
    return this.indexPath;
  }

  // ==========================================================================
  // Private Event Handlers
  // ==========================================================================

  /**
   * Handle file add event
   */
  private onAdd(absolutePath: string): void {
    this.handleFileEvent({
      type: 'add',
      path: absolutePath,
      relativePath: toRelativePath(absolutePath, this.projectPath),
    });
  }

  /**
   * Handle file change event
   */
  private onChange(absolutePath: string): void {
    this.handleFileEvent({
      type: 'change',
      path: absolutePath,
      relativePath: toRelativePath(absolutePath, this.projectPath),
    });
  }

  /**
   * Handle file unlink (delete) event
   */
  private onUnlink(absolutePath: string): void {
    this.handleFileEvent({
      type: 'unlink',
      path: absolutePath,
      relativePath: toRelativePath(absolutePath, this.projectPath),
    });
  }

  /**
   * Handle watcher error
   *
   * Implements error recovery by attempting to restart the watcher
   * after a delay, up to MAX_RESTART_ATTEMPTS times.
   */
  private onError(error: Error): void {
    const logger = getLogger();
    this.stats.errors++;

    logger.error('FileWatcher', 'Watcher error', {
      error: error.message,
      stack: error.stack,
      restartAttempts: this.restartAttempts,
    });

    // Don't attempt restart if shutdown is in progress
    if (isShutdownInProgress()) {
      logger.info('FileWatcher', 'Shutdown in progress, not attempting restart');
      return;
    }

    // Attempt restart if under the limit
    if (this.restartAttempts < MAX_RESTART_ATTEMPTS) {
      this.restartAttempts++;
      logger.info('FileWatcher', `Scheduling restart attempt ${this.restartAttempts}/${MAX_RESTART_ATTEMPTS}`, {
        delayMs: RESTART_DELAY_MS,
      });

      // Clear any existing restart timer
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
      }

      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.restart().catch((err) => {
          logger.error('FileWatcher', 'Restart failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }, RESTART_DELAY_MS);
    } else {
      logger.error('FileWatcher', 'Max restart attempts reached, watcher disabled', {
        maxAttempts: MAX_RESTART_ATTEMPTS,
      });
    }
  }

  /**
   * Restart the file watcher
   *
   * Stops the current watcher and starts a new one.
   * Used for error recovery.
   */
  async restart(): Promise<void> {
    const logger = getLogger();

    // Don't restart if shutdown is in progress
    if (isShutdownInProgress()) {
      logger.info('FileWatcher', 'Shutdown in progress, not restarting');
      return;
    }

    logger.info('FileWatcher', 'Restarting file watcher', {
      attempt: this.restartAttempts,
    });

    // Stop the current watcher (but preserve restart state)
    const currentRestartAttempts = this.restartAttempts;

    if (this.watcher) {
      // Clear all pending events
      for (const timeout of this.pendingEvents.values()) {
        clearTimeout(timeout);
      }
      this.pendingEvents.clear();

      // Unregister cleanup handler temporarily
      if (this.cleanupHandler) {
        unregisterCleanup(this.cleanupHandler);
        this.cleanupHandler = null;
      }

      try {
        await this.watcher.close();
      } catch (error) {
        logger.warn('FileWatcher', 'Error closing watcher during restart', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.watcher = null;
      this.isRunning = false;
    }

    // Restore restart attempt count (don't reset on restart)
    this.restartAttempts = currentRestartAttempts;

    // Attempt to start the watcher again
    try {
      await this.start();
      logger.info('FileWatcher', 'File watcher restarted successfully');
    } catch (error) {
      logger.error('FileWatcher', 'Failed to restart watcher', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the current restart attempt count
   */
  getRestartAttempts(): number {
    return this.restartAttempts;
  }

  /**
   * Reset the restart attempt counter
   * Useful after manual intervention or successful long-running operation
   */
  resetRestartAttempts(): void {
    this.restartAttempts = 0;
  }

  // ==========================================================================
  // Event Processing
  // ==========================================================================

  /**
   * Handle a file event (add/change/unlink)
   *
   * Applies debouncing and queues the event for processing.
   */
  private handleFileEvent(event: FileEvent): void {
    const logger = getLogger();

    logger.debug('FileWatcher', 'File event received', {
      type: event.type,
      relativePath: event.relativePath,
    });

    // Quick check for hardcoded deny patterns (synchronous)
    if (isHardDenied(event.relativePath)) {
      logger.debug('FileWatcher', 'Event skipped - hardcoded deny', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Debounce the event
    this.debounceEvent(event.relativePath, () => this.processFileEvent(event));
  }

  /**
   * Debounce an event
   *
   * If multiple events for the same file occur within the debounce window,
   * only the last one will be processed.
   *
   * Fixes:
   * - Bug #2: Race condition in processingQueue check is fixed by atomic check-and-add
   * - Bug #4: Unhandled promise rejection is fixed by wrapping in IIFE with try/catch
   */
  private debounceEvent(
    relativePath: string,
    handler: () => Promise<void>
  ): void {
    const logger = getLogger();

    // Cancel any existing pending event for this file
    const existing = this.pendingEvents.get(relativePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule the handler
    // Note: We use a regular function and IIFE to properly handle the async handler
    // This prevents unhandled promise rejections from escaping setTimeout
    const timeout = setTimeout(() => {
      this.pendingEvents.delete(relativePath);

      // Atomic check-and-add to prevent race condition
      // If already in processing queue, skip this event
      if (this.processingQueue.has(relativePath)) {
        logger.debug('FileWatcher', 'Skipping debounced event - already processing', {
          relativePath,
        });
        return;
      }

      // Add to processing queue before starting async work
      this.processingQueue.add(relativePath);

      // Wrap async handler in IIFE with proper error handling
      // This ensures promise rejections are caught and logged
      (async () => {
        try {
          await handler();
        } catch (error) {
          this.stats.errors++;
          logger.error('FileWatcher', 'Error in debounced handler', {
            relativePath,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          // Always remove from processing queue
          this.processingQueue.delete(relativePath);
        }
      })();
    }, this.debounceDelay);

    this.pendingEvents.set(relativePath, timeout);
  }

  /**
   * Process a file event
   *
   * This is called after debouncing. It checks the policy, compares
   * fingerprints, and triggers index updates if needed.
   */
  private async processFileEvent(event: FileEvent): Promise<void> {
    const logger = getLogger();
    this.stats.eventsProcessed++;

    try {
      if (event.type === 'unlink') {
        await this.handleUnlink(event);
      } else {
        // 'add' or 'change'
        await this.handleAddOrChange(event);
      }
    } catch (error) {
      this.stats.errors++;
      logger.error('FileWatcher', 'Error processing file event', {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't re-throw - continue watching other files
    }
  }

  /**
   * Handle add or change event
   *
   * 1. Check if file is a doc file (route to DocsIndexManager if provided)
   * 2. Check if file passes policy
   * 3. Calculate file hash
   * 4. Compare with stored fingerprint
   * 5. Update index if changed
   */
  private async handleAddOrChange(event: FileEvent): Promise<void> {
    const logger = getLogger();

    // Check if this is a doc file and we have a DocsIndexManager
    const isDoc = isDocFile(event.relativePath);
    if (isDoc && this.docsIndexManager) {
      await this.handleDocAddOrChange(event);
      return;
    }

    // If it's a doc file but no DocsIndexManager, skip it
    // (doc files should only go to DocsIndexManager)
    if (isDoc) {
      logger.debug('FileWatcher', 'Doc file skipped - no DocsIndexManager', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Check policy
    const policyResult = await this.policy.shouldIndex(
      event.relativePath,
      event.path
    );

    if (!policyResult.shouldIndex) {
      logger.debug('FileWatcher', 'Event skipped - policy', {
        relativePath: event.relativePath,
        reason: policyResult.reason,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Calculate current hash
    let currentHash: string;
    try {
      currentHash = await hashFile(event.path);
    } catch (error) {
      // File might have been deleted between event and processing
      logger.debug('FileWatcher', 'Could not hash file, may have been deleted', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Compare with stored fingerprint
    const storedHash = this.fingerprints.get(event.relativePath);

    if (storedHash === currentHash) {
      logger.debug('FileWatcher', 'Event skipped - content unchanged', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Content changed - update index
    logger.info('FileWatcher', 'Updating index for changed file', {
      type: event.type,
      relativePath: event.relativePath,
      wasNew: storedHash === undefined,
    });

    await this.indexManager.updateFile(event.relativePath);

    // Update in-memory fingerprint directly instead of reloading from disk (Bug #20)
    // The IndexManager already saved the updated fingerprints to disk,
    // so we just need to update our local cache to avoid expensive disk I/O
    this.fingerprints.set(event.relativePath, currentHash);

    this.stats.indexUpdates++;
  }

  /**
   * Handle add or change event for doc files
   *
   * Routes doc file changes to DocsIndexManager instead of IndexManager.
   */
  private async handleDocAddOrChange(event: FileEvent): Promise<void> {
    const logger = getLogger();

    // Check policy (docs still need to pass policy checks)
    const policyResult = await this.policy.shouldIndex(
      event.relativePath,
      event.path
    );

    if (!policyResult.shouldIndex) {
      logger.debug('FileWatcher', 'Doc event skipped - policy', {
        relativePath: event.relativePath,
        reason: policyResult.reason,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Calculate current hash
    let currentHash: string;
    try {
      currentHash = await hashFile(event.path);
    } catch (error) {
      // File might have been deleted between event and processing
      logger.debug('FileWatcher', 'Could not hash doc file, may have been deleted', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Compare with stored fingerprint from docs fingerprints
    const storedHash = this.docsFingerprints?.get(event.relativePath);

    if (storedHash === currentHash) {
      logger.debug('FileWatcher', 'Doc event skipped - content unchanged', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Content changed - update docs index
    logger.info('FileWatcher', 'Updating docs index for changed doc file', {
      type: event.type,
      relativePath: event.relativePath,
      wasNew: storedHash === undefined,
    });

    await this.docsIndexManager!.updateDocFile(event.relativePath);

    // Update in-memory docs fingerprint directly instead of reloading from disk (Bug #20)
    // The DocsIndexManager already saved the updated fingerprints to disk,
    // so we just need to update our local cache to avoid expensive disk I/O
    if (this.docsFingerprints) {
      this.docsFingerprints.set(event.relativePath, currentHash);
    }

    this.stats.indexUpdates++;
  }

  /**
   * Handle unlink (delete) event
   *
   * 1. Check if file is a doc file (route to DocsIndexManager if provided)
   * 2. Delete chunks from index
   * 3. Remove from fingerprints
   */
  private async handleUnlink(event: FileEvent): Promise<void> {
    const logger = getLogger();

    // Check if this is a doc file and we have a DocsIndexManager
    const isDoc = isDocFile(event.relativePath);
    if (isDoc && this.docsIndexManager) {
      await this.handleDocUnlink(event);
      return;
    }

    // If it's a doc file but no DocsIndexManager, skip it
    if (isDoc) {
      logger.debug('FileWatcher', 'Doc unlink skipped - no DocsIndexManager', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    // Check if file was even indexed (skip if not in fingerprints)
    if (!this.fingerprints.has(event.relativePath)) {
      logger.debug('FileWatcher', 'Unlink skipped - not in fingerprints', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    logger.info('FileWatcher', 'Removing deleted file from index', {
      relativePath: event.relativePath,
    });

    await this.indexManager.removeFile(event.relativePath);

    // Remove from in-memory fingerprints directly instead of reloading from disk (Bug #20)
    // The IndexManager already saved the updated fingerprints to disk,
    // so we just need to update our local cache to avoid expensive disk I/O
    this.fingerprints.delete(event.relativePath);

    this.stats.indexUpdates++;
  }

  /**
   * Handle unlink (delete) event for doc files
   *
   * Routes doc file deletions to DocsIndexManager instead of IndexManager.
   */
  private async handleDocUnlink(event: FileEvent): Promise<void> {
    const logger = getLogger();

    // Check if file was even indexed (skip if not in docs fingerprints)
    if (!this.docsFingerprints?.has(event.relativePath)) {
      logger.debug('FileWatcher', 'Doc unlink skipped - not in docs fingerprints', {
        relativePath: event.relativePath,
      });
      this.stats.eventsSkipped++;
      return;
    }

    logger.info('FileWatcher', 'Removing deleted doc file from docs index', {
      relativePath: event.relativePath,
    });

    await this.docsIndexManager!.removeDocFile(event.relativePath);

    // Remove from in-memory docs fingerprints directly instead of reloading from disk (Bug #20)
    // The DocsIndexManager already saved the updated fingerprints to disk,
    // so we just need to update our local cache to avoid expensive disk I/O
    if (this.docsFingerprints) {
      this.docsFingerprints.delete(event.relativePath);
    }

    this.stats.indexUpdates++;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a FileWatcher for a project
 *
 * Convenience function to create a FileWatcher with all required dependencies.
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param indexManager - IndexManager instance
 * @param policy - IndexingPolicy instance
 * @param fingerprints - FingerprintsManager instance
 * @param debounceDelay - Optional debounce delay in milliseconds
 * @param docsIndexManager - Optional DocsIndexManager for doc file routing
 * @param docsFingerprints - Optional DocsFingerprintsManager for doc file change detection
 * @returns FileWatcher instance (not yet started)
 */
export function createFileWatcher(
  projectPath: string,
  indexPath: string,
  indexManager: IndexManager,
  policy: IndexingPolicy,
  fingerprints: FingerprintsManager,
  debounceDelay?: number,
  docsIndexManager?: DocsIndexManager,
  docsFingerprints?: DocsFingerprintsManager
): FileWatcher {
  return new FileWatcher(
    projectPath,
    indexPath,
    indexManager,
    policy,
    fingerprints,
    debounceDelay,
    docsIndexManager,
    docsFingerprints
  );
}
