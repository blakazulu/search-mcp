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
import { IndexingPolicy, ALL_DENY_PATTERNS, isHardDenied } from './indexPolicy.js';
import { FingerprintsManager } from '../storage/fingerprints.js';
import { toRelativePath, toAbsolutePath, normalizePath } from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';

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
  // Use polling on Windows for better reliability
  usePolling: process.platform === 'win32',
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
   * Create a new FileWatcher instance
   *
   * @param projectPath - Absolute path to the project root
   * @param indexPath - Absolute path to the index directory
   * @param indexManager - IndexManager instance for updates
   * @param policy - IndexingPolicy instance for filtering
   * @param fingerprints - FingerprintsManager instance for change detection
   * @param debounceDelay - Debounce delay in milliseconds (default: 500)
   */
  constructor(
    projectPath: string,
    indexPath: string,
    indexManager: IndexManager,
    policy: IndexingPolicy,
    fingerprints: FingerprintsManager,
    debounceDelay: number = DEFAULT_DEBOUNCE_DELAY
  ) {
    this.projectPath = normalizePath(projectPath);
    this.indexPath = normalizePath(indexPath);
    this.indexManager = indexManager;
    this.policy = policy;
    this.fingerprints = fingerprints;
    this.debounceDelay = debounceDelay;
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
   */
  private onError(error: Error): void {
    const logger = getLogger();
    this.stats.errors++;

    logger.error('FileWatcher', 'Watcher error', {
      error: error.message,
      stack: error.stack,
    });

    // Don't crash - just log and continue
    // The watcher may still work for other files
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
   */
  private debounceEvent(
    relativePath: string,
    handler: () => Promise<void>
  ): void {
    // Cancel any existing pending event for this file
    const existing = this.pendingEvents.get(relativePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule the handler
    const timeout = setTimeout(async () => {
      this.pendingEvents.delete(relativePath);

      // Skip if file is already being processed
      if (this.processingQueue.has(relativePath)) {
        return;
      }

      this.processingQueue.add(relativePath);
      try {
        await handler();
      } finally {
        this.processingQueue.delete(relativePath);
      }
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
   * 1. Check if file passes policy
   * 2. Calculate file hash
   * 3. Compare with stored fingerprint
   * 4. Update index if changed
   */
  private async handleAddOrChange(event: FileEvent): Promise<void> {
    const logger = getLogger();

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

    // Reload fingerprints to get the updated hash
    await this.fingerprints.load();

    this.stats.indexUpdates++;
  }

  /**
   * Handle unlink (delete) event
   *
   * 1. Delete chunks from index
   * 2. Remove from fingerprints
   */
  private async handleUnlink(event: FileEvent): Promise<void> {
    const logger = getLogger();

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

    // Reload fingerprints to reflect removal
    await this.fingerprints.load();

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
 * @returns FileWatcher instance (not yet started)
 */
export function createFileWatcher(
  projectPath: string,
  indexPath: string,
  indexManager: IndexManager,
  policy: IndexingPolicy,
  fingerprints: FingerprintsManager,
  debounceDelay?: number
): FileWatcher {
  return new FileWatcher(
    projectPath,
    indexPath,
    indexManager,
    policy,
    fingerprints,
    debounceDelay
  );
}
