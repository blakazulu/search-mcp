---
task_id: "SMCP-025"
title: "Docs LanceDB Store"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["storage", "lancedb", "docs"]
---

# Task: Docs LanceDB Store

## Overview

Create a LanceDB store specifically for documentation files. This store uses a separate database (`docs.lancedb/`) with the same schema as the code store but will store chunks created with prose-optimized parameters.

## Goals

- [ ] Create DocsLanceDBStore class based on existing LanceDBStore
- [ ] Use separate database path (`docs.lancedb/`)
- [ ] Use table name `project_docs_prose`
- [ ] Reuse existing schema and methods

## Success Criteria

- DocsLanceDBStore is fully functional
- Uses `~/.mcp/search/indexes/<hash>/docs.lancedb/` path
- Can insert, search, and delete doc chunks
- All existing LanceDBStore tests pass when adapted for docs

## Dependencies

**Blocked by:**

- SMCP-009: LanceDB Store (completed - use as template)

**Blocks:**

- SMCP-028: Docs Index Manager
- SMCP-029: search_docs Tool

**Related:**

- SMCP-009: LanceDB Store (base implementation)

## Subtasks

### Phase 1: Create DocsLanceDBStore Class (1 hour)

- [ ] 1.1 Create `src/storage/docsLancedb.ts`
    - Copy structure from `lancedb.ts`
    - Change `TABLE_NAME` to `'project_docs_prose'`
    - Create `getDocsLanceDbPath()` helper

- [ ] 1.2 Update path constants
    ```typescript
    export function getDocsLanceDbPath(indexPath: string): string {
      return path.join(indexPath, 'docs.lancedb');
    }
    ```

- [ ] 1.3 Create DocsLanceDBStore class
    - Extend or copy LanceDBStore pattern
    - Override constructor to use docs path
    - Same schema: id, path, text, vector, start_line, end_line, content_hash

### Phase 2: Tests (1 hour)

- [ ] 2.1 Create `src/storage/__tests__/docsLancedb.test.ts`
    - Test database creation
    - Test chunk insertion
    - Test vector search
    - Test deletion by path

- [ ] 2.2 Test isolation
    - Verify docs.lancedb is separate from index.lancedb
    - Verify no cross-contamination

## Resources

- `src/storage/lancedb.ts` - Base implementation to copy
- `docs/ENGINEERING.RFC.md` Section 3.2.1: Database Schema (Docs)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] DocsLanceDBStore class created
- [ ] Uses separate `docs.lancedb/` path
- [ ] All CRUD operations work
- [ ] Tests pass
- [ ] Exported from `src/storage/index.ts`

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- This is essentially a copy of LanceDBStore with different paths
- Consider whether to extend base class or keep separate
- Same 384-dimension vectors (MiniLM model)

## Blockers

_None yet_

## Related Tasks

- SMCP-009: LanceDB Store (template)
- SMCP-028: Docs Index Manager (consumer)
