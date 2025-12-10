---
task_id: "SMCP-052"
title: "Path Security Hardening (Symlinks + safeJoin)"
category: "Security"
priority: "P0"
status: "not-started"
created_date: "2025-12-10"
estimated_hours: 8
assigned_to: "Team"
tags: ["security", "critical", "path-traversal", "symlinks"]
---

# Task: Path Security Hardening (Symlinks + safeJoin)

## Overview

Critical security hardening for file path operations. Currently, the codebase has excellent path security functions (`safeJoin()`) but they are only used in ONE file. Additionally, there is ZERO symlink detection in the entire codebase, allowing attackers to read arbitrary files via symlinks.

## Related Vulnerabilities

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | safeJoin() only used in reindexFile.ts | CRITICAL | Multiple |
| 3 | No symlink detection (lstat) | CRITICAL | chunking.ts, hash.ts, indexManager.ts |
| 4 | toAbsolutePath() used without validation | HIGH | Multiple |

## Goals

- [ ] Add symlink detection before ALL file read operations
- [ ] Expand safeJoin() usage to all file path operations
- [ ] Create a security utility for safe file reading

## Success Criteria

- `grep -r "lstat" src/` returns matches in all file-reading code
- `grep -r "safeJoin" src/` returns matches in ALL files that read user-controlled paths
- Symlink attack `ln -s /etc/passwd malicious.txt` fails with clear error
- Path traversal `../../../etc/passwd` rejected in all code paths
- All existing tests pass
- New tests cover symlink and path traversal scenarios

## Subtasks

### Phase 1: Create Security Utility (2 hours)

- [ ] 1.1 Create `src/utils/secureFileAccess.ts`
    - Export `safeReadFile(basePath, relativePath)` that combines:
      - safeJoin() validation
      - lstat() symlink check
      - Actual file read
    - Export `isSymlink(filePath)` helper
    - Export `safeFileExists(basePath, relativePath)`

- [ ] 1.2 Add symlink error type to `src/errors/index.ts`
    ```typescript
    SYMLINK_NOT_ALLOWED = 'SYMLINK_NOT_ALLOWED'
    ```

### Phase 2: Apply to Chunking Engine (2 hours)

- [ ] 2.1 Update `src/engines/chunking.ts`
    - Line 492: Replace `fs.createReadStream(absolutePath)` with secure version
    - Line 692: Replace `fs.promises.readFile(absolutePath)` with secure version
    - Add symlink check before all file operations

- [ ] 2.2 Update `src/engines/indexManager.ts`
    - Line 199: Replace `toAbsolutePath()` with `safeJoin()` + validation
    - Add symlink detection

### Phase 3: Apply to Storage Layer (2 hours)

- [ ] 3.1 Update `src/utils/hash.ts`
    - Line 54: Add symlink check before `fs.promises.access()`
    - Line 88: Add symlink check before `fs.promises.readFile()`

- [ ] 3.2 Update `src/storage/fingerprints.ts`
    - Add symlink checks in delta calculation

### Phase 4: Apply to Tools (2 hours)

- [ ] 4.1 Update `src/tools/getIndexStatus.ts`
    - Line 155-166: Replace `fs.promises.stat()` with `fs.promises.lstat()`
    - Detect and reject symlinks in calculateDirectorySize

- [ ] 4.2 Audit all other tools for file access patterns
    - Ensure all use secure file access utilities

### Phase 5: Testing (2 hours)

- [ ] 5.1 Create `src/utils/__tests__/secureFileAccess.test.ts`
    - Test symlink detection
    - Test path traversal rejection
    - Test normal file access works

- [ ] 5.2 Add integration tests
    - Test indexing with symlinks in project (should skip/error)
    - Test path traversal attempts

## Resources

- Current safeJoin implementation: `src/utils/paths.ts:286-325`
- Node.js lstat docs: https://nodejs.org/api/fs.html#fspromiseslstatpath-options

## Acceptance Checklist

- [ ] All subtasks completed
- [ ] Zero file reads without symlink check
- [ ] safeJoin used in all path operations
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] All existing tests pass
- [ ] No regressions introduced

## Notes

- The existing `safeJoin()` function at `paths.ts:286` is excellent - just needs wider adoption
- Consider whether to error or skip symlinks (recommend: skip with warning for indexing, error for explicit file access)
- Windows symlinks (junctions, symbolic links) need testing

## Progress Log

### 2025-12-10

- Task created from security audit
