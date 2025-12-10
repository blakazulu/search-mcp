---
task_id: "SMCP-048"
title: "Git Strategy"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
completed_date: "2025-12-10"
due_date: ""
estimated_hours: 3
actual_hours: 2
assigned_to: "blakazulu"
tags: ["strategy", "indexing", "git", "commits"]
---

# Task: Git Strategy

## Overview

Create a GitStrategy that only reindexes after git commits. Instead of watching all project files, it watches `.git/logs/HEAD` which is appended on every commit. Uses IntegrityEngine for drift detection.

## Goals

- [x] Create GitStrategy implementing IndexingStrategy
- [x] Watch .git/logs/HEAD for commit detection
- [x] Use IntegrityEngine to detect and reconcile drift
- [x] Minimal file watcher overhead

## Success Criteria

- [x] GitStrategy implements IndexingStrategy interface
- [x] Only watches `.git/logs/HEAD` (not project files)
- [x] Detects commits via file change events
- [x] Uses IntegrityEngine.checkDrift() and reconcile()
- [x] Handles rapid git operations with debounce (2s)
- [x] Fails gracefully for non-git projects

## Dependencies

**Blocked by:**

- SMCP-045: Strategy Interface (COMPLETED)

**Blocks:**

- SMCP-049: Strategy Orchestrator

**Related:**

- SMCP-016: Integrity Engine (used for drift detection)

## Subtasks

### Phase 1: Create Strategy Class (1.5 hours)

- [x] 1.1 Create `src/engines/strategies/gitStrategy.ts`:
    - Import IndexingStrategy interface
    - Import IntegrityEngine
    - Import chokidar

- [x] 1.2 Implement constructor:
    - projectPath
    - integrityEngine
    - options (debounceDelayMs)

- [x] 1.3 Implement state tracking:
    - gitWatcher: chokidar.FSWatcher
    - active: boolean
    - debounceTimer: timeout handle
    - debounceDelay: 2000ms (default)
    - processedCount: number
    - lastActivity: Date
    - flushing: boolean (prevents concurrent flushes)

### Phase 2: Implement Interface Methods (1 hour)

- [x] 2.1 `initialize()`:
    - Verify .git directory exists
    - Throw error if not a git repository

- [x] 2.2 `start()`:
    - Build path: `{projectPath}/.git/logs/HEAD`
    - Create logs dir if missing (fresh repos)
    - Create HEAD file if missing (fresh repos)
    - Watch with chokidar (awaitWriteFinish options)
    - Bind change/add events to onGitChange()
    - Register cleanup handler

- [x] 2.3 `stop()`:
    - Unregister cleanup handler
    - Clear debounce timer
    - Close git watcher

- [x] 2.4 `onFileEvent()`:
    - No-op (git strategy ignores individual file events)

- [x] 2.5 `flush()`:
    - Check flushing lock
    - Call integrityEngine.checkDrift()
    - If drift found, call integrityEngine.reconcile()
    - Update stats (processedCount, lastActivity)

- [x] 2.6 `getStats()`:
    - pendingFiles: 0 (git strategy doesn't track pending)
    - processedFiles: accumulated count
    - lastActivity: Date | null

### Phase 3: Git Change Detection (0.5 hours)

- [x] 3.1 Implement `onGitChange()`:
    - Check for shutdown in progress
    - Debounce rapid operations (configurable, default 2s)
    - On timeout: call flush()

- [x] 3.2 Handle watcher errors gracefully (handleError method)

### Phase 4: Exports and Tests

- [x] 4.1 Export from `src/engines/strategies/index.ts`
- [x] 4.2 Export from `src/engines/index.ts`
- [x] 4.3 Create comprehensive unit tests (40 tests)

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 6)
- Integrity Engine: `src/engines/integrity.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (40 unit tests passing)
- [x] Documentation updated
- [ ] Changes committed to Git (pending user approval)
- [x] No regressions introduced (all 1705 tests passing)

## Progress Log

### 2025-12-10 - 0 hours

- Task created
- Subtasks defined

### 2025-12-10 - 2 hours

- Created `src/engines/strategies/gitStrategy.ts`
- Implemented GitStrategy class with all interface methods
- Added GitStrategyOptions interface for configuration
- Added DEFAULT_GIT_DEBOUNCE_DELAY constant (2000ms)
- Implemented debounce mechanism for rapid git operations
- Implemented flushing lock to prevent concurrent reconciliations
- Added cleanup handler registration for graceful shutdown
- Updated `src/engines/strategies/index.ts` with exports
- Updated `src/engines/index.ts` with exports
- Created comprehensive test suite `tests/unit/engines/strategies/gitStrategy.test.ts` (40 tests)
- All tests passing (1705 total, 4 skipped)
- Build successful

## Implementation Details

### Files Created

- `src/engines/strategies/gitStrategy.ts` - Main strategy implementation

### Files Modified

- `src/engines/strategies/index.ts` - Added GitStrategy exports
- `src/engines/index.ts` - Added GitStrategy exports

### Test Files Created

- `tests/unit/engines/strategies/gitStrategy.test.ts` - 40 unit tests

### Key Implementation Notes

1. **Minimal file watching**: Only watches `.git/logs/HEAD`, not project files
2. **Debounce mechanism**: Configurable delay (default 2s) handles rapid git operations
3. **Flush locking**: Prevents concurrent reconciliations
4. **Error handling**: Validates git repository on initialize(), handles watcher errors gracefully
5. **Integration with IntegrityEngine**: Uses checkDrift() and reconcile() for drift detection
6. **Cleanup handling**: Proper registration/unregistration of cleanup handlers

### Exports

```typescript
export {
  GitStrategy,
  createGitStrategy,
  DEFAULT_GIT_DEBOUNCE_DELAY,
  type GitStrategyOptions,
} from './gitStrategy.js';
```

## Notes

- `.git/logs/HEAD` is appended on every commit, checkout, merge, rebase
- 2 second debounce handles rapid git operations (interactive rebase, etc.)
- No need to track individual file changes - IntegrityEngine does the diff
- onFileEvent() is a no-op - this strategy only responds to commits
- Fails loudly if .git doesn't exist (user chose wrong strategy)
- Creates logs directory and HEAD file if missing (fresh repos)
