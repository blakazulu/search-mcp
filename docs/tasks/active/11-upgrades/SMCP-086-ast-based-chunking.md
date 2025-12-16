---
task_id: "SMCP-086"
title: "AST-Based Chunking with Rich Metadata"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 24
actual_hours: 0
assigned_to: "Team"
tags: ["chunking", "ast", "tree-sitter", "metadata", "inspired-by-claude-context-local"]
---

# Task: AST-Based Chunking with Rich Metadata

## Overview

Implement AST-based chunking using Tree-sitter to replace/augment character-based chunking. Inspired by claude-context-local which extracts rich metadata including function signatures, docstrings, decorators, and parent-child relationships. This enables better search ranking and more meaningful code snippets.

## Goals

- [ ] Integrate Tree-sitter for multi-language AST parsing
- [ ] Extract function/class boundaries for semantic chunking
- [ ] Capture rich metadata (signatures, docstrings, decorators)
- [ ] Track parent-child relationships (methods within classes)
- [ ] Generate semantic tags for each chunk
- [ ] Maintain fallback to character-based chunking

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

- [ ] 1.1 Research Tree-sitter packages for Node.js
    - Evaluate `tree-sitter` vs `web-tree-sitter`
    - Check language grammar availability
- [ ] 1.2 Add Tree-sitter dependencies
    - Core parser
    - Language grammars (JS, TS, Python, Go, Java, Rust)
- [ ] 1.3 Create `src/engines/treeSitterParser.ts`
    - Initialize parser with language grammars
    - Implement language detection
    - Handle parser errors gracefully

### Phase 2: AST Chunk Extraction (8 hours)

- [ ] 2.1 Create `src/engines/astChunking.ts`
    - Define ChunkMetadata interface
    - Implement AST traversal
- [ ] 2.2 Implement language-specific extractors
    - JavaScript/TypeScript: functions, classes, methods, exports
    - Python: functions, classes, methods, decorators
    - Go: functions, structs, methods, interfaces
    - Java: classes, methods, interfaces
    - Rust: functions, structs, impl blocks, traits
- [ ] 2.3 Extract rich metadata per chunk
    - Name and signature
    - Docstring/comments
    - Decorators/annotations
    - Start/end line numbers
    - Parent context (class name for methods)
- [ ] 2.4 Generate semantic tags
    - async, export, public/private, static, etc.

### Phase 3: Chunking Strategy Integration (5 hours)

- [ ] 3.1 Update `src/engines/chunking.ts`
    - Add AST chunking as primary strategy
    - Implement fallback to character-based
- [ ] 3.2 Handle edge cases
    - Very large functions (split if needed)
    - Files with no semantic boundaries
    - Mixed content files
- [ ] 3.3 Update LanceDB schema
    - Add metadata fields to vector table
    - Migrate existing indexes (or document reindex requirement)

### Phase 4: Testing & Performance (3 hours)

- [ ] 4.1 Write unit tests for each language
- [ ] 4.2 Write integration tests
- [ ] 4.3 Benchmark indexing performance
- [ ] 4.4 Test fallback behavior

### Phase 5: Documentation (2 hours)

- [ ] 5.1 Update CLAUDE.md with AST chunking details
- [ ] 5.2 Document supported languages and metadata
- [ ] 5.3 Update CHANGELOG.md

## Resources

- [claude-context-local AST chunking](../../../examples/claude-context-local-main/)
- [mcp-vector-search parsers](../../../examples/mcp-vector-search-main/src/parsers/)
- [Tree-sitter Node.js](https://github.com/tree-sitter/node-tree-sitter)
- [web-tree-sitter](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web)
- [Current chunking.ts](../../../src/engines/chunking.ts)
- [Examples comparison analysis](../../examples-comparison-analysis.md)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced
- [ ] 5+ languages supported with AST

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on examples comparison analysis
- Inspired by claude-context-local's AST-based chunking

## Notes

- claude-context-local uses custom Python AST for Python, Tree-sitter for others
- mcp-vector-search has 8 language parsers we can reference
- Consider WASM-based Tree-sitter for cross-platform compatibility
- Rich metadata enables better ranking (SMCP-087)
- May need to update LanceDB schema - document migration path

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-087: Multi-Factor Ranking - uses metadata for ranking
- SMCP-090: Symbol Extraction - shares Tree-sitter infrastructure
