# Search Efficiency Improvements RFC

## Problem Statement

Current MCP search is **17.7x more efficient than Grep** but only **1.6x more efficient than optimal Drag-and-Drop**. This gap is smaller than expected because:

1. Chunks are large (~4000 chars / ~1000 tokens each)
2. Same file can appear multiple times in results (redundant tokens)
3. Output includes verbose metadata
4. Chunks don't align with code semantics (functions/classes)

## Benchmark Data (Measured)

From `tests/benchmarks/search-comparison.test.ts`:

| Query | MCP Tokens | D&D Tokens | MCP vs D&D |
|-------|------------|------------|------------|
| File watching | 9,421 | 18,638 | 2.0x |
| Error handling | 8,579 | 2,764 | **0.3x** (D&D wins) |
| LanceDB search | 9,172 | 16,235 | 1.8x |
| Security | 5,875 | 15,948 | 2.7x |
| Configuration | 6,390 | 9,166 | 1.4x |
| **TOTAL** | **39,437** | **62,751** | **1.6x** |

**Key observation**: MCP returns ~8,000 tokens per query (10 chunks × ~800 tokens). Even when the answer is in a single small file (Query 2: errors/index.ts at 2,764 tokens), MCP returns 3x more.

## Proposed Improvements

### 1. Dedupe Same-File Results

**Current behavior**: If a query matches multiple chunks in the same file, all chunks are returned separately.

**Example** (Query: "error handling patterns"):
```
Result 2: src/errors/index.ts (lines 317-355) - 1,500 chars
Result 5: src/errors/index.ts (lines 1-142)   - 5,600 chars
```

**Problem**: Same file appears twice, wasting tokens on file path repetition and potentially overlapping content.

**Proposed solution**: Group results by file path and merge adjacent/overlapping chunks.

```typescript
interface MergedResult {
  path: string;
  chunks: Array<{
    text: string;
    startLine: number;
    endLine: number;
    score: number;
  }>;
  bestScore: number;      // Highest score among chunks
  totalChars: number;     // Combined size
}
```

**Implementation options**:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A. Merge all | Combine all chunks from same file into one result | Maximum deduplication | May include less relevant portions |
| B. Best chunk only | Keep only highest-scoring chunk per file | Simple, predictable size | May miss relevant code in other chunks |
| C. Smart merge | Merge if chunks are adjacent/overlapping, otherwise keep separate | Best of both worlds | More complex logic |

**Recommended**: Option C (Smart merge)

**Estimated savings**: ~20-30% token reduction

---

### 2. Trim Whitespace

**Current behavior**: Chunks include leading/trailing blank lines from source code.

**Example**:
```typescript
// Chunk starts here

/**
 * Some function
 */
function foo() {
  // ...
}

// Chunk ends here

```

**Proposed solution**: Trim leading/trailing blank lines from chunk text before returning.

```typescript
function trimChunk(text: string): string {
  return text.replace(/^\s*\n/, '').replace(/\n\s*$/, '');
}
```

**Estimated savings**: ~5-10% token reduction

---

### 3. Compact Output Format

**Current output**:
```json
{
  "results": [
    {
      "path": "src/errors/index.ts",
      "text": "...",
      "score": 0.516,
      "startLine": 317,
      "endLine": 355
    }
  ],
  "totalResults": 10,
  "searchTimeMs": 15
}
```

**Proposed compact format**:
```json
{
  "results": [
    {
      "loc": "src/errors/index.ts:317-355",
      "text": "...",
      "score": 0.52
    }
  ],
  "count": 10,
  "ms": 15
}
```

**Changes**:
- Combine path + lines into single `loc` field
- Round scores to 2 decimal places
- Shorter field names

**Estimated savings**: ~5% token reduction (mostly from repeated field names across 10 results)

**Note**: This is a breaking change. Could be opt-in via `compact: true` parameter.

---

### 4. Code-Aware Chunking

**Current behavior**: Chunks split at character boundaries with fixed size (4000 chars) and overlap (800 chars).

**Problem**: Chunks may split in the middle of functions, classes, or logical blocks.

**Example of bad split**:
```typescript
// Chunk 1 ends here:
function processFile(path: string) {
  const content = fs.readFileSync(path);
  // Chunk boundary splits the function!

// Chunk 2 starts here:
  const parsed = parse(content);
  return transform(parsed);
}
```

**Proposed solution**: Use AST-aware or heuristic-based splitting:

1. **Heuristic approach** (simpler):
   - Prefer splitting at double newlines (`\n\n`)
   - Prefer splitting at function/class declaration boundaries
   - Avoid splitting inside block scopes

2. **AST approach** (more accurate):
   - Parse code with tree-sitter or TypeScript compiler
   - Extract top-level declarations as natural chunks
   - Merge small declarations, split large ones

**Implementation complexity**: Medium-High

**Estimated savings**: Variable, but improves result quality significantly

---

## Priority Matrix

| Improvement | Effort | Impact | Priority | Status |
|-------------|--------|--------|----------|--------|
| Dedupe same-file | Medium | High (~25% savings) | **P1** | DONE |
| Trim whitespace | Low | Medium (~7% savings) | **P1** | DONE |
| Compact output | Low | Low (~5% savings) | **P2** | DONE |
| Code-aware chunking | High | High (quality + savings) | **P3** | DONE |

## Implementation Plan

### Phase 1: Quick Wins (P1) - COMPLETED (2024-12-11)
1. [x] Add `trimChunkWhitespace()` utility
2. [x] Implement same-file deduplication in `searchCode.ts` and `searchDocs.ts`
3. [x] Update benchmarks to measure improvement

**Results:**
- Before: 39,437 total MCP tokens (1.6x vs D&D)
- After: 36,541 total MCP tokens (1.7x vs D&D)
- **Improvement: 7.3% token reduction**

Implementation files:
- `src/utils/searchResultProcessing.ts` - New utility module
- `src/tools/searchCode.ts` - Uses `processSearchResults()`
- `src/tools/searchDocs.ts` - Uses `processSearchResults()`
- `tests/unit/utils/searchResultProcessing.test.ts` - 37 unit tests

### Phase 2: Output Optimization (P2) - COMPLETED (2025-12-11)
1. [x] Add `compact` parameter to search tools
2. [x] Implement compact output format
3. [x] Document the new format

Implementation files:
- `src/tools/searchCode.ts` - Added compact parameter
- `src/tools/searchDocs.ts` - Added compact parameter
- `src/utils/searchResultProcessing.ts` - Added formatCompactResult/Output functions

### Phase 3: Chunking Improvements (P3) - COMPLETED (2025-12-11)
1. [x] Research tree-sitter integration - Chose heuristic approach instead
2. [x] Prototype code-aware chunking for TypeScript/JavaScript
3. [x] Evaluate impact on search quality
4. [x] Roll out for supported languages (TS/JS, Python)

Implementation files:
- `src/engines/codeAwareChunking.ts` - Heuristic-based boundary detection
- `src/engines/chunking.ts` - Added chunkFileWithStrategy()
- `src/storage/config.ts` - Added chunkingStrategy config option

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| MCP vs D&D ratio | 1.6x | 3.0x+ |
| Avg tokens per query | ~8,000 | ~4,000 |
| Same-file duplicates | Common | Rare |

## Open Questions

1. Should deduplication be opt-in or default?
2. How to handle merged chunks in the UI (show as expandable sections?)
3. Should compact format be the new default or require opt-in?
4. Which languages to support for code-aware chunking first?

## Related Files

- `src/tools/searchCode.ts` - Main search implementation
- `src/tools/searchDocs.ts` - Docs search (similar changes needed)
- `src/engines/chunking.ts` - Current chunking logic
- `tests/benchmarks/search-comparison.test.ts` - Benchmarks to update

## References

- Benchmark results: `tests/benchmarks/results.json`
- Comparison document: `docs/search-comparison-test.md`
