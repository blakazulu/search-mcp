/**
 * Lazy Indexing Strategy
 *
 * Detects file changes in real-time but defers indexing until:
 * 1. Idle timeout (default 30s of no activity)
 * 2. Before search (flush called by search tools)
 *
 * This reduces CPU usage for large projects by batching index updates
 * instead of processing each change immediately.
 *
 * Features:
 * - Real-time file change detection
 * - Queues changes using DirtyFilesManager
 * - Automatic flush after idle threshold
 * - Manual flush via flush() method
 * - Graceful shutdown with dirty files persistence
 */

import chokidar from 'chokidar';
import {
  IndexingStrategy,
  StrategyFileEvent,
  StrategyStats,
} from '../indexingStrategy.js';
import { IndexManager } from '../indexManager.js';
import { DocsIndexManager } from '../docsIndexManager.js';
import { IndexingPolicy, isHardDenied } from '../indexPolicy.js';
import { isDocFile } from '../docsChunking.js';
import { DirtyFilesManager } from '../../storage/dirtyFiles.js';
import { WATCHER_OPTIONS } from '../fileWatcher.js';
import { toRelativePath, normalizePath } from '../../utils/paths.js';
import { getLogger } from '../../utils/logger.js';
import {
  registerCleanup,
  unregisterCleanup,
  isShutdownInProgress,
  CleanupHandler,
} from '../../utils/cleanup.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for LazyStrategy
 */
export interface LazyStrategyOptions {
  /** Idle threshold in seconds before auto-flush (default: 30) */
  idleThresholdSeconds?: number;
}

// ============================================================================
// LazyStrategy Class
// ============================================================================

/**
 * Lazy Indexing Strategy
 *
 * Queues file changes and processes them on idle or before search.
 * This strategy is ideal for large projects where immediate indexing
 * would cause excessive CPU usage.
 *
 * @example
 * ```typescript
 * const strategy = new LazyStrategy(
 *   projectPath,
 *   indexManager,
 *   docsIndexManager,
 *   policy,
 *   dirtyFiles,
 *   30 // idle threshold in seconds
 * );
 *
 * await strategy.initialize();
 * await strategy.start();
 *
 * // File changes are queued, not processed immediately
 * // To force processing:
 * await strategy.flush();
 *
 * await strategy.stop();
 * ```
 */
export class LazyStrategy implements IndexingStrategy {
  readonly name = 'lazy' as const;

  // Dependencies
  private readonly projectPath: string;
  private readonly indexManager: IndexManager;
  private readonly docsIndexManager: DocsIndexManager | null;
  private readonly policy: IndexingPolicy;
  private readonly dirtyFiles: DirtyFilesManager;
  private readonly idleThresholdSeconds: number;

  // State
  private watcher: chokidar.FSWatcher | null = null;
  private active = false;
  private processedCount = 0;
  private lastActivity: Date | null = null;

  // Idle timer
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  // Flush lock to prevent concurrent flushes
  private flushing = false;

  // Cleanup
  private cleanupHandler: CleanupHandler | null = null;

  /**
   * Create a new LazyStrategy instance
   *
   * @param projectPath - Absolute path to the project root
   * @param indexManager - IndexManager for code file updates
   * @param docsIndexManager - DocsIndexManager for doc file updates (nullable)
   * @param policy - IndexingPolicy for file filtering
   * @param dirtyFiles - DirtyFilesManager for tracking pending changes
   * @param idleThresholdSeconds - Seconds of inactivity before auto-flush (default: 30)
   */
  constructor(
    projectPath: string,
    indexManager: IndexManager,
    docsIndexManager: DocsIndexManager | null,
    policy: IndexingPolicy,
    dirtyFiles: DirtyFilesManager,
    idleThresholdSeconds: number = 30
  ) {
    this.projectPath = normalizePath(projectPath);
    this.indexManager = indexManager;
    this.docsIndexManager = docsIndexManager;
    this.policy = policy;
    this.dirtyFiles = dirtyFiles;
    this.idleThresholdSeconds = idleThresholdSeconds;
  }

  // ==========================================================================
  // IndexingStrategy Interface Implementation
  // ==========================================================================

  /**
   * Initialize the strategy
   *
   * Loads dirty files from disk and initializes the policy.
   */
  async initialize(): Promise<void> {
    const logger = getLogger();
    logger.debug('LazyStrategy', 'Initializing');

    // Load dirty files from disk
    if (!this.dirtyFiles.isLoaded()) {
      await this.dirtyFiles.load();
    }

    // Ensure policy is initialized
    if (!this.policy.isInitialized()) {
      await this.policy.initialize();
    }

    logger.debug('LazyStrategy', 'Initialization complete', {
      pendingFiles: this.dirtyFiles.count(),
    });
  }

  /**
   * Start the strategy
   *
   * Creates a chokidar watcher and begins monitoring for file changes.
   * File changes are queued, not processed immediately.
   */
  async start(): Promise<void> {
    const logger = getLogger();

    if (this.active) {
      logger.warn('LazyStrategy', 'Strategy already active, ignoring start request');
      return;
    }

    logger.info('LazyStrategy', 'Starting file watcher (lazy mode)', {
      projectPath: this.projectPath,
      idleThreshold: this.idleThresholdSeconds,
    });

    // Create watcher with shared options from FileWatcher
    this.watcher = chokidar.watch(this.projectPath, WATCHER_OPTIONS);

    // Bind event handlers
    this.watcher.on('add', (path) => this.handleChokidarEvent('add', path));
    this.watcher.on('change', (path) => this.handleChokidarEvent('change', path));
    this.watcher.on('unlink', (path) => this.handleChokidarEvent('unlink', path));
    this.watcher.on('error', (error) => this.handleError(error));

    // Wait for ready event
    await new Promise<void>((resolve) => {
      this.watcher!.on('ready', () => {
        logger.info('LazyStrategy', 'File watcher ready (lazy mode)');
        resolve();
      });
    });

    this.active = true;

    // If there are pending dirty files from previous session, start idle timer
    if (!this.dirtyFiles.isEmpty()) {
      logger.info('LazyStrategy', 'Found pending dirty files from previous session', {
        count: this.dirtyFiles.count(),
      });
      this.resetIdleTimer();
    }

    // Register cleanup handler for graceful shutdown
    this.cleanupHandler = async () => {
      await this.stop();
    };
    registerCleanup(this.cleanupHandler, 'LazyStrategy');
  }

  /**
   * Stop the strategy
   *
   * Clears idle timer, saves dirty files, and closes watcher.
   */
  async stop(): Promise<void> {
    const logger = getLogger();

    if (!this.active) {
      logger.debug('LazyStrategy', 'Strategy not active, ignoring stop request');
      return;
    }

    logger.info('LazyStrategy', 'Stopping file watcher (lazy mode)');

    // Unregister cleanup handler (avoid double cleanup)
    if (this.cleanupHandler) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }

    // Clear idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Save dirty files before stopping
    await this.dirtyFiles.save();

    // Close the watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.active = false;

    logger.info('LazyStrategy', 'File watcher stopped (lazy mode)', {
      processedFiles: this.processedCount,
      pendingFiles: this.dirtyFiles.count(),
    });
  }

  /**
   * Check if strategy is currently active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Handle a file event
   *
   * For lazy strategy, this queues the event instead of processing immediately.
   */
  async onFileEvent(event: StrategyFileEvent): Promise<void> {
    const logger = getLogger();

    // Queue the event (don't process yet)
    if (event.type === 'unlink') {
      this.dirtyFiles.markDeleted(event.relativePath);
      logger.debug('LazyStrategy', 'Queued file deletion', {
        relativePath: event.relativePath,
      });
    } else {
      this.dirtyFiles.add(event.relativePath);
      logger.debug('LazyStrategy', 'Queued file for indexing', {
        type: event.type,
        relativePath: event.relativePath,
      });
    }

    this.lastActivity = new Date();
    this.resetIdleTimer();
  }

  /**
   * Force processing of all pending changes
   *
   * Processes all dirty files and deletions, then clears the queue.
   * This is called:
   * - Automatically after idle timeout
   * - By search tools before returning results
   * - During strategy switching
   */
  async flush(): Promise<void> {
    const logger = getLogger();

    // Skip if already flushing or nothing to process
    if (this.flushing) {
      logger.debug('LazyStrategy', 'Flush already in progress, skipping');
      return;
    }

    if (this.dirtyFiles.isEmpty()) {
      logger.debug('LazyStrategy', 'No dirty files to flush');
      return;
    }

    this.flushing = true;

    try {
      const deletedFiles = this.dirtyFiles.getDeleted();
      const dirtyFilesList = this.dirtyFiles.getAll();

      logger.info('LazyStrategy', 'Flushing dirty files', {
        toDelete: deletedFiles.length,
        toIndex: dirtyFilesList.length,
      });

      // Process deletions first (file might be deleted then recreated)
      for (const relativePath of deletedFiles) {
        try {
          if (isDocFile(relativePath) && this.docsIndexManager) {
            await this.docsIndexManager.removeDocFile(relativePath);
          } else if (!isDocFile(relativePath)) {
            await this.indexManager.removeFile(relativePath);
          }
          this.processedCount++;
          logger.debug('LazyStrategy', 'Processed deletion', { relativePath });
        } catch (error) {
          logger.error('LazyStrategy', 'Error processing deletion', {
            relativePath,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue processing other files
        }
      }

      // Process adds/changes
      for (const relativePath of dirtyFilesList) {
        try {
          if (isDocFile(relativePath) && this.docsIndexManager) {
            await this.docsIndexManager.updateDocFile(relativePath);
          } else if (!isDocFile(relativePath)) {
            await this.indexManager.updateFile(relativePath);
          }
          this.processedCount++;
          logger.debug('LazyStrategy', 'Processed file update', { relativePath });
        } catch (error) {
          logger.error('LazyStrategy', 'Error processing file update', {
            relativePath,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue processing other files
        }
      }

      // Clear dirty files and save to disk
      this.dirtyFiles.clear();
      await this.dirtyFiles.save();

      logger.info('LazyStrategy', 'Flush complete', {
        processed: deletedFiles.length + dirtyFilesList.length,
      });
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Get strategy statistics
   */
  getStats(): StrategyStats {
    return {
      name: this.name,
      isActive: this.active,
      pendingFiles: this.dirtyFiles.count(),
      processedFiles: this.processedCount,
      lastActivity: this.lastActivity,
    };
  }

  // ==========================================================================
  // Private Methods - Event Handling
  // ==========================================================================

  /**
   * Handle a chokidar event
   *
   * Converts the chokidar event to a StrategyFileEvent and queues it.
   */
  private handleChokidarEvent(
    type: 'add' | 'change' | 'unlink',
    absolutePath: string
  ): void {
    const logger = getLogger();
    const relativePath = toRelativePath(absolutePath, this.projectPath);

    logger.debug('LazyStrategy', 'File event received', {
      type,
      relativePath,
    });

    // Quick check for hardcoded deny patterns (synchronous)
    if (isHardDenied(relativePath)) {
      logger.debug('LazyStrategy', 'Event skipped - hardcoded deny', {
        relativePath,
      });
      return;
    }

    // Check policy for non-unlink events
    if (type !== 'unlink') {
      // For add/change, we should check policy
      // But since shouldIndex is async and we don't want to block here,
      // we'll queue all non-denied files and let flush() handle filtering
      // This is acceptable because:
      // 1. Hardcoded deny is already checked
      // 2. The actual indexing (in flush) will verify policy anyway
    }

    // Create the event and queue it
    const event: StrategyFileEvent = {
      type,
      relativePath,
      absolutePath,
    };

    // Queue the event (don't await - this is called from sync event handler)
    this.onFileEvent(event).catch((error) => {
      logger.error('LazyStrategy', 'Error queuing event', {
        relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Reset the idle timer
   *
   * Clears any existing timer and sets a new one for idleThresholdSeconds.
   * When the timer fires, it triggers a flush.
   */
  private resetIdleTimer(): void {
    const logger = getLogger();

    // Clear existing timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    // Set new timer
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;

      // Don't flush during shutdown
      if (isShutdownInProgress()) {
        return;
      }

      logger.info('LazyStrategy', 'Idle timeout reached, triggering flush');
      this.flush().catch((error) => {
        logger.error('LazyStrategy', 'Error during idle flush', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.idleThresholdSeconds * 1000);
  }

  /**
   * Handle watcher error
   */
  private handleError(error: Error): void {
    const logger = getLogger();

    // Don't log errors during shutdown
    if (isShutdownInProgress()) {
      return;
    }

    logger.error('LazyStrategy', 'Watcher error', {
      error: error.message,
      stack: error.stack,
    });
  }

  // ==========================================================================
  // Public Accessors
  // ==========================================================================

  /**
   * Get the project path being watched
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Get the dirty files count
   */
  getDirtyCount(): number {
    return this.dirtyFiles.count();
  }

  /**
   * Get the idle threshold in seconds
   */
  getIdleThreshold(): number {
    return this.idleThresholdSeconds;
  }

  /**
   * Check if a flush is currently in progress
   */
  isFlushing(): boolean {
    return this.flushing;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a LazyStrategy for a project
 *
 * @param projectPath - Absolute path to the project root
 * @param indexManager - IndexManager for code file updates
 * @param docsIndexManager - DocsIndexManager for doc file updates (nullable)
 * @param policy - IndexingPolicy for file filtering
 * @param dirtyFiles - DirtyFilesManager for tracking pending changes
 * @param options - Optional configuration
 * @returns LazyStrategy instance (not yet started)
 */
export function createLazyStrategy(
  projectPath: string,
  indexManager: IndexManager,
  docsIndexManager: DocsIndexManager | null,
  policy: IndexingPolicy,
  dirtyFiles: DirtyFilesManager,
  options?: LazyStrategyOptions
): LazyStrategy {
  return new LazyStrategy(
    projectPath,
    indexManager,
    docsIndexManager,
    policy,
    dirtyFiles,
    options?.idleThresholdSeconds ?? 30
  );
}
