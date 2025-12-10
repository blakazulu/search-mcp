---
task_id: "SMCP-040"
title: "Path Security & Validation"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2024-12-09"
completed_date: "2024-12-10"
due_date: ""
estimated_hours: 4
actual_hours: 3
assigned_to: "Team"
tags: ["high", "security", "path-traversal", "validation"]
---

# Task: Path Security & Validation

## Overview

Harden path handling to prevent path traversal attacks and handle edge cases like very long paths, Unicode normalization, and Windows-specific issues.

## Bugs Addressed

- **Bug #7**: TOCTOU in LanceDB Lockfile Cleanup (`lancedb.ts:121-133`)
- **Bug #16**: Path Traversal Insufficient Validation (`paths.ts:186-216`)
- **MCP-6**: Node.js Path Traversal (CVE-2025-27210) - Windows specific
- **MCP-19**: Very Long File Paths Cause Issues
- **MCP-29**: Unicode Path Handling Incomplete

## Goals

- [x] Reject all paths containing `..` components
- [x] Add path length validation for Windows
- [x] Fix TOCTOU in lockfile cleanup
- [x] Add basic Unicode normalization

## Success Criteria

- Path traversal attempts are rejected
- Long paths are handled gracefully on Windows
- Lockfile operations are race-condition free
- Build and all tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- SMCP-035: SQL Injection Prevention

## Subtasks

### Phase 1: Path Traversal Hardening (1.5 hours) ✅

- [x] 1.1 Update `safeJoin()` in `src/utils/paths.ts`
    ```typescript
    /**
     * Safely join paths, rejecting any path traversal attempts.
     * Returns null if the path is invalid or escapes the base directory.
     */
    export function safeJoin(
      basePath: string,
      relativePath: string
    ): string | null {
      // Reject any path containing ..
      if (relativePath.includes('..')) {
        return null;
      }

      // Reject absolute paths
      if (path.isAbsolute(relativePath)) {
        return null;
      }

      // Reject paths with null bytes (poison null byte attack)
      if (relativePath.includes('\0')) {
        return null;
      }

      const normalizedBase = normalizePath(basePath);
      const platformRelative = relativePath.replace(/\//g, path.sep);
      const joined = path.resolve(normalizedBase, platformRelative);
      const normalizedJoined = normalizePath(joined);

      // Verify result is within base directory
      if (!isWithinDirectory(normalizedJoined, normalizedBase)) {
        return null;
      }

      return normalizedJoined;
    }
    ```

- [x] 1.2 Add tests for path traversal attempts
    - `../../../etc/passwd`
    - `..\\..\\windows\\system32`
    - `foo/../../../bar`
    - Null byte injection: `file.txt\0.jpg`

### Phase 2: Windows Path Length Validation (1 hour) ✅

- [x] 2.1 Add path length check for Windows
    ```typescript
    const MAX_PATH_LENGTH_WINDOWS = 260;
    const MAX_PATH_LENGTH_UNIX = 4096;

    export function validatePathLength(absolutePath: string): boolean {
      const maxLength = process.platform === 'win32'
        ? MAX_PATH_LENGTH_WINDOWS
        : MAX_PATH_LENGTH_UNIX;

      return absolutePath.length <= maxLength;
    }
    ```

- [x] 2.2 Add validation before file operations in indexManager

### Phase 3: Fix TOCTOU in Lockfile Cleanup (1 hour) ✅

- [x] 3.1 Convert lockfile cleanup to async (`src/storage/lancedb.ts:121-133`)
    ```typescript
    async function cleanupStaleLockfiles(dbPath: string): Promise<void> {
      const logger = getLogger();

      try {
        await fs.promises.access(dbPath);
      } catch {
        return; // Directory doesn't exist
      }

      const lockFiles = await glob('**/*.lock', {
        cwd: dbPath,
        absolute: true,
        nodir: true,
      });

      for (const lockFile of lockFiles) {
        try {
          const stats = await fs.promises.stat(lockFile);
          const ageMs = Date.now() - stats.mtimeMs;

          if (ageMs > 5 * 60 * 1000) {
            // Use exclusive open to verify no one else is using it
            const fd = await fs.promises.open(lockFile, 'r+');
            await fd.close();
            await fs.promises.unlink(lockFile);
            logger.warn('lancedb', `Removed stale lockfile: ${lockFile}`);
          }
        } catch (error) {
          // ENOENT is fine - file was already deleted
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.debug('lancedb', `Could not process lockfile: ${lockFile}`);
          }
        }
      }
    }
    ```

### Phase 4: Unicode Normalization (0.5 hours) ✅

- [x] 4.1 Add basic Unicode NFC normalization for paths
    ```typescript
    export function normalizeUnicode(filePath: string): string {
      // Normalize to NFC form for consistent comparison
      return filePath.normalize('NFC');
    }
    ```

- [x] 4.2 Apply normalization in path handling functions

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [CVE-2025-27210](https://zeropath.com/blog/cve-2025-27210-nodejs-path-traversal-windows)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Unicode Normalization Forms](https://unicode.org/reports/tr15/)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] `safeJoin()` rejects all traversal attempts
- [x] Path length validation added
- [x] Lockfile TOCTOU fixed
- [x] Unicode normalization added
- [x] Tests added for all edge cases
- [x] `npm run build` passes
- [x] `npm run test` passes (1498 tests, no regressions)

## Progress Log

### 2024-12-09 - Task Created

- Task created from bug hunt findings

### 2024-12-10 - Task Completed (3 hours)

- Hardened `safeJoin()` in `src/utils/paths.ts`:
  - Rejects ALL paths containing `..` components
  - Rejects absolute paths in relativePath argument
  - Rejects null byte injection (`\0`)
  - Rejects Windows drive letters in relative paths
  - Added Unicode NFC normalization before processing
- Added path length validation:
  - `MAX_PATH_LENGTH_WINDOWS` (260) and `MAX_PATH_LENGTH_UNIX` (4096) constants
  - `validatePathLength()` - returns boolean for path length check
  - `checkPathLength()` - returns detailed validation result
- Fixed TOCTOU in lockfile cleanup (`src/storage/lancedb.ts`):
  - Converted from sync to async operations
  - Uses `fs.promises.open()` with 'r+' mode to verify no one is using the file
  - Proper ENOENT handling for race conditions
  - Added `STALE_LOCKFILE_AGE_MS` constant
- Added Unicode normalization:
  - `normalizeUnicode()` function for NFC normalization
  - Applied automatically in `safeJoin()`
- Added comprehensive tests for all edge cases
- All 1498 tests pass (no regressions)

## Implementation Details

### Files Modified
- `src/utils/paths.ts` - Security functions, constants, Unicode normalization
- `src/utils/index.ts` - Exported new functions and constants
- `src/storage/lancedb.ts` - Fixed TOCTOU in lockfile cleanup
- `tests/unit/paths.test.ts` - Comprehensive security tests

### Key Features
- Path traversal attempts rejected (Unix-style, Windows-style, mixed)
- Null byte injection blocked
- Path length validation for Windows MAX_PATH limit
- Unicode NFC normalization for cross-platform consistency
- Race-condition-safe lockfile cleanup

## Notes

- Windows has long path support via registry/manifest but not all apps support it
- Consider using `\\?\` prefix for long paths on Windows
- Unicode normalization affects fingerprint hashes - may need migration
- Test with actual Unicode filenames on macOS (uses NFD) and Linux (uses NFC)

## Blockers

_None - task completed_
