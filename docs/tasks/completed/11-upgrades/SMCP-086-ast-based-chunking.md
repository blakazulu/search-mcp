---
task_id: "SMCP-086"
title: "AST-Based Chunking with Rich Metadata"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-16"
completed_date: "2025-12-16"
due_date: ""
estimated_hours: 24
actual_hours: 8
assigned_to: "Team"
tags: ["chunking", "ast", "tree-sitter", "metadata"]
---

# Task: AST-Based Chunking with Rich Metadata

## Overview

Implement AST-based chunking using Tree-sitter to replace/augment character-based chunking. Extract rich metadata including function signatures, docstrings, decorators, and parent-child relationships. This enables better search ranking and more meaningful code snippets.

## Goals

- [x] Integrate Tree-sitter for multi-language AST parsing
- [x] Extract function/class boundaries for semantic chunking
- [x] Capture rich metadata (signatures, docstrings, decorators)
- [x] Track parent-child relationships (methods within classes)
- [x] Generate semantic tags for each chunk
- [x] Maintain fallback to character-based chunking

## Success Criteria

- Chunks align with semantic code boundaries (functions, classes)
- Metadata includes: type, name, signature, docstring, parent
- Supports at least 5 major languages (JS/TS, Python, Go, Java, Rust)
- Fallback works for unsupported languages
- No performance regression (< 20% slower indexing)
- Search results show more complete, meaningful code snippets

## Dependencies

**Blocked by:**

- None

**Blocks:**

- SMCP-087: Multi-Factor Ranking (benefits from rich metadata)
- SMCP-090: Symbol Extraction (shares Tree-sitter infrastructure)

**Related:**

- SMCP-087: Multi-Factor Ranking
- SMCP-090: Symbol Extraction

## Subtasks

### Phase 1: Tree-sitter Integration (6 hours)

- [x] 1.1 Research Tree-sitter packages for Node.js
    - Evaluated `tree-sitter` vs `web-tree-sitter` - chose `web-tree-sitter` for WASM cross-platform compatibility
    - Used `tree-sitter-wasms` for pre-built language grammars
- [x] 1.2 Add Tree-sitter dependencies
    - Added `web-tree-sitter` (^0.26.3) - WASM parser
    - Added `tree-sitter-wasms` (^0.1.13) - 10+ language grammars
- [x] 1.3 Create `src/engines/treeSitterParser.ts`
    - Singleton pattern with lazy initialization
    - Language detection from file extensions
    - Graceful error handling with fallback

### Phase 2: AST Chunk Extraction (8 hours)

- [x] 2.1 Create `src/engines/astChunking.ts`
    - ChunkMetadata interface with 15+ fields
    - AST traversal with recursive descent
- [x] 2.2 Implement language-specific extractors
    - JavaScript/TypeScript/TSX: functions, classes, methods, exports
    - Python: functions, classes, methods, decorators, docstrings
    - Go: functions, structs, methods, interfaces
    - Java: classes, methods, interfaces, Javadoc
    - Rust: functions, structs, impl blocks, traits, doc comments
    - C/C++/C#: functions, classes, structs
- [x] 2.3 Extract rich metadata per chunk
    - Name and signature
    - Docstring/comments (language-specific parsing)
    - Decorators/annotations
    - Start/end line numbers
    - Parent context (class name for methods)
- [x] 2.4 Generate semantic tags
    - async, export, public/private, static, property, constructor, etc.

### Phase 3: Chunking Strategy Integration (5 hours)

- [x] 3.1 Update `src/engines/chunking.ts`
    - Added 'ast' as third strategy alongside 'character' and 'code-aware'
    - Fallback chain: ast -> code-aware -> character
- [x] 3.2 Handle edge cases
    - Large function splitting with configurable maxChunkSize (8000)
    - Module-level chunks for files without semantic boundaries
    - Graceful handling of parse failures
- [x] 3.3 Update LanceDB schema
    - Added 8 optional metadata fields to ChunkRecord
    - SearchResult now includes metadata when available
    - No migration needed (fields are optional)

### Phase 4: Testing & Performance (3 hours)

- [x] 4.1 Write unit tests for each language (43 tests)
- [x] 4.2 Write integration tests (graceful degradation)
- [x] 4.3 Benchmark indexing performance (< 20% regression)
- [x] 4.4 Test fallback behavior (tested via CI without WASM)

### Phase 5: Documentation (2 hours)

- [x] 5.1 Update CLAUDE.md with AST chunking details
- [x] 5.2 Document supported languages and metadata
- [x] 5.3 Update CHANGELOG.md

## Resources

- [Tree-sitter Node.js](https://github.com/tree-sitter/node-tree-sitter)
- [web-tree-sitter](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web)
- [Current chunking.ts](../../../src/engines/chunking.ts)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable)
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [x] No regressions introduced
- [x] 5+ languages supported with AST (10 languages!)

## Progress Log

### 2025-12-16 - 8 hours (COMPLETED)

- Researched and chose `web-tree-sitter` + `tree-sitter-wasms` for cross-platform WASM-based parsing
- Created `src/engines/treeSitterParser.ts` with singleton pattern and lazy loading
- Created `src/engines/astChunking.ts` with ChunkMetadata interface and language extractors
- Implemented extractors for 10 languages: JavaScript, TypeScript, TSX, Python, Go, Java, Rust, C, C++, C#
- Extracted metadata: name, signature, docstring, decorators, parent, tags, visibility, async, export, static
- Updated `src/engines/chunking.ts` with new 'ast' strategy and fallback chain
- Updated LanceDB schema with 8 optional metadata fields
- Wrote 43 unit tests covering all languages
- All 968 tests pass (4 skipped)
- Updated CLAUDE.md with chunking strategies and metadata documentation
- Updated CHANGELOG.md with feature details

## Notes

- Used WASM-based Tree-sitter for cross-platform compatibility
- Rich metadata enables better ranking (SMCP-087)
- No migration needed - metadata fields are optional in LanceDB schema

## Files Created/Modified

### New Files:
- `src/engines/treeSitterParser.ts` - Tree-sitter parser wrapper
- `src/engines/astChunking.ts` - AST chunking engine
- `tests/unit/engines/astChunking.test.ts` - 43 unit tests

### Modified Files:
- `src/engines/chunking.ts` - Added 'ast' strategy
- `src/engines/index.ts` - Added exports
- `src/storage/lancedb.ts` - Added metadata fields
- `CLAUDE.md` - Added chunking documentation
- `CHANGELOG.md` - Added feature entry
- `package.json` - Added dependencies

## Blockers

_None_

## Related Tasks

- SMCP-087: Multi-Factor Ranking - uses metadata for ranking
- SMCP-090: Symbol Extraction - shares Tree-sitter infrastructure
