---
task_id: "SMCP-044"
title: "Dirty Files Manager"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "blakazulu"
tags: ["storage", "indexing", "lazy"]
---

# Task: Dirty Files Manager

## Overview

Create a new storage module to track files pending indexing for the lazy strategy. Persists dirty files to disk so they survive server restarts.

## Goals

- [ ] Create DirtyFilesManager class
- [ ] Implement load/save with atomic writes
- [ ] Track both dirty files and deletions
- [ ] Add getDirtyFilesPath utility

## Success Criteria

- ✅ DirtyFilesManager can add, remove, and track dirty files
- ✅ Deletion markers are tracked separately (`__deleted__:` prefix)
- ✅ State persists to `dirty-files.json` in index directory
- ✅ Survives server restarts with pending files intact
- ✅ Follows same patterns as FingerprintsManager

## Dependencies

**Blocked by:**

- SMCP-043: Config Schema (needs indexingStrategy type)

**Blocks:**

- SMCP-047: Lazy Strategy

**Related:**

- SMCP-008: Fingerprints Manager (similar pattern)

## Subtasks

### Phase 1: Path Utility (0.5 hours)

- [ ] 1.1 Add to `src/utils/paths.ts`:
    ```typescript
    export function getDirtyFilesPath(indexPath: string): string {
      return path.join(indexPath, 'dirty-files.json');
    }
    ```

- [ ] 1.2 Export from `src/utils/index.ts`

### Phase 2: DirtyFilesManager Implementation (2 hours)

- [ ] 2.1 Create `src/storage/dirtyFiles.ts` with:
    - DirtyFilesJSON interface (version, dirtyFiles array, lastModified)
    - DIRTY_FILES_VERSION constant
    - DirtyFilesManager class

- [ ] 2.2 Implement core methods:
    - `load()` - Load from disk
    - `save()` - Atomic write to disk (only if modified)
    - `add(relativePath)` - Mark file as dirty
    - `remove(relativePath)` - Remove from dirty set
    - `markDeleted(relativePath)` - Track deletions with prefix
    - `getAll()` - Get dirty files (excluding deletions)
    - `getDeleted()` - Get deleted files
    - `clear()` - Clear all dirty files
    - `count()` - Get count
    - `isEmpty()` - Check if empty
    - `isLoaded()` - Check if loaded
    - `delete()` - Delete file from disk

- [ ] 2.3 Export from `src/storage/index.ts`

### Phase 3: Testing (0.5 hours)

- [ ] 3.1 Create `tests/unit/storage/dirtyFiles.test.ts`
- [ ] 3.2 Test add/remove/clear operations
- [ ] 3.3 Test persistence (save and reload)
- [ ] 3.4 Test deletion markers

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 2)
- Pattern reference: `src/storage/fingerprints.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined

## Notes

- Use `__deleted__:` prefix to distinguish deletions from modifications
- Only save to disk when `modified` flag is true (optimization)
- Use atomicWriteJson for crash safety
