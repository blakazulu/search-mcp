---
task_id: "SMCP-077"
title: "Atomic Writes and Data Integrity"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-12"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "Team"
tags: ["bug-fix", "data-integrity", "medium-priority", "atomic-operations"]
---

# Task: Atomic Writes and Data Integrity

## Overview

Fix MEDIUM severity bugs related to data integrity: FTS index using non-atomic writes, TOCTOU vulnerability in lockfile cleanup, stale metadata during concurrent operations, and project path cache without invalidation.

## Goals

- [ ] Implement atomic writes for FTS index
- [ ] Improve lockfile cleanup safety (or document limitation)
- [ ] Add metadata state checking for concurrent operations
- [ ] Add project path cache validation

## Success Criteria

- ✅ FTS index cannot be corrupted on crash during write
- ✅ Lockfile cleanup is safer (or limitation is documented)
- ✅ Search operations detect if indexing is in progress
- ✅ Stale project path cache is detected and refreshed
- ✅ All existing tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md`
- SMCP-075: High priority race conditions

## Subtasks

### Phase 1: Atomic FTS Index Writes (BUG #25) (1.5 hours)

- [ ] 1.1 Create atomic write utility for FTS index
    - Use temp-file-then-rename pattern (same as fingerprints/config)
    - Consider using existing `atomicWriteJson` or creating `atomicWriteText`

- [ ] 1.2 Update `src/engines/indexManager.ts` FTS serialization
    - Replace `fs.promises.writeFile` with atomic write
    - Apply to both code FTS and docs FTS indexes

```typescript
// Current (non-atomic):
await fs.promises.writeFile(ftsIndexPath, serializedData, 'utf-8');

// Target (atomic):
await atomicWriteText(ftsIndexPath, serializedData);

// atomicWriteText implementation:
async function atomicWriteText(filePath: string, data: string): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  await fs.promises.writeFile(tempPath, data, 'utf-8');
  await fs.promises.rename(tempPath, filePath);
}
```

- [ ] 1.3 Add test for atomic write behavior

### Phase 2: Project Path Cache Validation (BUG #22) (1 hour)

- [ ] 2.1 Update `src/server.ts` getProjectPath()
    - Add validation that cached path still exists
    - Or invalidate cache on certain operations

```typescript
async function getProjectPath(context: ServerContext): Promise<string> {
  if (context.projectPath) {
    // Validate cached path still exists
    try {
      await fs.promises.access(context.projectPath);
      return context.projectPath;
    } catch {
      // Path no longer exists, re-detect
      context.projectPath = null;
    }
  }
  // ... existing detection logic
}
```

- [ ] 2.2 Consider adding explicit invalidation on delete_index

### Phase 3: Metadata Staleness Detection (BUG #24) (1 hour)

- [ ] 3.1 Add indexing state check to search operations
    - Check if indexing is in progress before search
    - Option A: Return warning in results
    - Option B: Wait for indexing to complete (with timeout)
    - Option C: Use file locking

- [ ] 3.2 Update `src/tools/searchCode.ts` and `src/tools/searchDocs.ts`
    - Add state check before loading metadata
    - Document behavior when indexing is in progress

```typescript
// Option A: Warning approach
const metadata = await loadMetadata(indexPath);
if (metadata.indexingInProgress) {
  // Include warning in response
  logger.warn('Search', 'Search during indexing may return stale results');
}
```

### Phase 4: Document Lockfile Limitation (BUG #8) (0.5 hours)

- [ ] 4.1 Review `src/storage/lancedb.ts` lockfile cleanup
    - The TOCTOU is inherent to file-based locking without OS support
    - Document the limitation in code comments
    - Consider if platform-specific locks are worth the complexity

- [ ] 4.2 Add prominent comment explaining the race window
    - Document when this could be a problem
    - Document mitigation (single MCP server per project)

```typescript
/**
 * Stale lockfile cleanup.
 *
 * LIMITATION: There is an inherent TOCTOU race between closing and
 * unlinking the lockfile. Another process could acquire the lock in
 * this window. This is acceptable because:
 * 1. MCP servers are designed as one-per-project
 * 2. The window is very small (~1ms)
 * 3. Platform-specific atomic locks add significant complexity
 *
 * If multi-process safety becomes critical, consider:
 * - flock() on Unix
 * - LockFileEx() on Windows
 * - External lock manager process
 */
```

## Resources

- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md` (BUG #8, #22, #24, #25)
- `src/engines/indexManager.ts:705-715`
- `src/server.ts:411-434`
- `src/tools/searchCode.ts:195`
- `src/storage/lancedb.ts:131-194`
- Existing atomic write: `src/storage/fingerprints.ts` (for reference)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] FTS index uses atomic writes
- [ ] Project path cache validates existence
- [ ] Search handles concurrent indexing gracefully
- [ ] Lockfile limitation is documented
- [ ] All existing tests pass
- [ ] New tests added where applicable
- [ ] Changes committed to Git
- [ ] CHANGELOG.md updated

## Progress Log

### 2025-12-12 - 0 hours

- ⏳ Task created from bug hunt report
- 📝 Subtasks defined based on BUG #8, #22, #24, #25

## Notes

- BUG #25: FTS is the only storage that doesn't use atomic writes
- BUG #22: Long-lived MCP server could have stale cached path
- BUG #24: Concurrent indexing and search is edge case but possible
- BUG #8: True atomic file locking requires OS-specific code

## Blockers

_No blockers identified_

## Related Tasks

- SMCP-075: High priority race conditions
- SMCP-076: Error handling improvements
- SMCP-078: Code quality improvements
