---
task_id: "SMCP-021"
title: "reindex_project Tool"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["tools", "indexing", "mcp"]
---

# Task: reindex_project Tool

## Overview

Implement the full project reindex MCP tool. Rebuilds the entire index from scratch, useful when the index seems stale or corrupt. Preserves configuration but regenerates all chunks and embeddings. Requires user confirmation.

## Goals

- [ ] Delete existing index data
- [ ] Perform full re-indexing
- [ ] Preserve user configuration
- [ ] Require user confirmation

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

- [ ] 1.1 Define input schema
    ```typescript
    const ReindexProjectInputSchema = z.object({
      // No required inputs
    });
    ```

- [ ] 1.2 Define output schema
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

- [ ] 2.1 Implement main handler
    ```typescript
    async function reindexProject(
      input: ReindexProjectInput,
      context: ToolContext
    ): Promise<ReindexProjectOutput>
    ```

- [ ] 2.2 Check index exists
    - Return error if no index to reindex
    - Suggest create_index instead

- [ ] 2.3 Confirmation prompt
    ```typescript
    // "This will rebuild the entire index. Continue? (Y/n)"
    // Warn about time for large projects
    ```

- [ ] 2.4 Reindex flow
    ```
    1. Load existing config
    2. Stop file watcher
    3. Delete index data (LanceDB, fingerprints)
    4. Perform full indexing
    5. Restart file watcher
    6. Return results
    ```

### Phase 3: MCP Tool Registration (0.25 hours)

- [ ] 3.1 Create tool definition
    ```typescript
    const reindexProjectTool: Tool = {
      name: 'reindex_project',
      description: 'Rebuild the entire search index from scratch',
      inputSchema: ReindexProjectInputSchema,
      handler: reindexProject,
      requiresConfirmation: true,
    };
    ```

### Phase 4: Export & Tests (0.5 hours)

- [ ] 4.1 Export from `src/tools/reindexProject.ts`

- [ ] 4.2 Write tests
    - Test confirmation flow
    - Test config preservation
    - Test no-index error handling
    - Test progress reporting

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.5: reindex_project

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Confirmation required
- [ ] Config preserved after reindex
- [ ] File watcher restarted
- [ ] Tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Reindex is for fixing issues, not normal operation
- Config preservation ensures user customizations survive
- Stop watcher before delete to prevent race conditions
- Consider backup of old index before delete (future enhancement)

## Blockers

_None yet_

## Related Tasks

- SMCP-014: Index Manager provides rebuildIndex
- SMCP-015: File Watcher must be stopped/restarted
