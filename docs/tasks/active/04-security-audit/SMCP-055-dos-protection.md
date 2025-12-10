---
task_id: "SMCP-055"
title: "Resource Exhaustion Protection (DoS)"
category: "Security"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
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

- [ ] Add per-file chunk limits
- [ ] Add glob result limits
- [ ] Add directory depth limits
- [ ] Add pending event limits
- [ ] Add JSON file size limits

## Success Criteria

- OOM impossible from single malicious file
- Glob operations bounded in time and memory
- Directory traversal bounded by depth
- File watcher events bounded
- JSON parsing bounded by file size
- All tests pass

## Subtasks

### Phase 1: Create Limits Constants (0.5 hours)

- [ ] 1.1 Add to `src/utils/limits.ts` (create if not exists)
    ```typescript
    // Resource limits
    export const MAX_CHUNKS_PER_FILE = 1000;
    export const MAX_PENDING_FILE_EVENTS = 1000;
    export const MAX_DIRECTORY_DEPTH = 20;
    export const MAX_GLOB_RESULTS = 100000;
    export const GLOB_TIMEOUT_MS = 30000;
    export const MAX_JSON_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    ```

### Phase 2: Chunking Limits (2 hours)

- [ ] 2.1 Update `src/engines/chunking.ts`
    - Line 286-313: Add chunk counter to `splitAtCharacterBoundary`
    - Throw error if chunks exceed MAX_CHUNKS_PER_FILE
    - Add warning when file produces many chunks

- [ ] 2.2 Fix streaming memory bypass
    - Line 485: Yield chunks in batches instead of accumulating
    - Or: Add chunk count limit to streaming path too

### Phase 3: File Watcher Limits (1.5 hours)

- [ ] 3.1 Update `src/engines/fileWatcher.ts`
    - Line 609-646: Add size check to `pendingEvents` map
    - Reject new events when limit exceeded
    - Log warning when approaching limit

- [ ] 3.2 Consider batch processing
    - Process events in batches when many pending
    - Add debounce for flood scenarios

### Phase 4: Directory Traversal Limits (1.5 hours)

- [ ] 4.1 Update `src/engines/indexPolicy.ts`
    - Line 235-281: Add depth parameter to `loadNestedGitignores`
    - Reject if depth exceeds MAX_DIRECTORY_DEPTH
    - Log warning for deep directories

- [ ] 4.2 Update `src/engines/integrity.ts`
    - Line 131-149: Add options to glob for depth/count limits
    - Consider using streaming glob if available

### Phase 5: JSON File Size Limits (1.5 hours)

- [ ] 5.1 Create safe JSON loader
    ```typescript
    async function safeLoadJSON<T>(path: string, maxSize = MAX_JSON_FILE_SIZE): Promise<T> {
      const stats = await fs.promises.stat(path);
      if (stats.size > maxSize) {
        throw new Error(`JSON file exceeds size limit: ${stats.size} > ${maxSize}`);
      }
      const content = await fs.promises.readFile(path, 'utf-8');
      return JSON.parse(content);
    }
    ```

- [ ] 5.2 Apply to all JSON loading
    - `src/storage/config.ts:212`
    - `src/storage/metadata.ts:182`
    - `src/storage/fingerprints.ts:99`

### Phase 6: Testing (1 hour)

- [ ] 6.1 Add limit enforcement tests
    - Test chunk limit enforcement
    - Test event limit enforcement
    - Test depth limit enforcement
    - Test JSON size limit enforcement

## Resources

- glob options: https://www.npmjs.com/package/glob
- Memory monitoring: `process.memoryUsage()`

## Acceptance Checklist

- [ ] All limits implemented
- [ ] Appropriate errors/warnings on limit exceeded
- [ ] Tests verify limits work
- [ ] All existing tests pass
- [ ] No performance regression for normal usage

## Notes

- Limits should be generous enough for legitimate use cases
- Consider making some limits configurable via config.json
- Add monitoring/logging when limits are approached

## Progress Log

### 2025-12-10

- Task created from security audit
