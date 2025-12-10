---
task_id: "SMCP-036"
title: "Async Mutex & Concurrency Control"
category: "Technical"
priority: "P0"
status: "completed"
created_date: "2024-12-09"
completed_date: "2024-12-09"
due_date: ""
estimated_hours: 6
actual_hours: 3
assigned_to: "Team"
tags: ["critical", "concurrency", "race-condition", "mutex", "lancedb"]
---

# Task: Async Mutex & Concurrency Control

## Overview

Fix race conditions and concurrent access issues across the codebase. Multiple components can trigger simultaneous database operations without proper synchronization, leading to potential data corruption.

## Bugs Addressed

- **Bug #2**: Race Condition in FileWatcher Debouncing (`fileWatcher.ts:418-446`)
- **Bug #3**: Concurrent LanceDB Access Without Locking (`lancedb.ts:204-219`)
- **Bug #4**: Unhandled Promise Rejection in Debounce setTimeout (`fileWatcher.ts:429-443`)
- **Bug #15**: Race Condition Between Search and Indexing
- **MCP-10**: No Protection Against Concurrent Indexing

## Goals

- [x] Create reusable async mutex utility
- [x] Protect LanceDB operations with mutex
- [x] Fix FileWatcher debouncing race condition
- [x] Add proper error handling in async callbacks

## Success Criteria

- Concurrent operations are properly serialized
- No data corruption under concurrent load
- Unhandled promise rejections are caught and logged
- Build and all tests pass

## Dependencies

**Blocked by:**
- SMCP-035: SQL Injection Prevention (both modify lancedb.ts - coordinate changes)

**Blocks:** None

**Related:**
- SMCP-038: Resource Cleanup & Signal Handling

## Subtasks

### Phase 1: Create Async Mutex Utility (1 hour) ✅

- [x] 1.1 Create `src/utils/asyncMutex.ts` with three classes:
    - `AsyncMutex` - Simple async mutex with `acquire()`, `release()`, `withLock()`, `tryAcquire()`, timeout support
    - `ReadWriteLock` - For concurrent reads, exclusive writes
    - `IndexingLock` - Singleton for preventing concurrent indexing operations

- [x] 1.2 Add unit tests for AsyncMutex (`tests/unit/utils/asyncMutex.test.ts`)
    - 47 comprehensive tests covering all three classes
    - Test sequential/concurrent acquisition, error handling, timeouts, edge cases

### Phase 2: Protect LanceDB Operations (2 hours) ✅

- [x] 2.1 Add mutex to `LanceDBStore` class (`src/storage/lancedb.ts`)
- [x] 2.2 Wrap `insertChunks()` with mutex
- [x] 2.3 Wrap `deleteByPath()` with mutex
- [x] 2.4 Wrap `search()` with mutex
- [x] 2.5 Wrap `getIndexedFiles()` with mutex
- [x] 2.6 Wrap `searchByPath()` with mutex
- [x] 2.7 Apply same changes to `src/storage/docsLancedb.ts`

### Phase 3: Fix FileWatcher Debouncing (2 hours) ✅

- [x] 3.1 Fix race condition in `processingQueue` check (`fileWatcher.ts`)
    - Made check-and-add atomic within the setTimeout callback

- [x] 3.2 Fix unhandled promise rejection in setTimeout
    - Wrapped async handler in IIFE with try/catch/finally
    - Proper error logging and stats tracking
    - Guaranteed cleanup in finally block

### Phase 4: Add Indexing Lock (1 hour) ✅

- [x] 4.1 Add `IndexingLock` singleton to prevent concurrent indexing
- [x] 4.2 Updated `src/tools/createIndex.ts` to acquire lock before indexing
- [x] 4.3 Updated `src/tools/reindexProject.ts` to acquire lock before reindexing
- [x] 4.4 Proper lock release in finally blocks on completion or error

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Node.js Async Mutex patterns](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] `src/utils/asyncMutex.ts` created with tests
- [x] `src/storage/lancedb.ts` uses mutex for all write operations
- [x] `src/storage/docsLancedb.ts` uses mutex for all write operations
- [x] `src/engines/fileWatcher.ts` debouncing fixed
- [x] Concurrent indexing prevented
- [x] `npm run build` passes
- [x] `npm run test` passes (1396 tests, no regressions)

## Progress Log

### 2024-12-09 - Task Created
- Task created from bug hunt findings

### 2024-12-09 - Task Completed (3 hours)
- Created `src/utils/asyncMutex.ts` with three utility classes:
  - `AsyncMutex` - Simple async mutex with timeout support
  - `ReadWriteLock` - For concurrent reads, exclusive writes
  - `IndexingLock` - Singleton for preventing concurrent indexing
- Updated `src/storage/lancedb.ts` with mutex protection on all operations
- Updated `src/storage/docsLancedb.ts` with same mutex protection
- Fixed `src/engines/fileWatcher.ts` debouncing:
  - Made processingQueue check-and-add atomic
  - Wrapped async handler in IIFE with proper error handling
- Added `IndexingLock` to `createIndex.ts` and `reindexProject.ts`
- Created 47 comprehensive tests in `tests/unit/utils/asyncMutex.test.ts`
- All 1396 tests pass (47 new tests, no regressions)

## Implementation Details

### Files Created
- `src/utils/asyncMutex.ts` - Mutex utilities (AsyncMutex, ReadWriteLock, IndexingLock)
- `tests/unit/utils/asyncMutex.test.ts` - 47 unit tests

### Files Modified
- `src/utils/index.ts` - Added exports for mutex classes
- `src/storage/lancedb.ts` - Added mutex to insertChunks, deleteByPath, search, searchByPath, getIndexedFiles
- `src/storage/docsLancedb.ts` - Same mutex protection
- `src/engines/fileWatcher.ts` - Fixed debounceEvent() race condition and error handling
- `src/tools/createIndex.ts` - Added IndexingLock protection
- `src/tools/reindexProject.ts` - Added IndexingLock protection

### Key Features
- `AsyncMutex.withLock()` - Automatically acquires/releases lock around async operation
- `AsyncMutex.tryAcquire()` - Non-blocking lock attempt
- Optional timeout support to prevent deadlocks
- `IndexingLock` singleton prevents concurrent create_index/reindex operations
- Proper error handling ensures locks are always released

## Notes

- ReadWriteLock implemented but not currently used (available for future optimization)
- Mutex is per-store instance, not global
- IndexingLock is a singleton shared across all tools
- Timeout support available via optional parameter

## Blockers

_None - task completed_
