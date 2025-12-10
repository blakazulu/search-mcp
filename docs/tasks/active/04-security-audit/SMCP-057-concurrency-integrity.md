---
task_id: "SMCP-057"
title: "Concurrency & Data Integrity"
category: "Security"
priority: "P2"
status: "not-started"
created_date: "2025-12-10"
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

- [ ] Fix race conditions in delete and reconciliation
- [ ] Increase hash entropy for project paths
- [ ] Add continuous disk space monitoring

## Success Criteria

- Concurrent operations don't corrupt data
- Hash collision probability acceptably low
- Disk full detected before corruption
- All tests pass

## Subtasks

### Phase 1: Fix Delete Race Condition (2 hours)

- [ ] 1.1 Analyze race in `src/tools/deleteIndex.ts`
    - Line 310-353: Document the TOCTOU window
    - Identify what could go wrong

- [ ] 1.2 Apply IndexingLock to deleteIndex
    - Use existing `IndexingLock` from indexManager
    - Hold lock throughout delete operation
    - Prevent concurrent create/delete

- [ ] 1.3 Add test for concurrent operations
    - Test delete during create
    - Test create during delete

### Phase 2: Fix Integrity/Watcher Race (1.5 hours)

- [ ] 2.1 Coordinate integrity engine with file watcher
    - Share `_isIndexingActive` flag
    - Have watcher check flag before processing

- [ ] 2.2 Alternative: Queue watcher events during reconciliation
    - Pause processing during reconcile
    - Resume and process after

- [ ] 2.3 Add test for concurrent reconciliation
    - Trigger file changes during reconcile
    - Verify no corruption

### Phase 3: Increase Hash Entropy (1 hour)

- [ ] 3.1 Update `src/utils/hash.ts`
    - Line 168-169: Increase from 16 to 32 hex chars (128 bits)
    - This changes index directory names

- [ ] 3.2 Handle migration
    - Existing indexes have 16-char hashes
    - Either: migrate existing indexes
    - Or: support both lengths during transition

- [ ] 3.3 Document the change
    - Update any docs referencing hash length

### Phase 4: Continuous Disk Space Monitoring (1.5 hours)

- [ ] 4.1 Add periodic disk space check during indexing
    ```typescript
    async function checkDiskSpaceContinuously(
      indexPath: string,
      intervalMs: number = 5000
    ): Promise<() => void> {
      const interval = setInterval(async () => {
        await validateDiskSpace(indexPath);
      }, intervalMs);
      return () => clearInterval(interval);
    }
    ```

- [ ] 4.2 Apply to long operations
    - `src/engines/indexManager.ts`: Check during batch processing
    - Abort if disk space critical

- [ ] 4.3 Add graceful abort on disk full
    - Save partial progress if possible
    - Clear error message to user

## Resources

- Node.js disk space: `fs.statfs()` or `check-disk-space` package
- AsyncMutex patterns: existing code in lancedb.ts

## Acceptance Checklist

- [ ] Delete race condition fixed
- [ ] Integrity/watcher race fixed
- [ ] Hash entropy increased
- [ ] Disk space monitored continuously
- [ ] Migration path documented
- [ ] Tests added
- [ ] All existing tests pass

## Notes

- Hash length change is breaking for existing installations - need migration strategy
- Consider making disk check interval configurable
- Race condition fixes may require refactoring lock management

## Progress Log

### 2025-12-10

- Task created from security audit
