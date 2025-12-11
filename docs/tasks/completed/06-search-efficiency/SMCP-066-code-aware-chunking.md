---
task_id: "SMCP-066"
title: "Implement Code-Aware Chunking"
category: "Technical"
priority: "P3"
status: "completed"
created_date: "2025-12-11"
completed_date: "2025-12-11"
due_date: ""
estimated_hours: 12
actual_hours: 4
assigned_to: "Team"
tags: ["search", "chunking", "ast", "quality", "optimization"]
---

# Task: Implement Code-Aware Chunking

## Overview

Current chunking splits code at fixed character boundaries (4000 chars) with overlap (800 chars), which can split functions, classes, or logical blocks mid-way. This task implements code-aware chunking that respects code structure, improving both search quality and token efficiency.

## Goals

- [x] Split code at semantic boundaries (functions, classes, methods)
- [x] Improve search result quality and coherence
- [x] Reduce need for large overlap (currently 20%)
- [x] Support major languages (TypeScript, JavaScript, Python)

## Success Criteria

- [x] Chunks align with code structure (no mid-function splits)
- [x] Search results are more coherent and complete
- [x] Reduced overlap requirement (from 20% to ~5%)
- [x] No degradation in search relevance
- [x] Backward compatible (opt-in or gradual rollout)

## Dependencies

**Blocked by:**

- None

**Related:**

- SMCP-063: Dedupe same-file results (completed)
- SMCP-064: Trim whitespace (completed)
- SMCP-065: Compact output format (completed)
- RFC: `docs/tasks/active/search-efficiency-improvements.md`

## Subtasks

### Phase 1: Research (2 hours)

- [x] 1.1 Evaluate tree-sitter for code parsing - SKIPPED (chose heuristic approach)
- [x] 1.2 Evaluate TypeScript compiler API - SKIPPED (chose heuristic approach)
- [x] 1.3 Evaluate heuristic approach - CHOSEN (simpler, smaller bundle)
- [x] 1.4 Document findings and recommendation

### Phase 2: Design (1 hour)

- [x] 2.1 Define chunk boundary rules
- [x] 2.2 Define language-specific configurations
- [x] 2.3 Design fallback strategy

### Phase 3: Implementation (6 hours)

- [x] 3.1 Create `codeAwareChunking.ts` module
- [x] 3.2 Implement TypeScript/JavaScript chunking
- [x] 3.3 Implement Python chunking
- [x] 3.4 Integrate with existing chunking engine
- [x] 3.5 Handle edge cases

### Phase 4: Testing (3 hours)

- [x] 4.1 Unit tests for code-aware chunking (29 tests)
- [x] 4.2 Integration tests (via chunkFileWithStrategy)
- [x] 4.3 Search quality evaluation
- [x] 4.4 Update benchmarks

## Implementation Details

### Approach

Used heuristic-based regex pattern matching instead of tree-sitter to:
- Keep bundle size small (no native dependencies)
- Avoid complex AST parsing
- Enable easy extension to new languages

### Supported Boundaries

**TypeScript/JavaScript:**
- Function declarations (async, regular, arrow)
- Class declarations
- Interface declarations
- Type declarations
- Enum declarations
- Export statements
- Variable declarations

**Python:**
- Function definitions (def, async def)
- Class definitions
- Decorated functions/classes

### Files Created/Modified

- `src/engines/codeAwareChunking.ts` - New module with heuristic-based chunking
- `src/engines/chunking.ts` - Added `chunkFileWithStrategy()` function
- `src/engines/index.ts` - Exported new types and functions
- `src/storage/config.ts` - Added `chunkingStrategy` config option

### Config Option

```json
{
  "chunkingStrategy": "character" | "code-aware"
}
```

Default: `"character"` (for backward compatibility)

### Tests Added

- `tests/unit/engines/codeAwareChunking.test.ts` - 29 tests covering:
  - Language detection
  - TypeScript/JavaScript boundary detection
  - Python boundary detection
  - Edge cases and fallback behavior

## Progress Log

### 2025-12-11 - 4 hours

- [x] Created codeAwareChunking.ts module
- [x] Implemented heuristic-based boundary detection
- [x] Added config option for chunking strategy
- [x] Integrated with existing chunking engine
- [x] Added 29 unit tests (all passing)
- [x] Updated CHANGELOG.md
- [x] All 1974 tests passing

## Related Tasks

- SMCP-063: Dedupe same-file results (completed)
- SMCP-064: Trim whitespace (completed)
- SMCP-065: Compact output format (completed)
