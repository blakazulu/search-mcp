---
task_id: "SMCP-019"
title: "get_index_status Tool"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["tools", "status", "mcp"]
---

# Task: get_index_status Tool

## Overview

Implement the index status MCP tool. Returns diagnostic information about the current project's index including file counts, chunk counts, storage size, and watcher status. Useful for debugging and understanding index state.

## Goals

- [ ] Report index statistics
- [ ] Show last update timestamps
- [ ] Report watcher status
- [ ] Handle missing index gracefully

## Success Criteria

- Returns accurate file and chunk counts
- Shows human-readable storage size
- Includes watcher active status
- Returns INDEX_NOT_FOUND for unindexed projects

## Dependencies

**Blocked by:**

- SMCP-007: Metadata Manager
- SMCP-009: LanceDB Store

**Blocks:**

- SMCP-024: MCP Server Setup

**Related:**

- SMCP-017: search_code Tool
- SMCP-018: search_by_path Tool

## Subtasks

### Phase 1: Tool Schema (0.25 hours)

- [ ] 1.1 Define input schema
    ```typescript
    const GetIndexStatusInputSchema = z.object({
      // No required inputs - uses current project context
    });
    ```

- [ ] 1.2 Define output schema
    ```typescript
    interface GetIndexStatusOutput {
      status: 'ready' | 'indexing' | 'not_found';
      projectPath?: string;
      totalFiles?: number;
      totalChunks?: number;
      lastUpdated?: string;  // ISO datetime
      storageSize?: string;  // Human readable (e.g., "45MB")
      watcherActive?: boolean;
    }
    ```

### Phase 2: Status Collection (1 hour)

- [ ] 2.1 Implement status collector
    ```typescript
    async function collectStatus(
      context: ToolContext
    ): Promise<GetIndexStatusOutput>
    ```

- [ ] 2.2 Check index existence
    ```typescript
    // Check if index exists at expected path
    // Return status: 'not_found' if missing
    ```

- [ ] 2.3 Gather statistics
    ```typescript
    // From MetadataManager:
    - totalFiles
    - totalChunks
    - lastUpdated

    // From LanceDBStore:
    - storageSize (directory size)

    // From FileWatcher:
    - watcherActive (is watching running?)
    ```

- [ ] 2.4 Format human-readable values
    ```typescript
    function formatStorageSize(bytes: number): string
    // Returns "45MB", "1.2GB", etc.
    ```

### Phase 3: Tool Implementation (0.5 hours)

- [ ] 3.1 Implement status handler
    ```typescript
    async function getIndexStatus(
      input: GetIndexStatusInput,
      context: ToolContext
    ): Promise<GetIndexStatusOutput>
    ```

- [ ] 3.2 Handle edge cases
    - Index exists but is empty
    - Index is currently being built
    - Metadata file is missing/corrupt

### Phase 4: MCP Tool Registration (0.25 hours)

- [ ] 4.1 Create tool definition
    ```typescript
    const getIndexStatusTool: Tool = {
      name: 'get_index_status',
      description: 'Show statistics about the current project index',
      inputSchema: GetIndexStatusInputSchema,
      handler: getIndexStatus,
    };
    ```

- [ ] 4.2 Register with MCP server
    - Tool does NOT require confirmation
    - Read-only operation

### Phase 5: Export & Tests (0.25 hours)

- [ ] 5.1 Export from `src/tools/getIndexStatus.ts`

- [ ] 5.2 Write tests
    - Test with valid index
    - Test with missing index
    - Test storage size formatting
    - Test watcher status reporting

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.4: get_index_status
- `docs/ENGINEERING.RFC.md` Section 3.4: Metadata Schema

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Statistics are accurate
- [ ] Storage size is human-readable
- [ ] Missing index handled gracefully
- [ ] Tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Consider adding 'indexing' status for in-progress operations
- Storage size should include LanceDB directory
- Watcher status helps debug "changes not detected" issues
- Consider caching stats to avoid repeated disk reads

## Blockers

_None yet_

## Related Tasks

- SMCP-007: Metadata Manager provides core stats
- SMCP-015: File Watcher provides watcher status
