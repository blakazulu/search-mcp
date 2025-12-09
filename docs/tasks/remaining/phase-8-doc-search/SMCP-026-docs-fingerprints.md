---
task_id: "SMCP-026"
title: "Docs Fingerprints Manager"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 0
assigned_to: "blakazulu"
tags: ["storage", "fingerprints", "docs"]
---

# Task: Docs Fingerprints Manager

## Overview

Create a fingerprints manager specifically for documentation files. This tracks SHA256 hashes of doc files separately from code files, enabling incremental doc updates.

## Goals

- [ ] Create DocsFingerprintsManager class based on existing FingerprintsManager
- [ ] Use separate file (`docs-fingerprints.json`)
- [ ] Enable delta detection for doc files only

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

- [ ] 1.1 Create `src/storage/docsFingerprints.ts`
    - Copy structure from `fingerprints.ts`
    - Change filename to `'docs-fingerprints.json'`

- [ ] 1.2 Update path helper
    ```typescript
    export function getDocsFingerprintsPath(indexPath: string): string {
      return path.join(indexPath, 'docs-fingerprints.json');
    }
    ```

- [ ] 1.3 Create DocsFingerprintsManager class
    - Same interface as FingerprintsManager
    - Load/save from `docs-fingerprints.json`

### Phase 2: Tests (0.5 hours)

- [ ] 2.1 Create `src/storage/__tests__/docsFingerprints.test.ts`
    - Test load/save
    - Test hash comparison
    - Test delta detection

- [ ] 2.2 Test isolation
    - Verify separate from `fingerprints.json`

## Resources

- `src/storage/fingerprints.ts` - Base implementation to copy
- `docs/ENGINEERING.RFC.md` Section 3.1: Storage Structure

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] DocsFingerprintsManager class created
- [ ] Uses separate `docs-fingerprints.json` path
- [ ] Delta detection works
- [ ] Tests pass
- [ ] Exported from `src/storage/index.ts`

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Very simple task - mostly copy/paste with path changes
- Consider DRY refactoring later (shared base class)

## Blockers

_None yet_

## Related Tasks

- SMCP-008: Fingerprints Manager (template)
- SMCP-028: Docs Index Manager (consumer)
