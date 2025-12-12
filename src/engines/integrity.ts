/**
 * Integrity Engine Module
 *
 * Provides periodic integrity checking to fix drift from missed file watcher events.
 * Compares stored fingerprints with current filesystem state and queues necessary updates.
 * Runs on MCP server startup and periodically (24 hours default).
 *
 * Features:
 * - Drift detection: Identifies added, modified, and removed files
 * - Reconciliation: Processes drift categories to update the index
 * - Scheduling: Startup checks and periodic background checks
 * - Non-blocking operations: Startup check runs in background
 */

import * as fs from 'node:fs';
import { glob } from 'glob';

import { IndexManager } from './indexManager.js';
import { IndexingPolicy } from './indexPolicy.js';
import { FingerprintsManager, DeltaResult } from '../storage/fingerprints.js';
import { toRelativePath, toAbsolutePath, normalizePath } from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { registerCleanup, unregisterCleanup, CleanupHandler } from '../utils/cleanup.js';
import {
  MAX_GLOB_RESULTS,
  MAX_DIRECTORY_DEPTH,
  GLOB_TIMEOUT_MS,
  ResourceLimitError,
} from '../utils/limits.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Report of drift between filesystem and index
 */
export interface DriftReport {
  /** Files on disk but not in index */
  added: string[];
  /** Files with different content hash than stored */
  modified: string[];
  /** Files in index but not on disk */
  removed: string[];
  /** Count of files that are unchanged */
  inSync: number;
  /** Timestamp of when check was performed */
  lastChecked: Date;
}

/**
 * Result of a reconciliation operation
 */
export interface ReconcileResult {
  /** Whether reconciliation completed successfully */
  success: boolean;
  /** Number of files added to index */
  filesAdded: number;
  /** Number of files updated in index */
  filesModified: number;
  /** Number of files removed from index */
  filesRemoved: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Errors encountered during reconciliation */
  errors?: string[];
}

/**
 * Progress callback for reconciliation operations
 */
export type ReconcileProgressCallback = (progress: ReconcileProgress) => void;

/**
 * Progress information during reconciliation
 */
export interface ReconcileProgress {
  /** Current phase of reconciliation */
  phase: 'scanning' | 'adding' | 'modifying' | 'removing';
  /** Current item number being processed */
  current: number;
  /** Total items to process in this phase */
  total: number;
  /** Current file being processed */
  currentFile?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default interval for periodic integrity checks (24 hours in milliseconds)
 */
export const DEFAULT_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

/**
 * Batch size for processing files during reconciliation
 */
const RECONCILE_BATCH_SIZE = 50;

/**
 * Hash batch size for parallel hash calculations during drift scan
 */
const HASH_BATCH_SIZE = 50;

// ============================================================================
// Drift Detection Functions
// ============================================================================

/**
 * Scan the current filesystem state for indexable files
 *
 * Returns a map of relative paths to their content hashes for all files
 * that pass the indexing policy.
 *
 * DoS Protection:
 * - Limits glob results to MAX_GLOB_RESULTS
 * - Limits directory depth to MAX_DIRECTORY_DEPTH
 * - Applies timeout to glob operations (GLOB_TIMEOUT_MS)
 *
 * @param projectPath - Absolute path to the project root
 * @param policy - Initialized IndexingPolicy instance
 * @param maxResults - Maximum number of files to return (default: MAX_GLOB_RESULTS)
 * @param maxDepth - Maximum directory depth (default: MAX_DIRECTORY_DEPTH)
 * @returns Map of relative path to SHA256 content hash
 * @throws ResourceLimitError if glob returns too many files
 */
export async function scanCurrentState(
  projectPath: string,
  policy: IndexingPolicy,
  maxResults: number = MAX_GLOB_RESULTS,
  maxDepth: number = MAX_DIRECTORY_DEPTH
): Promise<Map<string, string>> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);
  const currentState = new Map<string, string>();

  logger.debug('IntegrityEngine', 'Starting filesystem scan', {
    projectPath: normalizedProjectPath,
    maxResults,
    maxDepth,
  });

  // Ensure policy is initialized
  if (!policy.isInitialized()) {
    await policy.initialize();
  }

  // Get all files using glob with DoS protection
  const globPattern = '**/*';
  let allFiles: string[];

  // DoS Protection: Use AbortController for proper cancellation
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GLOB_TIMEOUT_MS);

  try {
    // DoS Protection: Use timeout and depth limit for glob
    const files = await glob(globPattern, {
      cwd: normalizedProjectPath,
      nodir: true,
      dot: true,
      absolute: false,
      maxDepth: maxDepth,
      signal: controller.signal,
    });

    allFiles = files.map(f => f.replace(/\\/g, '/'));

    // DoS Protection: Check result count
    if (allFiles.length > maxResults) {
      logger.error('IntegrityEngine', 'Glob returned too many files', {
        projectPath: normalizedProjectPath,
        fileCount: allFiles.length,
        maxResults,
      });
      throw new ResourceLimitError(
        'GLOB_RESULTS',
        allFiles.length,
        maxResults,
        `Glob returned too many files: ${allFiles.length} > ${maxResults}. Consider adding exclusion patterns.`
      );
    }

    // Warn when approaching limit (80%)
    const warningThreshold = Math.floor(maxResults * 0.8);
    if (allFiles.length > warningThreshold) {
      logger.warn('IntegrityEngine', 'Glob approaching result limit', {
        projectPath: normalizedProjectPath,
        fileCount: allFiles.length,
        maxResults,
        warningThreshold,
      });
    }
  } catch (error) {
    // Re-throw ResourceLimitError
    if (error instanceof ResourceLimitError) {
      clearTimeout(timeoutId);
      throw error;
    }

    // Handle abort error (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('IntegrityEngine', 'Glob operation timed out', {
        projectPath: normalizedProjectPath,
        timeoutMs: GLOB_TIMEOUT_MS,
      });
      return currentState;
    }

    logger.error('IntegrityEngine', 'Failed to scan directory', {
      projectPath: normalizedProjectPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return currentState;
  } finally {
    clearTimeout(timeoutId);
  }

  // Process files in batches for better performance
  const batches: string[][] = [];
  for (let i = 0; i < allFiles.length; i += HASH_BATCH_SIZE) {
    batches.push(allFiles.slice(i, i + HASH_BATCH_SIZE));
  }

  for (const batch of batches) {
    const hashPromises = batch.map(async (relativePath) => {
      const absolutePath = toAbsolutePath(relativePath, normalizedProjectPath);

      try {
        // Check if file passes policy
        const policyResult = await policy.shouldIndex(relativePath, absolutePath);
        if (!policyResult.shouldIndex) {
          return null;
        }

        // Hash the file
        const hash = await hashFile(absolutePath);
        return { path: relativePath, hash };
      } catch (error) {
        // Skip files that can't be read (deleted between scan and hash, permissions, etc.)
        logger.debug('IntegrityEngine', 'Skipping file during scan', {
          path: relativePath,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });

    const results = await Promise.all(hashPromises);
    for (const result of results) {
      if (result !== null) {
        currentState.set(result.path, result.hash);
      }
    }
  }

  logger.debug('IntegrityEngine', 'Filesystem scan complete', {
    fileCount: currentState.size,
  });

  return currentState;
}

/**
 * Calculate drift between filesystem and stored fingerprints
 *
 * Compares the current filesystem state with stored fingerprints to identify:
 * - Added files: Present on disk but not in fingerprints
 * - Modified files: Different hash than stored
 * - Removed files: In fingerprints but not on disk
 *
 * @param projectPath - Absolute path to the project root
 * @param fingerprints - FingerprintsManager instance (must be loaded)
 * @param policy - Initialized IndexingPolicy instance
 * @returns DriftReport with categorized files
 */
export async function calculateDrift(
  projectPath: string,
  fingerprints: FingerprintsManager,
  policy: IndexingPolicy
): Promise<DriftReport> {
  const logger = getLogger();
  const startTime = Date.now();

  logger.info('IntegrityEngine', 'Calculating drift', { projectPath });

  // Scan current filesystem state
  const currentState = await scanCurrentState(projectPath, policy);

  // Get stored fingerprints
  const storedFingerprints = fingerprints.getAll();

  // Initialize result
  const report: DriftReport = {
    added: [],
    modified: [],
    removed: [],
    inSync: 0,
    lastChecked: new Date(),
  };

  // Track which stored fingerprints we've seen
  const seenStoredPaths = new Set<string>();

  // Compare current state with stored
  for (const [relativePath, currentHash] of currentState) {
    const storedHash = storedFingerprints.get(relativePath);
    seenStoredPaths.add(relativePath);

    if (storedHash === undefined) {
      // File is on disk but not in index
      report.added.push(relativePath);
    } else if (storedHash !== currentHash) {
      // File hash differs
      report.modified.push(relativePath);
    } else {
      // File is in sync
      report.inSync++;
    }
  }

  // Find removed files (in stored but not in current)
  for (const storedPath of storedFingerprints.keys()) {
    if (!seenStoredPaths.has(storedPath)) {
      report.removed.push(storedPath);
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('IntegrityEngine', 'Drift calculation complete', {
    added: report.added.length,
    modified: report.modified.length,
    removed: report.removed.length,
    inSync: report.inSync,
    durationMs,
  });

  return report;
}

// ============================================================================
// Reconciliation Functions
// ============================================================================

/**
 * Reconcile drift between filesystem and index
 *
 * Processes all drift categories:
 * - Added: Chunk, embed, insert into index, add to fingerprints
 * - Modified: Delete old chunks, re-chunk/embed/insert, update fingerprint
 * - Removed: Delete chunks from index, remove from fingerprints
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param indexManager - IndexManager instance for updates
 * @param fingerprints - FingerprintsManager instance
 * @param policy - Initialized IndexingPolicy instance
 * @param onProgress - Optional progress callback
 * @returns ReconcileResult with operation details
 */
export async function reconcile(
  projectPath: string,
  indexPath: string,
  indexManager: IndexManager,
  fingerprints: FingerprintsManager,
  policy: IndexingPolicy,
  onProgress?: ReconcileProgressCallback
): Promise<ReconcileResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info('IntegrityEngine', 'Starting reconciliation', { projectPath });

  // Calculate drift first
  const drift = await calculateDrift(projectPath, fingerprints, policy);

  const totalChanges = drift.added.length + drift.modified.length + drift.removed.length;

  if (totalChanges === 0) {
    logger.info('IntegrityEngine', 'No drift detected, index is in sync');
    return {
      success: true,
      filesAdded: 0,
      filesModified: 0,
      filesRemoved: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Convert drift to DeltaResult format for IndexManager
  const delta: DeltaResult = {
    added: drift.added,
    modified: drift.modified,
    removed: drift.removed,
    unchanged: [], // Not used for delta application
  };

  // Report progress
  if (onProgress) {
    onProgress({
      phase: 'scanning',
      current: 0,
      total: totalChanges,
    });
  }

  try {
    // Apply delta through IndexManager
    const result = await indexManager.applyDelta(delta, (progress) => {
      // Map IndexManager progress to reconcile progress
      if (onProgress) {
        let phase: ReconcileProgress['phase'] = 'adding';
        if (progress.phase === 'storing' && progress.current <= drift.removed.length) {
          phase = 'removing';
        } else if (progress.phase === 'chunking' || progress.phase === 'embedding') {
          const processedRemoved = drift.removed.length;
          const currentInAddModify = progress.current - processedRemoved;
          if (currentInAddModify <= drift.added.length) {
            phase = 'adding';
          } else {
            phase = 'modifying';
          }
        }

        onProgress({
          phase,
          current: progress.current,
          total: progress.total,
          currentFile: progress.currentFile,
        });
      }
    });

    if (result.errors) {
      errors.push(...result.errors);
    }

    const durationMs = Date.now() - startTime;

    logger.info('IntegrityEngine', 'Reconciliation complete', {
      filesAdded: drift.added.length,
      filesModified: drift.modified.length,
      filesRemoved: drift.removed.length,
      durationMs,
      errorCount: errors.length,
    });

    return {
      success: errors.length === 0,
      filesAdded: drift.added.length,
      filesModified: drift.modified.length,
      filesRemoved: drift.removed.length,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('IntegrityEngine', 'Reconciliation failed', { error: message });
    errors.push(message);

    return {
      success: false,
      filesAdded: 0,
      filesModified: 0,
      filesRemoved: 0,
      durationMs: Date.now() - startTime,
      errors,
    };
  }
}

// ============================================================================
// IntegrityScheduler Class
// ============================================================================

/**
 * Scheduler for periodic integrity checks
 *
 * Manages background periodic checks and provides manual trigger capability.
 *
 * @example
 * ```typescript
 * const scheduler = new IntegrityScheduler(engine, 24 * 60 * 60 * 1000);
 * scheduler.start();
 *
 * // Later, to run a check immediately
 * const report = await scheduler.runNow();
 *
 * // When done
 * scheduler.stop();
 * ```
 */
export class IntegrityScheduler {
  private readonly engine: IntegrityEngine;
  private readonly checkInterval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastCheckTime: Date | null = null;

  /** Reference to cleanup handler for unregistration */
  private cleanupHandler: CleanupHandler | null = null;

  /**
   * Create a new IntegrityScheduler
   *
   * @param engine - IntegrityEngine instance to use for checks
   * @param checkInterval - Interval between checks in milliseconds (default: 24 hours)
   */
  constructor(engine: IntegrityEngine, checkInterval: number = DEFAULT_CHECK_INTERVAL) {
    this.engine = engine;
    this.checkInterval = checkInterval;
  }

  /**
   * Start periodic integrity checks
   *
   * Schedules checks to run at the configured interval.
   * Does not run an immediate check - use runNow() for that.
   *
   * BUG #16 FIX: Added explicit timer check to prevent potential leak.
   * If isRunning is true but timer is set (edge case), the existing timer
   * is cleared before creating a new one.
   */
  start(): void {
    const logger = getLogger();

    // BUG #16 FIX: Check both isRunning AND timer to prevent leaks
    // If either condition indicates scheduler is active, return early
    if (this.isRunning || this.timer !== null) {
      logger.debug('IntegrityScheduler', 'Scheduler already running, ignoring start', {
        isRunning: this.isRunning,
        hasTimer: this.timer !== null,
      });
      return;
    }

    logger.info('IntegrityScheduler', 'Starting periodic integrity checks', {
      intervalMs: this.checkInterval,
    });

    this.timer = setInterval(async () => {
      await this.runScheduledCheck();
    }, this.checkInterval);

    this.isRunning = true;

    // Register cleanup handler for graceful shutdown
    this.cleanupHandler = async () => {
      this.stop();
    };
    registerCleanup(this.cleanupHandler, 'IntegrityScheduler');
  }

  /**
   * Stop periodic integrity checks
   */
  stop(): void {
    const logger = getLogger();

    if (!this.isRunning || !this.timer) {
      logger.debug('IntegrityScheduler', 'Scheduler not running, ignoring stop');
      return;
    }

    // Unregister cleanup handler (avoid double cleanup)
    if (this.cleanupHandler) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }

    clearInterval(this.timer);
    this.timer = null;
    this.isRunning = false;

    logger.info('IntegrityScheduler', 'Stopped periodic integrity checks');
  }

  /**
   * Run an integrity check immediately
   *
   * @returns DriftReport from the check
   */
  async runNow(): Promise<DriftReport> {
    const logger = getLogger();
    logger.info('IntegrityScheduler', 'Running manual integrity check');

    const report = await this.engine.checkDrift();
    this.lastCheckTime = new Date();

    return report;
  }

  /**
   * Check if the scheduler is currently running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the time of the last check
   */
  getLastCheckTime(): Date | null {
    return this.lastCheckTime;
  }

  /**
   * Get the check interval
   */
  getCheckInterval(): number {
    return this.checkInterval;
  }

  /**
   * Internal method to run a scheduled check
   */
  private async runScheduledCheck(): Promise<void> {
    const logger = getLogger();

    // Skip if engine is busy with indexing
    if (this.engine.isIndexingActive()) {
      logger.debug('IntegrityScheduler', 'Skipping scheduled check - indexing in progress');
      return;
    }

    logger.info('IntegrityScheduler', 'Running scheduled integrity check');

    try {
      const report = await this.engine.checkDrift();
      this.lastCheckTime = new Date();

      // Log summary
      const totalDrift = report.added.length + report.modified.length + report.removed.length;
      if (totalDrift > 0) {
        logger.info('IntegrityScheduler', 'Drift detected during scheduled check', {
          added: report.added.length,
          modified: report.modified.length,
          removed: report.removed.length,
        });
      } else {
        logger.info('IntegrityScheduler', 'No drift detected during scheduled check');
      }
    } catch (error) {
      logger.error('IntegrityScheduler', 'Scheduled check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ============================================================================
// IntegrityEngine Class
// ============================================================================

/**
 * Integrity Engine for managing index integrity
 *
 * Provides drift detection and reconciliation capabilities for keeping
 * the search index in sync with the filesystem.
 *
 * @example
 * ```typescript
 * const engine = new IntegrityEngine(
 *   projectPath,
 *   indexPath,
 *   indexManager,
 *   fingerprints,
 *   policy
 * );
 *
 * // Check for drift
 * const drift = await engine.checkDrift();
 * if (drift.added.length + drift.modified.length + drift.removed.length > 0) {
 *   // Reconcile changes
 *   const result = await engine.reconcile();
 * }
 *
 * // Start periodic checks
 * engine.startPeriodicCheck();
 *
 * // Stop when done
 * engine.stopPeriodicCheck();
 * ```
 */
export class IntegrityEngine {
  private readonly projectPath: string;
  private readonly indexPath: string;
  private readonly indexManager: IndexManager;
  private readonly fingerprints: FingerprintsManager;
  private readonly policy: IndexingPolicy;

  private scheduler: IntegrityScheduler | null = null;
  private _isIndexingActive = false;

  /**
   * Create a new IntegrityEngine
   *
   * @param projectPath - Absolute path to the project root
   * @param indexPath - Absolute path to the index directory
   * @param indexManager - IndexManager instance for updates
   * @param fingerprints - FingerprintsManager instance (should be loaded)
   * @param policy - IndexingPolicy instance (should be initialized)
   */
  constructor(
    projectPath: string,
    indexPath: string,
    indexManager: IndexManager,
    fingerprints: FingerprintsManager,
    policy: IndexingPolicy
  ) {
    this.projectPath = normalizePath(projectPath);
    this.indexPath = normalizePath(indexPath);
    this.indexManager = indexManager;
    this.fingerprints = fingerprints;
    this.policy = policy;
  }

  // ==========================================================================
  // Drift Detection
  // ==========================================================================

  /**
   * Check for drift between filesystem and index
   *
   * Performs a full scan of the filesystem and compares with stored fingerprints.
   *
   * @returns DriftReport with categorized files
   */
  async checkDrift(): Promise<DriftReport> {
    const logger = getLogger();
    logger.info('IntegrityEngine', 'Checking for drift', { projectPath: this.projectPath });

    // Ensure fingerprints are loaded
    if (!this.fingerprints.isLoaded()) {
      await this.fingerprints.load();
    }

    // Ensure policy is initialized
    if (!this.policy.isInitialized()) {
      await this.policy.initialize();
    }

    return calculateDrift(this.projectPath, this.fingerprints, this.policy);
  }

  // ==========================================================================
  // Reconciliation
  // ==========================================================================

  /**
   * Reconcile drift between filesystem and index
   *
   * Calculates drift and applies necessary updates to bring the index in sync.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns ReconcileResult with operation details
   */
  async reconcile(onProgress?: ReconcileProgressCallback): Promise<ReconcileResult> {
    const logger = getLogger();

    if (this._isIndexingActive) {
      logger.warn('IntegrityEngine', 'Reconciliation skipped - indexing already in progress');
      return {
        success: false,
        filesAdded: 0,
        filesModified: 0,
        filesRemoved: 0,
        durationMs: 0,
        errors: ['Indexing is already in progress'],
      };
    }

    this._isIndexingActive = true;

    try {
      // Ensure fingerprints are loaded
      if (!this.fingerprints.isLoaded()) {
        await this.fingerprints.load();
      }

      // Ensure policy is initialized
      if (!this.policy.isInitialized()) {
        await this.policy.initialize();
      }

      const result = await reconcile(
        this.projectPath,
        this.indexPath,
        this.indexManager,
        this.fingerprints,
        this.policy,
        onProgress
      );

      // Reload fingerprints to get updated state
      await this.fingerprints.load();

      return result;
    } finally {
      this._isIndexingActive = false;
    }
  }

  // ==========================================================================
  // Periodic Checks
  // ==========================================================================

  /**
   * Start periodic integrity checks
   *
   * @param intervalMs - Interval between checks in milliseconds (default: 24 hours)
   */
  startPeriodicCheck(intervalMs: number = DEFAULT_CHECK_INTERVAL): void {
    const logger = getLogger();

    if (this.scheduler !== null) {
      logger.warn('IntegrityEngine', 'Periodic check already running');
      return;
    }

    this.scheduler = new IntegrityScheduler(this, intervalMs);
    this.scheduler.start();

    logger.info('IntegrityEngine', 'Started periodic integrity checks', { intervalMs });
  }

  /**
   * Stop periodic integrity checks
   */
  stopPeriodicCheck(): void {
    if (this.scheduler === null) {
      return;
    }

    this.scheduler.stop();
    this.scheduler = null;

    getLogger().info('IntegrityEngine', 'Stopped periodic integrity checks');
  }

  /**
   * Check if periodic checks are running
   */
  isPeriodicCheckRunning(): boolean {
    return this.scheduler !== null && this.scheduler.isSchedulerRunning();
  }

  /**
   * Check if indexing is currently active
   *
   * Used by scheduler to avoid running checks during active indexing.
   */
  isIndexingActive(): boolean {
    return this._isIndexingActive;
  }

  /**
   * Set indexing active state
   *
   * Should be called by IndexManager when starting/finishing indexing operations.
   */
  setIndexingActive(active: boolean): void {
    this._isIndexingActive = active;
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /**
   * Get the project path
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

  /**
   * Get the scheduler (if periodic checks are running)
   */
  getScheduler(): IntegrityScheduler | null {
    return this.scheduler;
  }
}

// ============================================================================
// Startup Check Function
// ============================================================================

/**
 * Run a quick startup integrity check
 *
 * This function performs a non-blocking drift check on startup.
 * It logs the drift summary at INFO level but does not automatically reconcile.
 *
 * @param engine - IntegrityEngine instance
 * @returns Promise that resolves to the DriftReport
 */
export async function runStartupCheck(engine: IntegrityEngine): Promise<DriftReport> {
  const logger = getLogger();

  logger.info('IntegrityEngine', 'Running startup integrity check');

  try {
    const report = await engine.checkDrift();

    const totalDrift = report.added.length + report.modified.length + report.removed.length;

    if (totalDrift === 0) {
      logger.info('IntegrityEngine', 'Startup check complete: Index is in sync', {
        inSync: report.inSync,
      });
    } else {
      logger.info('IntegrityEngine', 'Startup check complete: Drift detected', {
        added: report.added.length,
        modified: report.modified.length,
        removed: report.removed.length,
        inSync: report.inSync,
      });

      // Warn if large drift detected
      if (totalDrift > 100) {
        logger.warn('IntegrityEngine', 'Large drift detected - consider running reconciliation', {
          totalDrift,
        });
      }
    }

    return report;
  } catch (error) {
    logger.error('IntegrityEngine', 'Startup check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Return empty report on error
    return {
      added: [],
      modified: [],
      removed: [],
      inSync: 0,
      lastChecked: new Date(),
    };
  }
}

/**
 * Run startup check in background (non-blocking)
 *
 * Starts the startup check without waiting for it to complete.
 * Logs results when done.
 *
 * BUG #21 FIX: Wraps in try-catch to handle synchronous errors that may occur
 * before the promise is returned. Uses Promise.resolve().then() pattern to
 * ensure all errors (sync and async) are caught.
 *
 * @param engine - IntegrityEngine instance
 */
export function runStartupCheckBackground(engine: IntegrityEngine): void {
  const logger = getLogger();
  logger.info('IntegrityEngine', 'Starting background startup check');

  // BUG #21 FIX: Use Promise.resolve().then() pattern to catch both
  // synchronous errors (thrown before promise returns) and async rejections
  Promise.resolve()
    .then(() => runStartupCheck(engine))
    .catch((error) => {
      logger.error('IntegrityEngine', 'Background startup check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an IntegrityEngine for a project
 *
 * Convenience function to create an IntegrityEngine with all required dependencies.
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param indexManager - IndexManager instance
 * @param fingerprints - FingerprintsManager instance
 * @param policy - IndexingPolicy instance
 * @returns IntegrityEngine instance
 */
export function createIntegrityEngine(
  projectPath: string,
  indexPath: string,
  indexManager: IndexManager,
  fingerprints: FingerprintsManager,
  policy: IndexingPolicy
): IntegrityEngine {
  return new IntegrityEngine(
    projectPath,
    indexPath,
    indexManager,
    fingerprints,
    policy
  );
}
