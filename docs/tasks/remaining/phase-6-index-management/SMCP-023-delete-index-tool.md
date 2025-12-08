---
task_id: "SMCP-023"
title: "delete_index Tool"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["tools", "indexing", "mcp"]
---

# Task: delete_index Tool

## Overview

Implement the index deletion MCP tool. Removes the search index for the current project including all chunks, embeddings, fingerprints, and metadata. Stops the file watcher. Requires user confirmation (destructive operation).

## Goals

- [ ] Stop file watcher before deletion
- [ ] Delete all index data
- [ ] Remove index directory
- [ ] Require user confirmation

## Success Criteria

- File watcher is stopped cleanly
- All index files are removed
- Index directory is deleted
- User must confirm before deletion
- Graceful handling if index doesn't exist

## Dependencies

**Blocked by:**

- SMCP-009: LanceDB Store
- SMCP-015: File Watcher Engine

**Blocks:**

- SMCP-024: MCP Server Setup

**Related:**

- SMCP-020: create_index Tool
- SMCP-021: reindex_project Tool

## Subtasks

### Phase 1: Tool Schema (0.25 hours)

- [ ] 1.1 Define input schema
    ```typescript
    const DeleteIndexInputSchema = z.object({
      // No required inputs
    });
    ```

- [ ] 1.2 Define output schema
    ```typescript
    interface DeleteIndexOutput {
      status: 'success' | 'cancelled' | 'not_found';
      projectPath?: string;
      message?: string;
    }
    ```

### Phase 2: Deletion Implementation (1 hour)

- [ ] 2.1 Implement main handler
    ```typescript
    async function deleteIndex(
      input: DeleteIndexInput,
      context: ToolContext
    ): Promise<DeleteIndexOutput>
    ```

- [ ] 2.2 Check index exists
    - Return status: 'not_found' if no index
    - Include helpful message

- [ ] 2.3 Confirmation prompt
    ```typescript
    // "Delete the index for this project? This cannot be undone."
    // If declined, return status: 'cancelled'
    ```

- [ ] 2.4 Deletion flow
    ```
    1. Stop file watcher (if running)
    2. Close LanceDB connection
    3. Delete index directory recursively
       - index.lancedb/
       - fingerprints.json
       - config.json
       - metadata.json
       - logs/
    4. Return success
    ```

### Phase 3: Safe Deletion (0.25 hours)

- [ ] 3.1 Implement safe directory removal
    ```typescript
    async function safeDeleteIndex(indexPath: string): Promise<void>
    // Verify path is within ~/.mcp/search/indexes/
    // Prevent deletion of arbitrary directories
    ```

- [ ] 3.2 Handle partial deletion
    - If some files fail to delete, log warnings
    - Continue deleting remaining files
    - Report any failures in output

### Phase 4: MCP Tool Registration (0.25 hours)

- [ ] 4.1 Create tool definition
    ```typescript
    const deleteIndexTool: Tool = {
      name: 'delete_index',
      description: 'Remove the search index for the current project',
      inputSchema: DeleteIndexInputSchema,
      handler: deleteIndex,
      requiresConfirmation: true,  // Destructive operation
    };
    ```

### Phase 5: Export & Tests (0.25 hours)

- [ ] 5.1 Export from `src/tools/deleteIndex.ts`

- [ ] 5.2 Write tests
    - Test confirmation flow
    - Test watcher stop
    - Test directory removal
    - Test no-index handling
    - Test safe path validation

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.7: delete_index

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Confirmation required
- [ ] File watcher stopped before delete
- [ ] All index files removed
- [ ] Safe path validation prevents accidents
- [ ] Tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Confirmation is critical - operation is irreversible
- Stop watcher first to prevent race conditions
- Safe path check prevents accidental deletion of user files
- Consider keeping logs for debugging (optional)

## Blockers

_None yet_

## Related Tasks

- SMCP-015: File Watcher must be stopped
- SMCP-009: LanceDB must be closed before deletion
