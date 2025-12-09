---
task_id: "SMCP-027"
title: "Docs Chunking Config"
category: "Technical"
priority: "P1"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 1
assigned_to: "blakazulu"
tags: ["engines", "chunking", "docs"]
---

# Task: Docs Chunking Config

## Overview

Create prose-optimized chunking configuration and helper functions for documentation files. Uses larger chunks and more overlap than code to preserve context in prose content.

## Goals

- [x] Define DOC_SPLIT_OPTIONS with prose-optimized parameters
- [x] Create isDocFile() helper function
- [x] Create chunkDocFile() convenience function
- [x] Export doc file patterns constant

## Success Criteria

- Prose-optimized chunking parameters defined
- Doc file detection works correctly
- chunkDocFile() uses correct parameters
- All parameters match ENGINEERING.RFC.md spec

## Dependencies

**Blocked by:**

- SMCP-012: Chunking Engine (completed - use as base)

**Blocks:**

- SMCP-028: Docs Index Manager

**Related:**

- SMCP-012: Chunking Engine (base implementation)

## Subtasks

### Phase 1: Create Docs Chunking Module (0.5 hours)

- [x] 1.1 Create `src/engines/docsChunking.ts`

- [x] 1.2 Define prose-optimized parameters
    ```typescript
    export const DOC_SPLIT_OPTIONS: SplitOptions = {
      chunkSize: 8000,     // ~2000 tokens (larger for prose)
      chunkOverlap: 2000,  // ~500 tokens (more overlap)
      separators: ['\n\n', '\n', '. ', ' ', ''],
    };
    ```

- [x] 1.3 Define doc file patterns
    ```typescript
    export const DOC_FILE_EXTENSIONS = ['.md', '.txt'];
    export const DOC_FILE_PATTERNS = ['**/*.md', '**/*.txt'];
    ```

- [x] 1.4 Create isDocFile() helper
    ```typescript
    export function isDocFile(relativePath: string): boolean {
      const ext = path.extname(relativePath).toLowerCase();
      return DOC_FILE_EXTENSIONS.includes(ext);
    }
    ```

- [x] 1.5 Create chunkDocFile() convenience function
    ```typescript
    export async function chunkDocFile(
      absolutePath: string,
      relativePath: string
    ): Promise<Chunk[]> {
      return chunkFile(absolutePath, relativePath, DOC_SPLIT_OPTIONS);
    }
    ```

### Phase 2: Tests (0.5 hours)

- [x] 2.1 Create `tests/unit/engines/docsChunking.test.ts`
    - Test isDocFile() with various extensions
    - Test DOC_SPLIT_OPTIONS values
    - Test chunkDocFile() uses correct params

- [x] 2.2 Test chunk sizes
    - Verify chunks are larger than code chunks
    - Verify overlap is larger

## Resources

- `src/engines/chunking.ts` - Base implementation
- `docs/ENGINEERING.RFC.md` Section 3.2.1: Chunking differences

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] DOC_SPLIT_OPTIONS matches RFC spec
- [x] isDocFile() correctly identifies .md and .txt
- [x] chunkDocFile() creates larger chunks
- [x] Tests pass (39 tests)
- [x] Exported from `src/engines/index.ts`

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1 hour

- Created `src/engines/docsChunking.ts` with prose-optimized settings
- DOC_SPLIT_OPTIONS: 8000 chars chunk size, 2000 overlap, sentence separators
- DOC_FILE_EXTENSIONS and DOC_FILE_PATTERNS constants
- isDocFile() helper for file type detection
- chunkDocFile() convenience function
- Created comprehensive test suite with 39 tests
- All tests passing

## Notes

- Chunk size: 8000 chars (~2000 tokens) vs 4000 for code
- Overlap: 2000 chars (~500 tokens) vs 800 for code
- Added `. ` separator for sentence boundaries in prose

## Blockers

_None_

## Related Tasks

- SMCP-012: Chunking Engine (base)
- SMCP-028: Docs Index Manager (consumer)
