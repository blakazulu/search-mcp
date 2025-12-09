---
task_id: "SMCP-026"
title: "Docs Fingerprints Manager"
category: "Technical"
priority: "P1"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 1
assigned_to: "blakazulu"
tags: ["storage", "fingerprints", "docs"]
---

# Task: Docs Fingerprints Manager

## Overview

Create a fingerprints manager specifically for documentation files. This tracks SHA256 hashes of doc files separately from code files, enabling incremental doc updates.

## Goals

- [x] Create DocsFingerprintsManager class based on existing FingerprintsManager
- [x] Use separate file (`docs-fingerprints.json`)
- [x] Enable delta detection for doc files only

## Success Criteria

- DocsFingerprintsManager is fully functional
- Uses `~/.mcp/search/indexes/<hash>/docs-fingerprints.json` path
- Can track, compare, and update doc file hashes
- Independent from code fingerprints

## Dependencies

**Blocked by:**

- SMCP-008: Fingerprints Manager (completed - use as template)

**Blocks:**

- SMCP-028: Docs Index Manager

**Related:**

- SMCP-008: Fingerprints Manager (base implementation)

## Subtasks

### Phase 1: Create DocsFingerprintsManager Class (0.5 hours)

- [x] 1.1 Create `src/storage/docsFingerprints.ts`
    - Copy structure from `fingerprints.ts`
    - Change filename to `'docs-fingerprints.json'`

- [x] 1.2 Update path helper
    ```typescript
    export function getDocsFingerprintsPath(indexPath: string): string {
      return path.join(indexPath, 'docs-fingerprints.json');
    }
    ```

- [x] 1.3 Create DocsFingerprintsManager class
    - Same interface as FingerprintsManager
    - Load/save from `docs-fingerprints.json`

### Phase 2: Tests (0.5 hours)

- [x] 2.1 Create `tests/unit/storage/docsFingerprints.test.ts`
    - Test load/save
    - Test hash comparison
    - Test delta detection

- [x] 2.2 Test isolation
    - Verify separate from `fingerprints.json`

## Resources

- `src/storage/fingerprints.ts` - Base implementation to copy
- `docs/ENGINEERING.RFC.md` Section 3.1: Storage Structure

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] DocsFingerprintsManager class created
- [x] Uses separate `docs-fingerprints.json` path
- [x] Delta detection works
- [x] Tests pass (67 tests)
- [x] Exported from `src/storage/index.ts`

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1 hour

- Created `src/storage/docsFingerprints.ts` with DocsFingerprintsManager class
- Added `getDocsFingerprintsPath()` helper to `src/utils/paths.ts`
- Updated `src/storage/index.ts` with exports
- Created comprehensive test suite with 67 tests
- All 377 tests passing

## Notes

- Very simple task - mostly copy/paste with path changes
- Consider DRY refactoring later (shared base class)

## Blockers

_None_

## Related Tasks

- SMCP-008: Fingerprints Manager (template)
- SMCP-028: Docs Index Manager (consumer)
