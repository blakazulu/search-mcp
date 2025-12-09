---
task_id: "SMCP-017"
title: "search_code Tool"
category: "Technical"
priority: "P1"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 3
actual_hours: 2
assigned_to: "blakazulu"
tags: ["tools", "search", "mcp"]
---

# Task: search_code Tool

## Overview

Implement the primary semantic search MCP tool. Takes a natural language query, converts it to an embedding vector, and searches the LanceDB index for similar code chunks. Returns ranked results with file paths, content, and line numbers.

## Goals

- [x] Accept query string and optional top_k parameter
- [x] Generate query embedding
- [x] Search LanceDB for similar chunks
- [x] Return formatted results with scores

## Success Criteria

- Query embedding matches chunk embedding format
- Results sorted by similarity score (descending)
- Response includes path, text, score, line numbers
- Search completes in <200ms for typical queries

## Dependencies

**Blocked by:**

- SMCP-009: LanceDB Store
- SMCP-013: Embedding Engine

**Blocks:**

- SMCP-024: MCP Server Setup

**Related:**

- SMCP-018: search_by_path Tool
- SMCP-019: get_index_status Tool

## Subtasks

### Phase 1: Tool Schema (0.5 hours)

- [x] 1.1 Define input schema
    ```typescript
    const SearchCodeInputSchema = z.object({
      query: z.string().min(1).describe('The question or code concept to search for'),
      top_k: z.number().int().min(1).max(50).default(10)
        .describe('Number of results to return (1-50)'),
    });
    ```

- [x] 1.2 Define output schema
    ```typescript
    interface SearchCodeOutput {
      results: Array<{
        path: string;
        text: string;
        score: number;
        startLine: number;
        endLine: number;
      }>;
      totalResults: number;
      searchTimeMs: number;
    }
    ```

### Phase 2: Search Implementation (1.5 hours)

- [x] 2.1 Implement search handler
    ```typescript
    async function searchCode(
      input: SearchCodeInput,
      context: ToolContext
    ): Promise<SearchCodeOutput>
    ```

- [x] 2.2 Check index exists
    - If no index, return INDEX_NOT_FOUND error
    - Suggest running create_index

- [x] 2.3 Generate query embedding
    ```typescript
    const queryVector = await embeddingEngine.embed(input.query);
    ```

- [x] 2.4 Execute vector search
    ```typescript
    const results = await store.search(queryVector, input.top_k);
    ```

- [x] 2.5 Format response
    - Map database results to output format
    - Normalize scores to 0.0-1.0 range
    - Include timing information

### Phase 3: MCP Tool Registration (0.5 hours)

- [x] 3.1 Create tool definition
    ```typescript
    const searchCodeTool = {
      name: 'search_code',
      description: 'Search your codebase for relevant code using natural language',
      inputSchema: SearchCodeInputSchema,
      requiresConfirmation: false,
    };
    ```

- [x] 3.2 Register with MCP server
    - Tool does NOT require confirmation
    - Read-only operation

### Phase 4: Export & Tests (0.5 hours)

- [x] 4.1 Export from `src/tools/searchCode.ts`

- [x] 4.2 Write tests
    - Test query embedding generation
    - Test result formatting
    - Test top_k limiting
    - Test INDEX_NOT_FOUND error
    - Test search timing

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.2: search_code
- `docs/PRD.md` Section 5.1: MCP Tools table
- `docs/PRD.md` Section 7.3: Search Results Format

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Tool registered with MCP server
- [x] Query embedding works correctly
- [x] Results are sorted by relevance
- [x] Response format matches RFC
- [x] Tests pass
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 2 hours

- Implemented SearchCodeInputSchema with Zod validation
- Implemented SearchCodeOutput interface
- Implemented searchCode() handler with index existence check
- Generates query embedding using EmbeddingEngine
- Executes vector search on LanceDB store
- Returns formatted results sorted by similarity (descending)
- Includes searchTimeMs timing
- Created MCP tool definition (requiresConfirmation: false)
- Added export aliases for RFC compatibility (searchNow, searchNowTool)
- Created src/tools/index.ts for exports
- Wrote comprehensive unit tests (27 tests)
- All 709 tests passing, build successful

## Notes

- This is the most-used tool - optimize for performance
- No confirmation required (read-only)
- Consider caching recent query embeddings
- Score normalization may vary by LanceDB version
- Include searchTimeMs for performance monitoring

## Blockers

_None_

## Related Tasks

- SMCP-013: Embedding Engine generates query vectors
- SMCP-009: LanceDB Store performs similarity search
