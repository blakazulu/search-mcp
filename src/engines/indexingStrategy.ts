/**
 * Indexing Strategy Interface
 *
 * Defines the contract for different indexing strategies. Strategies control
 * when and how file changes are processed for the semantic search index.
 *
 * Three strategies are supported:
 * - `realtime`: Process changes immediately (with debounce) - default behavior
 * - `lazy`: Queue changes and process on idle or before search
 * - `git`: Only reindex after git commits
 *
 * All strategies implement this interface to provide a consistent API for
 * the StrategyOrchestrator to manage their lifecycle.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * File event from the filesystem
 *
 * Represents a change detected in the watched directory. Events are generated
 * by the file watcher (chokidar) and passed to the active indexing strategy.
 */
export interface StrategyFileEvent {
  /**
   * Type of file system event
   * - `add`: New file created
   * - `change`: Existing file modified
   * - `unlink`: File deleted
   */
  type: 'add' | 'change' | 'unlink';

  /**
   * Relative path from project root (forward-slash separated)
   *
   * @example 'src/utils/helper.ts'
   */
  relativePath: string;

  /**
   * Absolute path to the file (platform-specific separators)
   *
   * @example '/home/user/project/src/utils/helper.ts' (Unix)
   * @example 'C:\\Users\\user\\project\\src\\utils\\helper.ts' (Windows)
   */
  absolutePath: string;
}

/**
 * Strategy statistics for status reporting
 *
 * Provides insight into the current state and activity of an indexing strategy.
 * Used by `get_index_status` tool to report strategy information.
 */
export interface StrategyStats {
  /**
   * Name of the active strategy
   *
   * @example 'realtime', 'lazy', 'git'
   */
  name: string;

  /**
   * Whether the strategy is currently active and monitoring
   */
  isActive: boolean;

  /**
   * Number of files waiting to be processed
   *
   * - For `realtime`: Number of debounced events pending
   * - For `lazy`: Number of dirty files queued
   * - For `git`: Always 0 (no pending queue)
   */
  pendingFiles: number;

  /**
   * Total number of files processed since strategy started
   */
  processedFiles: number;

  /**
   * Timestamp of last indexing activity, or null if no activity yet
   */
  lastActivity: Date | null;
}

// ============================================================================
// Interface
// ============================================================================

/**
 * Base interface for all indexing strategies
 *
 * Defines the lifecycle methods that all strategies must implement.
 * The StrategyOrchestrator uses this interface to manage strategy
 * creation, switching, and shutdown.
 *
 * Lifecycle:
 * 1. `initialize()` - Load dependencies and state
 * 2. `start()` - Begin monitoring (start watchers)
 * 3. `onFileEvent()` - Handle file changes (called by watcher or orchestrator)
 * 4. `flush()` - Force processing of pending changes (before search/shutdown)
 * 5. `stop()` - Cleanup watchers and save state
 *
 * @example
 * ```typescript
 * class MyStrategy implements IndexingStrategy {
 *   readonly name = 'realtime' as const;
 *
 *   async initialize(): Promise<void> {
 *     // Load fingerprints, policy, etc.
 *   }
 *
 *   async start(): Promise<void> {
 *     // Start file watcher
 *   }
 *
 *   async stop(): Promise<void> {
 *     // Stop watcher, save state
 *   }
 *
 *   isActive(): boolean {
 *     return this._active;
 *   }
 *
 *   async onFileEvent(event: StrategyFileEvent): Promise<void> {
 *     // Process or queue the event
 *   }
 *
 *   async flush(): Promise<void> {
 *     // Process all pending changes
 *   }
 *
 *   getStats(): StrategyStats {
 *     return { ... };
 *   }
 * }
 * ```
 */
export interface IndexingStrategy {
  /**
   * Strategy name for identification and logging
   *
   * Must be one of the supported strategy types.
   */
  readonly name: 'realtime' | 'lazy' | 'git';

  /**
   * Initialize the strategy
   *
   * Called once before `start()`. Loads required dependencies such as:
   * - Fingerprints manager (load from disk)
   * - Indexing policy (initialize gitignore parser)
   * - Dirty files manager (for lazy strategy)
   *
   * Should be idempotent - safe to call multiple times.
   *
   * @throws Error if initialization fails (missing dependencies, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Start the strategy
   *
   * Begins active monitoring for file changes. For most strategies this
   * means starting a file watcher. Should be called after `initialize()`.
   *
   * After this method completes:
   * - `isActive()` should return `true`
   * - File events should trigger `onFileEvent()` calls
   *
   * @throws Error if strategy cannot be started
   */
  start(): Promise<void>;

  /**
   * Stop the strategy
   *
   * Gracefully shuts down the strategy:
   * - Stops file watchers
   * - Clears pending timers
   * - Saves any unsaved state (dirty files, etc.)
   *
   * After this method completes:
   * - `isActive()` should return `false`
   * - No more file events should be processed
   *
   * Should be idempotent - safe to call multiple times.
   */
  stop(): Promise<void>;

  /**
   * Check if strategy is currently active
   *
   * @returns `true` if the strategy is running and monitoring for changes
   */
  isActive(): boolean;

  /**
   * Handle a file event
   *
   * Called when a file change is detected. Depending on the strategy:
   * - `realtime`: Process immediately (with debounce)
   * - `lazy`: Add to dirty files queue
   * - `git`: Ignore (only responds to commit events)
   *
   * @param event - The file event to handle
   */
  onFileEvent(event: StrategyFileEvent): Promise<void>;

  /**
   * Force processing of all pending changes
   *
   * Ensures all queued/pending file changes are processed before returning.
   * Called by:
   * - Search tools (to ensure fresh results)
   * - Strategy switching (to flush old strategy before starting new one)
   * - Server shutdown (to save all pending work)
   *
   * Behavior by strategy:
   * - `realtime`: No-op (events processed immediately)
   * - `lazy`: Process all dirty files, clear queue
   * - `git`: Run full reconciliation (IntegrityEngine.reconcile)
   *
   * Should be safe to call even if no pending changes exist.
   */
  flush(): Promise<void>;

  /**
   * Get strategy statistics
   *
   * Returns current statistics for status reporting. Used by the
   * `get_index_status` tool to show strategy information.
   *
   * @returns Statistics object with current state
   */
  getStats(): StrategyStats;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Valid strategy names
 */
export const STRATEGY_NAMES = ['realtime', 'lazy', 'git'] as const;

/**
 * Type for valid strategy names
 */
export type StrategyName = (typeof STRATEGY_NAMES)[number];

/**
 * Check if a string is a valid strategy name
 *
 * @param name - String to check
 * @returns true if name is a valid strategy name
 */
export function isValidStrategyName(name: string): name is StrategyName {
  return STRATEGY_NAMES.includes(name as StrategyName);
}
