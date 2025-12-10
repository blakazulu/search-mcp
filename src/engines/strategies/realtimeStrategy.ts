/**
 * Realtime Indexing Strategy
 *
 * Processes file changes immediately (with debounce). This is the default strategy
 * that maintains the existing FileWatcher behavior - files are indexed as soon as
 * changes are detected (after a short debounce period to handle rapid saves).
 *
 * Features:
 * - Immediate indexing on file changes
 * - 500ms debounce to batch rapid saves
 * - Routes changes to appropriate index manager (code vs docs)
 * - Fingerprint-based change detection to avoid unnecessary re-indexing
 * - Graceful error handling (individual file errors don't stop watching)
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
import { FingerprintsManager } from '../../storage/fingerprints.js';
import { DocsFingerprintsManager } from '../../storage/docsFingerprints.js';
import {
  WATCHER_OPTIONS,
  DEFAULT_DEBOUNCE_DELAY,
} from '../fileWatcher.js';
import { toRelativePath, normalizePath } from '../../utils/paths.js';
import { hashFile } from '../../utils/hash.js';
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
 * Configuration options for RealtimeStrategy
 */
export interface RealtimeStrategyOptions {
  /** Debounce delay in milliseconds (default: 500) */
  debounceDelay?: number;
}

// ============================================================================
// RealtimeStrategy Class
// ============================================================================

/**
 * Realtime Indexing Strategy
 *
 * Implements immediate indexing on file changes with debouncing.
 * This is the default strategy that maintains backward compatibility
 * with the existing FileWatcher behavior.
 *
 * @example
 * ```typescript
 * const strategy = new RealtimeStrategy(
 *   projectPath,
 *   indexManager,
 *   docsIndexManager,
 *   policy,
 *   fingerprints,
 *   docsFingerprints
 * );
 *
 * await strategy.initialize();
 * await strategy.start();
 *
 * // Strategy will now process file changes immediately
 *
 * await strategy.stop();
 * ```
 */
export class RealtimeStrategy implements IndexingStrategy {
  readonly name = 'realtime' as const;

  // Dependencies
  private readonly projectPath: string;
  private readonly indexManager: IndexManager;
  private readonly docsIndexManager: DocsIndexManager | null;
  private readonly policy: IndexingPolicy;
  private readonly fingerprints: FingerprintsManager;
  private readonly docsFingerprints: DocsFingerprintsManager | null;
  private readonly debounceDelay: number;

  // State
  private watcher: chokidar.FSWatcher | null = null;
  private active = false;
  private processedCount = 0;
  private lastActivity: Date | null = null;

  // Debouncing
  private pendingEvents = new Map<string, ReturnType<typeof setTimeout>>();
  private processingQueue = new Set<string>();

  // Cleanup
  private cleanupHandler: CleanupHandler | null = null;

  /**
   * Create a new RealtimeStrategy instance
   *
   * @param projectPath - Absolute path to the project root
   * @param indexManager - IndexManager for code file updates
   * @param docsIndexManager - DocsIndexManager for doc file updates (nullable)
   * @param policy - IndexingPolicy for file filtering
   * @param fingerprints - FingerprintsManager for code file change detection
   * @param docsFingerprints - DocsFingerprintsManager for doc file change detection (nullable)
   * @param options - Optional configuration
   */
  constructor(
    projectPath: string,
    indexManager: IndexManager,
    docsIndexManager: DocsIndexManager | null,
    policy: IndexingPolicy,
    fingerprints: FingerprintsManager,
    docsFingerprints: DocsFingerprintsManager | null,
    options: RealtimeStrategyOptions = {}
  ) {
    this.projectPath = normalizePath(projectPath);
    this.indexManager = indexManager;
    this.docsIndexManager = docsIndexManager;
    this.policy = policy;
    this.fingerprints = fingerprints;
    this.docsFingerprints = docsFingerprints;
    this.debounceDelay = options.debounceDelay ?? DEFAULT_DEBOUNCE_DELAY;
  }

  // ==========================================================================
  // IndexingStrategy Interface Implementation
  // ==========================================================================

  /**
   * Initialize the strategy
   *
   * Ensures all dependencies are loaded:
   * - Fingerprints for change detection
   * - Policy for file filtering (gitignore, etc.)
   */
  async initialize(): Promise<void> {
    const logger = getLogger();
    logger.debug('RealtimeStrategy', 'Initializing');

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

    logger.debug('RealtimeStrategy', 'Initialization complete');
  }

  /**
   * Start the strategy
   *
   * Creates a chokidar watcher and begins monitoring for file changes.
   * File changes are processed immediately with debouncing.
   */
  async start(): Promise<void> {
    const logger = getLogger();

    if (this.active) {
      logger.warn('RealtimeStrategy', 'Strategy already active, ignoring start request');
      return;
    }

    logger.info('RealtimeStrategy', 'Starting file watcher', {
      projectPath: this.projectPath,
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
        logger.info('RealtimeStrategy', 'File watcher ready');
        resolve();
      });
    });

    this.active = true;

    // Register cleanup handler for graceful shutdown
    this.cleanupHandler = async () => {
      await this.stop();
    };
    registerCleanup(this.cleanupHandler, 'RealtimeStrategy');
  }

  /**
   * Stop the strategy
   *
   * Cleans up the watcher and pending events.
   */
  async stop(): Promise<void> {
    const logger = getLogger();

    if (!this.active) {
      logger.debug('RealtimeStrategy', 'Strategy not active, ignoring stop request');
      return;
    }

    logger.info('RealtimeStrategy', 'Stopping file watcher');

    // Unregister cleanup handler (avoid double cleanup)
    if (this.cleanupHandler) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }

    // Clear all pending debounce timers
    for (const timeout of this.pendingEvents.values()) {
      clearTimeout(timeout);
    }
    this.pendingEvents.clear();

    // Close the watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.active = false;

    logger.info('RealtimeStrategy', 'File watcher stopped', {
      processedFiles: this.processedCount,
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
   * For realtime strategy, this processes the event immediately with debouncing.
   * This method is called by the watcher or can be called directly for testing.
   */
  async onFileEvent(event: StrategyFileEvent): Promise<void> {
    // Process immediately (internal debouncing is handled by handleChokidarEvent)
    await this.processEvent(event);
  }

  /**
   * Force processing of all pending changes
   *
   * For realtime strategy, this is a no-op since events are processed immediately.
   * Pending debounced events will complete on their own timers.
   */
  async flush(): Promise<void> {
    // Nothing to flush - events are processed immediately after debounce
    // We could optionally trigger all pending debounced events here,
    // but that might cause issues with rapid saves
  }

  /**
   * Get strategy statistics
   */
  getStats(): StrategyStats {
    return {
      name: this.name,
      isActive: this.active,
      pendingFiles: this.pendingEvents.size,
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
   * Converts the chokidar event to a StrategyFileEvent and applies debouncing.
   */
  private handleChokidarEvent(
    type: 'add' | 'change' | 'unlink',
    absolutePath: string
  ): void {
    const logger = getLogger();
    const relativePath = toRelativePath(absolutePath, this.projectPath);

    logger.debug('RealtimeStrategy', 'File event received', {
      type,
      relativePath,
    });

    // Quick check for hardcoded deny patterns (synchronous)
    if (isHardDenied(relativePath)) {
      logger.debug('RealtimeStrategy', 'Event skipped - hardcoded deny', {
        relativePath,
      });
      return;
    }

    // Create the event
    const event: StrategyFileEvent = {
      type,
      relativePath,
      absolutePath,
    };

    // Debounce the event
    this.debounceEvent(relativePath, () => this.processEvent(event));
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
    const logger = getLogger();

    // Cancel any existing pending event for this file
    const existing = this.pendingEvents.get(relativePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule the handler
    const timeout = setTimeout(() => {
      this.pendingEvents.delete(relativePath);

      // Atomic check-and-add to prevent race condition
      if (this.processingQueue.has(relativePath)) {
        logger.debug('RealtimeStrategy', 'Skipping debounced event - already processing', {
          relativePath,
        });
        return;
      }

      // Add to processing queue before starting async work
      this.processingQueue.add(relativePath);

      // Wrap async handler in IIFE with proper error handling
      (async () => {
        try {
          await handler();
        } catch (error) {
          logger.error('RealtimeStrategy', 'Error in debounced handler', {
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
   * Routes the event to the appropriate handler based on file type and event type.
   */
  private async processEvent(event: StrategyFileEvent): Promise<void> {
    const logger = getLogger();

    try {
      if (event.type === 'unlink') {
        await this.handleUnlink(event);
      } else {
        // 'add' or 'change'
        await this.handleAddOrChange(event);
      }

      this.lastActivity = new Date();
    } catch (error) {
      logger.error('RealtimeStrategy', 'Error processing file event', {
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
  private async handleAddOrChange(event: StrategyFileEvent): Promise<void> {
    const logger = getLogger();

    // Check if this is a doc file and we have a DocsIndexManager
    const isDoc = isDocFile(event.relativePath);
    if (isDoc && this.docsIndexManager) {
      await this.handleDocAddOrChange(event);
      return;
    }

    // If it's a doc file but no DocsIndexManager, skip it
    if (isDoc) {
      logger.debug('RealtimeStrategy', 'Doc file skipped - no DocsIndexManager', {
        relativePath: event.relativePath,
      });
      return;
    }

    // Check policy
    const policyResult = await this.policy.shouldIndex(
      event.relativePath,
      event.absolutePath
    );

    if (!policyResult.shouldIndex) {
      logger.debug('RealtimeStrategy', 'Event skipped - policy', {
        relativePath: event.relativePath,
        reason: policyResult.reason,
      });
      return;
    }

    // Calculate current hash
    let currentHash: string;
    try {
      currentHash = await hashFile(event.absolutePath);
    } catch (error) {
      // File might have been deleted between event and processing
      logger.debug('RealtimeStrategy', 'Could not hash file, may have been deleted', {
        relativePath: event.relativePath,
      });
      return;
    }

    // Compare with stored fingerprint
    const storedHash = this.fingerprints.get(event.relativePath);

    if (storedHash === currentHash) {
      logger.debug('RealtimeStrategy', 'Event skipped - content unchanged', {
        relativePath: event.relativePath,
      });
      return;
    }

    // Content changed - update index
    logger.info('RealtimeStrategy', 'Updating index for changed file', {
      type: event.type,
      relativePath: event.relativePath,
      wasNew: storedHash === undefined,
    });

    await this.indexManager.updateFile(event.relativePath);

    // Update in-memory fingerprint directly instead of reloading from disk
    this.fingerprints.set(event.relativePath, currentHash);

    this.processedCount++;
  }

  /**
   * Handle add or change event for doc files
   *
   * Routes doc file changes to DocsIndexManager instead of IndexManager.
   */
  private async handleDocAddOrChange(event: StrategyFileEvent): Promise<void> {
    const logger = getLogger();

    // Check policy (docs still need to pass policy checks)
    const policyResult = await this.policy.shouldIndex(
      event.relativePath,
      event.absolutePath
    );

    if (!policyResult.shouldIndex) {
      logger.debug('RealtimeStrategy', 'Doc event skipped - policy', {
        relativePath: event.relativePath,
        reason: policyResult.reason,
      });
      return;
    }

    // Calculate current hash
    let currentHash: string;
    try {
      currentHash = await hashFile(event.absolutePath);
    } catch (error) {
      // File might have been deleted between event and processing
      logger.debug('RealtimeStrategy', 'Could not hash doc file, may have been deleted', {
        relativePath: event.relativePath,
      });
      return;
    }

    // Compare with stored fingerprint from docs fingerprints
    const storedHash = this.docsFingerprints?.get(event.relativePath);

    if (storedHash === currentHash) {
      logger.debug('RealtimeStrategy', 'Doc event skipped - content unchanged', {
        relativePath: event.relativePath,
      });
      return;
    }

    // Content changed - update docs index
    logger.info('RealtimeStrategy', 'Updating docs index for changed doc file', {
      type: event.type,
      relativePath: event.relativePath,
      wasNew: storedHash === undefined,
    });

    await this.docsIndexManager!.updateDocFile(event.relativePath);

    // Update in-memory docs fingerprint directly instead of reloading from disk
    if (this.docsFingerprints) {
      this.docsFingerprints.set(event.relativePath, currentHash);
    }

    this.processedCount++;
  }

  /**
   * Handle unlink (delete) event
   *
   * 1. Check if file is a doc file (route to DocsIndexManager if provided)
   * 2. Delete chunks from index
   * 3. Remove from fingerprints
   */
  private async handleUnlink(event: StrategyFileEvent): Promise<void> {
    const logger = getLogger();

    // Check if this is a doc file and we have a DocsIndexManager
    const isDoc = isDocFile(event.relativePath);
    if (isDoc && this.docsIndexManager) {
      await this.handleDocUnlink(event);
      return;
    }

    // If it's a doc file but no DocsIndexManager, skip it
    if (isDoc) {
      logger.debug('RealtimeStrategy', 'Doc unlink skipped - no DocsIndexManager', {
        relativePath: event.relativePath,
      });
      return;
    }

    // Check if file was even indexed (skip if not in fingerprints)
    if (!this.fingerprints.has(event.relativePath)) {
      logger.debug('RealtimeStrategy', 'Unlink skipped - not in fingerprints', {
        relativePath: event.relativePath,
      });
      return;
    }

    logger.info('RealtimeStrategy', 'Removing deleted file from index', {
      relativePath: event.relativePath,
    });

    await this.indexManager.removeFile(event.relativePath);

    // Remove from in-memory fingerprints directly instead of reloading from disk
    this.fingerprints.delete(event.relativePath);

    this.processedCount++;
  }

  /**
   * Handle unlink (delete) event for doc files
   *
   * Routes doc file deletions to DocsIndexManager instead of IndexManager.
   */
  private async handleDocUnlink(event: StrategyFileEvent): Promise<void> {
    const logger = getLogger();

    // Check if file was even indexed (skip if not in docs fingerprints)
    if (!this.docsFingerprints?.has(event.relativePath)) {
      logger.debug('RealtimeStrategy', 'Doc unlink skipped - not in docs fingerprints', {
        relativePath: event.relativePath,
      });
      return;
    }

    logger.info('RealtimeStrategy', 'Removing deleted doc file from docs index', {
      relativePath: event.relativePath,
    });

    await this.docsIndexManager!.removeDocFile(event.relativePath);

    // Remove from in-memory docs fingerprints directly instead of reloading from disk
    if (this.docsFingerprints) {
      this.docsFingerprints.delete(event.relativePath);
    }

    this.processedCount++;
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

    logger.error('RealtimeStrategy', 'Watcher error', {
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
   * Get the pending events count
   */
  getPendingCount(): number {
    return this.pendingEvents.size;
  }

  /**
   * Get the processing queue size
   */
  getProcessingCount(): number {
    return this.processingQueue.size;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a RealtimeStrategy for a project
 *
 * @param projectPath - Absolute path to the project root
 * @param indexManager - IndexManager for code file updates
 * @param docsIndexManager - DocsIndexManager for doc file updates (nullable)
 * @param policy - IndexingPolicy for file filtering
 * @param fingerprints - FingerprintsManager for code file change detection
 * @param docsFingerprints - DocsFingerprintsManager for doc file change detection (nullable)
 * @param options - Optional configuration
 * @returns RealtimeStrategy instance (not yet started)
 */
export function createRealtimeStrategy(
  projectPath: string,
  indexManager: IndexManager,
  docsIndexManager: DocsIndexManager | null,
  policy: IndexingPolicy,
  fingerprints: FingerprintsManager,
  docsFingerprints: DocsFingerprintsManager | null,
  options?: RealtimeStrategyOptions
): RealtimeStrategy {
  return new RealtimeStrategy(
    projectPath,
    indexManager,
    docsIndexManager,
    policy,
    fingerprints,
    docsFingerprints,
    options
  );
}
