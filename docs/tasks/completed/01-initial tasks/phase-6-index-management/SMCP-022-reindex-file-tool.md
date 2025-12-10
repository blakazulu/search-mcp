---
task_id: "SMCP-022"
title: "reindex_file Tool"
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

# Task: reindex_file Tool

## Overview

Implement the single file reindex MCP tool. Re-indexes a specific file, useful when the file watcher missed a change or for manual refresh. Does not require confirmation as it's a low-impact operation.

## Goals

- [x] Accept file path as input
- [x] Validate file exists and is indexable
- [x] Re-chunk and re-embed single file
- [x] Update index with new chunks

## Success Criteria

- File path is validated
- Old chunks for file are removed
- New chunks are added
- Fingerprint is updated
- No confirmation required (fast operation)

## Dependencies

**Blocked by:**

- SMCP-014: Index Manager

**Blocks:**

- SMCP-024: MCP Server Setup

**Related:**

- SMCP-021: reindex_project Tool
- SMCP-015: File Watcher (may trigger this)

## Subtasks

### Phase 1: Tool Schema (0.25 hours)

- [x] 1.1 Define input schema
    ```typescript
    const ReindexFileInputSchema = z.object({
      path: z.string()
        .describe("Relative path to the file (e.g., 'src/auth/login.ts')"),
    });
    ```

- [x] 1.2 Define output schema
    ```typescript
    interface ReindexFileOutput {
      status: 'success' | 'error';
      path: string;
      chunksCreated?: number;
      message?: string;
    }
    ```

### Phase 2: File Validation (0.5 hours)

- [x] 2.1 Implement path validation
    ```typescript
    async function validateFilePath(
      relativePath: string,
      projectPath: string,
      policy: IndexingPolicy
    ): Promise<ValidationResult>
    // Check file exists
    // Check file passes policy
    // Check file is in index
    ```

- [x] 2.2 Error handling
    - FILE_NOT_FOUND if file doesn't exist
    - Error if file is in deny list
    - Error if file not in index (suggest create_index)

### Phase 3: Reindex Implementation (0.75 hours)

- [x] 3.1 Implement main handler
    ```typescript
    async function reindexFile(
      input: ReindexFileInput,
      context: ToolContext
    ): Promise<ReindexFileOutput>
    ```

- [x] 3.2 Reindex flow
    ```
    1. Validate file path
    2. Delete existing chunks for file
    3. Read and chunk file
    4. Generate embeddings
    5. Insert new chunks
    6. Update fingerprint
    7. Return result
    ```

### Phase 4: MCP Tool Registration (0.25 hours)

- [x] 4.1 Create tool definition
    ```typescript
    const reindexFileTool = {
      name: 'reindex_file',
      description: 'Re-index a single specific file',
      inputSchema: ReindexFileInputSchema,
      requiresConfirmation: false,  // Fast, low-impact
    };
    ```

### Phase 5: Export & Tests (0.25 hours)

- [x] 5.1 Export from `src/tools/reindexFile.ts`

- [x] 5.2 Write tests
    - Test valid file reindex
    - Test file not found
    - Test file in deny list
    - Test file not in index

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.6: reindex_file

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Path validation works correctly
- [x] Old chunks removed before adding new
- [x] Fingerprint updated
- [x] No confirmation required
- [x] Tests pass
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1.5 hours

- Implemented ReindexFileInputSchema with path parameter
- Implemented ReindexFileOutput interface with status, path, chunksCreated, message
- Implemented validateFilePath() with file existence, deny list, and policy checks
- Added path traversal prevention (security)
- Path normalization (handles forward and backslashes)
- Implemented reindexFile() main handler with full reindex flow
- Delete existing chunks, re-chunk, re-embed, insert, update fingerprint
- Created MCP tool definition with requiresConfirmation: false
- Handles new files not previously in index
- Exported from src/tools/index.ts
- Wrote comprehensive unit tests (32 tests)
- All 912 tests passing, build successful

## Notes

- This is useful for manual refresh when watcher fails
- No confirmation needed - single file is fast
- Consider supporting glob patterns in future
- Path should be relative to project root

## Blockers

_None_

## Related Tasks

- SMCP-014: Index Manager provides updateFile
- SMCP-015: File Watcher uses similar logic internally
