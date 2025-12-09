---
task_id: "SMCP-027"
title: "Docs Chunking Config"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 0
assigned_to: "blakazulu"
tags: ["engines", "chunking", "docs"]
---

# Task: Docs Chunking Config

## Overview

Create prose-optimized chunking configuration and helper functions for documentation files. Uses larger chunks and more overlap than code to preserve context in prose content.

## Goals

- [ ] Define DOC_SPLIT_OPTIONS with prose-optimized parameters
- [ ] Create isDocFile() helper function
- [ ] Create chunkDocFile() convenience function
- [ ] Export doc file patterns constant

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

- [ ] 1.1 Create `src/engines/docsChunking.ts`

- [ ] 1.2 Define prose-optimized parameters
    ```typescript
    export const DOC_SPLIT_OPTIONS: SplitOptions = {
      chunkSize: 8000,     // ~2000 tokens (larger for prose)
      chunkOverlap: 2000,  // ~500 tokens (more overlap)
      separators: ['\n\n', '\n', '. ', ' ', ''],
    };
    ```

- [ ] 1.3 Define doc file patterns
    ```typescript
    export const DOC_FILE_EXTENSIONS = ['.md', '.txt'];
    export const DOC_FILE_PATTERNS = ['**/*.md', '**/*.txt'];
    ```

- [ ] 1.4 Create isDocFile() helper
    ```typescript
    export function isDocFile(relativePath: string): boolean {
      const ext = path.extname(relativePath).toLowerCase();
      return DOC_FILE_EXTENSIONS.includes(ext);
    }
    ```

- [ ] 1.5 Create chunkDocFile() convenience function
    ```typescript
    export async function chunkDocFile(
      absolutePath: string,
      relativePath: string
    ): Promise<Chunk[]> {
      return chunkFile(absolutePath, relativePath, DOC_SPLIT_OPTIONS);
    }
    ```

### Phase 2: Tests (0.5 hours)

- [ ] 2.1 Create `src/engines/__tests__/docsChunking.test.ts`
    - Test isDocFile() with various extensions
    - Test DOC_SPLIT_OPTIONS values
    - Test chunkDocFile() uses correct params

- [ ] 2.2 Test chunk sizes
    - Verify chunks are larger than code chunks
    - Verify overlap is larger

## Resources

- `src/engines/chunking.ts` - Base implementation
- `docs/ENGINEERING.RFC.md` Section 3.2.1: Chunking differences

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] DOC_SPLIT_OPTIONS matches RFC spec
- [ ] isDocFile() correctly identifies .md and .txt
- [ ] chunkDocFile() creates larger chunks
- [ ] Tests pass
- [ ] Exported from `src/engines/index.ts`

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Chunk size: 8000 chars (~2000 tokens) vs 4000 for code
- Overlap: 2000 chars (~500 tokens) vs 800 for code
- Added `. ` separator for sentence boundaries in prose

## Blockers

_None yet_

## Related Tasks

- SMCP-012: Chunking Engine (base)
- SMCP-028: Docs Index Manager (consumer)
