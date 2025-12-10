/**
 * Git Indexing Strategy
 *
 * Only reindexes after git commits. Instead of watching all project files,
 * it watches `.git/logs/HEAD` which is appended on every commit.
 *
 * This strategy has minimal file watcher overhead since it only monitors
 * a single file. Uses IntegrityEngine for drift detection and reconciliation.
 *
 * Features:
 * - Watches only .git/logs/HEAD (not project files)
 * - Detects commits via file change events
 * - Uses IntegrityEngine.detectDrift() and reconcile()
 * - Handles rapid git operations with debounce (2s)
 * - Fails gracefully for non-git projects
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chokidar from 'chokidar';
import {
  IndexingStrategy,
  StrategyFileEvent,
  StrategyStats,
} from '../indexingStrategy.js';
import { IntegrityEngine } from '../integrity.js';
import { normalizePath } from '../../utils/paths.js';
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
 * Configuration options for GitStrategy
 */
export interface GitStrategyOptions {
  /** Debounce delay in milliseconds for rapid git operations (default: 2000) */
  debounceDelayMs?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default debounce delay for git operations (2 seconds)
 *
 * This handles rapid git operations like interactive rebase, merge commits, etc.
 */
export const DEFAULT_GIT_DEBOUNCE_DELAY = 2000;

// ============================================================================
// GitStrategy Class
// ============================================================================

/**
 * Git Indexing Strategy
 *
 * Only reindexes after git commits by watching .git/logs/HEAD.
 * This strategy is ideal for projects where search freshness for uncommitted
 * changes is not critical, and minimal resource usage is desired.
 *
 * @example
 * ```typescript
 * const strategy = new GitStrategy(
 *   projectPath,
 *   integrityEngine,
 *   { debounceDelayMs: 2000 }
 * );
 *
 * await strategy.initialize();
 * await strategy.start();
 *
 * // Commits trigger automatic reconciliation
 * // Manual reconciliation:
 * await strategy.flush();
 *
 * await strategy.stop();
 * ```
 */
export class GitStrategy implements IndexingStrategy {
  readonly name = 'git' as const;

  // Dependencies
  private readonly projectPath: string;
  private readonly integrityEngine: IntegrityEngine;
  private readonly debounceDelayMs: number;

  // State
  private gitWatcher: chokidar.FSWatcher | null = null;
  private active = false;
  private processedCount = 0;
  private lastActivity: Date | null = null;

  // Debounce timer for rapid git operations
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Flush lock to prevent concurrent reconciliations
  private flushing = false;

  // Cleanup
  private cleanupHandler: CleanupHandler | null = null;

  /**
   * Create a new GitStrategy instance
   *
   * @param projectPath - Absolute path to the project root
   * @param integrityEngine - IntegrityEngine for drift detection and reconciliation
   * @param options - Optional configuration
   */
  constructor(
    projectPath: string,
    integrityEngine: IntegrityEngine,
    options?: GitStrategyOptions
  ) {
    this.projectPath = normalizePath(projectPath);
    this.integrityEngine = integrityEngine;
    this.debounceDelayMs = options?.debounceDelayMs ?? DEFAULT_GIT_DEBOUNCE_DELAY;
  }

  // ==========================================================================
  // IndexingStrategy Interface Implementation
  // ==========================================================================

  /**
   * Initialize the strategy
   *
   * Verifies that .git directory exists. Throws error if not a git repository.
   */
  async initialize(): Promise<void> {
    const logger = getLogger();
    logger.debug('GitStrategy', 'Initializing');

    // Verify .git directory exists
    const gitDir = path.join(this.projectPath, '.git');
    try {
      const stats = await fs.promises.stat(gitDir);
      if (!stats.isDirectory()) {
        throw new Error('Not a git repository: .git is not a directory');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Not a git repository: .git directory not found');
      }
      throw error;
    }

    logger.debug('GitStrategy', 'Initialization complete - git repository verified');
  }

  /**
   * Start the strategy
   *
   * Creates a chokidar watcher for .git/logs/HEAD and begins monitoring
   * for commit events. Creates the logs directory if it doesn't exist
   * (can happen in fresh repos).
   */
  async start(): Promise<void> {
    const logger = getLogger();

    if (this.active) {
      logger.warn('GitStrategy', 'Strategy already active, ignoring start request');
      return;
    }

    logger.info('GitStrategy', 'Starting git commit watcher', {
      projectPath: this.projectPath,
      debounceDelay: this.debounceDelayMs,
    });

    const gitLogsHead = path.join(this.projectPath, '.git', 'logs', 'HEAD');

    // Create logs directory if needed (fresh repos may not have it)
    const logsDir = path.dirname(gitLogsHead);
    try {
      await fs.promises.mkdir(logsDir, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    // Create HEAD file if it doesn't exist (fresh repos)
    try {
      await fs.promises.access(gitLogsHead);
    } catch {
      // Create empty file so watcher can watch it
      await fs.promises.writeFile(gitLogsHead, '', 'utf-8');
    }

    // Watch the git logs/HEAD file
    this.gitWatcher = chokidar.watch(gitLogsHead, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    // Bind event handlers
    this.gitWatcher.on('change', () => this.onGitChange());
    this.gitWatcher.on('add', () => this.onGitChange());
    this.gitWatcher.on('error', (error) => this.handleError(error));

    // Wait for ready event
    await new Promise<void>((resolve) => {
      this.gitWatcher!.on('ready', () => {
        logger.info('GitStrategy', 'Watching .git/logs/HEAD for commits');
        resolve();
      });
    });

    this.active = true;

    // Register cleanup handler for graceful shutdown
    this.cleanupHandler = async () => {
      await this.stop();
    };
    registerCleanup(this.cleanupHandler, 'GitStrategy');
  }

  /**
   * Stop the strategy
   *
   * Clears debounce timer and closes the git watcher.
   */
  async stop(): Promise<void> {
    const logger = getLogger();

    if (!this.active) {
      logger.debug('GitStrategy', 'Strategy not active, ignoring stop request');
      return;
    }

    logger.info('GitStrategy', 'Stopping git commit watcher');

    // Unregister cleanup handler (avoid double cleanup)
    if (this.cleanupHandler) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close the watcher
    if (this.gitWatcher) {
      await this.gitWatcher.close();
      this.gitWatcher = null;
    }

    this.active = false;

    logger.info('GitStrategy', 'Git commit watcher stopped', {
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
   * Git strategy ignores individual file events. Everything is handled
   * via git commit detection. This is a no-op.
   *
   * @param _event - The file event (ignored)
   */
  async onFileEvent(_event: StrategyFileEvent): Promise<void> {
    // Git strategy doesn't process individual file events
    // Everything is handled via git commit detection
  }

  /**
   * Force reconciliation of index with filesystem
   *
   * Uses IntegrityEngine to detect drift and reconcile differences.
   * This is called:
   * - After git commits (via debounced onGitChange)
   * - By search tools before returning results
   * - During strategy switching
   */
  async flush(): Promise<void> {
    const logger = getLogger();

    // Skip if already flushing
    if (this.flushing) {
      logger.debug('GitStrategy', 'Reconciliation already in progress, skipping');
      return;
    }

    this.flushing = true;

    try {
      logger.info('GitStrategy', 'Reconciling index with filesystem');

      // Use IntegrityEngine to detect drift
      const drift = await this.integrityEngine.checkDrift();

      if (
        drift.added.length === 0 &&
        drift.modified.length === 0 &&
        drift.removed.length === 0
      ) {
        logger.info('GitStrategy', 'Index is in sync', {
          inSync: drift.inSync,
        });
        return;
      }

      logger.info('GitStrategy', 'Drift detected', {
        added: drift.added.length,
        modified: drift.modified.length,
        removed: drift.removed.length,
        inSync: drift.inSync,
      });

      // Reconcile drift
      const result = await this.integrityEngine.reconcile();

      this.processedCount += result.filesAdded + result.filesModified + result.filesRemoved;
      this.lastActivity = new Date();

      logger.info('GitStrategy', 'Reconciliation complete', {
        added: result.filesAdded,
        modified: result.filesModified,
        removed: result.filesRemoved,
        durationMs: result.durationMs,
        success: result.success,
      });

      if (result.errors && result.errors.length > 0) {
        logger.warn('GitStrategy', 'Reconciliation had errors', {
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5), // Log first 5 errors
        });
      }
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
      pendingFiles: 0, // Git strategy doesn't track pending files
      processedFiles: this.processedCount,
      lastActivity: this.lastActivity,
    };
  }

  // ==========================================================================
  // Private Methods - Git Change Detection
  // ==========================================================================

  /**
   * Handle git HEAD log change
   *
   * Called when .git/logs/HEAD is modified (commit, checkout, merge, rebase).
   * Debounces rapid operations before triggering reconciliation.
   */
  private onGitChange(): void {
    const logger = getLogger();

    // Don't process during shutdown
    if (isShutdownInProgress()) {
      return;
    }

    logger.debug('GitStrategy', 'Git HEAD change detected');

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;

      // Don't flush during shutdown
      if (isShutdownInProgress()) {
        return;
      }

      logger.info('GitStrategy', 'Debounce complete, triggering reconciliation');
      this.flush().catch((error) => {
        logger.error('GitStrategy', 'Error during post-commit reconciliation', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.debounceDelayMs);
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

    logger.error('GitStrategy', 'Git watcher error', {
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
   * Get the debounce delay in milliseconds
   */
  getDebounceDelay(): number {
    return this.debounceDelayMs;
  }

  /**
   * Check if a flush/reconciliation is currently in progress
   */
  isFlushing(): boolean {
    return this.flushing;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a GitStrategy for a project
 *
 * @param projectPath - Absolute path to the project root
 * @param integrityEngine - IntegrityEngine for drift detection and reconciliation
 * @param options - Optional configuration
 * @returns GitStrategy instance (not yet started)
 */
export function createGitStrategy(
  projectPath: string,
  integrityEngine: IntegrityEngine,
  options?: GitStrategyOptions
): GitStrategy {
  return new GitStrategy(projectPath, integrityEngine, options);
}
