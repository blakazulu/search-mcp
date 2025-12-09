---
task_id: "SMCP-029"
title: "search_docs Tool"
category: "Technical"
priority: "P1"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 2
assigned_to: "blakazulu"
tags: ["tools", "search", "docs", "mcp"]
---

# Task: search_docs Tool

## Overview

Implement the documentation-specific semantic search MCP tool. Takes a natural language query, converts it to an embedding vector, and searches the docs LanceDB table for similar documentation chunks. Optimized for prose content.

## Goals

- [x] Accept query string and optional top_k parameter
- [x] Generate query embedding
- [x] Search DocsLanceDBStore for similar chunks
- [x] Return formatted results with scores

## Success Criteria

- Query embedding works correctly
- Results sorted by similarity score (descending)
- Response includes path, text, score, line numbers
- Search completes in <200ms for typical queries
- Only returns doc files (.md, .txt)

## Dependencies

**Blocked by:**

- SMCP-028: Docs Index Manager
- SMCP-013: Embedding Engine (completed)

**Blocks:**

- SMCP-034: MCP Server Setup

**Related:**

- SMCP-017: search_code Tool (similar implementation)

## Subtasks

### Phase 1: Tool Schema (0.5 hours)

- [x] 1.1 Define input schema
    ```typescript
    const SearchDocsInputSchema = z.object({
      query: z.string()
        .describe('The question or topic to search for in documentation'),
      top_k: z.number().min(1).max(50).default(10)
        .describe('Number of results to return (1-50)'),
    });
    ```

- [x] 1.2 Define output schema
    ```typescript
    interface SearchDocsOutput {
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

### Phase 2: Search Implementation (1 hour)

- [x] 2.1 Implement search handler
    ```typescript
    async function searchDocs(
      input: SearchDocsInput,
      context: ToolContext
    ): Promise<SearchDocsOutput>
    ```

- [x] 2.2 Check docs index exists
    - If no index, return DOCS_INDEX_NOT_FOUND error
    - Suggest running create_index

- [x] 2.3 Generate query embedding
    ```typescript
    const queryVector = await embeddingEngine.embed(input.query);
    ```

- [x] 2.4 Execute vector search
    ```typescript
    const results = await docsStore.search(queryVector, input.top_k);
    ```

- [x] 2.5 Format response
    - Map database results to output format
    - Normalize scores to 0.0-1.0 range
    - Include timing information

### Phase 3: MCP Tool Registration (0.25 hours)

- [x] 3.1 Create tool definition
    ```typescript
    const searchDocsTool: Tool = {
      name: 'search_docs',
      description: 'Search project documentation files (.md, .txt) using natural language. Optimized for prose content like README, guides, and technical docs.',
      inputSchema: SearchDocsInputSchema,
      handler: searchDocs,
    };
    ```

- [x] 3.2 Register with MCP server
    - Tool does NOT require confirmation
    - Read-only operation

### Phase 4: Export & Tests (0.25 hours)

- [x] 4.1 Export from `src/tools/searchDocs.ts`

- [x] 4.2 Write tests
    - Test query embedding generation
    - Test result formatting
    - Test top_k limiting
    - Test DOCS_INDEX_NOT_FOUND error
    - Test search timing

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.8: search_docs
- `docs/PRD.md` Section 5.1: MCP Tools table
- `src/tools/searchNow.ts` (when implemented) - Similar pattern

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Tool registered with MCP server
- [x] Query embedding works correctly
- [x] Results are sorted by relevance
- [x] Response format matches RFC
- [x] Tests pass (28 tests)
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 2 hours

- Created `src/tools/searchDocs.ts` with search_docs MCP tool
- SearchDocsInputSchema with query and optional top_k (1-50, default 10)
- searchDocs() handler with vector similarity search
- docsIndexNotFound() error factory for user-friendly errors
- searchDocsTool MCP definition (requiresConfirmation: false)
- Exported from tools/index.ts
- Created comprehensive test suite with 28 tests
- All 1189 tests passing

## Notes

- Very similar to search_code but uses DocsLanceDBStore
- Same embedding model (MiniLM 384-dim)
- No confirmation required (read-only)
- Consider caching recent query embeddings

## Blockers

_None_

## Related Tasks

- SMCP-017: search_code Tool (similar pattern)
- SMCP-028: Docs Index Manager (provides data)
- SMCP-013: Embedding Engine (generates vectors)
