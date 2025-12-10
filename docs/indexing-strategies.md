# Configurable Indexing Strategies

Add user-configurable indexing strategies to reduce performance overhead from continuous file watching.

---

## Implementation Progress

| Phase | Task ID | Description | Status |
|-------|---------|-------------|--------|
| 1 | SMCP-043 | Config Schema Changes | COMPLETED |
| 2 | SMCP-044 | Dirty Files Manager | Not Started |
| 3 | SMCP-045 | Strategy Interface | Not Started |
| 4 | SMCP-046 | Realtime Strategy | Not Started |
| 5 | SMCP-047 | Lazy Strategy | Not Started |
| 6 | SMCP-048 | Git Strategy | Not Started |
| 7 | SMCP-049 | Strategy Orchestrator | Not Started |
| 8 | SMCP-050 | Tool Integrations | Not Started |
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

## Phase 2: Dirty Files Manager

### New File: `src/storage/dirtyFiles.ts`

Track files that need indexing for lazy mode. Pattern follows `fingerprints.ts`.

```typescript
/**
 * Dirty Files Manager Module
 *
 * Tracks files pending indexing for lazy/deferred indexing strategies.
 * Persists to disk to survive server restarts.
 */

import * as fs from 'node:fs';
import { getDirtyFilesPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';

// ============================================================================
// Types
// ============================================================================

interface DirtyFilesJSON {
  version: string;
  dirtyFiles: string[];      // Array of relative paths
  lastModified: string;      // ISO timestamp
}

// ============================================================================
// Constants
// ============================================================================

export const DIRTY_FILES_VERSION = '1.0.0';

// ============================================================================
// DirtyFilesManager Class
// ============================================================================

export class DirtyFilesManager {
  private readonly indexPath: string;
  private dirtyFiles: Set<string> = new Set();
  private loaded: boolean = false;
  private modified: boolean = false;

  constructor(indexPath: string) {
    this.indexPath = indexPath;
  }

  /**
   * Load dirty files from disk
   */
  async load(): Promise<void> {
    const logger = getLogger();
    const filePath = getDirtyFilesPath(this.indexPath);

    try {
      if (!fs.existsSync(filePath)) {
        this.dirtyFiles = new Set();
        this.loaded = true;
        return;
      }

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as DirtyFilesJSON;

      // Version check for future migrations
      if (data.version !== DIRTY_FILES_VERSION) {
        logger.warn('DirtyFilesManager', 'Version mismatch, starting fresh', {
          expected: DIRTY_FILES_VERSION,
          found: data.version,
        });
        this.dirtyFiles = new Set();
      } else {
        this.dirtyFiles = new Set(data.dirtyFiles);
      }

      this.loaded = true;
      logger.debug('DirtyFilesManager', 'Loaded dirty files', {
        count: this.dirtyFiles.size,
      });
    } catch (error) {
      logger.warn('DirtyFilesManager', 'Failed to load dirty files', { error });
      this.dirtyFiles = new Set();
      this.loaded = true;
    }
  }

  /**
   * Save dirty files to disk (if modified)
   */
  async save(): Promise<void> {
    if (!this.modified) return;

    const logger = getLogger();
    const filePath = getDirtyFilesPath(this.indexPath);

    const data: DirtyFilesJSON = {
      version: DIRTY_FILES_VERSION,
      dirtyFiles: Array.from(this.dirtyFiles),
      lastModified: new Date().toISOString(),
    };

    await atomicWriteJson(filePath, data);
    this.modified = false;

    logger.debug('DirtyFilesManager', 'Saved dirty files', {
      count: this.dirtyFiles.size,
    });
  }

  /**
   * Add a file to the dirty set
   */
  add(relativePath: string): void {
    if (!this.dirtyFiles.has(relativePath)) {
      this.dirtyFiles.add(relativePath);
      this.modified = true;
    }
  }

  /**
   * Remove a file from the dirty set
   */
  remove(relativePath: string): void {
    if (this.dirtyFiles.has(relativePath)) {
      this.dirtyFiles.delete(relativePath);
      this.modified = true;
    }
  }

  /**
   * Mark a file as deleted (for tracking removals)
   */
  markDeleted(relativePath: string): void {
    // Prefix with special marker for deletions
    this.add(`__deleted__:${relativePath}`);
  }

  /**
   * Get all dirty files (excluding deletion markers)
   */
  getAll(): string[] {
    return Array.from(this.dirtyFiles).filter(p => !p.startsWith('__deleted__:'));
  }

  /**
   * Get all deleted files
   */
  getDeleted(): string[] {
    return Array.from(this.dirtyFiles)
      .filter(p => p.startsWith('__deleted__:'))
      .map(p => p.replace('__deleted__:', ''));
  }

  /**
   * Clear all dirty files
   */
  clear(): void {
    if (this.dirtyFiles.size > 0) {
      this.dirtyFiles.clear();
      this.modified = true;
    }
  }

  /**
   * Get count of dirty files
   */
  count(): number {
    return this.dirtyFiles.size;
  }

  /**
   * Check if there are any dirty files
   */
  isEmpty(): boolean {
    return this.dirtyFiles.size === 0;
  }

  /**
   * Check if loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Delete the dirty files from disk
   */
  async delete(): Promise<void> {
    const filePath = getDirtyFilesPath(this.indexPath);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore if doesn't exist
    }
  }
}
```

### Add to `src/utils/paths.ts`:

```typescript
/**
 * Get the path to the dirty files JSON for an index
 */
export function getDirtyFilesPath(indexPath: string): string {
  return path.join(indexPath, 'dirty-files.json');
}
```

---

## Phase 3: Strategy Interface

### New File: `src/engines/indexingStrategy.ts`

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
export interface FileEvent {
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
  onFileEvent(event: FileEvent): Promise<void>;

  /** Force processing of all pending changes */
  flush(): Promise<void>;

  /** Get statistics for status reporting */
  getStats(): StrategyStats;
}
```

---

## Phase 4: Realtime Strategy

### New File: `src/engines/strategies/realtimeStrategy.ts`

Wraps existing FileWatcher behavior - processes events immediately.

```typescript
/**
 * Realtime Indexing Strategy
 *
 * Processes file changes immediately (with debounce).
 * This is the current/default behavior.
 */

import chokidar from 'chokidar';
import { IndexingStrategy, FileEvent, StrategyStats } from '../indexingStrategy.js';
import { IndexManager } from '../indexManager.js';
import { DocsIndexManager } from '../docsIndexManager.js';
import { IndexingPolicy } from '../indexPolicy.js';
import { FingerprintsManager } from '../../storage/fingerprints.js';
import { WATCHER_OPTIONS, DEFAULT_DEBOUNCE_DELAY } from '../fileWatcher.js';
import { getLogger } from '../../utils/logger.js';
import { registerCleanup, unregisterCleanup } from '../../utils/cleanup.js';

export class RealtimeStrategy implements IndexingStrategy {
  readonly name = 'realtime' as const;

  private watcher: chokidar.FSWatcher | null = null;
  private active: boolean = false;
  private processedCount: number = 0;
  private lastActivity: Date | null = null;

  // Debouncing
  private pendingEvents = new Map<string, ReturnType<typeof setTimeout>>();
  private processingQueue = new Set<string>();

  constructor(
    private readonly projectPath: string,
    private readonly indexManager: IndexManager,
    private readonly docsIndexManager: DocsIndexManager | null,
    private readonly policy: IndexingPolicy,
    private readonly fingerprints: FingerprintsManager,
    private readonly docsFingerprints: FingerprintsManager | null,
  ) {}

  async initialize(): Promise<void> {
    // Ensure dependencies are loaded
    if (!this.fingerprints.isLoaded()) {
      await this.fingerprints.load();
    }
    if (this.docsFingerprints && !this.docsFingerprints.isLoaded()) {
      await this.docsFingerprints.load();
    }
    if (!this.policy.isInitialized()) {
      await this.policy.initialize();
    }
  }

  async start(): Promise<void> {
    const logger = getLogger();

    this.watcher = chokidar.watch(this.projectPath, WATCHER_OPTIONS);

    this.watcher.on('add', (path) => this.handleEvent('add', path));
    this.watcher.on('change', (path) => this.handleEvent('change', path));
    this.watcher.on('unlink', (path) => this.handleEvent('unlink', path));
    this.watcher.on('error', (error) => this.handleError(error));

    await new Promise<void>((resolve) => {
      this.watcher!.on('ready', () => {
        logger.info('RealtimeStrategy', 'File watcher ready');
        resolve();
      });
    });

    this.active = true;
  }

  async stop(): Promise<void> {
    // Clear pending debounce timers
    for (const timeout of this.pendingEvents.values()) {
      clearTimeout(timeout);
    }
    this.pendingEvents.clear();

    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  async onFileEvent(event: FileEvent): Promise<void> {
    // Process immediately (with debounce handled internally)
    await this.processEvent(event);
  }

  async flush(): Promise<void> {
    // Nothing to flush - events are processed immediately
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

  // --- Private methods (extracted from FileWatcher) ---

  private handleEvent(type: 'add' | 'change' | 'unlink', absolutePath: string): void {
    // Convert to relative, check policy, debounce, then process
    // (Implementation details from existing FileWatcher)
  }

  private async processEvent(event: FileEvent): Promise<void> {
    // Route to indexManager or docsIndexManager based on file type
    // Update fingerprints
    // (Implementation details from existing FileWatcher)
    this.processedCount++;
    this.lastActivity = new Date();
  }

  private handleError(error: Error): void {
    const logger = getLogger();
    logger.error('RealtimeStrategy', 'Watcher error', { error });
  }
}
```

---

## Phase 5: Lazy Strategy

### New File: `src/engines/strategies/lazyStrategy.ts`

```typescript
/**
 * Lazy Indexing Strategy
 *
 * Detects file changes in real-time but defers indexing until:
 * 1. Idle timeout (default 30s of no activity)
 * 2. Before search (flush called by search tools)
 */

import chokidar from 'chokidar';
import { IndexingStrategy, FileEvent, StrategyStats } from '../indexingStrategy.js';
import { IndexManager } from '../indexManager.js';
import { DocsIndexManager } from '../docsIndexManager.js';
import { IndexingPolicy } from '../indexPolicy.js';
import { DirtyFilesManager } from '../../storage/dirtyFiles.js';
import { WATCHER_OPTIONS } from '../fileWatcher.js';
import { isDocFile } from '../../utils/paths.js';
import { getLogger } from '../../utils/logger.js';

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

  constructor(
    private readonly projectPath: string,
    private readonly indexManager: IndexManager,
    private readonly docsIndexManager: DocsIndexManager | null,
    private readonly policy: IndexingPolicy,
    private readonly dirtyFiles: DirtyFilesManager,
    private readonly idleThreshold: number = 30, // seconds
  ) {}

  async initialize(): Promise<void> {
    if (!this.dirtyFiles.isLoaded()) {
      await this.dirtyFiles.load();
    }
    if (!this.policy.isInitialized()) {
      await this.policy.initialize();
    }
  }

  async start(): Promise<void> {
    const logger = getLogger();

    this.watcher = chokidar.watch(this.projectPath, WATCHER_OPTIONS);

    this.watcher.on('add', (path) => this.handleEvent('add', path));
    this.watcher.on('change', (path) => this.handleEvent('change', path));
    this.watcher.on('unlink', (path) => this.handleEvent('unlink', path));
    this.watcher.on('error', (error) => this.handleError(error));

    await new Promise<void>((resolve) => {
      this.watcher!.on('ready', () => {
        logger.info('LazyStrategy', 'File watcher ready (lazy mode)');
        resolve();
      });
    });

    this.active = true;

    // If there are pending dirty files from previous session, start idle timer
    if (!this.dirtyFiles.isEmpty()) {
      this.resetIdleTimer();
    }
  }

  async stop(): Promise<void> {
    // Clear idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Save dirty files before stopping
    await this.dirtyFiles.save();

    // Close watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  async onFileEvent(event: FileEvent): Promise<void> {
    // Just mark as dirty, don't process
    if (event.type === 'unlink') {
      this.dirtyFiles.markDeleted(event.relativePath);
    } else {
      this.dirtyFiles.add(event.relativePath);
    }

    this.lastActivity = new Date();
    this.resetIdleTimer();
  }

  /**
   * Process all pending dirty files
   */
  async flush(): Promise<void> {
    if (this.flushing || this.dirtyFiles.isEmpty()) {
      return;
    }

    const logger = getLogger();
    this.flushing = true;

    try {
      logger.info('LazyStrategy', 'Flushing dirty files', {
        count: this.dirtyFiles.count(),
      });

      // Process deletions first
      const deleted = this.dirtyFiles.getDeleted();
      for (const relativePath of deleted) {
        if (isDocFile(relativePath) && this.docsIndexManager) {
          await this.docsIndexManager.removeDocFile(relativePath);
        } else {
          await this.indexManager.removeFile(relativePath);
        }
        this.processedCount++;
      }

      // Process adds/changes
      const dirty = this.dirtyFiles.getAll();
      for (const relativePath of dirty) {
        if (isDocFile(relativePath) && this.docsIndexManager) {
          await this.docsIndexManager.updateDocFile(relativePath);
        } else {
          await this.indexManager.updateFile(relativePath);
        }
        this.processedCount++;
      }

      // Clear dirty files and save
      this.dirtyFiles.clear();
      await this.dirtyFiles.save();

      logger.info('LazyStrategy', 'Flush complete', {
        processed: deleted.length + dirty.length,
      });
    } finally {
      this.flushing = false;
    }
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

  // --- Private methods ---

  private handleEvent(type: 'add' | 'change' | 'unlink', absolutePath: string): void {
    const logger = getLogger();

    // Convert to relative path
    const relativePath = this.toRelativePath(absolutePath);
    if (!relativePath) return;

    // Check policy
    if (!this.policy.shouldIndex(relativePath)) {
      return;
    }

    // Queue the event (don't process yet)
    this.onFileEvent({
      type,
      relativePath,
      absolutePath,
    }).catch((error) => {
      logger.error('LazyStrategy', 'Error queuing event', { error, relativePath });
    });
  }

  private toRelativePath(absolutePath: string): string | null {
    // Implementation to convert absolute to relative path
    // Return null if outside project
  }

  private resetIdleTimer(): void {
    // Clear existing timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    // Set new timer
    this.idleTimer = setTimeout(() => {
      this.flush().catch((error) => {
        const logger = getLogger();
        logger.error('LazyStrategy', 'Error during idle flush', { error });
      });
    }, this.idleThreshold * 1000);
  }

  private handleError(error: Error): void {
    const logger = getLogger();
    logger.error('LazyStrategy', 'Watcher error', { error });
  }
}
```

---

## Phase 6: Git Strategy

### New File: `src/engines/strategies/gitStrategy.ts`

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
import { IndexingStrategy, FileEvent, StrategyStats } from '../indexingStrategy.js';
import { IntegrityEngine } from '../integrity.js';
import { getLogger } from '../../utils/logger.js';

export class GitStrategy implements IndexingStrategy {
  readonly name = 'git' as const;

  private gitWatcher: chokidar.FSWatcher | null = null;
  private active: boolean = false;
  private processedCount: number = 0;
  private lastActivity: Date | null = null;

  // Debounce rapid git operations (rebases, merges)
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceDelay = 2000; // 2 seconds

  constructor(
    private readonly projectPath: string,
    private readonly integrityEngine: IntegrityEngine,
  ) {}

  async initialize(): Promise<void> {
    // Verify .git directory exists
    const gitDir = path.join(this.projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error('Not a git repository: .git directory not found');
    }
  }

  async start(): Promise<void> {
    const logger = getLogger();

    const gitLogsHead = path.join(this.projectPath, '.git', 'logs', 'HEAD');

    // Create parent directory if needed (fresh repos may not have it)
    const logsDir = path.dirname(gitLogsHead);
    if (!fs.existsSync(logsDir)) {
      await fs.promises.mkdir(logsDir, { recursive: true });
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

    this.gitWatcher.on('change', () => this.onGitChange());
    this.gitWatcher.on('error', (error) => this.handleError(error));

    await new Promise<void>((resolve) => {
      this.gitWatcher!.on('ready', () => {
        logger.info('GitStrategy', 'Watching .git/logs/HEAD for commits');
        resolve();
      });
    });

    this.active = true;
  }

  async stop(): Promise<void> {
    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close watcher
    if (this.gitWatcher) {
      await this.gitWatcher.close();
      this.gitWatcher = null;
    }

    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  async onFileEvent(_event: FileEvent): Promise<void> {
    // Git strategy doesn't process individual file events
    // Everything is handled via git commit detection
  }

  /**
   * Reconcile index with current filesystem state
   */
  async flush(): Promise<void> {
    const logger = getLogger();
    logger.info('GitStrategy', 'Reconciling index with filesystem');

    // Use IntegrityEngine to detect and fix drift
    const drift = await this.integrityEngine.detectDrift();

    if (drift.added.length === 0 && drift.modified.length === 0 && drift.removed.length === 0) {
      logger.info('GitStrategy', 'Index is in sync');
      return;
    }

    logger.info('GitStrategy', 'Drift detected', {
      added: drift.added.length,
      modified: drift.modified.length,
      removed: drift.removed.length,
    });

    // Reconcile
    const result = await this.integrityEngine.reconcile(drift);
    this.processedCount += result.filesAdded + result.filesModified + result.filesRemoved;
    this.lastActivity = new Date();

    logger.info('GitStrategy', 'Reconciliation complete', {
      added: result.filesAdded,
      modified: result.filesModified,
      removed: result.filesRemoved,
      durationMs: result.durationMs,
    });
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

  // --- Private methods ---

  private onGitChange(): void {
    const logger = getLogger();
    logger.debug('GitStrategy', 'Git HEAD change detected');

    // Debounce rapid git operations
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush().catch((error) => {
        logger.error('GitStrategy', 'Error during post-commit reconciliation', { error });
      });
    }, this.debounceDelay);
  }

  private handleError(error: Error): void {
    const logger = getLogger();
    logger.error('GitStrategy', 'Git watcher error', { error });
  }
}
```

---

## Phase 7: Strategy Orchestrator

### New File: `src/engines/strategyOrchestrator.ts`

```typescript
/**
 * Strategy Orchestrator
 *
 * Manages indexing strategy lifecycle:
 * - Creates and configures strategies
 * - Handles strategy switching
 * - Provides unified interface for server
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
import { DirtyFilesManager } from '../storage/dirtyFiles.js';
import { Config } from '../storage/config.js';
import { getLogger } from '../utils/logger.js';
import { registerCleanup, unregisterCleanup, CleanupHandler } from '../utils/cleanup.js';

export class StrategyOrchestrator {
  private currentStrategy: IndexingStrategy | null = null;
  private cleanupHandler: CleanupHandler | null = null;

  constructor(
    private readonly projectPath: string,
    private readonly indexPath: string,
    private readonly indexManager: IndexManager,
    private readonly docsIndexManager: DocsIndexManager | null,
    private readonly integrityEngine: IntegrityEngine,
    private readonly policy: IndexingPolicy,
    private readonly fingerprints: FingerprintsManager,
    private readonly docsFingerprints: FingerprintsManager | null,
  ) {}

  /**
   * Set and start a strategy by name
   */
  async setStrategy(config: Config): Promise<void> {
    const logger = getLogger();
    const strategyName = config.indexingStrategy;

    // If same strategy is already running, do nothing
    if (this.currentStrategy?.name === strategyName && this.currentStrategy.isActive()) {
      return;
    }

    // Stop current strategy (flush pending first)
    if (this.currentStrategy) {
      logger.info('StrategyOrchestrator', 'Switching strategy', {
        from: this.currentStrategy.name,
        to: strategyName,
      });

      await this.currentStrategy.flush();
      await this.currentStrategy.stop();
    }

    // Create new strategy
    this.currentStrategy = this.createStrategy(strategyName, config);

    // Initialize and start
    await this.currentStrategy.initialize();
    await this.currentStrategy.start();

    // Register cleanup
    if (this.cleanupHandler) {
      unregisterCleanup(this.cleanupHandler);
    }
    this.cleanupHandler = async () => {
      await this.stop();
    };
    registerCleanup(this.cleanupHandler, 'StrategyOrchestrator');

    logger.info('StrategyOrchestrator', 'Strategy started', { strategy: strategyName });
  }

  /**
   * Create a strategy instance
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
          this.docsFingerprints,
        );

      case 'lazy':
        return new LazyStrategy(
          this.projectPath,
          this.indexManager,
          this.docsIndexManager,
          this.policy,
          new DirtyFilesManager(this.indexPath),
          config.lazyIdleThreshold,
        );

      case 'git':
        return new GitStrategy(
          this.projectPath,
          this.integrityEngine,
        );

      default:
        throw new Error(`Unknown indexing strategy: ${name}`);
    }
  }

  /**
   * Get current strategy
   */
  getCurrentStrategy(): IndexingStrategy | null {
    return this.currentStrategy;
  }

  /**
   * Flush pending changes (for lazy mode before search)
   */
  async flush(): Promise<void> {
    if (this.currentStrategy) {
      await this.currentStrategy.flush();
    }
  }

  /**
   * Stop current strategy
   */
  async stop(): Promise<void> {
    if (this.currentStrategy) {
      await this.currentStrategy.flush();
      await this.currentStrategy.stop();
      this.currentStrategy = null;
    }

    if (this.cleanupHandler) {
      unregisterCleanup(this.cleanupHandler);
      this.cleanupHandler = null;
    }
  }

  /**
   * Get strategy statistics
   */
  getStats(): StrategyStats | null {
    return this.currentStrategy?.getStats() ?? null;
  }
}
```

---

## Phase 8: Tool Integrations

### Modify: `src/tools/searchCode.ts`

Add before executing search:

```typescript
// Flush pending changes if using lazy strategy
const orchestrator = getOrchestrator(); // Access via server context
if (orchestrator?.getCurrentStrategy()?.name === 'lazy') {
  await orchestrator.flush();
}
```

### Modify: `src/tools/searchDocs.ts`

Same change as searchCode.ts.

### Modify: `src/tools/getIndexStatus.ts`

Add to status output:

```typescript
// Add strategy info to result
const strategyStats = orchestrator?.getStats();
if (strategyStats) {
  result.indexingStrategy = strategyStats.name;
  result.pendingFiles = strategyStats.pendingFiles;
}
```

### Modify: `src/tools/createIndex.ts`

After indexing completes, start the strategy:

```typescript
// Start configured indexing strategy
const config = await configManager.load();
await orchestrator.setStrategy(config);
```

### Modify: `src/tools/deleteIndex.ts`

Before deleting:

```typescript
// Stop strategy
await orchestrator?.stop();

// Delete dirty-files.json
const dirtyFilesPath = getDirtyFilesPath(indexPath);
if (fs.existsSync(dirtyFilesPath)) {
  await fs.promises.unlink(dirtyFilesPath);
}
```

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
