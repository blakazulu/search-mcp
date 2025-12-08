---
task_id: "SMCP-020"
title: "create_index Tool"
category: "Technical"
priority: "P0"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "blakazulu"
tags: ["tools", "indexing", "mcp"]
---

# Task: create_index Tool

## Overview

Implement the index creation MCP tool. Creates a new search index for the current project. Detects project root, scans files, chunks content, generates embeddings, and stores in LanceDB. Requires user confirmation before starting.

## Goals

- [ ] Detect project root automatically
- [ ] Create full index with progress reporting
- [ ] Start file watcher after indexing
- [ ] Require user confirmation

## Success Criteria

- Project root detected correctly
- All indexable files are processed
- Progress updates shown during indexing
- File watcher starts after completion
- User must confirm before starting

## Dependencies

**Blocked by:**

- SMCP-010: Project Root Detection
- SMCP-014: Index Manager

**Blocks:**

- SMCP-024: MCP Server Setup

**Related:**

- SMCP-021: reindex_project Tool
- SMCP-023: delete_index Tool

## Subtasks

### Phase 1: Tool Schema (0.5 hours)

- [ ] 1.1 Define input schema
    ```typescript
    const CreateIndexInputSchema = z.object({
      // No required inputs - uses current directory context
    });
    ```

- [ ] 1.2 Define output schema
    ```typescript
    interface CreateIndexOutput {
      status: 'success' | 'cancelled';
      projectPath?: string;
      filesIndexed?: number;
      chunksCreated?: number;
      duration?: string;  // "45s"
    }
    ```

### Phase 2: Project Detection (0.5 hours)

- [ ] 2.1 Implement project detection flow
    ```typescript
    async function detectProject(
      context: ToolContext
    ): Promise<string>
    // Use Project Root Detection engine
    // If not found, prompt user for choice
    ```

- [ ] 2.2 Handle PROJECT_NOT_DETECTED
    - Offer to use current directory
    - Or allow custom path input

### Phase 3: Index Creation Flow (2 hours)

- [ ] 3.1 Implement main handler
    ```typescript
    async function createIndex(
      input: CreateIndexInput,
      context: ToolContext
    ): Promise<CreateIndexOutput>
    ```

- [ ] 3.2 Confirmation prompt
    ```typescript
    // Ask user: "Index project at {path}? This may take a few minutes."
    // If declined, return status: 'cancelled'
    ```

- [ ] 3.3 Progress reporting
    ```typescript
    // Report progress to MCP client:
    // "Scanning files..."
    // "Found 450 files"
    // "Creating chunks... [████████░░] 50%"
    // "Generating embeddings... [██████████] 100%"
    ```

- [ ] 3.4 Post-indexing setup
    ```typescript
    // After successful indexing:
    // 1. Generate default config.json
    // 2. Start file watcher
    // 3. Return success with stats
    ```

### Phase 4: MCP Tool Registration (0.5 hours)

- [ ] 4.1 Create tool definition
    ```typescript
    const createIndexTool: Tool = {
      name: 'create_index',
      description: 'Create a search index for the current project',
      inputSchema: CreateIndexInputSchema,
      handler: createIndex,
      requiresConfirmation: true,  // User must approve
    };
    ```

- [ ] 4.2 Handle existing index
    - Check if index already exists
    - Offer to reindex if exists

### Phase 5: Export & Tests (0.5 hours)

- [ ] 5.1 Export from `src/tools/createIndex.ts`

- [ ] 5.2 Write tests
    - Test project detection
    - Test confirmation flow
    - Test progress reporting
    - Test existing index handling
    - Test watcher startup

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.1: create_index
- `docs/PRD.md` Section 7.1: First-Run Experience

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Project detection works from any subdirectory
- [ ] Confirmation required before indexing
- [ ] Progress updates shown during indexing
- [ ] File watcher starts after completion
- [ ] Tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- This is the primary entry point for users
- First-run experience is critical for UX
- Consider showing estimated time for large projects
- Progress reporting uses MCP progress protocol
- Existing index check prevents accidental overwrites

## Blockers

_None yet_

## Related Tasks

- SMCP-010: Project Root Detection provides path detection
- SMCP-014: Index Manager does actual indexing
- SMCP-015: File Watcher starts after indexing
