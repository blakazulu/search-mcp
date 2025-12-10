/**
 * Strategy Orchestrator
 *
 * Manages the lifecycle of indexing strategies:
 * - Creates and configures strategies based on configuration
 * - Handles strategy switching (flush old before starting new)
 * - Provides unified interface for server and tools
 * - Registers cleanup handlers for graceful shutdown
 *
 * The orchestrator is the single point of control for indexing strategies.
 * It ensures proper lifecycle management and prevents resource leaks.
 */

import { IndexingStrategy, StrategyStats } from './indexingStrategy.js';
import { RealtimeStrategy } from './strategies/realtimeStrategy.js';
import { LazyStrategy } from './strategies/lazyStrategy.js';
import { GitStrategy } from './strategies/gitStrategy.js';
import { IndexManager } from './indexManager.js';
import { DocsIndexManager } from './docsIndexManager.js';
import { IntegrityEngine } from './integrity.js';
import { IndexingPolicy } from './indexPolicy.js';
import { FingerprintsManager } from '../storage/fingerprints.js';
import { DocsFingerprintsManager } from '../storage/docsFingerprints.js';
import { DirtyFilesManager } from '../storage/dirtyFiles.js';
import { Config } from '../storage/config.js';
import { getLogger } from '../utils/logger.js';
import {
  registerCleanup,
  unregisterCleanup,
  CleanupHandler,
} from '../utils/cleanup.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Dependencies required to create strategies
 */
export interface StrategyOrchestratorDependencies {
  /** Absolute path to the project root */
  projectPath: string;
  /** Absolute path to the index directory */
  indexPath: string;
  /** IndexManager for code file updates */
  indexManager: IndexManager;
  /** DocsIndexManager for doc file updates (nullable if docs indexing disabled) */
  docsIndexManager: DocsIndexManager | null;
  /** IntegrityEngine for drift detection and reconciliation (used by git strategy) */
  integrityEngine: IntegrityEngine;
  /** IndexingPolicy for file filtering */
  policy: IndexingPolicy;
  /** FingerprintsManager for code file change detection */
  fingerprints: FingerprintsManager;
  /** DocsFingerprintsManager for doc file change detection (nullable if docs indexing disabled) */
  docsFingerprints: DocsFingerprintsManager | null;
}

// ============================================================================
// StrategyOrchestrator Class
// ============================================================================

/**
 * Strategy Orchestrator
 *
 * Manages the lifecycle of indexing strategies. Provides a unified interface
 * for the server and tools to interact with the active indexing strategy.
 *
 * Key responsibilities:
 * - Create strategies based on configuration
 * - Handle strategy switching (flush before switch to prevent data loss)
 * - Provide flush() for tools to call before search
 * - Register cleanup handlers for graceful shutdown
 *
 * @example
 * ```typescript
 * const orchestrator = new StrategyOrchestrator({
 *   projectPath: '/path/to/project',
 *   indexPath: '/path/to/index',
 *   indexManager,
 *   docsIndexManager,
 *   integrityEngine,
 *   policy,
 *   fingerprints,
 *   docsFingerprints,
 * });
 *
 * // Start with realtime strategy
 * await orchestrator.setStrategy({ indexingStrategy: 'realtime', ... });
 *
 * // Later, switch to lazy strategy
 * await orchestrator.setStrategy({ indexingStrategy: 'lazy', ... });
 *
 * // Before search, flush pending changes
 * await orchestrator.flush();
 *
 * // On shutdown
 * await orchestrator.stop();
 * ```
 */
export class StrategyOrchestrator {
  // Dependencies
  private readonly projectPath: string;
  private readonly indexPath: string;
  private readonly indexManager: IndexManager;
  private readonly docsIndexManager: DocsIndexManager | null;
  private readonly integrityEngine: IntegrityEngine;
  private readonly policy: IndexingPolicy;
  private readonly fingerprints: FingerprintsManager;
  private readonly docsFingerprints: DocsFingerprintsManager | null;

  // State
  private currentStrategy: IndexingStrategy | null = null;
  private cleanupHandler: CleanupHandler | null = null;

  /**
   * Create a new StrategyOrchestrator instance
   *
   * @param deps - Dependencies required for strategy creation
   */
  constructor(deps: StrategyOrchestratorDependencies) {
    this.projectPath = deps.projectPath;
    this.indexPath = deps.indexPath;
    this.indexManager = deps.indexManager;
    this.docsIndexManager = deps.docsIndexManager;
    this.integrityEngine = deps.integrityEngine;
    this.policy = deps.policy;
    this.fingerprints = deps.fingerprints;
    this.docsFingerprints = deps.docsFingerprints;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Set and start a strategy based on configuration
   *
   * If a strategy is already running:
   * 1. If same strategy type, does nothing (idempotent)
   * 2. Otherwise, flushes current strategy, stops it, then starts new one
   *
   * This method is idempotent - calling with the same strategy type
   * while that strategy is active is a no-op.
   *
   * @param config - Configuration containing indexingStrategy and related options
   * @throws Error if strategy creation or initialization fails
   */
  async setStrategy(config: Config): Promise<void> {
    const logger = getLogger();
    const strategyName = config.indexingStrategy;

    // If same strategy is already running, do nothing (idempotent)
    if (
      this.currentStrategy !== null &&
      this.currentStrategy.name === strategyName &&
      this.currentStrategy.isActive()
    ) {
      logger.debug('StrategyOrchestrator', 'Same strategy already active, skipping', {
        strategy: strategyName,
      });
      return;
    }

    // Stop current strategy if running (flush pending first)
    if (this.currentStrategy !== null) {
      logger.info('StrategyOrchestrator', 'Switching strategy', {
        from: this.currentStrategy.name,
        to: strategyName,
      });

      // Flush to prevent data loss
      await this.currentStrategy.flush();

      // Stop the old strategy
      await this.currentStrategy.stop();

      this.currentStrategy = null;
    }

    // Unregister old cleanup handler if present
    if (this.cleanupHandler !== null) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }

    // Create new strategy
    logger.debug('StrategyOrchestrator', 'Creating strategy', {
      strategy: strategyName,
    });
    this.currentStrategy = this.createStrategy(strategyName, config);

    // Initialize and start
    await this.currentStrategy.initialize();
    await this.currentStrategy.start();

    // Register cleanup handler for graceful shutdown
    this.cleanupHandler = async () => {
      await this.stop();
    };
    registerCleanup(this.cleanupHandler, 'StrategyOrchestrator');

    logger.info('StrategyOrchestrator', 'Strategy started', {
      strategy: strategyName,
    });
  }

  /**
   * Get the current strategy
   *
   * @returns Current strategy instance or null if none is active
   */
  getCurrentStrategy(): IndexingStrategy | null {
    return this.currentStrategy;
  }

  /**
   * Flush pending changes
   *
   * Delegates to the current strategy's flush() method.
   * This should be called before search operations to ensure fresh results.
   *
   * For realtime strategy, this is typically a no-op.
   * For lazy strategy, this processes all queued dirty files.
   * For git strategy, this triggers a full reconciliation.
   *
   * Safe to call even if no strategy is active.
   */
  async flush(): Promise<void> {
    if (this.currentStrategy !== null) {
      await this.currentStrategy.flush();
    }
  }

  /**
   * Stop the current strategy
   *
   * Gracefully stops the current strategy:
   * 1. Flushes pending changes
   * 2. Stops the strategy
   * 3. Unregisters cleanup handler
   *
   * Safe to call even if no strategy is active.
   */
  async stop(): Promise<void> {
    const logger = getLogger();

    if (this.currentStrategy !== null) {
      logger.info('StrategyOrchestrator', 'Stopping current strategy', {
        strategy: this.currentStrategy.name,
      });

      // Flush pending changes
      await this.currentStrategy.flush();

      // Stop the strategy
      await this.currentStrategy.stop();

      this.currentStrategy = null;
    }

    // Unregister cleanup handler
    if (this.cleanupHandler !== null) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }

    logger.debug('StrategyOrchestrator', 'Orchestrator stopped');
  }

  /**
   * Get strategy statistics
   *
   * Delegates to the current strategy's getStats() method.
   *
   * @returns Strategy statistics or null if no strategy is active
   */
  getStats(): StrategyStats | null {
    if (this.currentStrategy === null) {
      return null;
    }
    return this.currentStrategy.getStats();
  }

  /**
   * Check if a strategy is currently active
   *
   * @returns true if a strategy is running
   */
  isActive(): boolean {
    return this.currentStrategy !== null && this.currentStrategy.isActive();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Create a strategy instance based on name
   *
   * @param name - Strategy name ('realtime', 'lazy', 'git')
   * @param config - Configuration with strategy-specific options
   * @returns New strategy instance (not yet initialized or started)
   * @throws Error if strategy name is unknown
   */
  private createStrategy(name: string, config: Config): IndexingStrategy {
    switch (name) {
      case 'realtime':
        return new RealtimeStrategy(
          this.projectPath,
          this.indexManager,
          this.docsIndexManager,
          this.policy,
          this.fingerprints,
          this.docsFingerprints
        );

      case 'lazy':
        // Create a fresh DirtyFilesManager for the lazy strategy
        // This is intentional - the DirtyFilesManager is specific to the lazy strategy
        // and is not shared with other components
        return new LazyStrategy(
          this.projectPath,
          this.indexManager,
          this.docsIndexManager,
          this.policy,
          new DirtyFilesManager(this.indexPath),
          config.lazyIdleThreshold
        );

      case 'git':
        return new GitStrategy(
          this.projectPath,
          this.integrityEngine
        );

      default:
        throw new Error(`Unknown indexing strategy: ${name}`);
    }
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
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a StrategyOrchestrator for a project
 *
 * @param deps - Dependencies required for strategy creation
 * @returns StrategyOrchestrator instance (no strategy active yet)
 */
export function createStrategyOrchestrator(
  deps: StrategyOrchestratorDependencies
): StrategyOrchestrator {
  return new StrategyOrchestrator(deps);
}
