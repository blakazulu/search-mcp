# Configuration Matrix Testing Framework

## Goal
Create a comprehensive testing framework to test all Search MCP configuration combinations with reusable fixtures and markdown reports.

## Configuration Options to Test

| Option | Values |
|--------|--------|
| `indexingStrategy` | `realtime`, `lazy`, `git` |
| `chunkingStrategy` | `character`, `code-aware` |
| `hybridSearch.enabled` | `true`, `false` |
| `hybridSearch.ftsEngine` | `auto`, `js`, `native` |
| `hybridSearch.defaultAlpha` | `0.0`, `0.3`, `0.5`, `0.7`, `1.0` |
| `enhancedToolDescriptions` | `true`, `false` |

## Metrics to Measure

- **Quality**: Precision@5, relevance hits, result scores
- **Performance**: Search latency (ms), indexing time, memory usage
- **Efficiency**: Total tokens, avg chunk size
- **Accuracy vs Baseline**: MCP vs Grep, MCP vs Drag-and-Drop (from search-comparison-test.md)

---

## Search Accuracy Comparison (MCP vs Non-MCP)

For each configuration, we compare MCP search against baseline approaches:

### Comparison Methods (from search-comparison-test.md)

| Method | Description | Metrics |
|--------|-------------|---------|
| **MCP Semantic Search** | AI uses `search_code` tool | Results, tokens, search time, relevance |
| **Manual Grep+Read** | Search with grep, then read files | Files matched, total matches, tokens |
| **Drag-and-Drop** | User manually attaches files | Files needed, tokens, user expertise required |

### Test Queries (10 types)

| # | Query | Type | Tests |
|---|-------|------|-------|
| 1 | "how does file watching work" | Conceptual | Semantic understanding |
| 2 | "error handling patterns" | Pattern | Code pattern recognition |
| 3 | "LanceDB vector search" | Technical | Specific technology |
| 4 | "security vulnerabilities" | Broad | Cross-cutting concerns |
| 5 | "configuration options" | Documentation | Config/docs search |
| 6 | "hashPassword function" | Exact | Exact function name lookup |
| 7 | "how to create an index" | How-to | User intent / action query |
| 8 | "embedding model initialization" | Implementation | Specific implementation detail |
| 9 | "MCP tool handler" | API | API/interface search |
| 10 | "performance optimization" | Conceptual-Broad | Abstract concept across codebase |

### Metrics per Query per Config

```typescript
interface ComparisonResult {
  config: ConfigCombination;
  query: TestQuery;

  // MCP Results
  mcp: {
    toolCalls: number;           // Always 1
    resultsReturned: number;     // After deduplication
    rawResults: number;          // Before deduplication
    totalChars: number;
    estimatedTokens: number;
    searchTimeMs: number;
    relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  };

  // Grep Baseline
  grep: {
    toolCallsNeeded: number;     // 1 grep + N file reads
    filesMatched: number;
    totalMatches: number;
    totalChars: number;
    estimatedTokens: number;
    relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  };

  // Drag-and-Drop Baseline
  dragDrop: {
    userEffort: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';
    filesNeeded: string[];
    totalChars: number;
    estimatedTokens: number;
    relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  };

  // Efficiency Ratios
  efficiency: {
    mcpVsGrep: number;           // e.g., 20.5x more efficient
    mcpVsDragDrop: number;       // e.g., 1.8x more efficient
  };

  // Deduplication Stats
  deduplication: {
    rawResults: number;
    afterDedup: number;
    reduction: string;           // e.g., "-20%"
  };
}
```

### Report Section: Accuracy Comparison

For each config, generate a comparison table like:

```markdown
### Config: alpha-0.5

| Query | MCP Tokens | Grep Tokens | D&D Tokens | MCP vs Grep | MCP vs D&D |
|-------|------------|-------------|------------|-------------|------------|
| 1. File watching | 9,032 | 105,224 | 18,638 | **11.7x** | **2.1x** |
| 2. Error handling | 8,385 | 175,227 | 2,764 | **20.9x** | 0.3x* |
| 3. LanceDB search | 7,355 | 152,626 | 16,719 | **20.8x** | **2.3x** |
| 4. Security | 5,699 | 136,517 | 15,948 | **24.0x** | **2.8x** |
| 5. Configuration | 5,000 | 158,374 | 9,252 | **31.7x** | **1.9x** |
| **TOTAL** | **35,471** | **727,968** | **63,321** | **20.5x** | **1.8x** |

Deduplication: 10 raw → 8 after (-20% avg)
```

### Which Config is Most Accurate?

Compare configs to find:
1. **Best MCP vs Grep ratio** - Which config maximizes efficiency over manual search
2. **Best MCP vs D&D ratio** - Which config beats optimal file selection
3. **Best deduplication** - Which config reduces redundant results most
4. **Best relevance** - Which config returns most relevant results

---

## Directory Structure

```
tests/
  configs/                          # NEW: Config matrix tests
    configMatrix.test.ts            # Main test runner
    accuracyComparison.test.ts      # MCP vs Grep vs D&D comparison (NEW)
    configCombinations.ts           # Config generator (~22 combinations)
    metrics.ts                      # Metrics collection
    comparisonMetrics.ts            # MCP vs baseline comparison utilities (NEW)
    fixtureSetup.ts                 # Fixture creation/cleanup
    reportGenerator.ts              # Markdown report generator

  fixtures/                         # NEW: Test fixtures
    synthetic/
      small-project/                # ~20 files for fast tests
        src/auth/login.ts
        src/auth/oauth.ts
        src/db/query.ts
        src/db/connection.ts
        src/api/routes.ts
        src/api/middleware.ts
        src/utils/hash.ts
        src/utils/validation.ts
        docs/README.md
        docs/api.md
        docs/security.md
    queries/
      code-queries.json             # Test queries with expected results
      comparison-queries.json       # 5 queries from search-comparison-test.md (NEW)

  reports/                          # Generated (gitignored)
    config-matrix-YYYY-MM-DD.md
    accuracy-comparison-YYYY-MM-DD.md  # MCP vs Grep vs D&D report (NEW)
```

---

## Implementation Steps

### Step 1: Create directory structure
Create folders: `tests/configs/`, `tests/fixtures/synthetic/`, `tests/fixtures/queries/`, `tests/reports/`

### Step 2: Create synthetic fixture files
Create `tests/fixtures/synthetic/small-project/` with ~20 TypeScript files containing known searchable content (auth, db, api, utils patterns).

### Step 3: Create query definitions
Create `tests/fixtures/queries/code-queries.json` with 5-10 test queries:
- Conceptual: "how does user authentication work"
- Technical: "database connection pool"
- Exact: "hashPassword function"
- Broad: "security vulnerabilities"
- Pattern: "error handling patterns"

Each query includes `expectedTopFiles` for precision validation.

### Step 3b: Create comparison queries (enhanced to 10 queries)
Create `tests/fixtures/queries/comparison-queries.json` with 10 diverse queries:
```json
{
  "queries": [
    {
      "id": 1,
      "query": "how does file watching work",
      "type": "Conceptual",
      "grepPatterns": ["watch", "chokidar", "file.*change", "watcher"],
      "relevantFiles": ["fileWatcher.ts", "integrity.ts", "strategyOrchestrator.ts"]
    },
    {
      "id": 2,
      "query": "error handling patterns",
      "type": "Pattern",
      "grepPatterns": ["error", "catch", "throw", "MCPError"],
      "relevantFiles": ["errors", "MCPError", "wrapError"]
    },
    {
      "id": 3,
      "query": "LanceDB vector search",
      "type": "Technical",
      "grepPatterns": ["lancedb", "vector", "search", "embedding"],
      "relevantFiles": ["lancedb.ts", "docsLancedb.ts", "searchCode.ts", "searchDocs.ts"]
    },
    {
      "id": 4,
      "query": "security vulnerabilities",
      "type": "Broad",
      "grepPatterns": ["security", "vulnerab", "sanitize", "safe", "symlink"],
      "relevantFiles": ["secureFileAccess.ts", "paths.ts", "indexPolicy.ts"]
    },
    {
      "id": 5,
      "query": "configuration options",
      "type": "Documentation",
      "grepPatterns": ["config", "option", "setting", "preference"],
      "relevantFiles": ["config.ts", "metadata.ts"]
    },
    {
      "id": 6,
      "query": "hashPassword function",
      "type": "Exact",
      "grepPatterns": ["hashPassword", "hash.*password", "bcrypt"],
      "relevantFiles": ["hash.ts", "auth"]
    },
    {
      "id": 7,
      "query": "how to create an index",
      "type": "How-to",
      "grepPatterns": ["create.*index", "createIndex", "index.*create"],
      "relevantFiles": ["createIndex.ts", "indexManager.ts"]
    },
    {
      "id": 8,
      "query": "embedding model initialization",
      "type": "Implementation",
      "grepPatterns": ["embedding", "model", "pipeline", "transformers", "initialize"],
      "relevantFiles": ["embedding.ts", "transformers"]
    },
    {
      "id": 9,
      "query": "MCP tool handler",
      "type": "API",
      "grepPatterns": ["tool", "handler", "MCP", "server"],
      "relevantFiles": ["tools/", "server.ts"]
    },
    {
      "id": 10,
      "query": "performance optimization",
      "type": "Conceptual-Broad",
      "grepPatterns": ["performance", "optim", "cache", "memory", "fast"],
      "relevantFiles": ["memory.ts", "cache", "limits.ts"]
    }
  ]
}
```

### Step 4: Create config combination generator
`tests/configs/configCombinations.ts` - Generates ~22 meaningful configs:
- Baseline configs (default, all-features, minimal)
- Alpha variations (0.0, 0.3, 0.5, 0.7, 1.0)
- FTS engine variations (auto, js, native)
- Strategy variations (realtime, lazy, git)
- Chunking variations (character, code-aware)

### Step 5: Create metrics collector
`tests/configs/metrics.ts` - `MetricsCollector` class tracking:
- Search latency, result count, top scores
- Precision@5 (if expected files known)
- Token count, memory usage

### Step 6: Create fixture setup utilities
`tests/configs/fixtureSetup.ts`:
- `setupFixture(name)` - Create temp project, copy fixtures, create index
- `cleanupFixture(context)` - Remove temp dirs

### Step 7: Create main test file
`tests/configs/configMatrix.test.ts`:
- Load test queries from fixtures
- Loop through config combinations
- Run each query against each config
- Collect metrics, assert quality thresholds

### Step 8: Create report generator
`tests/configs/reportGenerator.ts`:
- Executive summary (best configs per metric)
- Config comparison table
- Alpha parameter analysis by query type
- FTS engine comparison
- Feature coverage summary
- Recommendations

### Step 8b: Create comparison metrics utility
`tests/configs/comparisonMetrics.ts`:
- `simulateGrep(dir, patterns)` - Find files matching grep patterns, count matches
- `calculateGrepTokens(files)` - Total chars/tokens if all matched files read
- `findDragDropFiles(dir, fileNames)` - Find optimal files for D&D
- `calculateDragDropTokens(files)` - Total chars/tokens for D&D approach
- `compareApproaches(mcpResult, grepResult, dragDropResult)` - Calculate efficiency ratios

### Step 8c: Create accuracy comparison test
`tests/configs/accuracyComparison.test.ts`:
- Load 5 comparison queries from `comparison-queries.json`
- For each config combination:
  - Run MCP search, measure tokens/time/relevance
  - Simulate grep search, measure tokens/matches
  - Calculate D&D baseline (optimal file selection)
  - Calculate efficiency ratios (MCP vs Grep, MCP vs D&D)
  - Track deduplication effectiveness
- Generate accuracy comparison report

### Step 9: Add npm scripts
```json
"test:configs": "vitest run tests/configs/",
"test:configs:watch": "vitest tests/configs/",
"test:configs:full": "FULL_CODEBASE=true vitest run tests/configs/"
```

### Step 10: Add .gitignore entry
Add `tests/reports/` to `.gitignore`

### Step 11: Update CHANGELOG.md
Document new testing framework

---

## Files to Create

| File | Purpose |
|------|---------|
| `tests/configs/configCombinations.ts` | Generate ~22 config combinations |
| `tests/configs/metrics.ts` | Collect quality/performance/efficiency metrics |
| `tests/configs/comparisonMetrics.ts` | MCP vs Grep vs D&D comparison utilities |
| `tests/configs/fixtureSetup.ts` | Setup/cleanup test fixtures |
| `tests/configs/configMatrix.test.ts` | Main config matrix test runner |
| `tests/configs/accuracyComparison.test.ts` | MCP vs baseline accuracy tests |
| `tests/configs/reportGenerator.ts` | Generate markdown reports |
| `tests/fixtures/synthetic/small-project/*` | ~20 fixture files |
| `tests/fixtures/queries/code-queries.json` | Test queries with expected results |
| `tests/fixtures/queries/comparison-queries.json` | 10 diverse queries for accuracy comparison |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `test:configs` scripts |
| `.gitignore` | Add `tests/reports/` |
| `CHANGELOG.md` | Document new feature |

---

## Smart Config Testing Strategy

Instead of testing all 360 combinations (3x2x2x3x5x2), we test ~22 meaningful combinations:

### Baseline Configurations
```typescript
{ name: 'default', indexingStrategy: 'realtime', chunkingStrategy: 'character',
  hybridSearch: { enabled: true, ftsEngine: 'auto', defaultAlpha: 0.7 } }

{ name: 'all-features', indexingStrategy: 'realtime', chunkingStrategy: 'code-aware',
  hybridSearch: { enabled: true, ftsEngine: 'native', defaultAlpha: 0.5 } }

{ name: 'minimal', indexingStrategy: 'lazy', chunkingStrategy: 'character',
  hybridSearch: { enabled: false, ftsEngine: 'auto', defaultAlpha: 0.7 } }
```

### Feature-Specific Variations
- **Alpha variations**: Test 0.0, 0.3, 0.5, 0.7, 1.0 with default settings
- **FTS engine variations**: Test auto, js, native with default settings
- **Strategy variations**: Test realtime, lazy, git with default settings
- **Chunking variations**: Test character, code-aware with default settings

### Edge Case Combinations
- lazy + code-aware
- git + native FTS
- vector-only (hybrid disabled)

---

## Report Output Example

The generated markdown report will include:

### 1. Executive Summary
| Metric | Best Config | Value |
|--------|-------------|-------|
| Fastest Search | `strategy-lazy` | 12ms avg |
| Best Precision@5 | `alpha-0.5` | 0.85 |
| Lowest Token Usage | `chunking-code-aware` | 2,500 avg |

### 2. Configuration Comparison Table
| Config | Avg Latency | Avg Tokens | Precision@5 |
|--------|-------------|------------|-------------|
| default | 18ms | 3,200 | 0.78 |
| alpha-0.5 | 22ms | 3,400 | 0.85 |
| fts-native | 12ms | 3,200 | 0.78 |

### 3. Alpha Parameter Analysis
| Query Type | alpha=0.0 | alpha=0.5 | alpha=1.0 |
|------------|-----------|-----------|-----------|
| Conceptual | 0.60 | 0.82 | 0.78 |
| Exact Match | 0.95 | 0.82 | 0.55 |

### 4. Feature Coverage Summary
| Feature | Combinations Tested |
|---------|---------------------|
| indexingStrategy | 3/3 values |
| hybridSearch.ftsEngine | 3/3 values |
| hybridSearch.defaultAlpha | 5/5 key values |

### 5. Recommendations
- Default: Use alpha=0.7 for general queries
- Exact matches: Lower alpha (0.3) favors keyword matching
- Large codebases: Use lazy strategy + code-aware chunking

---

## Reference Files

- `tests/benchmarks/search-comparison.test.ts` - Benchmark pattern
- `tests/unit/storage/config.test.ts` - Config testing patterns
- `tests/integration/hybridSearch.test.ts` - Hybrid search testing
- `src/storage/config.ts` - Config schema (source of truth)
- `src/tools/searchCode.ts` - Search function to invoke

---

## Usage

```bash
# Run config matrix tests (fast, synthetic fixtures)
npm run test:configs

# Watch mode during development
npm run test:configs:watch

# Include full codebase tests (slower, more realistic)
FULL_CODEBASE=true npm run test:configs:full
```

Reports are generated in `tests/reports/`

---

## Feature Testing Summary

### What Each Test File Covers

| Test File | Features Tested | Output |
|-----------|-----------------|--------|
| `configMatrix.test.ts` | All config combinations (22), precision, latency, tokens | `config-matrix-YYYY-MM-DD.md` |
| `accuracyComparison.test.ts` | MCP vs Grep vs D&D for each config | `accuracy-comparison-YYYY-MM-DD.md` |

### Feature Coverage Matrix

| Feature | configMatrix | accuracyComparison | Notes |
|---------|--------------|-------------------|-------|
| `indexingStrategy: realtime` | ✅ | ✅ | Default strategy |
| `indexingStrategy: lazy` | ✅ | ✅ | On-demand indexing |
| `indexingStrategy: git` | ✅ | ✅ | Git-based sync |
| `chunkingStrategy: character` | ✅ | ✅ | Default chunking |
| `chunkingStrategy: code-aware` | ✅ | ✅ | Syntax-aware chunks |
| `hybridSearch.enabled: true` | ✅ | ✅ | Hybrid mode |
| `hybridSearch.enabled: false` | ✅ | ✅ | Vector-only mode |
| `hybridSearch.ftsEngine: auto` | ✅ | ✅ | Auto-select engine |
| `hybridSearch.ftsEngine: js` | ✅ | ✅ | JavaScript BM25 |
| `hybridSearch.ftsEngine: native` | ✅ | ✅ | SQLite FTS5 |
| `hybridSearch.defaultAlpha: 0.0` | ✅ | ✅ | FTS-only weight |
| `hybridSearch.defaultAlpha: 0.3` | ✅ | ✅ | FTS-heavy |
| `hybridSearch.defaultAlpha: 0.5` | ✅ | ✅ | Balanced |
| `hybridSearch.defaultAlpha: 0.7` | ✅ | ✅ | Semantic-heavy (default) |
| `hybridSearch.defaultAlpha: 1.0` | ✅ | ✅ | Vector-only weight |
| `enhancedToolDescriptions` | ✅ | - | Tool hints |

### Metrics Summary by Test

| Metric | configMatrix | accuracyComparison |
|--------|--------------|-------------------|
| Search latency (ms) | ✅ | ✅ |
| Indexing time | ✅ | - |
| Memory usage | ✅ | - |
| Result count | ✅ | ✅ |
| Precision@5 | ✅ | - |
| Total tokens | ✅ | ✅ |
| Deduplication rate | ✅ | ✅ |
| MCP vs Grep ratio | - | ✅ |
| MCP vs D&D ratio | - | ✅ |
| Relevance rating | ✅ | ✅ |

### Query Type Coverage (10 types)

| Query Type | Example | Tests |
|------------|---------|-------|
| Conceptual | "how does file watching work" | Semantic understanding |
| Pattern | "error handling patterns" | Code pattern recognition |
| Technical | "LanceDB vector search" | Specific technology search |
| Broad | "security vulnerabilities" | Cross-cutting concerns |
| Documentation | "configuration options" | Config/docs search |
| Exact | "hashPassword function" | Exact function name lookup |
| How-to | "how to create an index" | User intent / action queries |
| Implementation | "embedding model initialization" | Specific implementation details |
| API | "MCP tool handler" | API/interface search |
| Conceptual-Broad | "performance optimization" | Abstract concepts across codebase |

---

## Expected Report Outputs

### 1. Config Matrix Report (`config-matrix-YYYY-MM-DD.md`)
- Executive summary (best config per metric)
- Config comparison table
- Alpha parameter analysis
- FTS engine comparison
- Indexing strategy comparison
- Chunking strategy comparison
- Recommendations

### 2. Accuracy Comparison Report (`accuracy-comparison-YYYY-MM-DD.md`)
- MCP vs Grep vs D&D summary table (like search-comparison-test.md)
- Per-config comparison tables
- Best config for accuracy
- Deduplication effectiveness
- Key takeaways (token efficiency, search speed, relevance)
