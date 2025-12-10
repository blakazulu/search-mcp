---
task_id: "SMCP-037"
title: "Atomic File Writes & Temp Cleanup"
category: "Technical"
priority: "P0"
status: "completed"
created_date: "2024-12-09"
completed_date: "2024-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 2
assigned_to: "Team"
tags: ["critical", "filesystem", "atomic-write", "data-integrity"]
---

# Task: Atomic File Writes & Temp Cleanup

## Overview

Fix file write operations to be truly atomic with proper temp file cleanup. Current implementation can leave orphaned temp files on failure and may crash if the target directory doesn't exist.

## Bugs Addressed

- **Bug #5**: Missing Directory Creation Before File Writes (`metadata.ts:213`, `fingerprints.ts:172`, `config.ts:287`)
- **Bug #6**: Partial Write Cleanup Missing (all storage save functions)
- **Bug #17**: TOCTOU in Config File Handling (`config.ts:269-276`)
- **MCP-34**: Error Recovery Leaves Orphaned Chunks

## Goals

- [x] Create reusable atomic write utility
- [x] Ensure directory exists before writing
- [x] Clean up temp files on failure
- [x] Update all storage managers to use atomic write

## Success Criteria

- File writes are atomic (complete or not at all)
- No orphaned `.tmp.*` files after failures
- Directory creation is automatic
- Build and all tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- SMCP-038: Resource Cleanup & Signal Handling

## Subtasks

### Phase 1: Create Atomic Write Utility (1.5 hours) ✅

- [x] 1.1 Create `src/utils/atomicWrite.ts` with:
    - `atomicWrite(targetPath, content, encoding)` - Atomic file write with directory creation and temp cleanup
    - `atomicWriteJson(targetPath, data, pretty)` - Atomic JSON file write
    - PID + timestamp in temp filename prevents collisions

- [x] 1.2 Add unit tests for atomicWrite (`tests/unit/utils/atomicWrite.test.ts`)
    - 27 comprehensive tests covering successful writes, directory creation, cleanup on errors
    - Tests for empty content, large content, unicode, concurrent writes

### Phase 2: Update Metadata Manager (0.5 hours) ✅

- [x] 2.1 Update `src/storage/metadata.ts` to use `atomicWriteJson`
    - Replaced manual temp file handling in `saveMetadata()` method

### Phase 3: Update Fingerprints Manager (0.5 hours) ✅

- [x] 3.1 Update `src/storage/fingerprints.ts` to use `atomicWriteJson`
    - Replaced manual temp file handling in `saveFingerprints()` method

- [x] 3.2 Update `src/storage/docsFingerprints.ts` similarly
    - Replaced manual temp file handling in `saveDocsFingerprints()` method

### Phase 4: Update Config Manager (0.5 hours) ✅

- [x] 4.1 Update `src/storage/config.ts` to use `atomicWriteJson`
    - Replaced manual temp file handling in `saveConfig()` and `generateDefaultConfig()`
    - Fixed TOCTOU issue in `loadConfig()` - now reads directly and handles ENOENT
    - Fixed TOCTOU in `saveConfig()` - removed existence check before reading

### Phase 5: Testing (1 hour) ✅

- [x] 5.1 Created unit tests for atomic writes (27 tests)
- [x] 5.2 Run full test suite - All 1423 tests pass
- [x] 5.3 Build verification - No TypeScript errors

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Atomic File Writes in Node.js](https://nodejs.org/api/fs.html#fspromisesrenamefrompath-topath)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] `src/utils/atomicWrite.ts` created with tests
- [x] `src/storage/metadata.ts` updated
- [x] `src/storage/fingerprints.ts` updated
- [x] `src/storage/docsFingerprints.ts` updated
- [x] `src/storage/config.ts` updated
- [x] No orphaned temp files after failed writes
- [x] `npm run build` passes
- [x] `npm run test` passes (1423 tests, no regressions)

## Progress Log

### 2024-12-09 - Task Created
- Task created from bug hunt findings

### 2024-12-09 - Task Completed (2 hours)
- Created `src/utils/atomicWrite.ts` with two utility functions:
  - `atomicWrite()` - Atomic file write with directory creation and temp cleanup
  - `atomicWriteJson()` - Atomic JSON file write with pretty-printing option
- Updated `src/storage/metadata.ts` - `saveMetadata()` uses `atomicWriteJson()`
- Updated `src/storage/fingerprints.ts` - `saveFingerprints()` uses `atomicWriteJson()`
- Updated `src/storage/docsFingerprints.ts` - `saveDocsFingerprints()` uses `atomicWriteJson()`
- Updated `src/storage/config.ts`:
  - `saveConfig()` and `generateDefaultConfig()` use `atomicWriteJson()`
  - Fixed TOCTOU in `loadConfig()` - reads directly, handles ENOENT in catch
  - Fixed TOCTOU in `saveConfig()` - removed existence check
- Created 27 comprehensive tests in `tests/unit/utils/atomicWrite.test.ts`
- All 1423 tests pass (27 new tests, no regressions)

## Implementation Details

### Files Created
- `src/utils/atomicWrite.ts` - Atomic write utilities

### Files Modified
- `src/utils/index.ts` - Added exports for `atomicWrite` and `atomicWriteJson`
- `src/storage/metadata.ts` - Uses `atomicWriteJson()` in `saveMetadata()`
- `src/storage/fingerprints.ts` - Uses `atomicWriteJson()` in `saveFingerprints()`
- `src/storage/docsFingerprints.ts` - Uses `atomicWriteJson()` in `saveDocsFingerprints()`
- `src/storage/config.ts` - Uses `atomicWriteJson()`, fixed TOCTOU issues

### Key Features
- Automatic parent directory creation
- Writes to temp file first, then atomic rename
- Temp file cleanup on any error
- PID + timestamp in temp filename prevents collisions
- Backwards compatible - no changes to public APIs

## Notes

- Rename is atomic on most POSIX filesystems but NOT across filesystem boundaries
- On Windows, rename may fail if target exists (use `fs.promises.rename` which handles this)
- PID in temp filename prevents collision between processes

## Blockers

_None - task completed_
