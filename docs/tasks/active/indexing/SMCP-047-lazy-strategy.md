---
task_id: "SMCP-047"
title: "Lazy Strategy"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 4
actual_hours: 3
assigned_to: "blakazulu"
tags: ["strategy", "indexing", "lazy", "deferred"]
---

# Task: Lazy Strategy

## Overview

Create a LazyStrategy that detects file changes in real-time but defers actual indexing until idle (30s default) or before search operations. This reduces CPU usage for large projects.

## Goals

- [x] Create LazyStrategy implementing IndexingStrategy
- [x] Track dirty files using DirtyFilesManager
- [x] Implement idle timer for automatic flush
- [x] Support flush before search via flush() method

## Success Criteria

- [x] LazyStrategy implements IndexingStrategy interface
- [x] File changes are queued, not processed immediately
- [x] Idle timer triggers flush after lazyIdleThreshold seconds
- [x] flush() processes all pending files
- [x] Deletions are tracked and processed correctly
- [x] Dirty files persist across restarts

## Dependencies

**Blocked by:**

- SMCP-044: Dirty Files Manager (COMPLETED)
- SMCP-045: Strategy Interface (COMPLETED)

**Blocks:**

- SMCP-049: Strategy Orchestrator

**Related:**

- SMCP-046: Realtime Strategy (shares watcher setup)

## Subtasks

### Phase 1: Create Strategy Class (2 hours)

- [x] 1.1 Create `src/engines/strategies/lazyStrategy.ts`:
    - Import IndexingStrategy interface
    - Import DirtyFilesManager
    - Import chokidar and WATCHER_OPTIONS

- [x] 1.2 Implement constructor:
    - projectPath
    - indexManager
    - docsIndexManager (nullable)
    - policy
    - dirtyFiles (DirtyFilesManager)
    - idleThreshold (seconds, from config)

- [x] 1.3 Implement state tracking:
    - watcher: chokidar.FSWatcher
    - active: boolean
    - idleTimer: timeout handle
    - flushing: boolean (lock)
    - processedCount: number
    - lastActivity: Date

### Phase 2: Implement Interface Methods (1.5 hours)

- [x] 2.1 `initialize()`:
    - Load dirty files from disk
    - Initialize policy

- [x] 2.2 `start()`:
    - Create chokidar watcher
    - Bind event handlers
    - Start idle timer if dirty files exist

- [x] 2.3 `stop()`:
    - Clear idle timer
    - Save dirty files
    - Close watcher

- [x] 2.4 `onFileEvent()`:
    - Add to dirty files (or markDeleted for unlink)
    - Reset idle timer
    - Do NOT process immediately

- [x] 2.5 `flush()`:
    - Check flushing lock
    - Process deletions first
    - Process adds/changes
    - Clear dirty files
    - Save to disk

- [x] 2.6 `getStats()`:
    - Return pending count from dirtyFiles.count()

### Phase 3: Idle Timer Logic (0.5 hours)

- [x] 3.1 Implement `resetIdleTimer()`:
    - Clear existing timer
    - Set new timer for idleThreshold seconds
    - On timeout: call flush()

- [x] 3.2 Handle timer cleanup in stop()

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 5)
- Dirty Files: `src/storage/dirtyFiles.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable)
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git (pending user approval)
- [x] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- Started task
- Subtasks defined

### 2025-12-10 - 3 hours

- Created `src/engines/strategies/lazyStrategy.ts` with full implementation
- Implemented all IndexingStrategy interface methods
- Implemented idle timer with configurable threshold
- Implemented flush with flushing lock to prevent concurrent operations
- Added proper cleanup handler registration
- Updated `src/engines/strategies/index.ts` to export LazyStrategy
- Updated `src/engines/index.ts` to export LazyStrategy
- Created comprehensive test suite `tests/unit/engines/strategies/lazyStrategy.test.ts`
- All 45 tests pass
- Build succeeds
- No regressions in existing tests (1665 tests pass)

## Implementation Details

### Files Created

- `src/engines/strategies/lazyStrategy.ts` - Main LazyStrategy implementation

### Files Modified

- `src/engines/strategies/index.ts` - Added LazyStrategy exports
- `src/engines/index.ts` - Added LazyStrategy exports

### Key Features Implemented

1. **File Change Queuing**: Events are queued in DirtyFilesManager instead of processed immediately
2. **Idle Timer**: Auto-flush after configurable idle period (default 30s)
3. **Manual Flush**: flush() method for search tools to call before returning results
4. **Deletion Tracking**: Deletions are tracked separately and processed first during flush
5. **Persistence**: Dirty files are saved to disk on stop() and loaded on initialize()
6. **Cleanup Integration**: Proper cleanup handler registration for graceful shutdown
7. **Code/Docs Routing**: Routes updates to appropriate manager based on file type

### API

```typescript
// Create strategy
const strategy = new LazyStrategy(
  projectPath,
  indexManager,
  docsIndexManager,
  policy,
  dirtyFiles,
  idleThresholdSeconds // default: 30
);

// Or use factory
const strategy = createLazyStrategy(
  projectPath,
  indexManager,
  docsIndexManager,
  policy,
  dirtyFiles,
  { idleThresholdSeconds: 60 }
);

// Lifecycle
await strategy.initialize();
await strategy.start();
// ... file events are queued ...
await strategy.flush(); // process all pending
await strategy.stop();
```

## Notes

- Use flushing lock to prevent concurrent flush operations
- Process deletions before adds (file might be deleted then recreated)
- Idle timer resets on each file event
- flush() is called by search tools before returning results
