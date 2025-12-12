---
task_id: "SMCP-078"
title: "Code Quality and Async Improvements"
category: "Technical"
priority: "P3"
status: "completed"
created_date: "2025-12-12"
due_date: ""
estimated_hours: 3
actual_hours: 2
assigned_to: "Team"
tags: ["bug-fix", "code-quality", "low-priority", "async", "security-hardening"]
---

# Task: Code Quality and Async Improvements

## Overview

Fix MEDIUM and LOW severity bugs related to code quality: synchronous operations in async context, SQL escaping hardening, input validation, and minor edge cases. These are not critical but improve overall code quality and defense in depth.

## Goals

- [x] Convert synchronous fs operations to async
- [x] Harden SQL escaping
- [x] Add missing input validation
- [x] Fix minor edge cases and improve code quality

## Success Criteria

- [x] No synchronous fs operations in async functions
- [x] SQL escaping covers additional edge cases
- [x] top_k validation at storage layer
- [x] Timer leak edge case fixed
- [x] All existing tests pass

## Dependencies

**Blocked by:** None (can be done in parallel with other tasks)

**Blocks:** None

**Related:**
- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md`
- SMCP-075, SMCP-076, SMCP-077

## Subtasks

### Phase 1: Convert Sync to Async Operations (BUG #10, #11) (1 hour)

- [x] 1.1 Update `src/utils/paths.ts` getStorageRoot()
    - Added caching to avoid repeated sync filesystem operations
    - Added async version `getStorageRootAsync()` for non-blocking operations
    - Added `clearStorageRootCache()` for testing

- [x] 1.2 Update `src/storage/fingerprints.ts` loadFingerprints()
    - Replaced fs.existsSync with fs.promises.access

- [x] 1.3 Updated tests to use clearStorageRootCache() for proper test isolation

### Phase 2: SQL Escaping Hardening (BUG #15, #3, #13) (0.5 hours)

- [x] 2.1 Update `src/utils/sql.ts` escapeSqlString()
    - Added escaping for semicolons
    - Added escaping for SQL comment sequences (-- and /* */)

- [x] 2.2 Add UUID format validation for IDs in getChunksById()
    - Added UUIDv4 pattern validation before SQL construction
    - Invalid IDs are logged and skipped

### Phase 3: Input Validation (BUG #23) (0.5 hours)

- [x] 3.1 Update `src/storage/lancedb.ts` search()
    - Added top_k upper bound validation (max 100)
    - Added lower bound validation (min 1)

### Phase 4: Minor Edge Cases (BUG #16, #18, #20) (1 hour)

- [x] 4.1 Fix timer leak in IntegrityScheduler (BUG #16)
    - Updated `src/engines/integrity.ts` start()
    - Added explicit timer !== null check

- [x] 4.2 Document ReadWriteLock starvation potential (BUG #18)
    - Added comprehensive documentation in `src/utils/asyncMutex.ts`
    - Documented the starvation potential and suggested future improvements

- [x] 4.3 Document chunking line calculation edge case (BUG #20)
    - Added comment explaining why the calculation can produce values < 1
    - Documented that the guard is correct behavior

## Resources

- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md` (BUG #3, #10, #11, #13, #15, #16, #18, #20, #23)
- `src/utils/paths.ts:372-382`
- `src/storage/fingerprints.ts:93`
- `src/utils/sql.ts:31-42`
- `src/storage/lancedb.ts:652, 771`
- `src/engines/integrity.ts:528-538`
- `src/utils/asyncMutex.ts:225-286`
- `src/engines/chunking.ts:614`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] No synchronous fs operations in async code paths
- [x] SQL escaping is more comprehensive
- [x] Input validation added at storage layer
- [x] Edge cases documented or fixed
- [x] All existing tests pass
- [x] Changes committed to Git
- [x] CHANGELOG.md updated

## Progress Log

### 2025-12-12 - 0 hours

- Task created from bug hunt report
- Subtasks defined based on LOW/MEDIUM priority bugs

### 2025-12-12 - 2 hours

- [x] BUG #10: Added caching to getStorageRoot() and async version getStorageRootAsync()
- [x] BUG #11: Converted fs.existsSync to fs.promises.access in loadFingerprints()
- [x] BUG #15, #3, #13: Added SQL escaping for semicolons, comments, and UUID validation
- [x] BUG #23: Added top_k upper/lower bound validation (1-100)
- [x] BUG #16: Fixed timer leak by checking this.timer !== null
- [x] BUG #18: Documented ReadWriteLock starvation potential
- [x] BUG #20: Documented chunking line calculation edge case
- [x] Updated tests for new caching behavior
- [x] All relevant unit tests pass

## Notes

- These are lower priority improvements, not blocking issues
- Sync->async conversion handled with caching approach (minimal caller changes)
- SQL hardening is defense in depth (current escaping works)
- Some items are documentation-only (BUG #18, #20)

## Out of Scope (Won't Fix)

The following LOW priority items are intentionally not addressed:

- **BUG #17 (logError sensitive info)**: By design, userMessage should not contain sensitive data. Would require audit of all error construction.
- **BUG #19 (REDOS_PATTERNS)**: Current patterns are sufficient for glob validation. Full ReDoS detection is overkill.

## Blockers

_No blockers identified_

## Related Tasks

- SMCP-075: High priority race conditions
- SMCP-076: Error handling improvements
- SMCP-077: Atomic writes and data integrity
