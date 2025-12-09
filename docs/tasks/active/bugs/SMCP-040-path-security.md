---
task_id: "SMCP-040"
title: "Path Security & Validation"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2024-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 0
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

- [ ] Reject all paths containing `..` components
- [ ] Add path length validation for Windows
- [ ] Fix TOCTOU in lockfile cleanup
- [ ] Add basic Unicode normalization

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

### Phase 1: Path Traversal Hardening (1.5 hours)

- [ ] 1.1 Update `safeJoin()` in `src/utils/paths.ts`
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

- [ ] 1.2 Add tests for path traversal attempts
    - `../../../etc/passwd`
    - `..\\..\\windows\\system32`
    - `foo/../../../bar`
    - Null byte injection: `file.txt\0.jpg`

### Phase 2: Windows Path Length Validation (1 hour)

- [ ] 2.1 Add path length check for Windows
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

- [ ] 2.2 Add validation before file operations in indexManager

### Phase 3: Fix TOCTOU in Lockfile Cleanup (1 hour)

- [ ] 3.1 Convert lockfile cleanup to async (`src/storage/lancedb.ts:121-133`)
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

### Phase 4: Unicode Normalization (0.5 hours)

- [ ] 4.1 Add basic Unicode NFC normalization for paths
    ```typescript
    export function normalizeUnicode(filePath: string): string {
      // Normalize to NFC form for consistent comparison
      return filePath.normalize('NFC');
    }
    ```

- [ ] 4.2 Apply normalization in path handling functions

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [CVE-2025-27210](https://zeropath.com/blog/cve-2025-27210-nodejs-path-traversal-windows)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Unicode Normalization Forms](https://unicode.org/reports/tr15/)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `safeJoin()` rejects all traversal attempts
- [ ] Path length validation added
- [ ] Lockfile TOCTOU fixed
- [ ] Unicode normalization added
- [ ] Tests added for all edge cases
- [ ] `npm run build` passes
- [ ] `npm run test` passes

## Progress Log

### 2024-12-09 - 0 hours

- Task created from bug hunt findings

## Notes

- Windows has long path support via registry/manifest but not all apps support it
- Consider using `\\?\` prefix for long paths on Windows
- Unicode normalization affects fingerprint hashes - may need migration
- Test with actual Unicode filenames on macOS (uses NFD) and Linux (uses NFC)

## Blockers

_None currently identified_
