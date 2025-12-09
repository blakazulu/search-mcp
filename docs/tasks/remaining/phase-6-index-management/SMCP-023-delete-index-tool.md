---
task_id: "SMCP-023"
title: "delete_index Tool"
category: "Technical"
priority: "P2"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 1.5
assigned_to: "blakazulu"
tags: ["tools", "indexing", "mcp"]
---

# Task: delete_index Tool

## Overview

Implement the index deletion MCP tool. Removes the search index for the current project including all chunks, embeddings, fingerprints, and metadata. Stops the file watcher. Requires user confirmation (destructive operation).

## Goals

- [x] Stop file watcher before deletion
- [x] Delete all index data
- [x] Remove index directory
- [x] Require user confirmation

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

- [x] 1.1 Define input schema
    ```typescript
    const DeleteIndexInputSchema = z.object({
      // No required inputs
    });
    ```

- [x] 1.2 Define output schema
    ```typescript
    interface DeleteIndexOutput {
      status: 'success' | 'cancelled' | 'not_found';
      projectPath?: string;
      message?: string;
    }
    ```

### Phase 2: Deletion Implementation (1 hour)

- [x] 2.1 Implement main handler
    ```typescript
    async function deleteIndex(
      input: DeleteIndexInput,
      context: ToolContext
    ): Promise<DeleteIndexOutput>
    ```

- [x] 2.2 Check index exists
    - Return status: 'not_found' if no index
    - Include helpful message

- [x] 2.3 Confirmation prompt
    ```typescript
    // "Delete the index for this project? This cannot be undone."
    // If declined, return status: 'cancelled'
    ```

- [x] 2.4 Deletion flow
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

- [x] 3.1 Implement safe directory removal
    ```typescript
    async function safeDeleteIndex(indexPath: string): Promise<void>
    // Verify path is within ~/.mcp/search/indexes/
    // Prevent deletion of arbitrary directories
    ```

- [x] 3.2 Handle partial deletion
    - If some files fail to delete, log warnings
    - Continue deleting remaining files
    - Report any failures in output

### Phase 4: MCP Tool Registration (0.25 hours)

- [x] 4.1 Create tool definition
    ```typescript
    const deleteIndexTool = {
      name: 'delete_index',
      description: 'Remove the search index for the current project',
      inputSchema: DeleteIndexInputSchema,
      requiresConfirmation: true,  // Destructive operation
    };
    ```

### Phase 5: Export & Tests (0.25 hours)

- [x] 5.1 Export from `src/tools/deleteIndex.ts`

- [x] 5.2 Write tests
    - Test confirmation flow
    - Test watcher stop
    - Test directory removal
    - Test no-index handling
    - Test safe path validation

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.7: delete_index

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Confirmation required
- [x] File watcher stopped before delete
- [x] All index files removed
- [x] Safe path validation prevents accidents
- [x] Tests pass
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1.5 hours

- Implemented DeleteIndexInputSchema (empty input)
- Implemented DeleteIndexOutput interface with status, projectPath, message
- Implemented isPathSafeToDelete() security function
- Implemented safeDeleteIndex() with ordered file deletion and partial deletion handling
- Implemented deleteIndex() main handler with confirmation flow
- Stop watcher and close LanceDB callbacks with graceful error handling
- Returns 'not_found' if index doesn't exist
- Created MCP tool definition with requiresConfirmation: true
- Added getDeleteConfirmationMessage() for user prompts
- Exported from src/tools/index.ts
- Wrote comprehensive unit tests (54 tests)
- All 966 tests passing, build successful

## Notes

- Confirmation is critical - operation is irreversible
- Stop watcher first to prevent race conditions
- Safe path check prevents accidental deletion of user files
- Consider keeping logs for debugging (optional)

## Blockers

_None_

## Related Tasks

- SMCP-015: File Watcher must be stopped
- SMCP-009: LanceDB must be closed before deletion
