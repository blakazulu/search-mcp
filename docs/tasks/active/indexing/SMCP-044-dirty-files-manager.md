---
task_id: "SMCP-044"
title: "Dirty Files Manager"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
completed_date: "2025-12-10"
due_date: ""
estimated_hours: 3
actual_hours: 1.5
assigned_to: "blakazulu"
tags: ["storage", "indexing", "lazy"]
---

# Task: Dirty Files Manager

## Overview

Create a new storage module to track files pending indexing for the lazy strategy. Persists dirty files to disk so they survive server restarts.

## Goals

- [x] Create DirtyFilesManager class
- [x] Implement load/save with atomic writes
- [x] Track both dirty files and deletions
- [x] Add getDirtyFilesPath utility

## Success Criteria

- [x] DirtyFilesManager can add, remove, and track dirty files
- [x] Deletion markers are tracked separately (`__deleted__:` prefix)
- [x] State persists to `dirty-files.json` in index directory
- [x] Survives server restarts with pending files intact
- [x] Follows same patterns as FingerprintsManager

## Dependencies

**Blocked by:**

- SMCP-043: Config Schema (needs indexingStrategy type) - COMPLETED

**Blocks:**

- SMCP-047: Lazy Strategy

**Related:**

- SMCP-008: Fingerprints Manager (similar pattern)

## Subtasks

### Phase 1: Path Utility (0.5 hours)

- [x] 1.1 Add to `src/utils/paths.ts`:
    ```typescript
    export function getDirtyFilesPath(indexPath: string): string {
      return path.join(indexPath, 'dirty-files.json');
    }
    ```

- [x] 1.2 Export from `src/utils/index.ts`

### Phase 2: DirtyFilesManager Implementation (2 hours)

- [x] 2.1 Create `src/storage/dirtyFiles.ts` with:
    - DirtyFilesJSON interface (version, dirtyFiles array, lastModified)
    - DIRTY_FILES_VERSION constant
    - DELETED_PREFIX constant
    - DirtyFilesManager class

- [x] 2.2 Implement core methods:
    - `load()` - Load from disk
    - `save()` - Atomic write to disk (only if modified)
    - `add(relativePath)` - Mark file as dirty
    - `remove(relativePath)` - Remove from dirty set
    - `markDeleted(relativePath)` - Track deletions with prefix
    - `getAll()` - Get dirty files (excluding deletions)
    - `getDeleted()` - Get deleted files
    - `clear()` - Clear all dirty files
    - `count()` - Get total count
    - `dirtyCount()` - Get count of dirty files
    - `deletedCount()` - Get count of deleted files
    - `isEmpty()` - Check if empty
    - `isLoaded()` - Check if loaded
    - `hasUnsavedChanges()` - Check for unsaved changes
    - `has(relativePath)` - Check if file is dirty
    - `isDeleted(relativePath)` - Check if file is marked deleted
    - `delete()` - Delete file from disk
    - `getDirtyFilesPath()` - Get path to dirty files
    - `getIndexPath()` - Get index path

- [x] 2.3 Export from `src/storage/index.ts`

### Phase 3: Testing (0.5 hours)

- [x] 3.1 Create `tests/unit/storage/dirtyFiles.test.ts`
- [x] 3.2 Test add/remove/clear operations
- [x] 3.3 Test persistence (save and reload)
- [x] 3.4 Test deletion markers
- [x] 3.5 Test integration scenarios

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 2)
- Pattern reference: `src/storage/fingerprints.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable) - 57 new tests, all passing
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git - User will handle
- [x] No regressions introduced - All 1587 tests passing

## Progress Log

### 2025-12-10 - 0 hours

- Task created
- Subtasks defined

### 2025-12-10 - 1.5 hours (COMPLETED)

- Added `getDirtyFilesPath` utility to `src/utils/paths.ts`
- Exported from `src/utils/index.ts`
- Created `DirtyFilesManager` class in `src/storage/dirtyFiles.ts`
- Exported `DIRTY_FILES_VERSION`, `DELETED_PREFIX`, and `DirtyFilesManager` from `src/storage/index.ts`
- Created comprehensive test suite with 57 tests in `tests/unit/storage/dirtyFiles.test.ts`
- All tests passing (1587 total tests)
- No regressions introduced

## Notes

- Use `__deleted__:` prefix to distinguish deletions from modifications
- Only save to disk when `modified` flag is true (optimization)
- Use atomicWriteJson for crash safety
- Added extra convenience methods beyond spec: `dirtyCount()`, `deletedCount()`, `has()`, `isDeleted()`, `hasUnsavedChanges()`
- Handles edge case where file is deleted then re-created (removes deletion marker)
- Handles edge case where file is modified then deleted (removes from dirty set, adds deletion marker)

## Files Changed

**New Files:**
- `src/storage/dirtyFiles.ts` - DirtyFilesManager implementation
- `tests/unit/storage/dirtyFiles.test.ts` - Unit tests (57 tests)

**Modified Files:**
- `src/utils/paths.ts` - Added `getDirtyFilesPath` function
- `src/utils/index.ts` - Export `getDirtyFilesPath`
- `src/storage/index.ts` - Export `DIRTY_FILES_VERSION`, `DELETED_PREFIX`, `DirtyFilesManager`
