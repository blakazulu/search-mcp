---
task_id: "SMCP-022"
title: "reindex_file Tool"
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

# Task: reindex_file Tool

## Overview

Implement the single file reindex MCP tool. Re-indexes a specific file, useful when the file watcher missed a change or for manual refresh. Does not require confirmation as it's a low-impact operation.

## Goals

- [ ] Accept file path as input
- [ ] Validate file exists and is indexable
- [ ] Re-chunk and re-embed single file
- [ ] Update index with new chunks

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

- [ ] 1.1 Define input schema
    ```typescript
    const ReindexFileInputSchema = z.object({
      path: z.string()
        .describe("Relative path to the file (e.g., 'src/auth/login.ts')"),
    });
    ```

- [ ] 1.2 Define output schema
    ```typescript
    interface ReindexFileOutput {
      status: 'success' | 'error';
      path: string;
      chunksCreated?: number;
      message?: string;
    }
    ```

### Phase 2: File Validation (0.5 hours)

- [ ] 2.1 Implement path validation
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

- [ ] 2.2 Error handling
    - FILE_NOT_FOUND if file doesn't exist
    - Error if file is in deny list
    - Error if file not in index (suggest create_index)

### Phase 3: Reindex Implementation (0.75 hours)

- [ ] 3.1 Implement main handler
    ```typescript
    async function reindexFile(
      input: ReindexFileInput,
      context: ToolContext
    ): Promise<ReindexFileOutput>
    ```

- [ ] 3.2 Reindex flow
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

- [ ] 4.1 Create tool definition
    ```typescript
    const reindexFileTool: Tool = {
      name: 'reindex_file',
      description: 'Re-index a single specific file',
      inputSchema: ReindexFileInputSchema,
      handler: reindexFile,
      requiresConfirmation: false,  // Fast, low-impact
    };
    ```

### Phase 5: Export & Tests (0.25 hours)

- [ ] 5.1 Export from `src/tools/reindexFile.ts`

- [ ] 5.2 Write tests
    - Test valid file reindex
    - Test file not found
    - Test file in deny list
    - Test file not in index

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.6: reindex_file

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Path validation works correctly
- [ ] Old chunks removed before adding new
- [ ] Fingerprint updated
- [ ] No confirmation required
- [ ] Tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- This is useful for manual refresh when watcher fails
- No confirmation needed - single file is fast
- Consider supporting glob patterns in future
- Path should be relative to project root

## Blockers

_None yet_

## Related Tasks

- SMCP-014: Index Manager provides updateFile
- SMCP-015: File Watcher uses similar logic internally
