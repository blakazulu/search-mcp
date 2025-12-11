# Search Comparison Test: MCP vs Manual vs Drag-and-Drop

This document presents **actual benchmark results** comparing three approaches:
1. **MCP semantic search** - AI uses `search_code` tool
2. **Manual Grep+Read** - AI searches with Grep, then reads files
3. **Drag-and-Drop** - User manually attaches files to AI chat

> **Note**: These results are from automated benchmarks. Run them yourself with:
> ```bash
> npx vitest run tests/benchmarks/search-comparison.test.ts
> ```

## Test Queries

| # | Query | Type | Description |
|---|-------|------|-------------|
| 1 | "how does file watching work" | Conceptual | Understanding a system concept |
| 2 | "error handling patterns" | Pattern | Finding code patterns |
| 3 | "LanceDB vector search" | Technical | Specific technology usage |
| 4 | "security vulnerabilities" | Broad | Security-related content |
| 5 | "configuration options" | Documentation | Finding config docs |

---

## Test Results

### Query 1: "how does file watching work"

#### MCP Results
- **Tool calls**: 1
- **Results returned**: 10 semantic chunks
- **Characters**: 37,683
- **Measured tokens**: 9,421
- **Search time**: 15-20ms (after model warmup)
- **Relevance**: HIGH - Direct matches for file watcher implementation, debouncing, event handling

#### Manual Results (Grep + Read)
- **Tool calls**: Would need 25+ (1 Grep + reading matched files)
- **Files matched**: 25
- **Total matches**: 607 occurrences
- **Characters**: 420,109
- **Measured tokens**: 105,027
- **Relevance**: MEDIUM - Need to manually select which files to read

#### Drag-and-Drop Results
- **User effort**: HIGH - Must know which files to attach
- **Files to attach**: fileWatcher.ts, integrity.ts, strategyOrchestrator.ts
- **Characters**: 74,553
- **Measured tokens**: 18,638
- **Relevance**: HIGH (if correct files chosen) / LOW (if wrong files chosen)
- **Problem**: User must already know where file watching is implemented

---

### Query 2: "error handling patterns"

#### MCP Results
- **Tool calls**: 1
- **Results returned**: 10 semantic chunks
- **Characters**: 34,314
- **Measured tokens**: 8,579
- **Search time**: 16ms
- **Relevance**: HIGH - Found MCPError class, wrapError(), error factories, test patterns

#### Manual Results (Grep + Read)
- **Tool calls**: Would need 43+ (1 Grep + reading matched files)
- **Files matched**: 43
- **Total matches**: 2,185 occurrences
- **Characters**: 665,473
- **Measured tokens**: 166,368
- **Relevance**: LOW - Too many matches, high noise ratio

#### Drag-and-Drop Results
- **User effort**: HIGH - Error handling is scattered across codebase
- **Files to attach**: errors/index.ts (primary error definitions)
- **Characters**: 11,056
- **Measured tokens**: 2,764
- **Relevance**: MEDIUM - Only covers error definitions, misses usage patterns
- **Problem**: Error patterns exist in 43 files - impractical to attach all

---

### Query 3: "LanceDB vector search"

#### MCP Results
- **Tool calls**: 1
- **Results returned**: 10 semantic chunks
- **Characters**: 36,689
- **Measured tokens**: 9,172
- **Search time**: 18ms
- **Relevance**: HIGH - Found LanceDB store implementation, search functions, tests

#### Manual Results (Grep + Read)
- **Tool calls**: Would need 42+ (1 Grep + reading matched files)
- **Files matched**: 42
- **Total matches**: 1,041 occurrences
- **Characters**: 574,404
- **Measured tokens**: 143,601
- **Relevance**: MEDIUM - Keyword matches but includes package.json, changelogs, etc.

#### Drag-and-Drop Results
- **User effort**: MEDIUM - LanceDB files are more concentrated
- **Files to attach**: lancedb.ts, docsLancedb.ts, searchCode.ts, searchDocs.ts
- **Characters**: 64,941
- **Measured tokens**: 16,235
- **Relevance**: HIGH (if user knows the architecture)
- **Problem**: User must understand codebase structure first

---

### Query 4: "security vulnerabilities"

#### MCP Results
- **Tool calls**: 1
- **Results returned**: 10 semantic chunks
- **Characters**: 23,500
- **Measured tokens**: 5,875
- **Search time**: 15ms
- **Relevance**: HIGH - Found security sections, path security, symlink protection

#### Manual Results (Grep + Read)
- **Tool calls**: Would need 34+ (1 Grep + reading matched files)
- **Files matched**: 34
- **Total matches**: 374 occurrences
- **Characters**: 539,183
- **Measured tokens**: 134,796
- **Relevance**: MEDIUM - Many false positives (e.g., comments mentioning "security")

#### Drag-and-Drop Results
- **User effort**: VERY HIGH - Security is cross-cutting concern
- **Files to attach**: secureFileAccess.ts, paths.ts, indexPolicy.ts
- **Characters**: 63,793
- **Measured tokens**: 15,948
- **Relevance**: LOW - Security concerns are distributed throughout codebase
- **Problem**: User cannot know all files with security implications

---

### Query 5: "configuration options"

#### MCP Results
- **Tool calls**: 1
- **Results returned**: 10 semantic chunks
- **Characters**: 25,560
- **Measured tokens**: 6,390
- **Search time**: 15ms
- **Relevance**: HIGH - Found ConfigManager, config schema, default options, documentation

#### Manual Results (Grep + Read)
- **Tool calls**: Would need 41+ (1 Grep + reading matched files)
- **Files matched**: 41
- **Total matches**: 806 occurrences
- **Characters**: 597,396
- **Measured tokens**: 149,349
- **Relevance**: MEDIUM - Matches spread across many files

#### Drag-and-Drop Results
- **User effort**: MEDIUM - Config is relatively concentrated
- **Files to attach**: config.ts, metadata.ts
- **Characters**: 36,665
- **Measured tokens**: 9,166
- **Relevance**: HIGH (if user knows config locations)
- **Problem**: May miss config options in tool files, schema definitions

---

## Summary Table (Measured Data)

| Query | MCP Tokens | Grep Tokens | D&D Tokens | MCP vs Grep | MCP vs D&D |
|-------|------------|-------------|------------|-------------|------------|
| 1. File watching | 9,421 | 105,027 | 18,638 | **11.1x** | **2.0x** |
| 2. Error handling | 8,579 | 166,368 | 2,764 | **19.4x** | 0.3x* |
| 3. LanceDB search | 9,172 | 143,601 | 16,235 | **15.7x** | **1.8x** |
| 4. Security | 5,875 | 134,796 | 15,948 | **22.9x** | **2.7x** |
| 5. Configuration | 6,390 | 149,349 | 9,166 | **23.4x** | **1.4x** |
| **TOTAL** | **39,437** | **699,141** | **62,751** | **17.7x** | **1.6x** |

*Query 2 D&D only includes errors/index.ts - incomplete coverage

---

## Key Takeaways

### 1. Token Efficiency (Measured)
- **MCP is ~17.7x more token-efficient than Grep** across all query types
- **MCP is ~1.6x more efficient than optimal D&D** (but D&D requires expertise)
- MCP returns focused chunks (~7,900 tokens avg) vs full files
- Grep would require reading 25-43 files per query (impractical)

### 2. Search Speed (Measured)
- **MCP search completes in 15-20ms** (after model warmup)
- First query takes ~400ms due to embedding model initialization
- Subsequent queries are near-instant

### 3. Relevance Quality
- **MCP consistently achieves HIGH relevance** - semantic search understands intent
- Manual Grep returns MEDIUM-LOW relevance - keyword matching produces noise
- D&D relevance varies: HIGH if correct files selected, LOW otherwise

### 4. Scalability
- **MCP scales consistently** - always ~10 results, ~8K tokens regardless of codebase
- Grep scales with codebase - more files = more tokens to read
- D&D requires increasing expertise as codebase grows

### 5. The D&D Paradox
- D&D can be **more efficient** than MCP for specific queries (Query 2: 2,764 vs 8,579)
- BUT requires user to **already know the answer** (which files to attach)
- This is a chicken-and-egg problem: to know what to attach, you need to search first

### 6. When Each Approach Wins

| Approach | Best For |
|----------|----------|
| **MCP** | Exploratory queries, broad topics, understanding unfamiliar code |
| **Grep** | Exact string matching, finding specific variable/function names |
| **D&D** | Explaining a specific file you're already looking at |

---

## Methodology

### Benchmark Implementation
All benchmarks are automated and reproducible. See `tests/benchmarks/search-comparison.test.ts`.

### Token Estimation
- 1 token ≈ 4 characters (standard approximation)
- Tokens = Characters / 4

### MCP Measurement
- Actual `search_code` tool calls with `top_k=10`
- Measured characters from returned chunk text
- Search time from actual execution (excluding first query warmup)

### Grep Measurement
- Simulated grep with relevant regex patterns per query
- Counted actual matched files in codebase
- Calculated total characters if ALL matched files were read

### Drag-and-Drop Measurement
- Identified minimum files a knowledgeable user would attach
- Calculated actual file sizes
- Assumes best-case scenario (user knows exactly what to attach)

---

## Codebase Statistics

At time of benchmark:
- **Total .ts files**: 51
- **Total characters**: 692,473
- **Estimated tokens**: 173,118
- **Average file size**: 13,578 chars

---

## Conclusion

**MCP semantic search is the clear winner for exploratory code searches:**

| Comparison | Efficiency Gain |
|------------|-----------------|
| MCP vs Manual Grep+Read | **~17.7x** more efficient |
| MCP vs Optimal Drag-and-Drop | **~1.6x** more efficient |

### Why MCP Wins

1. **No expertise required** - AI discovers relevant code automatically
2. **Focused results** - Only relevant portions returned (~8K tokens avg)
3. **Semantic understanding** - Finds conceptually related content
4. **Consistent performance** - Same efficiency regardless of codebase size

### The Hidden Cost of Alternatives

**Grep:** Would require reading 25-43 entire files per query. For a single question, that's 100K-166K tokens of context - often exceeding AI context limits entirely.

**Drag-and-Drop:** Requires the user to already understand the codebase structure. The "efficiency" comes at the cost of human expertise and time spent identifying files.

### Bottom Line

For AI assistants working with code, MCP enables asking questions about large codebases that would otherwise be impractical. The ~17.7x efficiency gain over grep means the difference between "context limit exceeded" and "here's your answer in 15ms."
