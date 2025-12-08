---
task_id: "SMCP-012"
title: "Chunking Engine"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "blakazulu"
tags: ["engines", "chunking", "text-processing"]
---

# Task: Chunking Engine

## Overview

Implement text chunking for splitting source files into indexable segments. Uses recursive character text splitting with configurable chunk size and overlap. Tracks line numbers for each chunk to enable navigation.

## Goals

- [ ] Split files into ~1000 token chunks
- [ ] Maintain ~200 token overlap between chunks
- [ ] Track start/end line numbers for each chunk
- [ ] Use natural break points (paragraphs, lines)

## Success Criteria

- Chunks are ~1000 tokens (±20%)
- Overlap preserves context across boundaries
- Line numbers correctly map to source file
- All separators from RFC are supported

## Dependencies

**Blocked by:**

- SMCP-003: Error Handling System
- SMCP-004: Hash Utilities

**Blocks:**

- SMCP-014: Index Manager

**Related:**

- SMCP-009: LanceDB Store (stores chunks)

## Subtasks

### Phase 1: Chunk Structure (0.25 hours)

- [ ] 1.1 Define chunk interface
    ```typescript
    interface Chunk {
      id: string;          // UUIDv4
      text: string;        // Chunk content
      path: string;        // Source file path (relative)
      startLine: number;   // Starting line number (1-based)
      endLine: number;     // Ending line number (1-based)
      contentHash: string; // SHA256 of source file content
    }
    ```

### Phase 2: Text Splitter (1.5 hours)

- [ ] 2.1 Implement recursive text splitter
    ```typescript
    interface SplitOptions {
      chunkSize: number;      // Target size in characters (~4000)
      chunkOverlap: number;   // Overlap size (~800)
      separators: string[];   // Split priority order
    }

    const DEFAULT_OPTIONS: SplitOptions = {
      chunkSize: 4000,        // ~1000 tokens
      chunkOverlap: 800,      // ~200 tokens
      separators: ['\n\n', '\n', ' ', ''],
    };
    ```

- [ ] 2.2 Implement split algorithm
    ```typescript
    function splitText(text: string, options?: Partial<SplitOptions>): string[]
    // Recursively splits using separators in priority order
    // First tries paragraph breaks, then lines, then spaces
    // Falls back to character split if needed
    ```

- [ ] 2.3 Handle edge cases
    - Empty files → return empty array
    - Single line files → single chunk if under size
    - Very long lines → split at character boundary

### Phase 3: Line Number Tracking (0.75 hours)

- [ ] 3.1 Implement line number calculation
    ```typescript
    interface ChunkWithLines {
      text: string;
      startLine: number;
      endLine: number;
    }

    function splitWithLineNumbers(
      text: string,
      options?: Partial<SplitOptions>
    ): ChunkWithLines[]
    // Tracks which lines each chunk covers
    ```

- [ ] 3.2 Handle overlap line counting
    - Overlapping text belongs to multiple chunks
    - Each chunk should have accurate start/end lines

### Phase 4: File Chunking Function (0.25 hours)

- [ ] 4.1 Implement file chunking
    ```typescript
    async function chunkFile(
      absolutePath: string,
      relativePath: string
    ): Promise<Chunk[]>
    // Reads file, splits into chunks
    // Assigns UUIDs to each chunk
    // Includes file content hash
    ```

- [ ] 4.2 Generate UUIDs for chunks
    - Use uuid v4 for unique chunk IDs

### Phase 5: Export & Tests (0.25 hours)

- [ ] 5.1 Export from `src/engines/chunking.ts`

- [ ] 5.2 Write unit tests
    - Test chunk size bounds
    - Test overlap presence
    - Test line number accuracy
    - Test separator priority
    - Test edge cases (empty, single line, very long)

## Resources

- `docs/ENGINEERING.RFC.md` Section 5.3: Chunking Engine
- LangChain RecursiveCharacterTextSplitter (reference implementation)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Chunks are within size bounds
- [ ] Overlap works correctly
- [ ] Line numbers are accurate
- [ ] All separators are tried in order
- [ ] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Token count approximation: 1 token ≈ 4 characters
- Separators tried in order: paragraph → line → space → character
- Line numbers are 1-based (first line is 1)
- Consider adding language-aware splitting in future (AST-based)

## Blockers

_None yet_

## Related Tasks

- SMCP-013: Embedding Engine converts chunks to vectors
- SMCP-014: Index Manager orchestrates chunking
