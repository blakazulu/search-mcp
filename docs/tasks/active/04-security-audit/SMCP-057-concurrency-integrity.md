---
task_id: "SMCP-057"
title: "Concurrency & Data Integrity"
category: "Security"
priority: "P2"
status: "completed"
created_date: "2025-12-10"
completed_date: "2025-12-10"
estimated_hours: 6
assigned_to: "Team"
tags: ["security", "medium", "concurrency", "integrity"]
---

# Task: Concurrency & Data Integrity

## Overview

Fix race conditions and data integrity issues including TOCTOU in deleteIndex, race between integrity engine and file watcher, insufficient hash entropy, and lack of continuous disk space monitoring.

## Related Vulnerabilities

| # | Issue | Severity | File |
|---|-------|----------|------|
| 7 | Hash truncation to 64 bits | HIGH | hash.ts:168-169 |
| 19 | Race condition in deleteIndex | MEDIUM | deleteIndex.ts:310-353 |
| 21 | Race between integrity and watcher | MEDIUM | integrity.ts:686-698 |
| 24 | No continuous disk space monitoring | MEDIUM | indexManager.ts:436-437 |

## Goals

- [x] Fix race conditions in delete and reconciliation
- [x] Increase hash entropy for project paths
- [x] Add continuous disk space monitoring

## Success Criteria

- [x] Concurrent operations don't corrupt data
- [x] Hash collision probability acceptably low (128-bit entropy)
- [x] Disk full detected before corruption
- [x] All tests pass (1890 tests passing)

## Subtasks

### Phase 1: Fix Delete Race Condition (2 hours) - COMPLETED

- [x] 1.1 Analyzed race in `src/tools/deleteIndex.ts`
    - Documented the TOCTOU window between checking index existence and deletion
    - Identified risk of concurrent create/delete operations corrupting state

- [x] 1.2 Applied IndexingLock to deleteIndex
    - Added import for `IndexingLock` from asyncMutex
    - Check if indexing is in progress before acquiring lock
    - Hold lock throughout entire delete operation
    - Release lock in `finally` block for cleanup

- [x] 1.3 Added tests for concurrent operations
    - Test preventing delete while create is in progress
    - Test preventing create while delete is in progress
    - Test lock release on error and success

### Phase 2: Fix Integrity/Watcher Race (1.5 hours) - COMPLETED

- [x] 2.1 Coordinated integrity engine with file watcher
    - Added `ReconciliationCheckCallback` type
    - Watcher accepts `isReconciling` callback in constructor

- [x] 2.2 Implemented event queueing during reconciliation
    - Added `reconciliationEventQueue` to store events
    - `handleFileEvent()` queues events when reconciling
    - `processQueuedEvents()` processes after reconciliation
    - Deduplication prevents duplicate events for same file

- [x] 2.3 Added tests for reconciliation queueing
    - Test event queueing during reconciliation
    - Test normal processing when not reconciling
    - Test backward compatibility without callback
    - Test event deduplication

### Phase 3: Increase Hash Entropy (1 hour) - COMPLETED

- [x] 3.1 Updated `src/utils/hash.ts`
    - Added constants `OLD_HASH_LENGTH = 16` and `NEW_HASH_LENGTH = 32`
    - `hashProjectPath()` now returns 32 hex chars (128 bits entropy)
    - Added `hashProjectPathLegacy()` for backward compatibility

- [x] 3.2 Handled migration
    - `getIndexPath()` checks for legacy 16-char index first
    - Falls back to new 32-char hash if legacy not found
    - Added `indexPathExists()` and `isLegacyIndex()` helpers
    - Existing indexes continue to work seamlessly

- [x] 3.3 Updated tests
    - Tests expect 32-char hash for new indexes
    - Tests accept 16-32 char range for migration support

### Phase 4: Continuous Disk Space Monitoring (1.5 hours) - COMPLETED

- [x] 4.1 Added periodic disk space check in `src/utils/diskSpace.ts`
    - `DEFAULT_DISK_CHECK_INTERVAL_MS = 5000`
    - `CRITICAL_DISK_SPACE_BYTES = 50MB`
    - `startDiskSpaceMonitor()` function with callback and abort flag
    - `checkDiskSpaceAndAbort()` convenience function

- [x] 4.2 Applied to long operations in `src/engines/indexManager.ts`
    - `createFullIndex()` starts disk monitor before batch processing
    - Checks abort flag in each iteration of batch loop
    - Throws DISK_FULL error when space critical

- [x] 4.3 Added graceful abort on disk full
    - Saves partial progress before aborting
    - Clear error message: "Disk space critical during indexing"
    - Always stops monitor in `finally` block

## Resources

- Node.js disk space: `fs.statfs()` or `check-disk-space` package
- AsyncMutex patterns: existing code in lancedb.ts

## Acceptance Checklist

- [x] Delete race condition fixed
- [x] Integrity/watcher race fixed
- [x] Hash entropy increased (128-bit)
- [x] Disk space monitored continuously
- [x] Migration path documented (legacy 16-char + new 32-char)
- [x] Tests added (14+ new tests)
- [x] All existing tests pass (1890 tests passing)

## Notes

- Hash length change is breaking for existing installations - need migration strategy
- Consider making disk check interval configurable
- Race condition fixes may require refactoring lock management

## Progress Log

### 2025-12-10

- Task created from security audit
- **COMPLETED**: Full implementation of concurrency and data integrity fixes

#### Files Modified:

1. **`src/tools/deleteIndex.ts`**:
   - Added IndexingLock to prevent TOCTOU race conditions
   - Lock held throughout delete operation with proper cleanup

2. **`src/engines/fileWatcher.ts`**:
   - Added `ReconciliationCheckCallback` type
   - Added event queueing during reconciliation
   - Added `getQueuedEventCount()` and `processQueuedEvents()` methods
   - Event deduplication for same-file events

3. **`src/utils/hash.ts`**:
   - Increased hash from 16 to 32 hex chars (128-bit entropy)
   - Added `hashProjectPathLegacy()` for backward compatibility
   - Added `OLD_HASH_LENGTH` and `NEW_HASH_LENGTH` constants

4. **`src/utils/paths.ts`**:
   - `getIndexPath()` checks legacy 16-char hash first
   - Added `indexPathExists()` and `isLegacyIndex()` helpers

5. **`src/utils/diskSpace.ts`**:
   - Added `startDiskSpaceMonitor()` for continuous monitoring
   - Added `checkDiskSpaceAndAbort()` convenience function
   - Added `CRITICAL_DISK_SPACE_BYTES` constant (50MB)

6. **`src/engines/indexManager.ts`**:
   - Integrated disk space monitoring in `createFullIndex()`
   - Graceful abort with partial progress save on disk full

#### Tests Added:
- `tests/unit/tools/deleteIndex.test.ts`: Concurrent operations tests
- `tests/unit/engines/fileWatcher.test.ts`: Reconciliation queueing tests
- `tests/unit/utils/hash.test.ts`: Hash entropy and legacy tests

#### Test Results:
- All 1890 tests pass with no regressions
