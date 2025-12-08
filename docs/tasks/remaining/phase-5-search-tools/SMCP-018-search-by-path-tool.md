---
task_id: "SMCP-018"
title: "search_by_path Tool"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["tools", "search", "mcp", "glob"]
---

# Task: search_by_path Tool

## Overview

Implement the glob pattern file search MCP tool. Finds indexed files matching a glob pattern (e.g., `**/auth*.ts`). Useful when users know what file they're looking for but not the exact path.

## Goals

- [ ] Accept glob pattern and optional limit
- [ ] Match pattern against indexed file paths
- [ ] Return matching file paths
- [ ] Handle invalid patterns gracefully

## Success Criteria

- Standard glob patterns work (`**`, `*`, `?`)
- Results limited by limit parameter
- Invalid patterns return INVALID_PATTERN error
- Search completes quickly even with many files

## Dependencies

**Blocked by:**

- SMCP-009: LanceDB Store

**Blocks:**

- SMCP-024: MCP Server Setup

**Related:**

- SMCP-017: search_now Tool
- SMCP-019: get_index_status Tool

## Subtasks

### Phase 1: Tool Schema (0.25 hours)

- [ ] 1.1 Define input schema
    ```typescript
    const SearchByPathInputSchema = z.object({
      pattern: z.string()
        .describe("Glob pattern to match (e.g., '**/auth*.ts', 'src/**/*.md')"),
      limit: z.number().min(1).max(100).default(20)
        .describe('Maximum results to return'),
    });
    ```

- [ ] 1.2 Define output schema
    ```typescript
    interface SearchByPathOutput {
      matches: string[];
      totalMatches: number;
    }
    ```

### Phase 2: Pattern Matching (1 hour)

- [ ] 2.1 Implement pattern validator
    ```typescript
    function validateGlobPattern(pattern: string): boolean
    // Check for valid glob syntax
    // Reject obviously malformed patterns
    ```

- [ ] 2.2 Implement pattern matching
    ```typescript
    import { minimatch } from 'minimatch';

    async function matchPattern(
      store: LanceDBStore,
      pattern: string,
      limit: number
    ): Promise<string[]>
    // Get all indexed files
    // Filter by glob pattern
    // Return up to limit matches
    ```

- [ ] 2.3 Optimize for large file lists
    - Consider SQL LIKE query for simple patterns
    - Fall back to minimatch for complex patterns

### Phase 3: Tool Implementation (0.5 hours)

- [ ] 3.1 Implement search handler
    ```typescript
    async function searchByPath(
      input: SearchByPathInput,
      context: ToolContext
    ): Promise<SearchByPathOutput>
    ```

- [ ] 3.2 Error handling
    - INDEX_NOT_FOUND if no index
    - INVALID_PATTERN for malformed patterns

- [ ] 3.3 Format response
    ```typescript
    return {
      matches: matchedPaths.slice(0, input.limit),
      totalMatches: matchedPaths.length,
    };
    ```

### Phase 4: MCP Tool Registration (0.25 hours)

- [ ] 4.1 Create tool definition
    ```typescript
    const searchByPathTool: Tool = {
      name: 'search_by_path',
      description: 'Find files by name or glob pattern',
      inputSchema: SearchByPathInputSchema,
      handler: searchByPath,
    };
    ```

- [ ] 4.2 Register with MCP server
    - Tool does NOT require confirmation
    - Read-only operation

### Phase 5: Export & Tests (0.25 hours)

- [ ] 5.1 Export from `src/tools/searchByPath.ts`

- [ ] 5.2 Write tests
    - Test simple patterns (`*.ts`)
    - Test recursive patterns (`**/*.ts`)
    - Test directory patterns (`src/**/*`)
    - Test invalid pattern handling
    - Test limit parameter

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.3: search_by_path
- [minimatch documentation](https://github.com/isaacs/minimatch)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Standard glob patterns work
- [ ] Limit parameter respected
- [ ] Invalid patterns handled gracefully
- [ ] Tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Use minimatch for glob matching (same as npm uses)
- Pattern matching is case-sensitive
- Consider caching file list for repeated searches
- Return sorted results (alphabetically) for consistency

## Blockers

_None yet_

## Related Tasks

- SMCP-009: LanceDB Store provides file list
- SMCP-017: search_now for semantic search
