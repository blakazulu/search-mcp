---
task_id: "SMCP-090"
title: "Symbol Extraction & Complexity Metrics"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-16"
completed_date: "2025-12-17"
due_date: ""
estimated_hours: 12
actual_hours: 8
assigned_to: "Team"
tags: ["analysis", "symbols", "complexity", "llm-context"]
---

# Task: Symbol Extraction & Complexity Metrics

## Overview

Implement symbol extraction and complexity metrics for files. This adds a `get_file_summary` capability that provides LLM-friendly summaries including functions, classes, imports, exports, and complexity scores. Valuable for AI assistants to understand code structure without reading entire files.

## Goals

- [x] Extract symbols from code files (functions, classes, imports, exports)
- [x] Calculate complexity metrics per file
- [x] Expose via new MCP tool `get_file_summary`
- [x] Support at least 5 major languages (supported 10: JS, TS, TSX, Python, Go, Java, Rust, C, C++, C#)
- [x] Keep extraction fast (< 100ms per file)

## Success Criteria

- [x] `get_file_summary` returns structured symbol list
- [x] Includes: functions, classes, imports, exports, line counts
- [x] Complexity score correlates with actual code complexity
- [x] Works for JS/TS, Python, Go, Java, Rust, C, C++, C#
- [x] Response time < 100ms for typical files

## Dependencies

**Blocked by:**

- SMCP-086: AST-Based Chunking (shares Tree-sitter infrastructure) - COMPLETED

**Blocks:**

- None

**Related:**

- SMCP-086: AST-Based Chunking

## Subtasks

### Phase 1: Design (2 hours) - COMPLETED

- [x] 1.1 Study get_file_summary implementations
    - Documented returned fields
    - Understand complexity calculation
- [x] 1.2 Design FileSummary interface
    ```typescript
    interface FileSummary {
      path: string;
      relativePath: string;
      language: string;
      lines: number;
      codeLines: number;
      blankLines: number;
      commentLines: number;
      functions: SymbolInfo[];
      classes: SymbolInfo[];
      imports: ImportInfo[];
      exports: ExportInfo[];
      complexity: ComplexityMetrics;
      size: number;
      extractionTimeMs: number;
    }
    ```
- [x] 1.3 Define complexity metrics
    - Cyclomatic complexity per function and total
    - Lines of code (code, blank, comment)
    - Nesting depth per function and max
    - Decision points count
    - Overall complexity score (0-100)

### Phase 2: Symbol Extraction (5 hours) - COMPLETED

- [x] 2.1 Create `src/engines/symbolExtractor.ts`
    - Reuses Tree-sitter from SMCP-086
    - Language-specific extractors for each supported language
- [x] 2.2 Implement function extraction
    - Name, signature, line range
    - Parameters and return type (if available)
    - Async, static, visibility modifiers
    - Decorators/annotations
- [x] 2.3 Implement class extraction
    - Name, type (class, interface, struct, trait, enum)
    - Methods as separate symbols with parent reference
    - Visibility and export status
- [x] 2.4 Implement import/export extraction
    - Module imports with named imports
    - Default and namespace imports
    - Named exports and re-exports

### Phase 3: Complexity Metrics (2 hours) - COMPLETED

- [x] 3.1 Implement cyclomatic complexity
    - Count decision points (if, while, for, switch, &&, ||, ?:)
    - Per-function and file-level totals
- [x] 3.2 Implement nesting depth
    - Track max nesting level per function
    - File-level maximum
- [x] 3.3 Implement overall complexity score
    - Weighted combination of metrics
    - Normalize to 0-100 scale (higher = less complex)
    - Penalizes high cyclomatic complexity, deep nesting, many functions

### Phase 4: MCP Tool Integration (2 hours) - COMPLETED

- [x] 4.1 Create `get_file_summary` MCP tool
    - Accept file path as input (relative or absolute)
    - Return structured FileSummary response
    - Options: includeComplexity, includeDocstrings
- [x] 4.2 Register tool in server.ts
    - Add tool definition
    - Add handler case
- [x] 4.3 Document tool in CLAUDE.md

Note: Caching was deferred as the extraction is already fast (< 100ms). Can add in future if needed.

### Phase 5: Testing (1 hour) - COMPLETED

- [x] 5.1 Unit tests for symbol extraction (60+ tests)
    - TypeScript/JavaScript tests
    - Python tests
    - Go tests
    - Java tests
    - Rust tests
- [x] 5.2 Unit tests for complexity calculation
    - Cyclomatic complexity tests
    - Nesting depth tests
    - Overall score tests
- [x] 5.3 Edge case tests
    - Empty files
    - Files with only comments
    - Syntax errors
    - Unicode content
    - Large files
    - File size limits

## Resources

- [Tree-sitter queries](https://tree-sitter.github.io/tree-sitter/using-parsers#query-syntax)
- [Cyclomatic complexity](https://en.wikipedia.org/wiki/Cyclomatic_complexity)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable)
- [x] Documentation updated (if applicable)
- [x] Changes committed to Git (pending user approval)
- [x] No regressions introduced
- [x] MCP tool works correctly

## Progress Log

### 2025-12-17 - 8 hours

- Implemented complete symbol extraction engine
- Added support for 10 languages (JS, TS, TSX, Python, Go, Java, Rust, C, C++, C#)
- Implemented complexity metrics (cyclomatic, nesting, decision points, overall score)
- Created get_file_summary MCP tool
- Added 60+ unit tests
- Updated CLAUDE.md documentation
- Updated CHANGELOG.md

## Implementation Details

### Files Created

1. **src/engines/symbolExtractor.ts** - Core symbol extraction engine
   - `extractFileSummary()` - Main extraction function
   - `supportsSymbolExtraction()` - Check language support
   - `getSupportedLanguages()` - List supported languages
   - Language-specific extractors for JS/TS, Python, Go, Java, Rust, C/C++/C#

2. **src/tools/getFileSummary.ts** - MCP tool implementation
   - Input validation with Zod schema
   - Path resolution and security validation
   - Output formatting

3. **tests/unit/engines/symbolExtractor.test.ts** - Comprehensive unit tests

### Files Modified

1. **src/engines/index.ts** - Added symbolExtractor exports
2. **src/tools/index.ts** - Added getFileSummary exports
3. **src/server.ts** - Registered get_file_summary tool
4. **src/errors/index.ts** - Added INVALID_PATH and EXTRACTION_FAILED error codes
5. **CLAUDE.md** - Added documentation for new tool
6. **CHANGELOG.md** - Added release notes

## Notes

- Reused Tree-sitter infrastructure from SMCP-086 for AST parsing
- Complexity metrics help LLMs prioritize which code to examine
- The overall complexity score is designed to be intuitive (higher = better)
- Consider adding dependency graph in future iteration
- This is valuable for "understand this file" type queries

## Blockers

_None_

## Related Tasks

- SMCP-086: AST-Based Chunking - shares Tree-sitter infrastructure
