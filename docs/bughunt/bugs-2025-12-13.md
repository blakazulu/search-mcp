# Consolidated Bug Hunt Report: Search MCP Server

**Date:** 2025-12-13
**Source:** Consolidated from 3 independent bug-hunter runs
**Codebase:** Search MCP - Local-first semantic search for codebases

---

## Executive Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 6 |
| MEDIUM | 10 |
| LOW | 8 |
| **TOTAL** | **25** |

This report consolidates findings from 3 independent bug-hunter analyses. Bugs found by multiple reports are flagged with higher confidence. Severity is normalized based on impact assessment.

### Confidence Legend
- **[3/3]** - Found in all 3 reports (highest confidence)
- **[2/3]** - Found in 2 reports (high confidence)
- **[1/3]** - Found in 1 report (review recommended)

---

## Critical Findings

### BUG #1: IndexingLock Race Condition / Potential Deadlock [2/3]

| Property | Value |
|----------|-------|
| **Severity** | CRITICAL |
| **Location** | `src/utils/asyncMutex.ts:493-520` |
| **Category** | Concurrency / Deadlock |
| **Found In** | Report 01 (Critical), Report 02 (High) |

**Description:**

The `IndexingLock.acquire()` method has a race condition between the `isLocked` check and the actual `acquire()` call. Two issues exist:

1. If two callers pass the `isLocked` check simultaneously before either acquires, one will succeed and one will wait indefinitely (or timeout)
2. If `acquire()` times out after the check passes, `currentProject` remains null, causing inconsistent state

```typescript
async acquire(projectPath: string, timeout?: number): Promise<void> {
  // RACE WINDOW START
  if (this.mutex.isLocked) {  // Check occurs here
    throw new Error(...);
  }
  // RACE WINDOW END - another thread could acquire between check and throw
  await this.mutex.acquire(timeout);  // Actual acquire
  this.currentProject = projectPath;  // Not set if acquire times out
}
```

**Impact:** Under concurrent indexing requests, confusing behavior or deadlock where indexing lock is never released.

**Suggested Fix:** Use `tryAcquire()` pattern:

```typescript
async acquire(projectPath: string, timeout?: number): Promise<void> {
  const acquired = this.mutex.tryAcquire();
  if (!acquired) {
    throw new Error(`Indexing already in progress for project: ${this.currentProject}`);
  }
  this.currentProject = projectPath;
}
```

---

## High Severity Findings

### BUG #2: TOCTOU Race in Symlink Checks [3/3]

| Property | Value |
|----------|-------|
| **Severity** | HIGH |
| **Location** | `src/utils/secureFileAccess.ts:70-78`, `src/engines/chunking.ts:801-833` |
| **Category** | Race Conditions / Security |
| **Found In** | Report 01 (Medium), Report 02 (High), Report 03 (Low) |

**Description:**

The `isSymlink()` function and file reading have a TOCTOU vulnerability. Between when the lstat check is performed and when the file is actually read, an attacker could replace a regular file with a symlink.

```typescript
// Check happens here
stats = await fs.promises.lstat(absolutePath);
// Race window - file could be replaced with symlink
content = await fs.promises.readFile(absolutePath, 'utf8');
```

Additionally, `isSymlink()` returns `false` on errors (including permission denied), which could mask symlinks.

**Impact:** Potential security bypass allowing reading of files outside the project directory.

**Suggested Fix:**
- Use `O_NOFOLLOW` flag when opening files on Unix
- Distinguish between ENOENT and other errors in catch block

---

### BUG #3: Unbounded Reconciliation Event Queue [2/3]

| Property | Value |
|----------|-------|
| **Severity** | HIGH |
| **Location** | `src/engines/fileWatcher.ts:213` |
| **Category** | Resource Exhaustion / DoS |
| **Found In** | Report 01 (High), Report 03 (Medium) |

**Description:**

The `reconciliationEventQueue` has no size limit. During a long reconciliation operation, if many files change, memory can grow unbounded.

```typescript
private reconciliationEventQueue: FileEvent[] = [];
// No limit check when pushing:
this.reconciliationEventQueue.push(event);
```

**Impact:** During reconciliation of a large project with many file changes (e.g., git checkout), the queue can consume excessive memory leading to OOM conditions.

**Suggested Fix:**

```typescript
private static readonly MAX_RECONCILIATION_QUEUE = 1000;

if (this.reconciliationEventQueue.length >= FileWatcher.MAX_RECONCILIATION_QUEUE) {
  logger.warn('FileWatcher', 'Reconciliation queue full, triggering full reindex');
  return;
}
```

---

### BUG #4: Synchronous File Operations Block Event Loop [1/3]

| Property | Value |
|----------|-------|
| **Severity** | HIGH |
| **Location** | `src/storage/config.ts:257, 519, 567` |
| **Category** | Performance / DoS |
| **Found In** | Report 01 (High) |

**Description:**

Multiple instances of `fs.existsSync()` are used in async functions, blocking the Node.js event loop.

```typescript
if (!fs.existsSync(configPath)) {  // Blocks event loop
```

**Impact:** During periods of heavy I/O load, synchronous file checks can block the entire server, causing search requests to timeout.

**Suggested Fix:**

```typescript
try {
  await fs.promises.access(configPath);
  // file exists
} catch {
  // file does not exist
}
```

---

### BUG #5: Hybrid Search ID Collision [1/3]

| Property | Value |
|----------|-------|
| **Severity** | HIGH |
| **Location** | `src/engines/hybridSearch.ts:260-265, 327-330` |
| **Category** | Logic Bug / Data Integrity |
| **Found In** | Report 02 (High) |

**Description:**

The hybrid search uses synthetic IDs like `vector-0`, `vector-1` for vector results. The ID parsing assumes a specific format with a single dash.

```typescript
const vectorResultsWithId = vectorResults.map((r, idx) => ({
  id: `vector-${idx}`,  // Synthetic ID
}));

// Later when parsing:
const idx = parseInt(fused.id.split('-')[1], 10);  // Assumes single dash
```

**Impact:** Incorrect search results or index-out-of-bounds if chunk IDs ever start with "vector-".

**Suggested Fix:** Use a more robust ID scheme (UUID prefix or `__vector__${idx}`).

---

### BUG #6: TOCTOU in Config File Preservation [1/3]

| Property | Value |
|----------|-------|
| **Severity** | HIGH |
| **Location** | `src/storage/config.ts:338-356` |
| **Category** | Race Conditions |
| **Found In** | Report 01 (High) |

**Description:**

In `saveConfig()`, there's a TOCTOU race when reading existing documentation fields before writing.

```typescript
const content = await fs.promises.readFile(configPath, 'utf-8');  // READ
const existing = JSON.parse(content);
// ... processing ...
await atomicWriteJson(configPath, configWithDocs);  // WRITE - file may have changed!
```

**Impact:** Documentation fields could be lost if another process modifies the config between read and write.

**Suggested Fix:** Use file locking or document as expected behavior.

---

### BUG #7: SQL Pattern Interpolation Risk [1/3]

| Property | Value |
|----------|-------|
| **Severity** | HIGH |
| **Location** | `src/storage/lancedb.ts:738-746` |
| **Category** | SQL Injection |
| **Found In** | Report 03 (High) |

**Description:**

While `globToSafeLikePattern` is used, the result is interpolated directly into a SQL WHERE clause.

```typescript
const likePattern = globToSafeLikePattern(pattern);
const results = (await table
  .query()
  .where(`path LIKE '${likePattern}'`)  // String interpolation
```

**Impact:** If `globToSafeLikePattern` has edge case vulnerabilities, SQL injection could be possible.

**Suggested Fix:** Add secondary validation that result contains no single quotes.

---

## Medium Severity Findings

### BUG #8: Missing Validation on Hybrid Search Alpha Parameter [2/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/tools/searchCode.ts:243-245`, `src/engines/hybridSearch.ts:342` |
| **Category** | Input Validation |
| **Found In** | Report 01 (High), Report 02 (Medium) |

**Description:**

No defensive check ensures `effectiveAlpha` is in valid range [0,1] before use. Also, `parseInt()` for vector index doesn't validate for NaN or negative.

**Suggested Fix:**

```typescript
if (effectiveAlpha < 0 || effectiveAlpha > 1) {
  effectiveAlpha = 0.5;
  logger.warn('searchCode', 'Invalid alpha, using default');
}
```

---

### BUG #9: Memory Leak in Embedding Engine Tensor Disposal [2/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/engines/embedding.ts:326-359` |
| **Category** | Resource Leak |
| **Found In** | Report 02 (Medium), Report 03 (Low) |

**Description:**

If an exception occurs during `output!.data` access before the try/finally, the output tensor may leak. Also, pipeline may internally cache tensors.

**Impact:** Gradual memory leak during batch embedding operations.

**Suggested Fix:** Move tensor extraction into a separate try block with its own finally.

---

### BUG #10: Integer Overflow in File Size Parsing [2/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/storage/config.ts:46-56`, `src/tools/createIndex.ts:102-123` |
| **Category** | Input Validation |
| **Found In** | Report 01 (Medium), Report 03 (Medium) |

**Description:**

`parseFileSize` and `formatDuration` use `parseInt` without validating numeric range. Values like "999999999MB" could exceed safe integer range.

**Suggested Fix:**

```typescript
if (!Number.isFinite(value) || value < 0 || value > MAX_SAFE_VALUE) {
  throw new Error(`Invalid value: ${value}`);
}
```

---

### BUG #11: Silent Failure on FTS Update [1/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/tools/reindexFile.ts:358-362` |
| **Category** | Error Handling |
| **Found In** | Report 01 (Medium) |

**Description:**

FTS index update failures are logged but silently swallowed, potentially leaving FTS out of sync with vector index.

**Impact:** Degraded hybrid search quality over time.

**Suggested Fix:** Track consecutive FTS failures and surface warning after N failures.

---

### BUG #12: Missing FTS Engine Cleanup on Error [1/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/tools/reindexFile.ts:314-357` |
| **Category** | Resource Leak |
| **Found In** | Report 01 (Medium) |

**Description:**

If error occurs after `loadFTSEngine()` but before `ftsEngine.close()`, the engine may not be cleaned up.

**Suggested Fix:** Use try-finally pattern.

---

### BUG #13: Path Concatenation Instead of path.join [1/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/tools/reindexProject.ts:143-153` |
| **Category** | Cross-Platform |
| **Found In** | Report 02 (Medium) |

**Description:**

Uses string concatenation (`${indexPath}/fingerprints.json`) instead of `path.join()`.

**Impact:** Potential path handling issues on Windows.

**Suggested Fix:** Use `path.join(indexPath, 'fingerprints.json')`.

---

### BUG #14: Glob Pattern Injection via Config [1/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/storage/config.ts:131-135` |
| **Category** | ReDoS |
| **Found In** | Report 03 (Medium) |

**Description:**

The `include` and `exclude` patterns have minimal validation. Malicious patterns could cause ReDoS.

**Suggested Fix:**

```typescript
const safeGlobPattern = z.string()
  .max(256)
  .regex(/^[a-zA-Z0-9_\-.*?[\]{}\/]+$/, 'Invalid characters');
```

---

### BUG #15: Fingerprint Desync on Partial Update Failure [1/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/engines/fileWatcher.ts:888-893` |
| **Category** | Data Integrity |
| **Found In** | Report 03 (Medium) |

**Description:**

In-memory fingerprints updated after `indexManager.updateFile()` succeeds, but if crash occurs before persistence, state diverges from disk.

**Impact:** Stale fingerprints until next integrity check.

---

### BUG #16: Glob Timeout Not Enforced [1/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/utils/limits.ts:198-204` |
| **Category** | DoS |
| **Found In** | Report 02 (Medium) |

**Description:**

`GLOB_TIMEOUT_MS` is defined (30000ms) but may not be enforced in glob operations.

**Suggested Fix:** Implement actual timeout using `AbortController`.

---

### BUG #17: atomicWrite Temp File Predictable Naming [1/3]

| Property | Value |
|----------|-------|
| **Severity** | MEDIUM |
| **Location** | `src/utils/atomicWrite.ts:40` |
| **Category** | Security |
| **Found In** | Report 02 (Medium) |

**Description:**

Temp file naming uses only timestamp and PID, which is predictable.

**Suggested Fix:** Add random component: `crypto.randomBytes(8).toString('hex')`

---

## Low Severity Findings

### BUG #18: Hardcoded Magic Numbers [1/3]

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | Multiple files |
| **Found In** | Report 01 (Low) |

**Description:** Magic numbers without constants: `10000` limit, `100` max top_k, `50` in Zod validation.

---

### BUG #19: Information Leak in Error Messages [1/3]

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/tools/reindexFile.ts:125`, `src/tools/getConfig.ts:106-124` |
| **Found In** | Report 01 (Low), Report 02 (Medium) |

**Description:** Error messages include attempted paths or full system paths.

---

### BUG #20: Deprecated Function Still Exported [1/3]

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/storage/lancedb.ts:240-243` |
| **Found In** | Report 01 (Low) |

**Description:** `globToLikePattern()` marked `@deprecated` but still exported.

---

### BUG #21: Missing Type Safety in RawSearchResult [1/3]

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/storage/lancedb.ts:78-87` |
| **Found In** | Report 01 (Low) |

**Description:** No runtime validation of LanceDB result shape.

---

### BUG #22: Windows Drive Letter Inconsistency [1/3]

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/utils/paths.ts:237` |
| **Found In** | Report 01 (Low) |

**Description:** Inconsistent handling of drive letter case sensitivity.

---

### BUG #23: ReadWriteLock Starvation [1/3]

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/utils/asyncMutex.ts:274-404` |
| **Found In** | Report 02 (Medium) |

**Description:** Under heavy contention, readers or writers can be starved indefinitely. Documented but not fixed.

---

### BUG #24: Missing Timeout on Database Operations [1/3]

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/storage/lancedb.ts:321-378` |
| **Found In** | Report 03 (Low) |

**Description:** `lancedb.connect()` has no timeout; could hang indefinitely on corruption.

---

### BUG #25: validateSearchMode Silent Fallback [1/3]

| Property | Value |
|----------|-------|
| **Severity** | LOW |
| **Location** | `src/engines/hybridSearch.ts:379-384` |
| **Found In** | Report 02 (Low) |

**Description:** Defaults to 'hybrid' for invalid inputs without logging.

---

## Attack Scenarios

### Scenario 1: Resource Exhaustion Attack
1. Trigger `create_index` on a very large project
2. Rapidly modify thousands of files during indexing
3. Both `pendingEvents` and `reconciliationEventQueue` grow unbounded
4. Combined with synchronous file operations blocking event loop
5. Server becomes unresponsive (DoS)

### Scenario 2: Index Corruption via Timing Attack
1. Send concurrent `create_index` and `delete_index` requests
2. Due to IndexingLock race window, both might pass initial checks
3. Partial deletion during indexing corrupts the index

### Scenario 3: Symlink Race Attack
1. Create a valid file in the project directory
2. Run rapid loop: delete file, create symlink to sensitive file, repeat
3. During indexing, symlink check passes but subsequent read follows symlink
4. Sensitive system files get indexed and become searchable

### Scenario 4: ReDoS via Config
1. Modify config.json with malicious glob patterns
2. Wait for reindexing operation
3. Glob library enters exponential backtracking

---

## Prioritized Recommendations

### Immediate (Critical/High)
| Priority | Bug # | Action |
|----------|-------|--------|
| 1 | #1 | Fix IndexingLock race with `tryAcquire()` |
| 2 | #2 | Use O_NOFOLLOW for file operations |
| 3 | #3 | Add size limit to reconciliation queue |
| 4 | #4 | Replace `fs.existsSync()` with async |
| 5 | #5 | Use robust hybrid search ID scheme |
| 6 | #7 | Add secondary SQL pattern validation |

### Short-term (Medium)
| Priority | Bug # | Action |
|----------|-------|--------|
| 7 | #8 | Add defensive alpha/parseInt validation |
| 8 | #9 | Restructure tensor disposal |
| 9 | #10 | Add numeric range validation |
| 10 | #12 | Use try-finally for FTS engine |
| 11 | #13 | Replace string concat with path.join |
| 12 | #14 | Add glob pattern validation |

### Long-term (Low)
| Priority | Bug # | Action |
|----------|-------|--------|
| 13 | #18 | Consolidate magic numbers |
| 14 | #20 | Remove deprecated exports |
| 15 | #23 | Implement fair ReadWriteLock |

---

## Positive Security Findings

The codebase demonstrates mature security practices:

1. **Path Traversal Prevention** - Comprehensive `safeJoin()` with null byte, `..`, and absolute path rejection
2. **SQL Injection Prevention** - Proper escaping via `globToSafeLikePattern()`
3. **Input Validation** - Query length limits, glob complexity limits, ReDoS detection
4. **Resource Protection** - Chunk count limits, file size limits, binary detection
5. **Atomic Operations** - Atomic file writes with temp file + rename
6. **Previous Hardening** - 40+ bugs already fixed per CHANGELOG (SMCP-035 through SMCP-078)

---

## Source Reports

- `docs/BUG-HUNT-2025-12-13-report-01.md` - 16 bugs
- `docs/BUG-HUNT-2025-12-13-report-02.md` - 14 bugs
- `docs/BUG-HUNT-2025-12-13-report-03.md` - 13 bugs

---

**Report Consolidated:** 2025-12-14
**Total Unique Bugs:** 25
**High Confidence Bugs (2+ reports):** 6
