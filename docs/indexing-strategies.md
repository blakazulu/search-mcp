# Configurable Indexing Strategies

Add user-configurable indexing strategies to reduce performance overhead from continuous file watching.

---

## Implementation Progress

| Phase | Task ID | Description | Status |
|-------|---------|-------------|--------|
| 1 | SMCP-043 | Config Schema Changes | COMPLETED |
| 2 | SMCP-044 | Dirty Files Manager | COMPLETED |
| 3 | SMCP-045 | Strategy Interface | COMPLETED |
| 4 | SMCP-046 | Realtime Strategy | COMPLETED |
| 5 | SMCP-047 | Lazy Strategy | COMPLETED |
| 6 | SMCP-048 | Git Strategy | COMPLETED |
| 7 | SMCP-049 | Strategy Orchestrator | COMPLETED |
| 8 | SMCP-050 | Tool Integrations | COMPLETED |
| 9 | SMCP-051 | Server Integration | Not Started |

---

## Summary

Three indexing strategies for users to choose based on their needs:

| Strategy     | Watches Files           | When Indexing Happens          | Best For                                |
| ------------ | ----------------------- | ------------------------------ | --------------------------------------- |
| `realtime` | All files continuously  | Immediately on change          | Small projects, instant freshness       |
| `lazy`     | All files continuously  | On idle (30s) or before search | Large projects, reduce CPU              |
| `git`      | Only `.git/logs/HEAD` | After each git commit          | Minimal overhead, committed-only search |

---

## Phase 1: Config Schema Changes (COMPLETED - SMCP-043)

### File: `src/storage/config.ts`

**Added to ConfigSchema (lines 117-121):**

```typescript
/** Indexing strategy: 'realtime' (immediate), 'lazy' (on idle/search), 'git' (on commit) */
indexingStrategy: z.enum(['realtime', 'lazy', 'git']).default('realtime'),

/** Idle threshold in seconds for lazy strategy (default: 30) */
lazyIdleThreshold: z.number().positive().default(30),
```

**Updated DEFAULT_CONFIG (lines 161-162):**

```typescript
export const DEFAULT_CONFIG: Config = {
  // ... existing fields
  indexingStrategy: 'realtime',
  lazyIdleThreshold: 30,
};
```

**Updated _availableOptions in generateDefaultConfig (lines 340-343):**

```typescript
_availableOptions: {
  // ... existing options
  indexingStrategy: 'Indexing strategy: "realtime" (immediate), "lazy" (on idle/search), "git" (on commit)',
  lazyIdleThreshold: 'Seconds of inactivity before lazy indexing triggers (default: 30)',
},
```

**Tests Added (tests/unit/storage/config.test.ts):**
- Schema validation for all valid indexingStrategy values
- Schema rejection of invalid indexingStrategy values
- Schema validation for positive lazyIdleThreshold
- Schema rejection of zero/negative/non-number lazyIdleThreshold
- DEFAULT_CONFIG tests for new fields
- Backward compatibility test for old configs without new fields
- Generated config tests for new fields and documentation

---

## Phase 2: Dirty Files Manager (COMPLETED - SMCP-044)

### New File: `src/storage/dirtyFiles.ts`

Track files that need indexing for lazy mode. Pattern follows `fingerprints.ts`.

**Implemented exports:**
- `DIRTY_FILES_VERSION` - Version constant ('1.0.0')
- `DELETED_PREFIX` - Prefix for deletion markers ('__deleted__:')
- `DirtyFilesManager` - Main class

**DirtyFilesManager API:**
- `load()` - Load from disk (starts fresh on missing/corrupt/version mismatch)
- `save()` - Atomic write to disk (only if modified)
- `add(relativePath)` - Mark file as dirty (removes deletion marker if present)
- `remove(relativePath)` - Remove from dirty set and deletion markers
- `markDeleted(relativePath)` - Track deletion (removes from dirty set)
- `getAll()` - Get dirty files (excluding deletions)
- `getDeleted()` - Get deleted files (without prefix)
- `clear()` - Clear all entries
- `count()` - Total count (dirty + deleted)
- `dirtyCount()` - Count of dirty files only
- `deletedCount()` - Count of deleted files only
- `isEmpty()` - Check if empty
- `isLoaded()` - Check if loaded
- `hasUnsavedChanges()` - Check for unsaved changes
- `has(relativePath)` - Check if file is dirty
- `isDeleted(relativePath)` - Check if file is marked deleted
- `delete()` - Delete dirty-files.json from disk
- `getDirtyFilesPath()` - Get path to dirty files
- `getIndexPath()` - Get index path

**Tests:** 57 tests in `tests/unit/storage/dirtyFiles.test.ts`

### Added to `src/utils/paths.ts`:

```typescript
/**
 * Get the dirty files JSON path for an index
 */
export function getDirtyFilesPath(indexPath: string): string {
  return path.join(indexPath, 'dirty-files.json');
}
```

---

## Phase 3: Strategy Interface (COMPLETED - SMCP-045)

### New File: `src/engines/indexingStrategy.ts`

**Note:** Named `StrategyFileEvent` instead of `FileEvent` to avoid collision with existing `FileEvent` type in `fileWatcher.ts`.

**Implemented exports:**
- `StrategyFileEvent` - File event interface for strategy handlers
- `StrategyStats` - Statistics interface for status reporting
- `IndexingStrategy` - Main interface that all strategies must implement
- `STRATEGY_NAMES` - Constant array of valid strategy names
- `StrategyName` - Type alias for valid strategy names
- `isValidStrategyName()` - Type guard function

```typescript
/**
 * Indexing Strategy Interface
 *
 * Defines the contract for different indexing strategies.
 * Strategies control when and how file changes are processed.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * File event from the filesystem
 */
export interface StrategyFileEvent {
  type: 'add' | 'change' | 'unlink';
  relativePath: string;
  absolutePath: string;
}

/**
 * Strategy statistics
 */
export interface StrategyStats {
  name: string;
  isActive: boolean;
  pendingFiles: number;
  processedFiles: number;
  lastActivity: Date | null;
}

// ============================================================================
// Interface
// ============================================================================

/**
 * Base interface for all indexing strategies
 */
export interface IndexingStrategy {
  /** Strategy name for logging/status */
  readonly name: 'realtime' | 'lazy' | 'git';

  /** Initialize the strategy (load state, etc.) */
  initialize(): Promise<void>;

  /** Start the strategy (begin watching/monitoring) */
  start(): Promise<void>;

  /** Stop the strategy (cleanup watchers, save state) */
  stop(): Promise<void>;

  /** Check if strategy is currently active */
  isActive(): boolean;

  /** Handle a file event - may process immediately or queue */
  onFileEvent(event: StrategyFileEvent): Promise<void>;

  /** Force processing of all pending changes */
  flush(): Promise<void>;

  /** Get statistics for status reporting */
  getStats(): StrategyStats;
}

// ============================================================================
// Type Guards
// ============================================================================

export const STRATEGY_NAMES = ['realtime', 'lazy', 'git'] as const;
export type StrategyName = (typeof STRATEGY_NAMES)[number];
export function isValidStrategyName(name: string): name is StrategyName {
  return STRATEGY_NAMES.includes(name as StrategyName);
}
```

**Updated `src/engines/index.ts` with new exports:**
```typescript
// Indexing Strategy Interface
export {
  type StrategyFileEvent,
  type StrategyStats,
  type IndexingStrategy,
  type StrategyName,
  STRATEGY_NAMES,
  isValidStrategyName,
} from './indexingStrategy.js';
```

---

## Phase 4: Realtime Strategy (COMPLETED)

### New File: `src/engines/strategies/realtimeStrategy.ts`

Wraps existing FileWatcher behavior - processes events immediately.

**Implementation completed 2025-12-10**

Key exports:
- `RealtimeStrategy` - Main class implementing `IndexingStrategy`
- `createRealtimeStrategy()` - Factory function
- `RealtimeStrategyOptions` - Configuration interface

```typescript
/**
 * Realtime Indexing Strategy
 *
 * Processes file changes immediately (with debounce).
 * This is the current/default behavior.
 */

import chokidar from 'chokidar';
import { IndexingStrategy, StrategyFileEvent, StrategyStats } from '../indexingStrategy.js';
import { IndexManager } from '../indexManager.js';
import { DocsIndexManager } from '../docsIndexManager.js';
import { IndexingPolicy, isHardDenied } from '../indexPolicy.js';
import { isDocFile } from '../docsChunking.js';
import { FingerprintsManager } from '../../storage/fingerprints.js';
import { DocsFingerprintsManager } from '../../storage/docsFingerprints.js';
import { WATCHER_OPTIONS, DEFAULT_DEBOUNCE_DELAY } from '../fileWatcher.js';
import { toRelativePath, normalizePath } from '../../utils/paths.js';
import { hashFile } from '../../utils/hash.js';
import { getLogger } from '../../utils/logger.js';
import { registerCleanup, unregisterCleanup, isShutdownInProgress, CleanupHandler } from '../../utils/cleanup.js';

export interface RealtimeStrategyOptions {
  debounceDelay?: number;  // default: 500ms
}

export class RealtimeStrategy implements IndexingStrategy {
  readonly name = 'realtime' as const;

  private watcher: chokidar.FSWatcher | null = null;
  private active = false;
  private processedCount = 0;
  private lastActivity: Date | null = null;

  // Debouncing
  private pendingEvents = new Map<string, ReturnType<typeof setTimeout>>();
  private processingQueue = new Set<string>();

  // Cleanup
  private cleanupHandler: CleanupHandler | null = null;

  constructor(
    projectPath: string,
    indexManager: IndexManager,
    docsIndexManager: DocsIndexManager | null,
    policy: IndexingPolicy,
    fingerprints: FingerprintsManager,
    docsFingerprints: DocsFingerprintsManager | null,
    options?: RealtimeStrategyOptions,
  ) { /* ... */ }

  async initialize(): Promise<void> {
    // Ensure fingerprints, docs fingerprints, and policy are loaded
  }

  async start(): Promise<void> {
    // Create chokidar watcher, bind events, register cleanup handler
  }

  async stop(): Promise<void> {
    // Clear pending timers, close watcher, unregister cleanup
  }

  isActive(): boolean {
    return this.active;
  }

  async onFileEvent(event: StrategyFileEvent): Promise<void> {
    // Process immediately (with internal debouncing)
  }

  async flush(): Promise<void> {
    // No-op - events are processed immediately
  }

  getStats(): StrategyStats {
    return {
      name: this.name,
      isActive: this.active,
      pendingFiles: this.pendingEvents.size,
      processedFiles: this.processedCount,
      lastActivity: this.lastActivity,
    };
  }

  // Private methods handle:
  // - handleChokidarEvent() - Convert path, check hardcoded deny, create event, debounce
  // - debounceEvent() - Prevent rapid re-processing of same file
  // - processEvent() - Route to handleAddOrChange or handleUnlink
  // - handleAddOrChange() - Check policy, hash file, compare fingerprint, update index
  // - handleDocAddOrChange() - Route doc files to DocsIndexManager
  // - handleUnlink() - Remove from index and fingerprints
  // - handleDocUnlink() - Remove doc files from DocsIndexManager
  // - handleError() - Log watcher errors
}

// Factory function
export function createRealtimeStrategy(
  projectPath: string,
  indexManager: IndexManager,
  docsIndexManager: DocsIndexManager | null,
  policy: IndexingPolicy,
  fingerprints: FingerprintsManager,
  docsFingerprints: DocsFingerprintsManager | null,
  options?: RealtimeStrategyOptions,
): RealtimeStrategy;
```

### New File: `src/engines/strategies/index.ts`

Module exports for all strategies.

### Updated: `src/engines/index.ts`

Added exports:
```typescript
// Indexing Strategies
export {
  RealtimeStrategy,
  createRealtimeStrategy,
  type RealtimeStrategyOptions,
} from './strategies/index.js';
```

### Tests: `tests/unit/engines/strategies/realtimeStrategy.test.ts`

Comprehensive tests covering:
- Interface compliance
- Constructor options
- Lifecycle management (initialize, start, stop, isActive)
- getStats() return values
- flush() no-op behavior
- File event detection (add, change, delete)
- Debouncing behavior
- Accessors (getProjectPath, getPendingCount, getProcessingCount)
- Factory function

---

## Phase 5: Lazy Strategy (COMPLETED - SMCP-047)

### New File: `src/engines/strategies/lazyStrategy.ts`

**Implementation completed 2025-12-10**

Key exports:
- `LazyStrategy` - Main class implementing `IndexingStrategy`
- `createLazyStrategy()` - Factory function
- `LazyStrategyOptions` - Configuration interface

```typescript
/**
 * Lazy Indexing Strategy
 *
 * Detects file changes in real-time but defers indexing until:
 * 1. Idle timeout (default 30s of no activity)
 * 2. Before search (flush called by search tools)
 */

import chokidar from 'chokidar';
import { IndexingStrategy, StrategyFileEvent, StrategyStats } from '../indexingStrategy.js';
import { IndexManager } from '../indexManager.js';
import { DocsIndexManager } from '../docsIndexManager.js';
import { IndexingPolicy, isHardDenied } from '../indexPolicy.js';
import { isDocFile } from '../docsChunking.js';
import { DirtyFilesManager } from '../../storage/dirtyFiles.js';
import { WATCHER_OPTIONS } from '../fileWatcher.js';
import { toRelativePath, normalizePath } from '../../utils/paths.js';
import { getLogger } from '../../utils/logger.js';
import { registerCleanup, unregisterCleanup, isShutdownInProgress, CleanupHandler } from '../../utils/cleanup.js';

export interface LazyStrategyOptions {
  idleThresholdSeconds?: number;  // default: 30
}

export class LazyStrategy implements IndexingStrategy {
  readonly name = 'lazy' as const;

  private watcher: chokidar.FSWatcher | null = null;
  private active: boolean = false;
  private processedCount: number = 0;
  private lastActivity: Date | null = null;

  // Idle timer
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  // Flush lock to prevent concurrent flushes
  private flushing: boolean = false;

  // Cleanup handler
  private cleanupHandler: CleanupHandler | null = null;

  constructor(
    projectPath: string,
    indexManager: IndexManager,
    docsIndexManager: DocsIndexManager | null,
    policy: IndexingPolicy,
    dirtyFiles: DirtyFilesManager,
    idleThresholdSeconds: number = 30,
  ) { /* ... */ }

  async initialize(): Promise<void> {
    // Load dirty files from disk
    // Initialize policy
  }

  async start(): Promise<void> {
    // Create chokidar watcher, bind events, register cleanup handler
    // If dirty files exist from previous session, start idle timer
  }

  async stop(): Promise<void> {
    // Clear idle timer, save dirty files, close watcher, unregister cleanup
  }

  isActive(): boolean {
    return this.active;
  }

  async onFileEvent(event: StrategyFileEvent): Promise<void> {
    // Queue to dirty files (don't process immediately)
    // Reset idle timer
  }

  async flush(): Promise<void> {
    // Check flushing lock
    // Process deletions first, then adds/changes
    // Clear dirty files and save to disk
  }

  getStats(): StrategyStats {
    return {
      name: this.name,
      isActive: this.active,
      pendingFiles: this.dirtyFiles.count(),
      processedFiles: this.processedCount,
      lastActivity: this.lastActivity,
    };
  }

  // Private methods handle:
  // - handleChokidarEvent() - Convert path, check hardcoded deny, queue event
  // - resetIdleTimer() - Clear and set new idle timer
  // - handleError() - Log watcher errors

  // Public accessors
  getProjectPath(): string;
  getDirtyCount(): number;
  getIdleThreshold(): number;
  isFlushing(): boolean;
}

// Factory function
export function createLazyStrategy(
  projectPath: string,
  indexManager: IndexManager,
  docsIndexManager: DocsIndexManager | null,
  policy: IndexingPolicy,
  dirtyFiles: DirtyFilesManager,
  options?: LazyStrategyOptions,
): LazyStrategy;
```

### Updated: `src/engines/strategies/index.ts`

Added exports:
```typescript
export {
  LazyStrategy,
  createLazyStrategy,
  type LazyStrategyOptions,
} from './lazyStrategy.js';
```

### Updated: `src/engines/index.ts`

Added exports:
```typescript
export {
  LazyStrategy,
  createLazyStrategy,
  type LazyStrategyOptions,
} from './strategies/index.js';
```

### Tests: `tests/unit/engines/strategies/lazyStrategy.test.ts`

Comprehensive tests covering (45 tests total):
- Interface compliance
- Constructor options (default and custom idle threshold)
- Lifecycle management (initialize, start, stop, isActive)
- File event queuing (add, change, unlink not processed immediately)
- Dirty files persistence on stop
- Deletion tracking and processing order
- Flush behavior (clears dirty files, saves to disk)
- Concurrent flush prevention (flushing lock)
- Idle timer (auto-flush after threshold)
- Timer reset on new events
- Timer cleanup on stop
- getStats() return values
- Public accessors
- Factory function

---

## Phase 6: Git Strategy (COMPLETED - SMCP-048)

### New File: `src/engines/strategies/gitStrategy.ts`

**Implementation completed 2025-12-10**

Key exports:
- `GitStrategy` - Main class implementing `IndexingStrategy`
- `createGitStrategy()` - Factory function
- `GitStrategyOptions` - Configuration interface
- `DEFAULT_GIT_DEBOUNCE_DELAY` - Default debounce delay (2000ms)

```typescript
/**
 * Git Indexing Strategy
 *
 * Only reindexes after git commits.
 * Watches .git/logs/HEAD which is appended on every commit.
 * No file watcher overhead on project files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chokidar from 'chokidar';
import { IndexingStrategy, StrategyFileEvent, StrategyStats } from '../indexingStrategy.js';
import { IntegrityEngine } from '../integrity.js';
import { normalizePath } from '../../utils/paths.js';
import { getLogger } from '../../utils/logger.js';
import { registerCleanup, unregisterCleanup, isShutdownInProgress, CleanupHandler } from '../../utils/cleanup.js';

export interface GitStrategyOptions {
  debounceDelayMs?: number;  // default: 2000
}

export const DEFAULT_GIT_DEBOUNCE_DELAY = 2000;

export class GitStrategy implements IndexingStrategy {
  readonly name = 'git' as const;

  private gitWatcher: chokidar.FSWatcher | null = null;
  private active: boolean = false;
  private processedCount: number = 0;
  private lastActivity: Date | null = null;

  // Debounce rapid git operations (rebases, merges)
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceDelayMs: number;

  // Flush lock to prevent concurrent reconciliations
  private flushing: boolean = false;

  // Cleanup handler
  private cleanupHandler: CleanupHandler | null = null;

  constructor(
    projectPath: string,
    integrityEngine: IntegrityEngine,
    options?: GitStrategyOptions,
  ) { /* ... */ }

  async initialize(): Promise<void> {
    // Verify .git directory exists
    // Throw error if not a git repository
  }

  async start(): Promise<void> {
    // Build path: {projectPath}/.git/logs/HEAD
    // Create logs dir if missing (fresh repos)
    // Create HEAD file if missing (fresh repos)
    // Watch with chokidar (awaitWriteFinish options)
    // Bind change/add events to onGitChange()
    // Register cleanup handler
  }

  async stop(): Promise<void> {
    // Unregister cleanup handler
    // Clear debounce timer
    // Close git watcher
  }

  isActive(): boolean {
    return this.active;
  }

  async onFileEvent(_event: StrategyFileEvent): Promise<void> {
    // Git strategy doesn't process individual file events
    // Everything is handled via git commit detection
  }

  async flush(): Promise<void> {
    // Check flushing lock
    // Call integrityEngine.checkDrift()
    // If drift found, call integrityEngine.reconcile()
    // Update stats (processedCount, lastActivity)
  }

  getStats(): StrategyStats {
    return {
      name: this.name,
      isActive: this.active,
      pendingFiles: 0, // Git strategy doesn't track pending files
      processedFiles: this.processedCount,
      lastActivity: this.lastActivity,
    };
  }

  // Private methods:
  // - onGitChange() - Debounce rapid operations, trigger flush
  // - handleError() - Log watcher errors

  // Public accessors:
  getProjectPath(): string;
  getDebounceDelay(): number;
  isFlushing(): boolean;
}

// Factory function
export function createGitStrategy(
  projectPath: string,
  integrityEngine: IntegrityEngine,
  options?: GitStrategyOptions,
): GitStrategy;
```

### Updated: `src/engines/strategies/index.ts`

Added exports:
```typescript
export {
  GitStrategy,
  createGitStrategy,
  DEFAULT_GIT_DEBOUNCE_DELAY,
  type GitStrategyOptions,
} from './gitStrategy.js';
```

### Updated: `src/engines/index.ts`

Added exports:
```typescript
export {
  GitStrategy,
  createGitStrategy,
  DEFAULT_GIT_DEBOUNCE_DELAY,
  type GitStrategyOptions,
} from './strategies/index.js';
```

### Tests: `tests/unit/engines/strategies/gitStrategy.test.ts`

Comprehensive tests covering (40 tests total):
- Interface compliance
- Constructor options (default and custom debounce delay)
- Lifecycle management (initialize, start, stop, isActive)
- Git repository verification (throws for non-git directories)
- onFileEvent() as no-op
- flush() behavior (drift detection, reconciliation, stats updates)
- Concurrent flush prevention (flushing lock)
- Git commit detection via .git/logs/HEAD changes
- Debounce behavior for rapid git operations
- getStats() return values
- Public accessors
- Factory function
- Constants export

---

## Phase 7: Strategy Orchestrator (COMPLETED - SMCP-049)

### New File: `src/engines/strategyOrchestrator.ts`

**Implementation completed 2025-12-10**

Key exports:
- `StrategyOrchestrator` - Main class for strategy lifecycle management
- `createStrategyOrchestrator()` - Factory function
- `StrategyOrchestratorDependencies` - Configuration interface

```typescript
/**
 * Strategy Orchestrator
 *
 * Manages indexing strategy lifecycle:
 * - Creates and configures strategies based on configuration
 * - Handles strategy switching (flush old before starting new)
 * - Provides unified interface for server and tools
 * - Registers cleanup handlers for graceful shutdown
 */

export interface StrategyOrchestratorDependencies {
  projectPath: string;
  indexPath: string;
  indexManager: IndexManager;
  docsIndexManager: DocsIndexManager | null;
  integrityEngine: IntegrityEngine;
  policy: IndexingPolicy;
  fingerprints: FingerprintsManager;
  docsFingerprints: DocsFingerprintsManager | null;
}

export class StrategyOrchestrator {
  private currentStrategy: IndexingStrategy | null = null;
  private cleanupHandler: CleanupHandler | null = null;

  constructor(deps: StrategyOrchestratorDependencies) { /* ... */ }

  /**
   * Set and start a strategy based on configuration
   * Idempotent - calling with same active strategy is a no-op
   */
  async setStrategy(config: Config): Promise<void> {
    // If same strategy is already running, do nothing
    // Flush and stop current strategy before switching
    // Create new strategy via factory
    // Initialize and start
    // Register cleanup handler
  }

  /**
   * Create a strategy instance (private factory)
   */
  private createStrategy(name: string, config: Config): IndexingStrategy {
    switch (name) {
      case 'realtime': return new RealtimeStrategy(...);
      case 'lazy': return new LazyStrategy(...);
      case 'git': return new GitStrategy(...);
      default: throw new Error(`Unknown indexing strategy: ${name}`);
    }
  }

  /** Get current strategy or null */
  getCurrentStrategy(): IndexingStrategy | null;

  /** Flush pending changes (delegates to current strategy) */
  async flush(): Promise<void>;

  /** Stop current strategy (flush + stop + unregister cleanup) */
  async stop(): Promise<void>;

  /** Get strategy statistics or null */
  getStats(): StrategyStats | null;

  /** Check if a strategy is active */
  isActive(): boolean;

  /** Accessors */
  getProjectPath(): string;
  getIndexPath(): string;
}

// Factory function
export function createStrategyOrchestrator(
  deps: StrategyOrchestratorDependencies
): StrategyOrchestrator;
```

### Updated: `src/engines/index.ts`

Added exports:
```typescript
// Strategy Orchestrator
export {
  StrategyOrchestrator,
  createStrategyOrchestrator,
  type StrategyOrchestratorDependencies,
} from './strategyOrchestrator.js';
```

### Tests: `tests/unit/engines/strategyOrchestrator.test.ts`

Comprehensive tests covering (43 tests total):
- Constructor and initial state (no strategy active)
- setStrategy() for all three strategies (realtime, lazy, git)
- Idempotent behavior (same strategy is no-op)
- Strategy switching (flush old before starting new)
- flush() delegation and null-safety
- stop() with flush, stop, and cleanup unregistration
- getCurrentStrategy() accessor
- getStats() delegation
- isActive() status check
- Factory function
- Null docsIndexManager handling
- Edge cases (rapid switching, failed strategy start)

---

## Phase 8: Tool Integrations (COMPLETED - SMCP-050)

**Implementation completed 2025-12-10**

All tools updated to integrate with the strategy orchestrator via optional context properties.

### Modified: `src/tools/searchCode.ts`

- Added `StrategyOrchestrator` type import
- Extended `ToolContext` interface with optional `orchestrator?: StrategyOrchestrator`
- Added flush logic before search:

```typescript
// Flush pending changes if using lazy strategy (ensures fresh results)
if (context.orchestrator) {
  const strategy = context.orchestrator.getCurrentStrategy();
  if (strategy?.name === 'lazy') {
    logger.debug('searchCode', 'Flushing lazy strategy before search');
    await context.orchestrator.flush();
  }
}
```

### Modified: `src/tools/searchDocs.ts`

- Same changes as searchCode.ts
- Extended `DocsToolContext` with optional `orchestrator?: StrategyOrchestrator`

### Modified: `src/tools/getIndexStatus.ts`

- Added `StrategyOrchestrator` and `StrategyName` type imports
- Extended `GetIndexStatusOutput` with new fields:
  - `indexingStrategy?: StrategyName` - Current strategy name
  - `pendingFiles?: number` - Files pending indexing (for lazy strategy)
- Added strategy info collection in `collectStatus()`:

```typescript
// Get strategy info from orchestrator if available
let indexingStrategy: StrategyName | undefined;
let pendingFiles: number | undefined;

if (context.orchestrator) {
  const strategyStats = context.orchestrator.getStats();
  if (strategyStats) {
    indexingStrategy = strategyStats.name as StrategyName;
    pendingFiles = strategyStats.pendingFiles;
  }
}
```

### Modified: `src/tools/createIndex.ts`

- Added `StrategyOrchestrator` and `Config` type imports
- Extended `CreateIndexContext` with:
  - `orchestrator?: StrategyOrchestrator`
  - `config?: Config` (required if orchestrator is provided)
- Added step to start strategy after indexing:

```typescript
// Step 6: Start indexing strategy if orchestrator and config provided
if (context.orchestrator && context.config) {
  logger.debug('createIndex', 'Starting indexing strategy', {
    strategy: context.config.indexingStrategy,
  });
  await context.orchestrator.setStrategy(context.config);
  logger.info('createIndex', 'Indexing strategy started', {
    strategy: context.config.indexingStrategy,
  });
}
```

### Modified: `src/tools/deleteIndex.ts`

- Added `StrategyOrchestrator` type import
- Added `getDirtyFilesPath` to path utils import
- Extended `DeleteIndexContext` with `orchestrator?: StrategyOrchestrator`
- Added step to stop orchestrator before deletion:

```typescript
// Step 2: Stop strategy orchestrator if provided
if (context.orchestrator) {
  logger.debug('deleteIndex', 'Stopping indexing strategy');
  try {
    await context.orchestrator.stop();
    logger.debug('deleteIndex', 'Indexing strategy stopped');
  } catch (error) {
    logger.warn('deleteIndex', 'Failed to stop indexing strategy', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue with deletion even if strategy stop fails
  }
}
```

- Updated `safeDeleteIndex` to include additional files:
  - `docs.lancedb` (directory)
  - `docs-fingerprints.json`
  - `dirty-files.json`

---

## Phase 9: Server Integration

### Modify: `src/server.ts`

```typescript
// Create orchestrator after index manager initialization
const orchestrator = new StrategyOrchestrator(
  projectPath,
  indexPath,
  indexManager,
  docsIndexManager,
  integrityEngine,
  policy,
  fingerprints,
  docsFingerprints,
);

// Make orchestrator available to tools
// (via server context or module-level export)

// Start strategy based on config
const config = await configManager.load();
await orchestrator.setStrategy(config);

// Optional: Watch config file for strategy changes
// chokidar.watch(configPath).on('change', async () => {
//   const newConfig = await configManager.load();
//   await orchestrator.setStrategy(newConfig);
// });
```

---

## Testing Plan

### Unit Tests

1. `dirtyFiles.test.ts` - Add, remove, save, load, clear
2. `lazyStrategy.test.ts` - Idle timer, flush, event queuing
3. `gitStrategy.test.ts` - Commit detection, reconciliation
4. `strategyOrchestrator.test.ts` - Strategy switching, flush before switch

### Integration Tests

1. Strategy switching preserves existing index
2. Lazy mode flushes before search returns results
3. Git mode detects commits and reconciles
4. Config change triggers strategy switch

---

## Migration Notes

- Default strategy is `realtime` - **backward compatible**
- Existing configs without `indexingStrategy` get default
- No data migration needed
- New `dirty-files.json` created on first lazy mode use

---

## File Summary

### New Files (7)

| File                                           | Purpose                   |
| ---------------------------------------------- | ------------------------- |
| `src/storage/dirtyFiles.ts`                  | Dirty files persistence   |
| `src/engines/indexingStrategy.ts`            | Strategy interface        |
| `src/engines/strategies/realtimeStrategy.ts` | Immediate indexing        |
| `src/engines/strategies/lazyStrategy.ts`     | Deferred indexing         |
| `src/engines/strategies/gitStrategy.ts`      | Commit-based indexing     |
| `src/engines/strategyOrchestrator.ts`        | Strategy lifecycle        |
| `src/utils/paths.ts`                         | Add `getDirtyFilesPath` |

### Modified Files (8)

| File                            | Changes                 |
| ------------------------------- | ----------------------- |
| `src/storage/config.ts`       | Add schema fields       |
| `src/tools/searchCode.ts`     | Flush before search     |
| `src/tools/searchDocs.ts`     | Flush before search     |
| `src/tools/getIndexStatus.ts` | Report strategy stats   |
| `src/tools/createIndex.ts`    | Start strategy          |
| `src/tools/deleteIndex.ts`    | Stop strategy, cleanup  |
| `src/server.ts`               | Initialize orchestrator |
| `src/engines/index.ts`        | Export new modules      |

---

## Related Tasks

- SMCP-043: Config Schema: Indexing Strategy
- SMCP-044: Dirty Files Manager
- SMCP-045: Strategy Interface
- SMCP-046: Realtime Strategy
- SMCP-047: Lazy Strategy
- SMCP-048: Git Strategy
- SMCP-049: Strategy Orchestrator
- SMCP-050: Tool Integrations
- SMCP-051: Server Integration
