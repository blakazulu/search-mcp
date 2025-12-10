---
task_id: "SMCP-055"
title: "Resource Exhaustion Protection (DoS)"
category: "Security"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
completed_date: "2025-12-10"
estimated_hours: 8
assigned_to: "Team"
tags: ["security", "high", "dos", "resource-limits"]
---

# Task: Resource Exhaustion Protection (DoS)

## Overview

Add resource limits throughout the codebase to prevent denial-of-service attacks via resource exhaustion. Currently, there are no limits on chunks per file, pending file watcher events, directory traversal depth, or JSON file sizes.

## Related Vulnerabilities

| # | Issue | Severity | File |
|---|-------|----------|------|
| 9 | Unbounded chunks per file (OOM) | HIGH | chunking.ts:286-313 |
| 10 | Glob with no file/depth limit | HIGH | integrity.ts:131-149 |
| 11 | Recursive directory traversal no depth limit | HIGH | indexPolicy.ts:235-281 |
| 12 | Rapid file change exhaustion | HIGH | fileWatcher.ts:609-646 |
| 14 | Streaming chunking memory bypass | HIGH | chunking.ts:485 |
| 20 | Config/JSON file size limits missing | MEDIUM | config.ts, metadata.ts, fingerprints.ts |

## Goals

- [x] Add per-file chunk limits
- [x] Add glob result limits
- [x] Add directory depth limits
- [x] Add pending event limits
- [x] Add JSON file size limits

## Success Criteria

- [x] OOM impossible from single malicious file
- [x] Glob operations bounded in time and memory
- [x] Directory traversal bounded by depth
- [x] File watcher events bounded
- [x] JSON parsing bounded by file size
- [x] All tests pass (1851 tests passing)

## Subtasks

### Phase 1: Create Limits Constants (0.5 hours)

- [x] 1.1 Added to `src/utils/limits.ts`:
    ```typescript
    // Resource limits
    export const MAX_CHUNKS_PER_FILE = 1000;
    export const CHUNKS_WARNING_THRESHOLD = 800; // 80% of max
    export const MAX_PENDING_FILE_EVENTS = 1000;
    export const PENDING_EVENTS_WARNING_THRESHOLD = 800; // 80% of max
    export const MAX_DIRECTORY_DEPTH = 20;
    export const MAX_GLOB_RESULTS = 100000;
    export const GLOB_TIMEOUT_MS = 30000;
    export const MAX_JSON_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    ```

### Phase 2: Chunking Limits (2 hours)

- [x] 2.1 Updated `src/engines/chunking.ts`
    - Added `maxChunks` parameter to `splitText()` and `splitWithLineNumbers()`
    - Throws `ResourceLimitError` if chunks exceed MAX_CHUNKS_PER_FILE
    - Added warning when approaching chunk limits (80%)

- [x] 2.2 Fixed streaming memory bypass
    - Updated `chunkLargeFile()` to enforce chunk limits during streaming
    - Aborts early when limit exceeded

### Phase 3: File Watcher Limits (1.5 hours)

- [x] 3.1 Updated `src/engines/fileWatcher.ts`
    - Added size check to `debounceEvent()` against `MAX_PENDING_FILE_EVENTS`
    - Rejects new events when limit exceeded
    - Logs warning when approaching limit (80%)

### Phase 4: Directory Traversal Limits (1.5 hours)

- [x] 4.1 Updated `src/engines/indexPolicy.ts`
    - Added `depth` and `maxDepth` parameters to `loadNestedGitignores()`
    - Stops recursion when MAX_DIRECTORY_DEPTH is reached
    - Logs warning when approaching depth limit

- [x] 4.2 Updated `src/engines/integrity.ts`
    - Added `maxResults` and `maxDepth` parameters to `scanCurrentState()`
    - Uses glob with `maxDepth` option
    - Applies timeout (GLOB_TIMEOUT_MS) to glob operations
    - Throws `ResourceLimitError` when file count exceeds limit

### Phase 5: JSON File Size Limits (1.5 hours)

- [x] 5.1 Created safe JSON loader in `src/utils/limits.ts`:
    - `safeLoadJSON<T>()` - async version with size limit check
    - `safeLoadJSONSync<T>()` - sync version with size limit check
    - `ResourceLimitError` class for standardized error handling

- [x] 5.2 Applied to all JSON loading:
    - `src/storage/config.ts` - uses `safeLoadJSON()`
    - `src/storage/metadata.ts` - uses `safeLoadJSON()`
    - `src/storage/fingerprints.ts` - uses `safeLoadJSON()`

### Phase 6: Testing (1 hour)

- [x] 6.1 Added limit enforcement tests in `tests/unit/utils/limits.test.ts`:
    - Tests for resource limit constants
    - Tests for `ResourceLimitError` class
    - Tests for `safeLoadJSON()` and `safeLoadJSONSync()`

- [x] 6.2 Added chunking limit tests in `tests/unit/engines/chunking.test.ts`:
    - "DoS Protection: Chunk Limits" test suite
    - Tests for chunk limit enforcement in `splitText()` and `splitWithLineNumbers()`

## Resources

- glob options: https://www.npmjs.com/package/glob
- Memory monitoring: `process.memoryUsage()`

## Acceptance Checklist

- [x] All limits implemented
- [x] Appropriate errors/warnings on limit exceeded
- [x] Tests verify limits work
- [x] All existing tests pass (1851 tests passing)
- [x] No performance regression for normal usage

## Notes

- Limits should be generous enough for legitimate use cases
- Consider making some limits configurable via config.json
- Add monitoring/logging when limits are approached

## Progress Log

### 2025-12-10

- Task created from security audit
- **COMPLETED**: Full implementation of DoS protection

#### Implementation Summary

1. **Added Resource Limit Constants** to `src/utils/limits.ts`:
   - `MAX_CHUNKS_PER_FILE = 1000`
   - `CHUNKS_WARNING_THRESHOLD = 800` (80%)
   - `MAX_PENDING_FILE_EVENTS = 1000`
   - `PENDING_EVENTS_WARNING_THRESHOLD = 800` (80%)
   - `MAX_DIRECTORY_DEPTH = 20`
   - `MAX_GLOB_RESULTS = 100000`
   - `GLOB_TIMEOUT_MS = 30000`
   - `MAX_JSON_FILE_SIZE = 10MB`
   - `ResourceLimitError` class
   - `safeLoadJSON()` and `safeLoadJSONSync()` functions

2. **Chunking Limits** in `src/engines/chunking.ts`:
   - `splitText()` accepts `maxChunks` parameter
   - `splitWithLineNumbers()` passes limit through
   - `chunkLargeFile()` enforces limits during streaming
   - Aborts early when limit exceeded
   - Warning logs at 80% threshold

3. **File Watcher Limits** in `src/engines/fileWatcher.ts`:
   - `debounceEvent()` checks pending events count
   - Rejects new events when limit exceeded
   - Warning logs at 80% threshold

4. **Directory Traversal Limits** in `src/engines/indexPolicy.ts`:
   - `loadNestedGitignores()` accepts depth parameters
   - Stops at MAX_DIRECTORY_DEPTH
   - Warning logs when approaching limit

5. **Glob Limits** in `src/engines/integrity.ts`:
   - `scanCurrentState()` accepts maxResults/maxDepth
   - Uses glob with maxDepth option
   - Applies GLOB_TIMEOUT_MS timeout
   - Throws ResourceLimitError on overflow

6. **JSON File Size Limits** in storage layer:
   - `config.ts` uses `safeLoadJSON()`
   - `metadata.ts` uses `safeLoadJSON()`
   - `fingerprints.ts` uses `safeLoadJSON()`

7. **Tests Added**:
   - Resource limit constant tests
   - ResourceLimitError class tests
   - safeLoadJSON function tests
   - Chunk limit enforcement tests

#### Test Results
- All 1851 tests pass with no regressions
