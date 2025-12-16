---
task_id: "SMCP-090"
title: "Symbol Extraction & Complexity Metrics"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 12
actual_hours: 0
assigned_to: "Team"
tags: ["analysis", "symbols", "complexity", "llm-context", "inspired-by-code-index-mcp"]
---

# Task: Symbol Extraction & Complexity Metrics

## Overview

Implement symbol extraction and complexity metrics for files, inspired by code-index-mcp. This adds a `get_file_summary` capability that provides LLM-friendly summaries including functions, classes, imports, exports, and complexity scores. Valuable for AI assistants to understand code structure without reading entire files.

## Goals

- [ ] Extract symbols from code files (functions, classes, imports, exports)
- [ ] Calculate complexity metrics per file
- [ ] Expose via new MCP tool `get_file_summary`
- [ ] Support at least 5 major languages
- [ ] Keep extraction fast (< 100ms per file)

## Success Criteria

- `get_file_summary` returns structured symbol list
- Includes: functions, classes, imports, exports, line counts
- Complexity score correlates with actual code complexity
- Works for JS/TS, Python, Go, Java, Rust
- Response time < 100ms for typical files

## Dependencies

**Blocked by:**

- SMCP-086: AST-Based Chunking (shares Tree-sitter infrastructure)

**Blocks:**

- None

**Related:**

- SMCP-086: AST-Based Chunking

## Subtasks

### Phase 1: Design (2 hours)

- [ ] 1.1 Study code-index-mcp's get_file_summary implementation
    - Document returned fields
    - Understand complexity calculation
- [ ] 1.2 Design FileSummary interface
    ```typescript
    interface FileSummary {
      path: string;
      language: string;
      lines: number;
      functions: SymbolInfo[];
      classes: SymbolInfo[];
      imports: string[];
      exports: string[];
      complexity: number;
    }
    ```
- [ ] 1.3 Define complexity metrics
    - Cyclomatic complexity
    - Lines of code
    - Nesting depth
    - Number of dependencies

### Phase 2: Symbol Extraction (5 hours)

- [ ] 2.1 Create `src/engines/symbolExtractor.ts`
    - Reuse Tree-sitter from SMCP-086
    - Define extraction queries per language
- [ ] 2.2 Implement function extraction
    - Name, signature, line range
    - Parameters and return type (if available)
- [ ] 2.3 Implement class extraction
    - Name, methods, properties
    - Inheritance info
- [ ] 2.4 Implement import/export extraction
    - Module imports
    - Named exports
    - Default exports

### Phase 3: Complexity Metrics (2 hours)

- [ ] 3.1 Implement cyclomatic complexity
    - Count decision points (if, while, for, &&, ||)
    - Per-function and file-level
- [ ] 3.2 Implement nesting depth
    - Track max nesting level
- [ ] 3.3 Implement overall complexity score
    - Weighted combination of metrics
    - Normalize to 0-100 scale

### Phase 4: MCP Tool Integration (2 hours)

- [ ] 4.1 Create `get_file_summary` MCP tool
    - Accept file path as input
    - Return FileSummary response
- [ ] 4.2 Add caching for repeated requests
    - Cache based on file hash
    - Invalidate on file change
- [ ] 4.3 Document tool in README

### Phase 5: Testing (1 hour)

- [ ] 5.1 Unit tests for symbol extraction
- [ ] 5.2 Unit tests for complexity calculation
- [ ] 5.3 Integration tests for MCP tool

## Resources

- [code-index-mcp file analysis](../../../examples/code-index-mcp-master/)
- [Tree-sitter queries](https://tree-sitter.github.io/tree-sitter/using-parsers#query-syntax)
- [Cyclomatic complexity](https://en.wikipedia.org/wiki/Cyclomatic_complexity)
- [Examples comparison analysis](../../examples-comparison-analysis.md)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced
- [ ] MCP tool works correctly

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on examples comparison analysis
- Inspired by code-index-mcp's get_file_summary

## Notes

- code-index-mcp provides rich file analysis for LLM consumption
- Complexity metrics help LLMs prioritize which code to examine
- Can reuse Tree-sitter infrastructure from SMCP-086
- Consider adding dependency graph in future iteration
- This is valuable for "understand this file" type queries

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-086: AST-Based Chunking - shares Tree-sitter infrastructure
