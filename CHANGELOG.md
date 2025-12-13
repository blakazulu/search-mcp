# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
