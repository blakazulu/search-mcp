# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Query Expansion & Synonyms (SMCP-095)
- **New `queryExpansion` engine** (`src/engines/queryExpansion.ts`) - Improves search recall by expanding abbreviations and synonyms
  - When users search for "auth", the query is expanded to include "authentication authorize login session token"
  - Inspired by mcp-vector-search's query expansion system with 60+ expansion mappings
  - Preserves original query terms while adding related terms for better recall

- **60+ expansion mappings organized by category:**
  - Authentication & Security: auth, login, oauth, jwt, password, permission, role
  - Database & Storage: db, sql, mongo, postgres, redis, cache, orm, prisma
  - API & HTTP: api, endpoint, route, http, rest, graphql, request, response
  - Async & Concurrency: async, await, promise, callback, concurrent, thread
  - Errors & Exceptions: err, error, exception, catch, throw, fail, handle
  - Configuration & Settings: config, env, settings, options, param
  - Common Abbreviations: util, fn, init, msg, req, res, ctx, src, dest, dir
  - Programming Concepts: class, interface, function, method, property, type
  - Testing: test, mock, spec, stub, spy, assert, expect
  - Logging & Debugging: log, logger, debug, trace, console
  - File & I/O: file, path, fs, read, write, save, load, parse
  - Networking: socket, tcp, connect, client, server, url

- **Core functions:**
  - `expandQuery(query, config?)` - Expand a query with synonyms (returns string)
  - `expandQueryWithDetails(query, config?)` - Expand with detailed results (returns QueryExpansionResult)
  - `hasExpansion(term)` - Check if a term has expansion mappings
  - `getExpansionTerms(term)` - Get expansion terms for a specific term
  - `getExpansionKeys()` / `getExpansionCount()` - Query available expansions

- **Configuration options (`QueryExpansionConfig`):**
  - `enabled` (boolean, default: true) - Enable/disable query expansion
  - `maxExpansionTerms` (number, default: 10) - Limit expansion terms added
  - `customExpansions` (Record<string, string>) - Add custom expansion mappings

- **Integration with search tools:**
  - `search_code` now applies query expansion before generating embeddings
  - `search_docs` now applies query expansion before generating embeddings
  - Expanded query used for semantic search, original query preserved for FTS
  - Non-blocking with < 1ms overhead per query

- **Benefits:**
  - Better recall for abbreviation-heavy queries (e.g., "auth" finds "authentication")
  - Domain-specific term expansion (e.g., "db" finds "database", "sql", "mongo")
  - Configurable and extensible with custom mappings
  - Zero impact on search latency (expansion is sub-millisecond)

### Testing
- 72 new unit tests for query expansion (`tests/unit/engines/queryExpansion.test.ts`)
- Tests cover all expansion categories, configuration options, edge cases
- Performance tests verify < 1ms expansion time
- Integration tests for search usability

#### Search-Triggered Auto-Reindexing (SMCP-094)
- **New `autoReindexer` engine** (`src/engines/autoReindexer.ts`) - Search-triggered automatic reindexing inspired by mcp-vector-search
  - Periodically checks for stale files during search operations
  - Silently reindexes small changes (<=5 files by default) without user intervention
  - No daemon process needed - reindexing happens opportunistically during search

- **SearchTriggeredIndexer class** - Core implementation
  - `preSearchHook()` - Call before search to check and auto-reindex stale files
  - `checkStaleness()` - Compare current filesystem state with stored fingerprints
  - `forceNextCheck()` - Force staleness check on next search
  - `getStats()` - Get statistics about auto-reindex activity
  - `updateConfig()` - Dynamically update configuration

- **Configuration options (`AutoReindexConfig`):**
  - `enabled` (boolean, default: true) - Enable/disable auto-reindexing
  - `checkEveryNSearches` (number, default: 10) - Check staleness every N searches
  - `maxAutoReindexFiles` (number, default: 5) - Maximum files to auto-reindex silently
  - `stalenessThresholdMs` (number, default: 300000) - Minimum time between checks
  - `logActivity` (boolean, default: true) - Log reindex activity

- **Global instance management:**
  - `getAutoReindexer(projectPath)` - Get or create cached indexer for a project
  - `createAutoReindexer(projectPath, config?)` - Create new indexer instance
  - `clearAutoReindexers()` - Clear all cached indexers
  - `removeAutoReindexer(projectPath)` - Remove specific cached indexer

- **Integration with search tools:**
  - `search_code` now automatically checks for stale files before searching
  - `search_docs` now automatically checks for stale files before searching
  - Auto-reindex is non-blocking for large changes (logs info and continues)

- **Benefits:**
  - Index stays fresh without background processes
  - Small changes (editing a few files) are auto-reindexed silently
  - Large changes (new branch, many files) skip auto-reindex to avoid delays
  - Search performance unaffected (staleness check is fast)

### Testing
- 35+ new unit tests for auto-reindexer (`tests/unit/engines/autoReindexer.test.ts`)
- Tests cover configuration, staleness detection, concurrent access, path normalization
- Edge case coverage: disabled mode, zero thresholds, concurrent calls

#### LanceDB Vector Index Acceleration (SMCP-091)
- **IVF-PQ Vector Index Support** - Automatic vector index creation for faster similarity search
  - Automatic index creation for datasets with >= 10,000 chunks
  - Configurable IVF-PQ parameters (numPartitions, numSubVectors, distanceType)
  - Adaptive parameter calculation based on dataset size
  - `sqrt(numRows)` partitions (clamped to 1-256)
  - `dimension/16` or `dimension/8` sub-vectors based on divisibility

- **New `LanceDBStore` methods:**
  - `createVectorIndex(config?)` - Create IVF-PQ vector index with configurable parameters
  - `getVectorIndexInfo()` - Get information about existing vector index

- **Vector Index Configuration:**
  - `indexType` - 'ivf_pq' or 'none' (default: auto based on chunk count)
  - `numPartitions` - Number of IVF partitions (default: sqrt(numRows))
  - `numSubVectors` - Number of PQ sub-vectors (default: dimension/16)
  - `distanceType` - 'l2', 'cosine', or 'dot' (default: 'l2')
  - `maxIterations` - Max kmeans iterations (default: 50)
  - `sampleRate` - Kmeans sample rate (default: 256)

- **Index information tracked in metadata:**
  - `hasIndex` - Whether a vector index exists
  - `indexType` - Type of index ('ivf_pq' or 'none')
  - `numPartitions`, `numSubVectors`, `distanceType` - Index parameters
  - `indexCreationTimeMs` - Time to create the index
  - `chunkCount` - Chunks at time of index creation
  - `createdAt` - Index creation timestamp

- **get_index_status enhancement:**
  - New `vectorIndex` field in status output showing index info

- **Automatic integration:**
  - Vector index created automatically during `create_index` for large codebases
  - Graceful fallback to brute-force search if index creation fails

- **Note:** GPU acceleration (CUDA/MPS) is NOT available in the LanceDB Node.js SDK.
  Index building runs on CPU only. When LanceDB adds GPU support to the Node.js SDK,
  we can enable it.

#### Symbol Extraction & Complexity Metrics (SMCP-090)
- **New `symbolExtractor` engine** (`src/engines/symbolExtractor.ts`) - On-demand symbol extraction and complexity analysis
  - Reuses Tree-sitter infrastructure from SMCP-086
  - Fast extraction (< 100ms per typical file)
  - Extracts functions, classes, methods, interfaces, structs, traits, enums
  - Extracts imports and exports with full details
  - Calculates cyclomatic complexity per function
  - Calculates nesting depth per function
  - Provides overall complexity score (0-100)

- **New `get_file_summary` MCP tool** - Retrieve file structure without reading entire files
  - Returns functions, classes, imports, exports with metadata
  - Returns complexity metrics for code quality assessment
  - Returns line counts (total, code, blank, comments)
  - Useful for AI assistants to understand code structure quickly
  - Does NOT require confirmation (read-only operation)

- **SymbolInfo metadata per symbol:**
  - `name` - Symbol name
  - `type` - function, class, method, interface, struct, trait, enum
  - `startLine` / `endLine` - Line range
  - `signature` - Full function/method signature
  - `docstring` - Extracted documentation comment
  - `isExported` / `isAsync` / `isStatic` - Boolean flags
  - `visibility` - public / private / protected
  - `paramCount` - Parameter count for functions/methods
  - `returnType` - Return type if available
  - `parentName` - Parent class/struct name for methods
  - `decorators` - List of decorators/annotations
  - `complexity` - Cyclomatic complexity (if includeComplexity: true)
  - `nestingDepth` - Maximum nesting depth

- **ComplexityMetrics per file:**
  - `cyclomaticComplexity` - Sum of all function complexities
  - `maxNestingDepth` - Maximum nesting in the file
  - `avgFunctionComplexity` - Average function complexity
  - `decisionPoints` - Count of if, while, for, &&, ||, etc.
  - `overallScore` - Overall score (0-100, higher = better/less complex)

- **Supported languages:** JavaScript, TypeScript, TSX, Python, Go, Java, Rust, C, C++, C#

- **New API functions:**
  - `extractFileSummary(source, absolutePath, relativePath, options?)` - Main extraction function
  - `supportsSymbolExtraction(filePath)` - Check if language is supported
  - `getSupportedLanguages()` - List supported languages

### Testing
- 60+ new unit tests for symbol extraction (`tests/unit/engines/symbolExtractor.test.ts`)
- Tests cover all 10 supported languages
- Complexity calculation tests
- Performance tests (50 functions < 100ms, 100 functions < 200ms)
- Edge case coverage: empty files, syntax errors, unicode, deep nesting

#### Merkle DAG Change Detection (SMCP-089)
- **New `merkleTree` engine** (`src/engines/merkleTree.ts`) - Content-hash based change detection
  - Hierarchical Merkle tree structure: Project -> Directory -> File -> Chunk
  - Chunk-level granularity for partial reindexing (vs file-level fingerprints)
  - O(1) change detection via root hash comparison
  - Efficient diff algorithm to identify only changed nodes

- **MerkleTreeManager class** - State management for incremental indexing
  - Content-hash based file tracking with chunk boundaries
  - Snapshot persistence for fast startup (merkle-tree.json)
  - Support for detecting moved/renamed chunks via content hash
  - Snapshot creation for safe rollback on errors

- **Hash computation functions**
  - `computeChunkHash()` - Position-aware hash for chunk tracking
  - `computeChunkContentHash()` - Position-independent hash for detecting moves
  - `computeFileHash()` - File hash from ordered chunk hashes
  - `computeProjectHash()` - Root hash from all file hashes

- **Diff operations**
  - `diffFileMaps()` - Compare two tree states to get changes
  - `MerkleDiff` - Categorized changes (added/modified/removed files, chunk-level changes)
  - `getChangedFiles()` - Quick list of changed files without full diff

- **Benefits over file-level fingerprints**
  - Changing one function in a large file can identify affected chunks only
  - Potential for 50%+ reindex time reduction for small changes
  - Foundation for future partial reindexing optimization

- **Comprehensive test coverage**
  - 39 unit tests for hash computation, diff algorithm, and MerkleTreeManager
  - 13 integration tests for project indexing, change detection, and persistence
  - Performance tests demonstrating O(1) root hash comparison

#### Zero-Config CLI Interface (SMCP-088)
- **New CLI commands** - Direct command-line access without MCP client setup
  - `search-mcp index` - Create or update search index for current project
  - `search-mcp search <query>` - Search code with natural language queries
  - `search-mcp status` - Show index statistics and configuration
  - `search-mcp reindex` - Rebuild entire index from scratch
  - `search-mcp setup` - Configure MCP clients (existing functionality)
  - `search-mcp logs` - Show log file locations (existing functionality)

- **Rich terminal output** - Beautiful, informative CLI experience
  - Progress bars for indexing (chunking, embedding phases)
  - Colored output: cyan for headers, green for success, yellow for warnings, red for errors
  - Spinners for operations in progress
  - Formatted search results with file paths, line numbers, and scores
  - Code snippet preview with truncation for long results

- **Search command options**
  - `-k, --top-k <number>` - Number of results to return (default: 10)
  - `-m, --mode <mode>` - Search mode: hybrid, vector, or fts
  - `-a, --alpha <number>` - Alpha weight for hybrid search (0-1)
  - `-d, --docs` - Search documentation files instead of code
  - `--json` - Output results as JSON for scripting

- **JSON output mode** - All commands support `--json` flag for scripting
  - Machine-readable output for CI/CD integration
  - Structured error reporting
  - Compatible with jq and other JSON tools

### Dependencies
- Added `commander` (^12.x) - CLI framework
- Added `chalk` (^5.x) - Terminal colors
- Added `ora` (^8.x) - Terminal spinners
- Added `cli-progress` (^3.x) - Progress bars

### Usage Examples

```bash
# Create index for current project
npx @liraz-sbz/search-mcp index

# Search for code
npx @liraz-sbz/search-mcp search "authentication function"

# Search with options
npx @liraz-sbz/search-mcp search "error handling" --top-k 5 --mode hybrid

# Search docs
npx @liraz-sbz/search-mcp search "setup instructions" --docs

# Get index status
npx @liraz-sbz/search-mcp status

# JSON output for scripting
npx @liraz-sbz/search-mcp status --json | jq '.totalFiles'

# Rebuild index
npx @liraz-sbz/search-mcp reindex
```

#### AST-Based Chunking (SMCP-086)
- **New `treeSitterParser` engine** (`src/engines/treeSitterParser.ts`) - WASM-based AST parsing using Tree-sitter
  - Cross-platform support via `web-tree-sitter` (WASM)
  - Pre-built grammars via `tree-sitter-wasms` for 10+ languages
  - Lazy loading of language grammars for minimal startup time
  - Singleton pattern with `TreeSitterParser.getInstance()`
  - Language detection from file extensions

- **New `astChunking` engine** (`src/engines/astChunking.ts`) - Semantic code chunking with rich metadata
  - Supported languages: JavaScript, TypeScript, TSX, Python, Go, Java, Rust, C, C++, C#
  - Extracts semantic units: functions, classes, methods, interfaces, structs, traits, impls
  - Rich metadata per chunk: name, signature, docstring, decorators, parent info
  - Semantic tags for search boosting (async, export, static, etc.)
  - Configurable chunk size with automatic splitting of large functions

- **New chunking strategy: `'ast'`** - Third strategy alongside `'character'` and `'code-aware'`
  - Best accuracy for supported languages
  - Falls back to code-aware, then character-based
  - Use via `chunkFileWithStrategy(path, relativePath, { strategy: 'ast' })`

- **LanceDB schema updates** - Optional metadata fields for AST chunks
  - `chunk_type`, `chunk_name`, `chunk_signature`, `chunk_docstring`
  - `chunk_parent`, `chunk_tags`, `chunk_language`
  - `SearchResult` now includes metadata when available

#### ChunkMetadata Interface
```typescript
interface ChunkMetadata {
  type: ChunkType;           // function, class, method, interface, etc.
  name?: string;             // Function/class/method name
  signature?: string;        // Full signature
  docstring?: string;        // Extracted docstring
  decorators?: string[];     // Decorators/annotations
  parentName?: string;       // Parent name (class for methods)
  parentType?: ChunkType;    // Parent type
  tags?: string[];           // Semantic tags
  language: ASTLanguage;     // Programming language
  isAsync?: boolean;         // Async function
  isExport?: boolean;        // Exported
  isStatic?: boolean;        // Static method
  visibility?: 'public' | 'private' | 'protected';
  paramCount?: number;       // Parameter count
  returnType?: string;       // Return type
  genericParams?: string[];  // Generic parameters
}
```

### Dependencies
- Added `web-tree-sitter` (^0.26.3) - WASM-based Tree-sitter parser
- Added `tree-sitter-wasms` (^0.1.13) - Pre-built WASM grammars

### Testing
- 43 new unit tests for AST chunking (`tests/unit/engines/astChunking.test.ts`)
- Tests cover all 10 supported languages
- Metadata extraction tests for each language
- Graceful degradation tests when parser unavailable

#### Query Intent Detection (SMCP-085)
- **New `queryIntent` engine** (`src/engines/queryIntent.ts`) - Classifies search queries into intent categories for better search ranking
  - Detects 8 intent categories: FUNCTION, CLASS, ERROR, DATABASE, API, AUTH, TEST, CONFIG
  - Multi-intent support - queries can match multiple categories with confidence scores
  - Fast keyword-based detection with < 10ms latency overhead
  - CamelCase and snake_case aware tokenization via `normalizeToTokens()`
  - Entity-like query detection via `isEntityLikeQuery()`

#### Intent-Based Search Boosting
- **Chunk type boosting** - `getChunkTypeBoosts()` returns boost factors based on query intent
  - CLASS intent boosts class chunks (1.3x)
  - FUNCTION intent boosts function/method chunks (1.15x)
  - TEST intent boosts function/method chunks (1.2x)
- **Tag-based boosting** - `getIntentTagBoost()` boosts results with matching tags
- **Name matching** - CamelCase-aware name matching with up to 1.4x boost for exact matches
- **Integration with hybrid search** - `applyIntentBoosts()` function in `hybridSearch.ts`

#### New API Functions
- `detectQueryIntent(query, config?)` - Main intent detection function
- `getChunkTypeBoosts(intent)` - Get boost factors for chunk types
- `getIntentTagBoost(intent, tags)` - Get boost factor for tag overlap
- `createIntentDetector(config)` - Create a pre-configured detector
- `getIntentNames(intent)` - Extract intent category names
- `hasIntent(intent, category, minConfidence?)` - Check for specific intent

### Testing
- 86 new unit tests for query intent detection
- Tests cover all 8 intent categories
- Performance tests verify < 10ms latency
- Edge case coverage: empty queries, special characters, long queries

#### Multi-Factor Search Ranking (SMCP-087)
- **New `advancedRanking` engine** (`src/engines/advancedRanking.ts`) - Sophisticated multi-factor ranking algorithm inspired by claude-context-local
  - Combines 7+ ranking signals for significantly better search result quality:
    1. Base similarity score (from vector/hybrid search)
    2. Query intent detection (via SMCP-085)
    3. Chunk type boosting (dynamic based on intent)
    4. Name matching with CamelCase/snake_case awareness
    5. Path/filename relevance
    6. Docstring/comment presence bonus
    7. Complexity penalty for oversized chunks

#### Core Ranking Features
- **Chunk type boosting** - Dynamic boosts based on detected query intent
  - CLASS intent: 1.3x boost for class chunks
  - FUNCTION intent: 1.15x boost for function/method chunks
  - TEST intent: 1.2x boost for function/method chunks
- **Name matching** - CamelCase/snake_case-aware tokenization
  - Exact match: 1.4x boost
  - 80%+ token overlap: 1.3x (strong match)
  - 50%+ token overlap: 1.2x (good match)
  - 30%+ token overlap: 1.1x (partial match)
  - Any overlap: 1.05x (weak match)
- **Path relevance** - Boosts results when query tokens appear in file path
  - 5% boost per matching token, capped at 20% total
- **Docstring bonus** - 1.05x boost for documented code
  - Reduced bonus for module docstrings on entity-like queries
- **Complexity penalty** - Penalizes oversized chunks
  - 2% penalty for chunks > 2000 chars
  - 5% penalty for chunks > 4000 chars

#### New API Functions
- `applyAdvancedRanking(query, results, config?)` - Main ranking function with full factor breakdown
- `calculateChunkTypeBoost(chunkType, boosts)` - Calculate type-based boost
- `calculateNameBoost(name, query, tokens)` - Calculate name matching boost
- `calculatePathBoost(path, tokens)` - Calculate path relevance boost
- `calculateDocstringBonus(docstring, type, isEntity)` - Calculate documentation bonus
- `calculateComplexityPenalty(text, thresholds)` - Calculate size penalty
- `createRanker(config)` - Create pre-configured ranking function
- `getRankingStats(results)` - Analyze ranking factor statistics

#### Configuration
```typescript
interface AdvancedRankingConfig {
  enabled: boolean;              // Enable/disable ranking (default: true)
  intentConfig?: IntentConfig;   // Intent detection settings
  weights?: {                    // Factor weight multipliers
    chunkType: number;           // Default: 1.0
    name: number;
    path: number;
    tag: number;
    docstring: number;
    complexity: number;
  };
  complexityThresholds?: {
    mild: number;                // Default: 2000 chars
    strong: number;              // Default: 4000 chars
  };
  docstringBonusValue?: number;  // Default: 1.05
}
```

#### Integration with Hybrid Search
- `applyAdvancedSearchRanking()` - Apply ranking to `HybridSearchResult[]`
- `convertRankedToHybridResults()` - Convert back to hybrid results with updated scores

### Testing
- 73 new unit tests for advanced ranking (`tests/unit/engines/advancedRanking.test.ts`)
- Tests cover all ranking factors
- Performance tests: < 50ms for 100 results, < 200ms for 500 results
- Edge cases: empty queries, unicode, very long queries

## [1.4.0] - 2025-12-16

### Added

#### GPU Acceleration (Windows)
- **Automatic GPU acceleration via DirectML** - Zero-configuration GPU support on Windows
  - Works with NVIDIA, AMD, and Intel GPUs (including integrated graphics)
  - DirectML is built into `onnxruntime-node` - no additional dependencies needed
  - Graceful fallback to CPU if GPU initialization fails

#### Device Detection (`src/engines/deviceDetection.ts`)
- New module for detecting and managing compute devices
- Functions: `detectBestDevice()`, `isDirectMLAvailable()`, `supportsGPU()`, `formatDeviceInfo()`
- Platform detection: `isWindows()`, `isMacOS()`, `isLinux()`, `isNodeEnvironment()`
- Caching with `getCachedDeviceInfo()` and `clearDeviceCache()`
- 5-second timeout prevents hangs on unresponsive GPU drivers

#### Embedding Engine GPU Support
- New `device` option in `EmbeddingEngineConfig`: `'webgpu' | 'dml' | 'cpu'` or auto-detect
- GPU batch size: 64 (vs 32 for CPU) for better throughput
- New methods: `getDeviceInfo()`, `getDevice()`, `isUsingGPU()`, `didFallbackToCPU()`
- Performance logging: chunks/sec, device info, total time

#### Status Reporting
- `get_index_status` now includes `compute` field with device info
- `create_index` summary shows compute device and throughput (chunks/sec)
- New `ComputeStatus` interface exported from tools

### Changed
- **Transformers.js v3 Migration** - Upgraded from `@xenova/transformers` v2 to `@huggingface/transformers` v3
  - Actively maintained by Hugging Face (v2 was 2+ years old)
  - Foundation for GPU acceleration support
  - Existing models and indexes remain fully compatible
- Device detection priority:
  - Windows Node.js: DirectML > CPU
  - macOS/Linux Node.js: CPU only (CoreML/CUDA require separate packages)
  - Browser: WebGPU > CPU

### Platform Support

| Platform | GPU Support | Notes |
|----------|-------------|-------|
| Windows | DirectML | Automatic - NVIDIA, AMD, Intel GPUs |
| macOS | CPU only | CoreML not available in Node.js |
| Linux | CPU only | CUDA requires separate package |

### Testing
- 2831 tests passing (123+ unit tests for GPU features)
- 40 new integration tests for WebGPU/DirectML pipeline
- Platform compatibility matrix tests
- Search quality validation: MCP 2.5x better than grep

## [1.3.20] - 2025-12-16

### Added
- **Human-Readable Index Summary** - `create_index` now returns a formatted `summary` field with:
  ```
  Index created successfully for /path/to/project

  Statistics:
    Total files in project: 20,085
    Files excluded: 19,830
    Code files indexed: 255
    Doc files indexed: 103
    Total chunks created: 1,196
    Duration: 3m 19s
  ```
  - Numbers are formatted with thousands separators for readability
  - Warning is appended if docs indexing had issues

### Fixed
- **Docs Indexing Diagnostics** - Added better diagnostics when documentation files aren't indexed
  - `scanDocFiles()` now returns both the file list and the raw glob count for debugging
  - When 0 docs are indexed but glob found files, a warning is now returned explaining that files were filtered out
  - Warning suggests checking gitignore, exclude patterns, or file size limits
  - `create_index` output now includes `docsWarning` field when docs indexing has issues
  - Added info-level logging for raw glob results before and after filtering

### Changed
- `scanDocFiles()` now returns a `ScanDocFilesResult` object with `files` and `globFilesFound` properties
- `DocsIndexResult` interface now includes optional `warning` and `globFilesFound` fields

## [1.3.19] - 2025-12-14

### Added
- **Detailed Index Statistics** - After indexing completes, you now see comprehensive stats:
  - Total files found in project (before filtering)
  - Files excluded by policy (gitignore, deny patterns, etc.)
  - Code files indexed
  - Doc files indexed (if docs indexing is enabled)
  - Total files indexed
  - Duration

### Changed
- `create_index` tool now indexes both code AND docs in a single operation
  - Previously docs were only indexed lazily when first searched
  - Now both are indexed upfront for faster first searches
- `scanFiles` now returns a `ScanResult` object with detailed stats instead of just a file list

## [1.3.18] - 2025-12-14

### Added
- **Adaptive Streaming Mode for High Memory** - When memory usage exceeds 80%, indexing automatically switches to streaming mode
  - Processes only 3 files at a time (instead of 50) to minimize memory accumulation
  - Writes to database immediately after each small batch
  - Runs garbage collection between batches
  - Normal batch processing when memory is below 80% (fast mode)
  - Applied to both code and docs indexing

## [1.3.16] - 2025-12-14

### Fixed
- **Memory Management During Indexing** - Fixed indexing failing with 0 files due to overly aggressive memory checks
  - Raised memory critical threshold from 85% to 90% to allow headroom after embedding model loads
  - Process at least 1 file per batch before checking memory (ensures progress is made)
  - Request garbage collection before each batch to free memory from previous operations
  - Fixes "0 files indexed" issue when memory was high after embedding model initialization

## [1.3.15] - 2025-12-14

### Fixed
- **Windows MCP Connection Failures** - Reverted `cmd /c` wrapper which was breaking MCP connections
  - The `/doctor` warning about needing `cmd /c` wrapper was misleading
  - Working MCP configs use `npx` directly without `cmd /c` wrapper
  - Removed `cmd /c` wrapper from setup wizard and help text
  - Kept path normalization fix for `.claude.json` forward/backslash entries

## [1.3.13] - 2025-12-14

### Fixed
- **Windows MCP Config** - Setup wizard added `cmd /c` wrapper for npx commands
  - ⚠️ **Reverted in v1.3.14** - This change actually broke MCP connections
  - The `/doctor` warning was misleading; `npx` works directly without wrapper

## [1.3.12] - 2025-12-14

### Fixed
- **Framework Cache Crashes** - Fixed indexing failures on projects with large framework caches
  - Root cause: `.angular/cache` and similar directories contain large binary files causing crashes
  - Added comprehensive hardcoded deny patterns for 30+ framework/tool caches:
    - **Package managers**: `.yarn/**`, `.pnpm-store/**`, `Pods/**`, `.bundle/**`, `deps/**`
    - **Build artifacts**: `bin/**`, `obj/**`, `_build/**`, `.build/**`, `.output/**`, `.svelte-kit/**`, `.astro/**`, `.gradle/**`, `.mvn/**`, `.expo/**`, `.docusaurus/**`, `.storybook-static/**`
    - **Linter caches**: `.mypy_cache/**`, `.ruff_cache/**`, `.eslintcache`, `.stylelintcache`
    - **Testing**: `.hypothesis/**`, `.tox/**`, `htmlcov/**`
    - **Cloud/deploy**: `.terraform/**`, `.serverless/**`, `.vercel/**`, `.netlify/**`
    - **IDE**: `.fleet/**`, `*.sublime-workspace`
  - This fixes "MCP connection closed" errors on Angular, .NET, Elixir, Swift, and other projects

## [1.3.11] - 2025-12-14

### Fixed
- **Crash Logging** - Server crashes are now logged even during startup
  - Added early crash logging before module imports
  - Added global handlers for uncaughtException and unhandledRejection
  - Crashes are now written to `~/.mcp/search/logs/server.log`

## [1.3.10] - 2025-12-14

### Added
- **Debugging Support** - Better logging and error messages for troubleshooting
  - New `--logs` CLI command to show log file locations for each indexed project
  - Global server log at `~/.mcp/search/logs/server.log` for server start/stop events
  - Error messages now include log file path for easy debugging
  - Full stack traces logged for all errors
  - `get_index_status` tool now returns `logPath` field
  - Support for `DEBUG=1` or `SEARCH_MCP_DEBUG=1` environment variables for verbose logging
- **Progress Reporting** - Real-time indexing progress visibility
  - Progress logged to file during `create_index` and `reindex_project` operations
  - Progress written to stderr (visible when running MCP server directly)
  - Shows phase (scanning/chunking/embedding/storing), file count, and current file

### Changed
- Updated README troubleshooting section with new CLI options and debug mode info
- Improved `--logs` output to show only 10 most recent indexes (prioritizing those with log files)

## [1.3.8] - 2025-12-14

### Changed
- Improved first-use instructions to be clearer and more explicit
  - Added step to verify MCP connection with `/mcp` command
  - Changed prompt to "Use search-mcp to create an index for this project" for better AI recognition
- Updated README, setup wizard, CLI help, and postinstall message

## [1.3.7] - 2025-12-14

### Changed
- Updated all setup commands to use `npx --yes @liraz-sbz/search-mcp@latest --setup` to avoid npx caching issues
- Updated README, CLI help, and postinstall message with correct command format

## [1.3.6] - 2025-12-14

### Added
- **Setup Wizard** - New `--setup` command to easily configure MCP clients
  - Auto-detects installed MCP clients (Claude Desktop, Claude Code, Cursor, Windsurf)
  - Interactive menu to select which clients to configure
  - Creates or updates `.mcp.json` configuration files automatically
  - Supports Claude Code CLI integration when available
  - Usage: `npx @liraz-sbz/search-mcp --setup`

- **Post-install Instructions** - Helpful setup message after `npm install`
  - Shows quick setup options immediately after installation
  - Guides users to configure their MCP clients
  - No more confusion about manual `.mcp.json` creation

- **CLI Help & Version** - Standard CLI flags
  - `--help` / `-h` - Show usage information
  - `--version` / `-v` - Show installed version

### Changed
- Entry point now handles CLI arguments before starting the MCP server
- Improved first-time user experience with clear setup paths

## [1.3.5] - 2025-12-13

### Changed
- **Documentation Updates** - Updated README and benchmark docs with full codebase test results
  - Updated headline efficiency claim from "20x" to "40x" based on full codebase benchmarks
  - Updated performance table: "40-43x fewer tokens" (was "20.4x faster")
  - Added install command (`npm i`) alongside run command in README
  - Updated search-comparison-test.md with full codebase efficiency numbers
  - Added link to full codebase analysis report

## [1.3.4] - 2025-12-13

### Changed
- **Default Configuration Optimization** - Updated defaults based on full codebase benchmark testing
  - Changed `hybridSearch.defaultAlpha` from `0.7` to `0.5` (balanced hybrid)
    - Achieves 43x token efficiency vs grep (up from 40.9x)
    - Same precision (32% P@5), better balance of semantic + keyword search
  - Changed `chunkingStrategy` from `"character"` to `"code-aware"`
    - Respects code boundaries (functions, classes) for better semantic chunks
    - Slightly better search latency in benchmarks
  - Updated documentation to reflect new defaults

### Performance
- Full codebase testing shows new defaults achieve:
  - 43x fewer tokens than grep (vs 40.9x with old defaults)
  - Same search precision (32% Precision@5)
  - Better semantic understanding with balanced alpha

## [1.3.3] - 2025-12-12

### Fixed
- **MEDIUM: Synchronous Operations in getStorageRoot** (BUG #10, SMCP-078)
  - Added caching to avoid repeated sync filesystem operations
  - Added async version `getStorageRootAsync()` for non-blocking operations
  - Added `clearStorageRootCache()` utility for testing

- **MEDIUM: Synchronous fs.existsSync in loadFingerprints** (BUG #11, SMCP-078)
  - Replaced `fs.existsSync` with async `fs.promises.access` in fingerprints loader

- **MEDIUM: SQL IN Clause Construction** (BUG #13, SMCP-078)
  - Added UUID format validation for chunk IDs before SQL construction
  - Invalid IDs are logged and skipped for defense in depth

- **LOW: escapeSqlString Security Hardening** (BUG #15, SMCP-078)
  - Added removal of semicolons (statement terminator)
  - Added removal of SQL comment sequences (`--` and `/* */`)
  - Defense in depth for SQL escaping

- **LOW: Timer Leak in IntegrityScheduler** (BUG #16, SMCP-078)
  - Added explicit `this.timer !== null` check to prevent timer leaks

- **LOW: Missing top_k Upper Bound Validation** (BUG #23, SMCP-078)
  - Added upper/lower bound validation in LanceDB search (clamps to 1-100)
  - Prevents resource exhaustion from arbitrary top_k values

- **LOW: ReadWriteLock Starvation Documentation** (BUG #18, SMCP-078)
  - Added comprehensive documentation about starvation potential
  - Documented why it's acceptable and future fairness options

- **LOW: Chunking Line Calculation Edge Case** (BUG #20, SMCP-078)
  - Added documentation explaining the edge case handling
  - Clarified that the guard is correct behavior

## [1.3.2] - 2025-12-12

### Fixed
- **MEDIUM: Stream Resource Leaks in Large File Chunking** (BUG #5, SMCP-076)
  - Attached error handlers immediately after stream creation to eliminate race window
  - Added `rejected` flag and `rejectOnce` helper to prevent double rejection
  - Added `cleanup()` function called from all exit paths
  - Consolidated duplicate error handlers for cleaner code

- **MEDIUM: Partial Initialization State in Embedding Engine** (BUG #9, SMCP-076)
  - Wrapped initialization in inner async IIFE for atomic state handling
  - Used finally block to clear `initializationPromise` only if pipeline not set
  - Ensures retry works correctly after any initialization failure

- **MEDIUM: Unhandled Promise Rejection in Background Startup Check** (BUG #21, SMCP-076)
  - Used `Promise.resolve().then()` pattern to catch both synchronous and async errors
  - All errors now properly logged instead of causing unhandled rejections
  - Added 2 tests for error handling scenarios

- **MEDIUM: Missing Error Handling for Config Load Failure** (BUG #26, SMCP-076)
  - Added try-catch around config loading in `create_index` tool handler
  - Falls back to `DEFAULT_CONFIG` on any config load error
  - Logs warning about config load failure for debugging

- **MEDIUM: FTS Index Uses Non-Atomic Writes** (BUG #25, SMCP-077)
  - FTS index now uses `atomicWrite` utility (temp-file-then-rename pattern)
  - Prevents FTS index corruption if process crashes during write
  - Updated both `indexManager.ts` and `reindexFile.ts`

- **MEDIUM: Project Path Cache Without Invalidation** (BUG #22, SMCP-077)
  - Added validation that cached project path still exists before returning
  - Uses `fs.promises.access()` to verify path accessibility
  - Re-detects project root if cached path is deleted/moved during long-running session
  - Added unit test for cache invalidation scenario

- **MEDIUM: Metadata Staleness During Concurrent Indexing** (BUG #24, SMCP-077)
  - Enhanced documentation for existing indexing state check in search operations
  - Search operations already warn users when indexing is in progress
  - Clarified that warning approach is the implemented solution for concurrent access

- **MEDIUM: TOCTOU in Stale Lockfile Cleanup** (BUG #8, SMCP-077)
  - Added comprehensive documentation of the inherent TOCTOU limitation
  - Documents why it's acceptable (single MCP server per project, small race window)
  - Lists platform-specific alternatives if multi-process safety becomes critical

## [1.3.1] - 2025-12-12

### Fixed
- **HIGH: Glob Timeout Resource Exhaustion** (BUG #4, SMCP-075)
  - Replaced `Promise.race` timeout pattern with `AbortController` for glob operations
  - Glob operations now properly cancel when timeout fires, preventing resource exhaustion
  - Timeout is properly cleared in finally block to prevent memory leaks
  - Added 3 new tests for glob timeout cancellation

- **HIGH: AsyncMutex Timeout/Grant Race Condition** (BUG #6, SMCP-075)
  - Added atomic `satisfied` flag to prevent race between timeout and lock grant
  - `resolveWrapper` now returns boolean to indicate if lock was accepted
  - Updated `release()` to skip timed-out waiters and properly unlock mutex
  - Prevents potential deadlock in high-contention scenarios
  - Added 6 new stress tests for high contention and race condition handling

## [1.3.0] - 2025-12-12

### Added
- **Migration Detection and Model Compatibility** (SMCP-074)
  - All MCP tools now use the correct embedding engines (code vs docs)
  - `search_code` uses `getCodeEmbeddingEngine()` (BGE-small, 384 dims)
  - `search_docs` uses `getDocsEmbeddingEngine()` (BGE-base, 768 dims)
  - Index creation and reindexing now save model metadata to `metadata.json`
  - Migration detection warns when searching an index created with a different model
  - Searching with mismatched models triggers clear error suggesting `reindex_project`
  - `get_index_status` now shows embedding model information and mismatch warnings
  - New utility: `checkModelCompatibility()` in `src/utils/modelCompatibility.ts`
  - New utility functions: `checkCodeModelCompatibility()`, `checkDocsModelCompatibility()`
  - New utility: `buildStatusWarning()` for non-blocking status warnings
  - `createMetadata()` now includes embedding model info by default
  - **Breaking for legacy indexes**: Search operations on legacy indexes (created before SMCP-072) will fail with a helpful error message suggesting `reindex_project`
- **Dual Embedding Model Support** (SMCP-072)
  - Refactored embedding engine to support two separate models
  - Code search: `Xenova/bge-small-en-v1.5` (384 dimensions)
  - Docs search: `Xenova/bge-base-en-v1.5` (768 dimensions)
  - New exports: `CODE_MODEL_NAME`, `CODE_EMBEDDING_DIMENSION`, `DOCS_MODEL_NAME`, `DOCS_EMBEDDING_DIMENSION`
  - New exports: `CODE_ENGINE_CONFIG`, `DOCS_ENGINE_CONFIG`, `EmbeddingEngineConfig`
  - New functions: `getCodeEmbeddingEngine()`, `getDocsEmbeddingEngine()`
  - New reset functions: `resetCodeEmbeddingEngine()`, `resetDocsEmbeddingEngine()`
  - EmbeddingEngine now accepts config parameter for model customization
  - New methods: `getModelName()`, `getDisplayName()` on EmbeddingEngine class
  - Backward compatible: `getEmbeddingEngine()`, `MODEL_NAME`, `EMBEDDING_DIMENSION` still work
- **Configurable Vector Dimensions in Storage** (SMCP-073)
  - `LanceDBStore` now accepts `vectorDimension` parameter (defaults to 384)
  - `DocsLanceDBStore` now accepts configurable dimension (defaults to 384 for backward compat)
  - New exports: `CODE_VECTOR_DIMENSION` (384), `DOCS_VECTOR_DIMENSION` (768)
  - Added `EmbeddingModelInfoSchema` to metadata for tracking model names and dimensions
  - New `MetadataManager` methods: `updateEmbeddingModelInfo()`, `getCodeModelName()`, `getDocsModelName()`, etc.
  - Backward compatible: existing indexes without `embeddingModels` field still work
- **Config Matrix npm Scripts** (SMCP-071)
  - `npm run test:configs` - Run config matrix and accuracy comparison tests
  - `npm run test:configs:watch` - Watch mode for config tests
  - `npm run test:configs:full` - Run tests against full codebase (FULL_CODEBASE=true)
  - Added `cross-env` dependency for Windows compatibility
- **Accuracy Comparison Tests** (`tests/configs/accuracyComparison.test.ts`) (SMCP-070)
  - Compares MCP search efficiency against Grep and Drag-and-Drop baselines
  - Tests 5 representative configs (default, alpha-0.0, alpha-0.5, alpha-1.0, fts-js)
  - Calculates MCP vs Grep efficiency ratio
  - Calculates MCP vs Drag-and-Drop efficiency ratio
  - Tracks deduplication effectiveness per config
  - Generates comparison reports to `tests/reports/accuracy-comparison-*.md`
  - FULL_CONFIG and FULL_CODEBASE environment variables for extended testing
- **Config Matrix Test Runner** (`tests/configs/configMatrix.test.ts`) (SMCP-069)
  - Systematically tests all 21 configuration combinations
  - Runs 20 test queries against each config
  - Collects quality metrics (precision@5, relevance hits)
  - Collects performance metrics (latency, memory, tokens)
  - Generates JSON and Markdown reports to `tests/reports/`
  - FULL_CODEBASE environment variable for testing against actual codebase

## [1.2.0] - 2025-12-11

### Added
- **Hybrid Search** - Combines semantic (vector) and keyword (FTS) search for better results
  - New `mode` parameter for `search_code` and `search_docs`: `'hybrid'` (default), `'vector'`, `'fts'`
  - New `alpha` parameter (0-1) to control semantic vs keyword weight
  - Reciprocal Rank Fusion (RRF) algorithm for intelligent result merging
  - Backward compatible: existing indexes without FTS fall back to vector-only search
- **FTS Engine Interface** (`src/engines/ftsEngine.ts`) (SMCP-058)
  - Unified interface for full-text search engines
  - Support for multiple implementations (JS and native)
  - Error types: `FTSNotInitializedError`, `FTSQueryError`, `FTSSerializationError`
- **NaturalBM25Engine** (`src/engines/naturalBM25.ts`) - Pure JavaScript FTS implementation
  - Uses `natural` npm package for TF-IDF/BM25 based text search
  - No native dependencies - works on all platforms
  - Supports add/remove/search operations
  - Score normalization for hybrid search (0-1 range)
  - Serialization/deserialization for index persistence
- **FTS Engine Factory** (`src/engines/ftsEngineFactory.ts`) (SMCP-060)
  - Auto-detection of best FTS engine based on codebase size
  - Threshold: 5000 files triggers native engine selection when available
  - User preference override via `hybridSearch.ftsEngine` config option
  - Graceful fallback from native to JS when better-sqlite3 unavailable
- **Hybrid Search Configuration** - New `hybridSearch` config section
  - `enabled` (boolean, default: true) - Enable/disable hybrid search
  - `ftsEngine` ('auto' | 'js' | 'native', default: 'auto') - FTS engine preference
  - `defaultAlpha` (0-1, default: 0.7) - Semantic vs keyword weight
- **Compact output format** for `search_code` and `search_docs` tools (SMCP-065)
  - New `compact` parameter (default: false) returns results with shorter field names
  - Reduces token count by ~5% through shorter field names
- **Code-aware chunking module** (`src/engines/codeAwareChunking.ts`) (SMCP-066)
  - Heuristic-based chunking that splits at semantic boundaries
  - Supports TypeScript, JavaScript, and Python
  - New config option: `chunkingStrategy: 'character' | 'code-aware'` (default: 'character')
- `get_index_status` now shows hybrid search info (FTS engine type, chunk count, default alpha)
- `reindex_file` now updates both vector and FTS indexes incrementally
- Comprehensive hybrid search integration tests (48 tests)

### Changed
- `search_code` and `search_docs` now apply whitespace trimming and same-file deduplication
- Reduced token usage by ~7-8% through automatic result optimization
- Default search mode is now `hybrid` (combines vector + keyword search)

### Documentation
- Updated API reference with new `mode` and `alpha` parameters
- Added Hybrid Search section to configuration docs
- Added Hybrid Search examples to examples docs
- Updated ROADMAP to mark Hybrid Search as completed

## [1.1.5] - 2024-12-11

### Added
- New `get_config` tool to retrieve configuration file path and contents
- `indexPath` and `configPath` fields added to `get_index_status` output

## [1.1.4] - 2024-12-11

### Added
- CHANGELOG.md - Version history
- CONTRIBUTING.md - Contributor guide
- ROADMAP.md - Planned features
- docs/api-reference.md - Complete API documentation
- README badges (npm version, license, node version)
- Links to all new docs in README Documentation section

## [1.1.3] - 2024-12-11

### Fixed
- Fixed `create_index`, `reindex_project`, and `delete_index` tools returning "cancelled" status
- Fixed `claude mcp add` command syntax in documentation

### Changed
- Removed `-y` flag from `npx` commands in documentation (caused errors with Claude Code)

### Added
- "Updating & Uninstalling" section in README
- `claude mcp remove search` uninstall instructions

## [1.1.2] - 2024-12-11

### Changed
- Added Windows paths alongside macOS/Linux paths in all documentation
- Improved documentation for cross-platform users

## [1.1.1] - 2024-12-11

### Changed
- Updated package name references from `@blakazulu/search-mcp` to `@liraz-sbz/search-mcp`

## [1.1.0] - 2024-12-11

### Changed
- Migrated from deprecated `vectordb` package to `@lancedb/lancedb`
- Simplified lazy indexing strategy to true lazy loading (index only on first search)

### Fixed
- Various security hardening improvements

## [1.0.0] - 2024-12-10

### Added
- Initial release
- `create_index` - Create search index for a project
- `search_code` - Semantic search for code
- `search_docs` - Semantic search for documentation (.md, .txt files)
- `search_by_path` - Find files by glob pattern
- `get_index_status` - Show index statistics
- `reindex_project` - Rebuild entire index
- `reindex_file` - Re-index a single file
- `delete_index` - Remove project index
- Real-time file watching with automatic index updates
- Three indexing strategies: realtime, lazy, git
- Local embedding model (Xenova/all-MiniLM-L6-v2)
- LanceDB vector storage
- Hardcoded security deny list for sensitive files
- Path traversal and symlink attack protection
- Resource exhaustion protection

### Security
- Path security hardening with symlink protection
- Input validation on all tool parameters
- Confirmation bypass prevention
- Zero vector insertion prevention
- File filtering security hardening
- Concurrency and data integrity protections

[1.1.5]: https://github.com/blakazulu/search-mcp/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/blakazulu/search-mcp/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/blakazulu/search-mcp/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/blakazulu/search-mcp/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/blakazulu/search-mcp/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/blakazulu/search-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/blakazulu/search-mcp/releases/tag/v1.0.0
