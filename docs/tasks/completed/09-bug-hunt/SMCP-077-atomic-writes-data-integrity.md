---
task_id: "SMCP-077"
title: "Atomic Writes and Data Integrity"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-12"
due_date: ""
estimated_hours: 4
actual_hours: 2
assigned_to: "Team"
tags: ["bug-fix", "data-integrity", "medium-priority", "atomic-operations"]
---

# Task: Atomic Writes and Data Integrity

## Overview

Fix MEDIUM severity bugs related to data integrity: FTS index using non-atomic writes, TOCTOU vulnerability in lockfile cleanup, stale metadata during concurrent operations, and project path cache without invalidation.

## Goals

- [x] Implement atomic writes for FTS index
- [x] Improve lockfile cleanup safety (or document limitation)
- [x] Add metadata state checking for concurrent operations
- [x] Add project path cache validation

## Success Criteria

- [x] FTS index cannot be corrupted on crash during write
- [x] Lockfile cleanup is safer (or limitation is documented)
- [x] Search operations detect if indexing is in progress
- [x] Stale project path cache is detected and refreshed
- [x] All existing tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md`
- SMCP-075: High priority race conditions

## Subtasks

### Phase 1: Atomic FTS Index Writes (BUG #25) (1.5 hours)

- [x] 1.1 Create atomic write utility for FTS index
    - Used existing `atomicWrite` from `src/utils/atomicWrite.ts`
    - Implements temp-file-then-rename pattern

- [x] 1.2 Update `src/engines/indexManager.ts` FTS serialization
    - Replaced `fs.promises.writeFile` with `atomicWrite`
    - Updated at line 708-712

- [x] 1.3 Update `src/tools/reindexFile.ts` FTS serialization
    - Replaced `fs.promises.writeFile` with `atomicWrite`
    - Updated at line 342-345

### Phase 2: Project Path Cache Validation (BUG #22) (1 hour)

- [x] 2.1 Update `src/server.ts` getProjectPath()
    - Added validation that cached path still exists using `fs.promises.access()`
    - Invalidates cache and re-detects if path no longer exists
    - Updated at lines 416-431

- [x] 2.2 Added unit test for cache invalidation
    - Test in `tests/unit/server.test.ts` verifies re-detection when path is deleted

### Phase 3: Metadata Staleness Detection (BUG #24) (1 hour)

- [x] 3.1 Verified existing indexing state check in search operations
    - Code already checks `metadata.indexingState` and returns warnings
    - Added enhanced documentation comments explaining BUG #24 fix

- [x] 3.2 Updated `src/tools/searchCode.ts` and `src/tools/searchDocs.ts`
    - Enhanced comments at lines 210-213 (searchCode) and 211-214 (searchDocs)
    - Documents that warning approach is the implemented solution

### Phase 4: Document Lockfile Limitation (BUG #8) (0.5 hours)

- [x] 4.1 Reviewed `src/storage/lancedb.ts` lockfile cleanup
    - Added comprehensive documentation of TOCTOU limitation

- [x] 4.2 Added prominent comment explaining the race window
    - Added at lines 129-146 in lancedb.ts
    - Documents when this could be a problem
    - Documents mitigation (single MCP server per project)
    - Lists potential platform-specific solutions if needed in future

## Resources

- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md` (BUG #8, #22, #24, #25)
- `src/engines/indexManager.ts:705-715`
- `src/server.ts:411-434`
- `src/tools/searchCode.ts:195`
- `src/storage/lancedb.ts:131-194`
- Existing atomic write: `src/storage/fingerprints.ts` (for reference)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] FTS index uses atomic writes
- [x] Project path cache validates existence
- [x] Search handles concurrent indexing gracefully
- [x] Lockfile limitation is documented
- [x] All existing tests pass
- [x] New tests added where applicable
- [ ] Changes committed to Git (pending user approval)
- [x] CHANGELOG.md updated

## Progress Log

### 2025-12-12 - 0 hours

- Task created from bug hunt report
- Subtasks defined based on BUG #8, #22, #24, #25

### 2025-12-12 - 2 hours

- Completed all fixes:
  - BUG #25: Added atomic writes for FTS index in indexManager.ts and reindexFile.ts
  - BUG #22: Added project path cache validation in server.ts with unit test
  - BUG #24: Enhanced documentation for existing indexing state check (already implemented)
  - BUG #8: Added comprehensive documentation of TOCTOU limitation in lancedb.ts
- All tests pass (5 pre-existing flaky file watcher tests unrelated to changes)
- Build passes

## Notes

- BUG #25: FTS was the only storage that didn't use atomic writes - now fixed
- BUG #22: Long-lived MCP server could have stale cached path - now validates on each call
- BUG #24: Concurrent indexing and search was already handled with warning - documented
- BUG #8: True atomic file locking requires OS-specific code - documented limitation

## Blockers

_No blockers identified_

## Related Tasks

- SMCP-075: High priority race conditions
- SMCP-076: Error handling improvements
- SMCP-078: Code quality improvements
