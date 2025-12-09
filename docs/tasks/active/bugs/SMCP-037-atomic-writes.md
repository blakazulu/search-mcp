---
task_id: "SMCP-037"
title: "Atomic File Writes & Temp Cleanup"
category: "Technical"
priority: "P0"
status: "not-started"
created_date: "2024-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "Team"
tags: ["critical", "filesystem", "atomic-write", "data-integrity"]
---

# Task: Atomic File Writes & Temp Cleanup

## Overview

Fix file write operations to be truly atomic with proper temp file cleanup. Current implementation can leave orphaned temp files on failure and may crash if the target directory doesn't exist.

## Bugs Addressed

- **Bug #5**: Missing Directory Creation Before File Writes (`metadata.ts:213`, `fingerprints.ts:172`, `config.ts:287`)
- **Bug #6**: Partial Write Cleanup Missing (all storage save functions)
- **Bug #17**: TOCTOU in Config File Handling (`config.ts:269-276`)
- **MCP-34**: Error Recovery Leaves Orphaned Chunks

## Goals

- [ ] Create reusable atomic write utility
- [ ] Ensure directory exists before writing
- [ ] Clean up temp files on failure
- [ ] Update all storage managers to use atomic write

## Success Criteria

- File writes are atomic (complete or not at all)
- No orphaned `.tmp.*` files after failures
- Directory creation is automatic
- Build and all tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- SMCP-038: Resource Cleanup & Signal Handling

## Subtasks

### Phase 1: Create Atomic Write Utility (1.5 hours)

- [ ] 1.1 Create `src/utils/atomicWrite.ts`
    ```typescript
    import * as fs from 'fs';
    import * as path from 'path';

    /**
     * Atomically write content to a file.
     * - Creates parent directory if needed
     * - Writes to temp file first
     * - Renames to target (atomic on most filesystems)
     * - Cleans up temp file on error
     */
    export async function atomicWrite(
      targetPath: string,
      content: string,
      encoding: BufferEncoding = 'utf-8'
    ): Promise<void> {
      const tempPath = `${targetPath}.tmp.${Date.now()}.${process.pid}`;

      try {
        // Ensure directory exists
        const dir = path.dirname(targetPath);
        await fs.promises.mkdir(dir, { recursive: true });

        // Write to temp file
        await fs.promises.writeFile(tempPath, content, encoding);

        // Atomic rename
        await fs.promises.rename(tempPath, targetPath);
      } catch (error) {
        // Clean up temp file on error
        try {
          await fs.promises.unlink(tempPath);
        } catch {
          // Ignore cleanup errors (file may not exist)
        }
        throw error;
      }
    }

    /**
     * Atomically write JSON content to a file.
     */
    export async function atomicWriteJson(
      targetPath: string,
      data: unknown,
      pretty: boolean = true
    ): Promise<void> {
      const content = pretty
        ? JSON.stringify(data, null, 2) + '\n'
        : JSON.stringify(data) + '\n';
      await atomicWrite(targetPath, content);
    }
    ```

- [ ] 1.2 Add unit tests for atomicWrite
    - Test successful write
    - Test directory creation
    - Test cleanup on write error
    - Test cleanup on rename error

### Phase 2: Update Metadata Manager (0.5 hours)

- [ ] 2.1 Update `src/storage/metadata.ts` to use atomicWriteJson
    - Replace manual temp file handling in `save()` method
    - Remove redundant try-catch for temp cleanup

### Phase 3: Update Fingerprints Manager (0.5 hours)

- [ ] 3.1 Update `src/storage/fingerprints.ts` to use atomicWriteJson
    - Replace manual temp file handling in `save()` method

- [ ] 3.2 Update `src/storage/docsFingerprints.ts` similarly

### Phase 4: Update Config Manager (0.5 hours)

- [ ] 4.1 Update `src/storage/config.ts` to use atomicWriteJson
    - Replace manual temp file handling in `save()` method
    - Fix TOCTOU issue by not checking existence before read

### Phase 5: Testing (1 hour)

- [ ] 5.1 Create integration tests for atomic writes
    - Test concurrent writes to same file
    - Test write with simulated disk full error
    - Test write to non-existent directory

- [ ] 5.2 Run full test suite
- [ ] 5.3 Manual testing of index creation and updates

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Atomic File Writes in Node.js](https://nodejs.org/api/fs.html#fspromisesrenamefrompath-topath)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `src/utils/atomicWrite.ts` created with tests
- [ ] `src/storage/metadata.ts` updated
- [ ] `src/storage/fingerprints.ts` updated
- [ ] `src/storage/docsFingerprints.ts` updated
- [ ] `src/storage/config.ts` updated
- [ ] No orphaned temp files after failed writes
- [ ] `npm run build` passes
- [ ] `npm run test` passes

## Progress Log

### 2024-12-09 - 0 hours

- Task created from bug hunt findings

## Notes

- Rename is atomic on most POSIX filesystems but NOT across filesystem boundaries
- On Windows, rename may fail if target exists (use `fs.promises.rename` which handles this)
- Consider adding fsync for durability-critical writes
- PID in temp filename prevents collision between processes

## Blockers

_None currently identified_
