---
task_id: "SMCP-047"
title: "Lazy Strategy"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "blakazulu"
tags: ["strategy", "indexing", "lazy", "deferred"]
---

# Task: Lazy Strategy

## Overview

Create a LazyStrategy that detects file changes in real-time but defers actual indexing until idle (30s default) or before search operations. This reduces CPU usage for large projects.

## Goals

- [ ] Create LazyStrategy implementing IndexingStrategy
- [ ] Track dirty files using DirtyFilesManager
- [ ] Implement idle timer for automatic flush
- [ ] Support flush before search via flush() method

## Success Criteria

- ✅ LazyStrategy implements IndexingStrategy interface
- ✅ File changes are queued, not processed immediately
- ✅ Idle timer triggers flush after lazyIdleThreshold seconds
- ✅ flush() processes all pending files
- ✅ Deletions are tracked and processed correctly
- ✅ Dirty files persist across restarts

## Dependencies

**Blocked by:**

- SMCP-044: Dirty Files Manager
- SMCP-045: Strategy Interface

**Blocks:**

- SMCP-049: Strategy Orchestrator

**Related:**

- SMCP-046: Realtime Strategy (shares watcher setup)

## Subtasks

### Phase 1: Create Strategy Class (2 hours)

- [ ] 1.1 Create `src/engines/strategies/lazyStrategy.ts`:
    - Import IndexingStrategy interface
    - Import DirtyFilesManager
    - Import chokidar and WATCHER_OPTIONS

- [ ] 1.2 Implement constructor:
    - projectPath
    - indexManager
    - docsIndexManager (nullable)
    - policy
    - dirtyFiles (DirtyFilesManager)
    - idleThreshold (seconds, from config)

- [ ] 1.3 Implement state tracking:
    - watcher: chokidar.FSWatcher
    - active: boolean
    - idleTimer: timeout handle
    - flushing: boolean (lock)
    - processedCount: number
    - lastActivity: Date

### Phase 2: Implement Interface Methods (1.5 hours)

- [ ] 2.1 `initialize()`:
    - Load dirty files from disk
    - Initialize policy

- [ ] 2.2 `start()`:
    - Create chokidar watcher
    - Bind event handlers
    - Start idle timer if dirty files exist

- [ ] 2.3 `stop()`:
    - Clear idle timer
    - Save dirty files
    - Close watcher

- [ ] 2.4 `onFileEvent()`:
    - Add to dirty files (or markDeleted for unlink)
    - Reset idle timer
    - Do NOT process immediately

- [ ] 2.5 `flush()`:
    - Check flushing lock
    - Process deletions first
    - Process adds/changes
    - Clear dirty files
    - Save to disk

- [ ] 2.6 `getStats()`:
    - Return pending count from dirtyFiles.count()

### Phase 3: Idle Timer Logic (0.5 hours)

- [ ] 3.1 Implement `resetIdleTimer()`:
    - Clear existing timer
    - Set new timer for idleThreshold seconds
    - On timeout: call flush()

- [ ] 3.2 Handle timer cleanup in stop()

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 5)
- Dirty Files: `src/storage/dirtyFiles.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined

## Notes

- Use flushing lock to prevent concurrent flush operations
- Process deletions before adds (file might be deleted then recreated)
- Idle timer resets on each file event
- flush() is called by search tools before returning results
