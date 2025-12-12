# Bug Hunt Report: Search MCP Server

**Date:** 2025-12-12
**Analyzer:** Claude Opus 4.5 Bug Hunter (Verified Second Pass)
**Codebase:** Search MCP - Local-first semantic search for codebases

---

## Executive Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| CRITICAL | 0 | 0 |
| HIGH | 2 | **2** |
| MEDIUM | 12 | 0 |
| LOW | 5 | 0 |
| **TOTAL** | **19** | **2** |

Initial analysis found 20 issues. After verification:
- **4 FALSE POSITIVES** removed
- **3 SEVERITY ADJUSTED** (1 CRITICAL->MEDIUM, 2 HIGH->MEDIUM)
- **6 NEW BUGS** discovered in second pass
- **2 HIGH PRIORITY BUGS FIXED** (BUG #4, #6) - see SMCP-075

The Search MCP codebase demonstrates good security practices overall. The remaining issues are primarily race conditions, resource management concerns, and code quality improvements.

---

## Verification Summary

| Bug # | Original Severity | Status | Final Severity |
|-------|-------------------|--------|----------------|
| 1 | CRITICAL | SEVERITY ADJUSTED | MEDIUM |
| 2 | HIGH | FALSE POSITIVE | - |
| 3 | HIGH | SEVERITY ADJUSTED | MEDIUM |
| 4 | HIGH | **FIXED** | HIGH |
| 5 | HIGH | SEVERITY ADJUSTED | MEDIUM |
| 6 | HIGH | **FIXED** | HIGH |
| 7 | MEDIUM | FALSE POSITIVE | - |
| 8 | MEDIUM | CONFIRMED | MEDIUM |
| 9 | MEDIUM | CONFIRMED | MEDIUM |
| 10 | MEDIUM | CONFIRMED | MEDIUM |
| 11 | MEDIUM | CONFIRMED | MEDIUM |
| 12 | MEDIUM | FALSE POSITIVE | - |
| 13 | MEDIUM | CONFIRMED | MEDIUM |
| 14 | MEDIUM | FALSE POSITIVE | - |
| 15 | LOW | CONFIRMED | LOW |
| 16 | LOW | CONFIRMED | LOW |
| 17 | LOW | CONFIRMED | LOW |
| 18 | LOW | CONFIRMED | LOW |
| 19 | LOW | CONFIRMED | LOW |
| 20 | LOW | CONFIRMED | LOW |
| 21-26 | - | NEW | Various |

---

## High Priority Issues

### BUG #4: Resource Exhaustion via Uncancelled Glob Timeout [FIXED]

| Property | Value |
|----------|-------|
| **Severity** | HIGH |
| **Location** | `src/engines/integrity.ts:155-220` |
| **Category** | Resource Exhaustion / DoS |
| **Status** | **FIXED** (SMCP-075) |

**Description:**

The glob operation previously used `Promise.race` with a timeout, which did not cancel the underlying glob operation when timeout fired.

**Fix Applied:**

Replaced `Promise.race` with `AbortController` pattern:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), GLOB_TIMEOUT_MS);
try {
  const files = await glob(globPattern, {
    signal: controller.signal,
    // ... other options
  });
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    logger.error('IntegrityEngine', 'Glob operation timed out', {...});
    return currentState;
  }
} finally {
  clearTimeout(timeoutId);
}
```

**Tests Added:** 3 new tests in `tests/unit/engines/integrity.test.ts`

---

### BUG #6: AsyncMutex Timeout/Grant Race Condition [FIXED]

| Property | Value |
|----------|-------|
| **Severity** | HIGH |
| **Location** | `src/utils/asyncMutex.ts:97-185` |
| **Category** | Deadlock Potential |
| **Status** | **FIXED** (SMCP-075) |

**Description:**

Race condition existed where timeout and lock grant could interleave, potentially leaving the mutex locked forever with no one holding it.

**Fix Applied:**

1. Added atomic `satisfied` flag per waiter to prevent race:
```typescript
let satisfied = false;
const resolveWrapper = (): boolean => {
  if (satisfied) return false;  // Already timed out
  satisfied = true;
  clearTimeout(timeoutHandle);
  resolve();
  return true;  // Lock accepted
};
```

2. Updated `release()` to handle timed-out waiters:
```typescript
while (this.queue.length > 0) {
  const next = this.queue.shift();
  if (next) {
    const accepted = next();
    if (accepted) return;  // Lock transferred
    // Waiter timed out, try next one
  }
}
this.locked = false;  // No valid waiters, unlock
```

**Tests Added:** 6 new tests in `tests/unit/utils/asyncMutex.test.ts` including:
- Deadlock prevention tests
- Interleaved timeout handling
- Skip timed-out waiters
- High contention stress test (20 concurrent acquires)
- FIFO order preservation

---

## Medium Priority Issues

### BUG #1: Global Module State Without Isolation (Severity Adjusted)

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM (was CRITICAL) |
| **Location** | `src/utils/cleanup.ts:54-65` |
| **Category** | Concurrency / State Management |
| **Status** | SEVERITY ADJUSTED |

**Description:**

The cleanup registry uses module-level variables:
- `cleanupHandlers: CleanupHandlerEntry[] = []`
- `isShuttingDown = false`
- `cleanupCompleted = false`

**Why Adjusted:** The MCP server is designed to run as a singleton process per project, communicating via stdio. Multiple instances in the same process is not a supported production use case. The `resetCleanupRegistry()` function exists for testing.

**Impact:** Testing complications, not production reliability issues

**Suggested Fix:** Document the singleton assumption. For testing, ensure `resetCleanupRegistry()` is called in test teardown.

---

### BUG #3: SQL Injection Risk in searchByPath (Severity Adjusted)

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM (was HIGH) |
| **Location** | `src/storage/lancedb.ts:710-717` |
| **Category** | SQL Injection (Partial) |
| **Status** | SEVERITY ADJUSTED |

**Description:**

```typescript
const likePattern = globToSafeLikePattern(pattern);
.where(`path LIKE '${likePattern}'`)
```

**Why Adjusted:** The `globToSafeLikePattern` function properly tokenizes input and calls `escapeLikePattern` on literal parts, which escapes backslashes, single quotes, null bytes, control characters, and LIKE wildcards (%, _, [). The escaping is comprehensive for LanceDB/DuckDB.

**Impact:** Theoretical risk if escaping has undiscovered gaps. String concatenation for SQL is a code smell.

**Suggested Fix:** Use parameterized queries if LanceDB supports them. Add additional input validation.

---

### BUG #5: Stream Resource Leaks in Large File Chunking (Severity Adjusted)

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM (was HIGH) |
| **Location** | `src/engines/chunking.ts:540-701` |
| **Category** | Resource Leaks |
| **Status** | SEVERITY ADJUSTED |

**Description:**

The code has multiple cleanup points:
1. Line 577-579: Early abort calls `rl.close()` and `fileStream.destroy()`
2. Line 621-662: `rl.on('close')` handles successful completion
3. Line 665-674: `rl.on('error')` handles readline errors
4. Line 676-699: `fileStream.on('error')` handles file stream errors

**Why Adjusted:** Cleanup is mostly correct. The real issue is a narrow window: if an error occurs between creating the stream (line 541) and attaching the error handler (line 676), the stream could leak.

**Impact:** File descriptor exhaustion possible but requires precise timing

**Suggested Fix:** Create stream and attach error handler atomically, or use a cleanup wrapper.

---

### BUG #8: TOCTOU in Stale Lockfile Cleanup

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/storage/lancedb.ts:131-194` |
| **Category** | TOCTOU Race Condition |
| **Status** | CONFIRMED |

**Description:**

```typescript
fd = await fs.promises.open(lockFile, 'r+');
await fd.close();
await fs.promises.unlink(lockFile);
```

Between `close()` and `unlink()`, another process could acquire the lock. The code comment acknowledges: "reduces the race window but doesn't eliminate it entirely".

**Impact:** Data corruption if lock is deleted while held by another process

**Attack Vector:** Start multiple indexing processes simultaneously

**Suggested Fix:** Use platform-specific atomic lock operations (`flock` on Unix, `LockFileEx` on Windows).

---

### BUG #9: Partial Initialization State in Embedding Engine

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/engines/embedding.ts:182-205` |
| **Category** | Partial Initialization State |
| **Status** | CONFIRMED |

**Description:**

```typescript
this.initializationPromise = this.loadModel(onProgress);
try {
  await this.initializationPromise;
} catch (error) {
  this.initializationPromise = null;
  this.pipeline = null;
  throw error;
}
```

Inside `loadModel()`, `this.pipeline` is set. If pipeline creation succeeds but something fails afterward, there's no rollback. Current implementation mostly mitigates this.

**Impact:** Inconsistent engine state after failed initialization

**Suggested Fix:** Use atomic state transitions in a finally block.

---

### BUG #10: Synchronous Operations in getStorageRoot

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/utils/paths.ts:372-382` |
| **Category** | Error Handling |
| **Status** | CONFIRMED |

**Description:**

```typescript
if (!fs.existsSync(storageRoot)) {
  fs.mkdirSync(storageRoot, { recursive: true });
}
```

Blocks the event loop. No error handling if mkdir fails.

**Impact:** Event loop blocking, unhandled errors on permission issues

**Suggested Fix:** Convert to async operations. Cache the result.

---

### BUG #11: Synchronous fs.existsSync in Async Functions

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/storage/fingerprints.ts:93` |
| **Category** | Synchronous Operations in Async Context |
| **Status** | CONFIRMED |

**Description:**

```typescript
if (!fs.existsSync(fingerprintsPath)) {
  return new Map();
}
```

Synchronous operation in async function blocks the event loop.

**Impact:** Minor performance degradation under load

**Suggested Fix:** Use `fs.promises.access()` with try-catch.

---

### BUG #13: SQL IN Clause Construction

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/storage/lancedb.ts:771` |
| **Category** | SQL Injection (Limited) |
| **Status** | CONFIRMED |

**Description:**

```typescript
const escapedIds = ids.map((id) => `'${escapeSqlString(id)}'`).join(', ');
const whereClause = `id IN (${escapedIds})`;
```

IDs are UUIDs generated by the system (not user input), reducing risk. String concatenation for SQL is still a code smell.

**Impact:** SQL injection if escape logic fails

**Suggested Fix:** Validate IDs match expected UUID format. Use parameterized queries if available.

---

### NEW BUG #21: Unhandled Promise Rejection in Background Startup Check

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/engines/integrity.ts:952-956` |
| **Category** | Error Handling |
| **Status** | NEW |

**Description:**

```typescript
export function runStartupCheckBackground(engine: IntegrityEngine): void {
  runStartupCheck(engine).catch((error) => {
    logger.error('IntegrityEngine', 'Background startup check failed', {...});
  });
}
```

If `runStartupCheck` throws a synchronous error before returning the promise, it won't be caught.

**Impact:** Potential unhandled exception

**Suggested Fix:** Wrap in try-catch or use `Promise.resolve().then()`.

---

### NEW BUG #22: Server Context Project Path Caching Without Invalidation

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/server.ts:411-434` |
| **Category** | State Management |
| **Status** | NEW |

**Description:**

```typescript
async function getProjectPath(context: ServerContext): Promise<string> {
  if (context.projectPath) {
    return context.projectPath;  // Returns cached value forever
  }
  // ... detection happens only once
  context.projectPath = result.projectPath;
}
```

Once `projectPath` is detected, it's cached forever. The MCP server runs as a long-lived process.

**Impact:** Stale project path could lead to indexing wrong project

**Suggested Fix:** Add invalidation on tool calls that might change context, or validate cached path still exists.

---

### NEW BUG #24: Metadata Manager Load Can Return Stale Data

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/tools/searchCode.ts:195` |
| **Category** | State Synchronization |
| **Status** | NEW |

**Description:**

```typescript
const metadata = await loadMetadata(indexPath);
```

If indexing is in progress concurrently, the loaded metadata might be stale. The `MetadataManager` doesn't use file locking.

**Impact:** Search could operate on stale metadata during concurrent indexing

**Suggested Fix:** Use advisory locking or check indexing state atomically.

---

### NEW BUG #25: FTS Index Path - No Atomic Write

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/engines/indexManager.ts:705-715` |
| **Category** | Resource Management |
| **Status** | NEW |

**Description:**

```typescript
const ftsIndexPath = getCodeFTSIndexPath(normalizedIndexPath);
const serializedData = ftsEngine.serialize();
await fs.promises.writeFile(ftsIndexPath, serializedData, 'utf-8');
```

No atomic write pattern for FTS index. LanceDB and fingerprints use atomic write patterns, but FTS does not.

**Impact:** FTS index corruption on crash during indexing

**Suggested Fix:** Use `atomicWriteJson` or temp-file-then-rename pattern.

---

### NEW BUG #26: Missing Error Handling for Config Load Failure

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/server.ts:465-466` |
| **Category** | Error Handling |
| **Status** | NEW |

**Description:**

```typescript
const indexPath = getIndexPath(projectPath);
const config = await loadConfig(indexPath);
```

If `loadConfig` throws (e.g., corrupted config), the error creates a confusing message.

**Impact:** Confusing error when config is corrupted

**Suggested Fix:** Wrap in try-catch and fall back to `generateDefaultConfig()`.

---

## Low Priority Issues

### BUG #15: escapeSqlString Could Be More Comprehensive

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/utils/sql.ts:31-42` |
| **Category** | Security Hardening |
| **Status** | CONFIRMED |

**Description:**

Missing escaping for: semicolons (`;`), SQL comments (`--`, `/* */`). Unlikely to matter for LanceDB/DuckDB WHERE clauses.

**Suggested Fix:** Add escaping for semicolons and SQL comment sequences for defense in depth.

---

### BUG #16: setInterval Timer Reference Could Leak

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/engines/integrity.ts:528-538` |
| **Category** | Resource Management |
| **Status** | CONFIRMED |

**Description:**

If `start()` sets `this.timer` but `this.isRunning` fails to be set, a subsequent call would create a new timer.

**Impact:** Minor memory/CPU leak (edge case)

**Suggested Fix:** Add explicit `this.timer !== null` check.

---

### BUG #17: logError() Could Leak Sensitive Info

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/errors/index.ts:94` |
| **Category** | Information Disclosure |
| **Status** | CONFIRMED |

**Description:**

The `userMessage` is included in log metadata. By design shouldn't contain sensitive data, but no enforcement.

**Suggested Fix:** Review all `userMessage` construction.

---

### BUG #18: ReadWriteLock Has Potential Writer Starvation

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/utils/asyncMutex.ts:225-286` |
| **Category** | Starvation |
| **Status** | CONFIRMED |

**Description:**

In high-contention scenarios, readers or writers might starve depending on access patterns.

**Suggested Fix:** Implement fairness policy (alternating batches).

---

### BUG #19: REDOS_PATTERNS Could Be More Comprehensive

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/utils/limits.ts:69-76` |
| **Category** | ReDoS Protection |
| **Status** | CONFIRMED |

**Description:**

Missing: nested groups, complex alternation, backreference patterns. Coverage is reasonable for glob patterns specifically.

**Suggested Fix:** Add more patterns or use a ReDoS detection library.

---

### BUG #20: currentChunkStartLine Calculation Edge Case

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/engines/chunking.ts:614` |
| **Category** | Edge Case |
| **Status** | CONFIRMED |

**Description:**

Calculation can produce values < 1 before the guard. Correctly handled but indicates edge case complexity.

**Suggested Fix:** Review line counting logic.

---

### NEW BUG #23: Missing Validation of top_k Upper Bound in LanceDB

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/storage/lancedb.ts:652` |
| **Category** | Input Validation |
| **Status** | NEW |

**Description:**

While Zod validates `top_k` at 1-50 in tool schema, direct calls to `store.search()` could pass arbitrary values.

**Suggested Fix:** Add `Math.min(topK, MAX_SEARCH_RESULTS)` guard.

---

## False Positives Removed

### BUG #2: TOCTOU Race in FileWatcher Event Queue - FALSE POSITIVE

**Why:** JavaScript is single-threaded. The check and set happen in the same event loop tick:
```typescript
const existing = this.pendingEvents.get(relativePath);
if (existing) { clearTimeout(existing); }
else { /* check limit */ }
this.pendingEvents.set(relativePath, timeout);
```
No async operations between check and set means no race condition is possible.

---

### BUG #7: Potential Infinite Loop in findProjectRoot - FALSE POSITIVE

**Why:** Loop termination is correctly implemented:
```typescript
if (isFilesystemRoot(currentDir)) return null;
if (parentDir === currentDir) return null;  // Redundant safety
```
`path.dirname()` doesn't throw on permission denied - it returns the parent path string.

---

### BUG #12: Potential Infinite Loop in splitAtCharacterBoundary - FALSE POSITIVE

**Why:** Explicit infinite loop prevention exists:
```typescript
if (start >= end) {
  start = end;  // Force progress
}
```

---

### BUG #14: Fingerprint Update After IndexManager Could Cause Inconsistency - FALSE POSITIVE

**Why:** This is intentional optimization. `IndexManager.updateFile()` updates fingerprints internally and saves to disk. The FileWatcher line updates the in-memory cache to match, avoiding a reload. Comment at lines 890-892 explains this.

---

## Prioritized Remediation Steps

| Priority | Bug # | Severity | Action |
|----------|-------|----------|--------|
| 1 | #4 | HIGH | Implement AbortController for glob timeout cancellation |
| 2 | #6 | HIGH | Add atomic flag to AsyncMutex waiter to prevent timeout/grant race |
| 3 | #25 | MEDIUM | Use atomic write pattern for FTS index persistence |
| 4 | #22 | MEDIUM | Add project path cache invalidation or validation |
| 5 | #24 | MEDIUM | Add locking or atomic state check for metadata operations |
| 6 | #26 | MEDIUM | Add try-catch with fallback for config load failure |
| 7 | #3, #13 | MEDIUM | Consider parameterized queries if LanceDB supports them |
| 8 | #10, #11 | MEDIUM | Convert synchronous fs operations to async |
| 9 | #21 | MEDIUM | Wrap background check in try-catch |
| 10 | Others | LOW | Address based on development priorities |

---

## Verified Security Measures

The following security measures were verified as correctly implemented:

1. **Path Traversal Prevention**: `safeJoin()` properly rejects `..` components and validates paths stay within base directory
2. **Symlink Protection**: Consistent use of `lstat()` and `isSymlink()` checks before file operations
3. **SQL Escaping**: `escapeSqlString()` and `escapeLikePattern()` cover standard injection vectors
4. **Resource Limits**: `MAX_CHUNKS_PER_FILE`, `MAX_GLOB_RESULTS`, `MAX_JSON_FILE_SIZE` properly enforced
5. **Atomic File Writes**: Fingerprints and config use temp-file-then-rename pattern
6. **Graceful Shutdown**: Cleanup handlers properly registered and called in LIFO order
7. **Confirmation Requirement**: `create_index` uses `context.confirmed !== true` check (not `=== false`) preventing bypass

---

## Appendix: Files Analyzed

| Directory | Files |
|-----------|-------|
| `src/tools/` | createIndex, searchCode, searchDocs, searchByPath, getIndexStatus, reindexProject, reindexFile, deleteIndex, getConfig |
| `src/engines/` | chunking, embedding, fileWatcher, integrity, projectRoot, indexPolicy, indexManager |
| `src/storage/` | lancedb, fingerprints, config, metadata |
| `src/utils/` | cleanup, asyncMutex, paths, sql, limits, hash |
| `src/errors/` | Error definitions |
| `src/` | index.ts, server.ts |
