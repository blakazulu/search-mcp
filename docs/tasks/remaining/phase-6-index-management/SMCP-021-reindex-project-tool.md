---
task_id: "SMCP-021"
title: "reindex_project Tool"
category: "Technical"
priority: "P1"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 1.5
assigned_to: "blakazulu"
tags: ["tools", "indexing", "mcp"]
---

# Task: reindex_project Tool

## Overview

Implement the full project reindex MCP tool. Rebuilds the entire index from scratch, useful when the index seems stale or corrupt. Preserves configuration but regenerates all chunks and embeddings. Requires user confirmation.

## Goals

- [x] Delete existing index data
- [x] Perform full re-indexing
- [x] Preserve user configuration
- [x] Require user confirmation

## Success Criteria

- Existing index is completely replaced
- User config (include/exclude) is preserved
- Progress updates shown during reindexing
- User must confirm (destructive operation)

## Dependencies

**Blocked by:**

- SMCP-014: Index Manager

**Blocks:**

- SMCP-024: MCP Server Setup

**Related:**

- SMCP-020: create_index Tool
- SMCP-022: reindex_file Tool

## Subtasks

### Phase 1: Tool Schema (0.25 hours)

- [x] 1.1 Define input schema
    ```typescript
    const ReindexProjectInputSchema = z.object({
      // No required inputs
    });
    ```

- [x] 1.2 Define output schema
    ```typescript
    interface ReindexProjectOutput {
      status: 'success' | 'cancelled';
      filesIndexed?: number;
      chunksCreated?: number;
      duration?: string;
      message?: string;
    }
    ```

### Phase 2: Reindex Implementation (1 hour)

- [x] 2.1 Implement main handler
    ```typescript
    async function reindexProject(
      input: ReindexProjectInput,
      context: ToolContext
    ): Promise<ReindexProjectOutput>
    ```

- [x] 2.2 Check index exists
    - Return error if no index to reindex
    - Suggest create_index instead

- [x] 2.3 Confirmation prompt
    ```typescript
    // "This will rebuild the entire index. Continue? (Y/n)"
    // Warn about time for large projects
    ```

- [x] 2.4 Reindex flow
    ```
    1. Load existing config
    2. Stop file watcher
    3. Delete index data (LanceDB, fingerprints)
    4. Perform full indexing
    5. Restart file watcher
    6. Return results
    ```

### Phase 3: MCP Tool Registration (0.25 hours)

- [x] 3.1 Create tool definition
    ```typescript
    const reindexProjectTool = {
      name: 'reindex_project',
      description: 'Rebuild the entire search index from scratch',
      inputSchema: ReindexProjectInputSchema,
      requiresConfirmation: true,
    };
    ```

### Phase 4: Export & Tests (0.5 hours)

- [x] 4.1 Export from `src/tools/reindexProject.ts`

- [x] 4.2 Write tests
    - Test confirmation flow
    - Test config preservation
    - Test no-index error handling
    - Test progress reporting

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.5: reindex_project

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Confirmation required
- [x] Config preserved after reindex
- [x] File watcher restarted
- [x] Tests pass
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1.5 hours

- Implemented ReindexProjectInputSchema (empty input)
- Implemented ReindexProjectOutput interface with status, filesIndexed, chunksCreated, duration, message
- Implemented checkIndexExists() to verify index presence
- Implemented loadExistingConfig() to preserve user settings
- Implemented deleteIndexData() to remove LanceDB, fingerprints, metadata while preserving config
- Implemented reindexProject() main handler with confirmation flow
- Added INDEX_NOT_FOUND error with create_index suggestion
- Progress reporting during all phases
- Created MCP tool definition with requiresConfirmation: true
- Added getReindexConfirmationMessage() for user-friendly prompts
- Exported from src/tools/index.ts
- Wrote comprehensive unit tests (39 tests)
- All 880 tests passing, build successful

## Notes

- Reindex is for fixing issues, not normal operation
- Config preservation ensures user customizations survive
- Stop watcher before delete to prevent race conditions
- Consider backup of old index before delete (future enhancement)

## Blockers

_None_

## Related Tasks

- SMCP-014: Index Manager provides rebuildIndex
- SMCP-015: File Watcher must be stopped/restarted
