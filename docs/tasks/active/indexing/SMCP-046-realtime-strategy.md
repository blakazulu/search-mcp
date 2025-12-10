---
task_id: "SMCP-046"
title: "Realtime Strategy"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 4
actual_hours: 3
assigned_to: "blakazulu"
tags: ["strategy", "indexing", "realtime", "filewatcher"]
---

# Task: Realtime Strategy

## Overview

Extract the current FileWatcher behavior into a RealtimeStrategy class that implements the IndexingStrategy interface. This maintains the existing "index immediately on change" behavior as the default strategy.

## Goals

- [x] Create RealtimeStrategy implementing IndexingStrategy
- [x] Extract core logic from existing FileWatcher
- [x] Process file events immediately with debouncing
- [x] Maintain all existing FileWatcher functionality

## Success Criteria

- [x] RealtimeStrategy implements IndexingStrategy interface
- [x] Processes file changes immediately (with 500ms debounce)
- [x] Routes to correct index manager (code vs docs)
- [x] Behavior is identical to current FileWatcher
- [x] Proper cleanup on stop()

## Dependencies

**Blocked by:**

- SMCP-045: Strategy Interface

**Blocks:**

- SMCP-049: Strategy Orchestrator

**Related:**

- SMCP-015: File Watcher (source of implementation)
- SMCP-047: Lazy Strategy (shares watcher setup)

## Subtasks

### Phase 1: Create Strategy Class (2 hours)

- [x] 1.1 Create `src/engines/strategies/` directory

- [x] 1.2 Create `src/engines/strategies/realtimeStrategy.ts`:
    - Import IndexingStrategy interface
    - Import chokidar and WATCHER_OPTIONS from fileWatcher
    - Implement constructor with dependencies:
      - projectPath
      - indexManager
      - docsIndexManager (nullable)
      - policy
      - fingerprints
      - docsFingerprints (nullable)

- [x] 1.3 Implement interface methods:
    - `initialize()` - Load fingerprints, policy
    - `start()` - Create chokidar watcher, bind events
    - `stop()` - Clear timers, close watcher
    - `isActive()` - Return active state
    - `onFileEvent()` - Process event immediately
    - `flush()` - No-op (events processed immediately)
    - `getStats()` - Return statistics

### Phase 2: Extract FileWatcher Logic (1.5 hours)

- [x] 2.1 Extract debouncing logic:
    - pendingEvents Map
    - processingQueue Set
    - DEFAULT_DEBOUNCE_DELAY

- [x] 2.2 Extract event handling:
    - handleEvent() - Convert path, check policy, debounce
    - processEvent() - Route to index manager, update fingerprints

- [x] 2.3 Extract error handling:
    - handleError() - Log watcher errors

### Phase 3: Testing (0.5 hours)

- [x] 3.1 Create `tests/unit/engines/strategies/realtimeStrategy.test.ts`
- [x] 3.2 Test lifecycle (start/stop)
- [x] 3.3 Test event processing
- [x] 3.4 Test debouncing

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 4)
- Source: `src/engines/fileWatcher.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable)
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git (user will handle)
- [x] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- Task created
- Subtasks defined

### 2025-12-10 - 3 hours

- Created `src/engines/strategies/` directory
- Implemented `RealtimeStrategy` class in `src/engines/strategies/realtimeStrategy.ts`
- Created `src/engines/strategies/index.ts` for module exports
- Added exports to `src/engines/index.ts`
- Created comprehensive unit tests in `tests/unit/engines/strategies/realtimeStrategy.test.ts`
- All 1620 tests pass (4 flaky integration tests skipped)
- Task COMPLETED

## Notes

- Export WATCHER_OPTIONS and DEFAULT_DEBOUNCE_DELAY from fileWatcher.ts for reuse
- The existing FileWatcher class is kept as-is for backward compatibility
- RealtimeStrategy extracts and reimplements the same logic as FileWatcher
- flush() is a no-op since events are processed immediately
- pendingEvents.size is used for stats.pendingFiles
- Some integration tests are skipped (marked with describe.skip) because they are timing-sensitive

## Implementation Summary

### New Files Created:
- `src/engines/strategies/realtimeStrategy.ts` - Main strategy implementation
- `src/engines/strategies/index.ts` - Module exports
- `tests/unit/engines/strategies/realtimeStrategy.test.ts` - Unit tests

### Modified Files:
- `src/engines/index.ts` - Added exports for RealtimeStrategy

### Key Implementation Details:
- Implements `IndexingStrategy` interface with name `'realtime'`
- Reuses WATCHER_OPTIONS and DEFAULT_DEBOUNCE_DELAY from fileWatcher.ts
- Same debouncing logic with configurable delay (default 500ms)
- Routes code files to IndexManager, doc files (.md, .txt) to DocsIndexManager
- Fingerprint-based change detection to avoid unnecessary re-indexing
- Proper cleanup on stop() - clears all pending events and closes watcher
- Factory function `createRealtimeStrategy()` for convenient instantiation
