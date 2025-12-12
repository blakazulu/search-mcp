---
task_id: "SMCP-078"
title: "Code Quality and Async Improvements"
category: "Technical"
priority: "P3"
status: "not-started"
created_date: "2025-12-12"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "Team"
tags: ["bug-fix", "code-quality", "low-priority", "async", "security-hardening"]
---

# Task: Code Quality and Async Improvements

## Overview

Fix MEDIUM and LOW severity bugs related to code quality: synchronous operations in async context, SQL escaping hardening, input validation, and minor edge cases. These are not critical but improve overall code quality and defense in depth.

## Goals

- [ ] Convert synchronous fs operations to async
- [ ] Harden SQL escaping
- [ ] Add missing input validation
- [ ] Fix minor edge cases and improve code quality

## Success Criteria

- ✅ No synchronous fs operations in async functions
- ✅ SQL escaping covers additional edge cases
- ✅ top_k validation at storage layer
- ✅ Timer leak edge case fixed
- ✅ All existing tests pass

## Dependencies

**Blocked by:** None (can be done in parallel with other tasks)

**Blocks:** None

**Related:**
- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md`
- SMCP-075, SMCP-076, SMCP-077

## Subtasks

### Phase 1: Convert Sync to Async Operations (BUG #10, #11) (1 hour)

- [ ] 1.1 Update `src/utils/paths.ts` getStorageRoot()
    - Convert fs.existsSync to async
    - Add proper error handling for mkdir
    - Consider caching the result

```typescript
// Current:
if (!fs.existsSync(storageRoot)) {
  fs.mkdirSync(storageRoot, { recursive: true });
}

// Target:
let storageRootCache: string | null = null;

export async function getStorageRootAsync(): Promise<string> {
  if (storageRootCache) return storageRootCache;

  const homeDir = os.homedir();
  const storageRoot = path.join(homeDir, STORAGE_BASE);

  try {
    await fs.promises.access(storageRoot);
  } catch {
    await fs.promises.mkdir(storageRoot, { recursive: true });
  }

  storageRootCache = storageRoot;
  return storageRoot;
}
```

- [ ] 1.2 Update `src/storage/fingerprints.ts` loadFingerprints()
    - Replace fs.existsSync with fs.promises.access

```typescript
// Current:
if (!fs.existsSync(fingerprintsPath)) {
  return new Map();
}

// Target:
try {
  await fs.promises.access(fingerprintsPath);
} catch {
  return new Map();
}
```

- [ ] 1.3 Search for other fs.existsSync usage and convert
    - May need to update callers to use async versions

### Phase 2: SQL Escaping Hardening (BUG #15, #3, #13) (0.5 hours)

- [ ] 2.1 Update `src/utils/sql.ts` escapeSqlString()
    - Add escaping for semicolons
    - Add escaping for SQL comment sequences

```typescript
export function escapeSqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    // Additional hardening:
    .replace(/;/g, '')           // Remove semicolons
    .replace(/--/g, '')          // Remove SQL line comments
    .replace(/\/\*/g, '')        // Remove SQL block comment start
    .replace(/\*\//g, '');       // Remove SQL block comment end
}
```

- [ ] 2.2 Add UUID format validation for IDs in getChunksById()
    - Validate IDs match UUID format before SQL construction

### Phase 3: Input Validation (BUG #23) (0.5 hours)

- [ ] 3.1 Update `src/storage/lancedb.ts` search()
    - Add top_k upper bound validation

```typescript
async search(queryVector: number[], topK: number = 10): Promise<SearchResult[]> {
  const MAX_TOP_K = 100;  // Reasonable upper limit
  const safeTopK = Math.min(Math.max(1, topK), MAX_TOP_K);
  // ... rest of implementation
}
```

### Phase 4: Minor Edge Cases (BUG #16, #18, #20) (1 hour)

- [ ] 4.1 Fix timer leak in IntegrityScheduler (BUG #16)
    - Update `src/engines/integrity.ts` start()
    - Add explicit timer check

```typescript
start(): void {
  if (this.isRunning || this.timer !== null) {
    logger.debug(...);
    return;
  }
  // ... rest of implementation
}
```

- [ ] 4.2 Document ReadWriteLock starvation potential (BUG #18)
    - Add comment in `src/utils/asyncMutex.ts`
    - Note: Full fix (fairness policy) is complex and may not be needed

```typescript
/**
 * ReadWriteLock implementation.
 *
 * NOTE: Under extreme contention, reader or writer starvation is possible.
 * Current policy: writers have priority when waiting.
 * For most use cases in this codebase, contention is low and this is fine.
 * If fairness becomes critical, consider implementing alternating batches.
 */
```

- [ ] 4.3 Review chunking line calculation (BUG #20)
    - Add comment explaining the edge case handling
    - Consider if the guard can be moved earlier

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

- [ ] All subtasks completed
- [ ] No synchronous fs operations in async code paths
- [ ] SQL escaping is more comprehensive
- [ ] Input validation added at storage layer
- [ ] Edge cases documented or fixed
- [ ] All existing tests pass
- [ ] Changes committed to Git
- [ ] CHANGELOG.md updated

## Progress Log

### 2025-12-12 - 0 hours

- ⏳ Task created from bug hunt report
- 📝 Subtasks defined based on LOW/MEDIUM priority bugs

## Notes

- These are lower priority improvements, not blocking issues
- Sync→async conversion may require updating many callers
- SQL hardening is defense in depth (current escaping works)
- Some items are documentation-only (BUG #18)

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
