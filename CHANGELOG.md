# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **FTS (Full-Text Search) Engine Interface** (`src/engines/ftsEngine.ts`) (SMCP-058)
  - Unified interface for full-text search engines
  - Support for multiple implementations (JS and native)
  - Error types: `FTSNotInitializedError`, `FTSQueryError`, `FTSSerializationError`
- **NaturalBM25Engine** (`src/engines/naturalBM25.ts`) - Pure JavaScript FTS implementation
  - Uses `natural` npm package for TF-IDF based text search
  - No native dependencies - works on all platforms
  - Supports add/remove/search operations
  - Score normalization for hybrid search (0-1 range)
  - Serialization/deserialization for index persistence
  - 51 unit tests with performance benchmarks
- **FTS Engine Factory** (`src/engines/ftsEngineFactory.ts`) (SMCP-060)
  - Auto-detection of best FTS engine based on codebase size and native module availability
  - Threshold: 5000 files triggers native engine selection when available
  - User preference override via `hybridSearch.ftsEngine` config option
  - Clear feedback about which engine was selected and why
  - Graceful fallback from native to JS when better-sqlite3 unavailable
- **Hybrid Search Configuration** - New `hybridSearch` config section
  - `enabled` (boolean, default: true) - Enable/disable hybrid search
  - `ftsEngine` ('auto' | 'js' | 'native', default: 'auto') - FTS engine preference
  - `defaultAlpha` (0-1, default: 0.7) - Semantic vs keyword weight (0.7 = 70% semantic)
- Search result processing utilities for token optimization (`src/utils/searchResultProcessing.ts`)
- **Compact output format** for `search_code` and `search_docs` tools (SMCP-065)
  - New `compact` parameter (default: false) returns results with shorter field names
  - When compact=true: `l` (location), `t` (text), `s` (score), `r` (results), `n` (count), `ms` (time)
  - Reduces token count by ~5% through shorter field names
- **Code-aware chunking module** (`src/engines/codeAwareChunking.ts`) (SMCP-066)
  - Heuristic-based chunking that splits at semantic boundaries (functions, classes, exports)
  - Supports TypeScript, JavaScript, and Python
  - Falls back to character-based chunking for unsupported languages
  - New config option: `chunkingStrategy: 'character' | 'code-aware'` (default: 'character')
  - Reduced overlap (200 chars vs 800) since splits occur at meaningful boundaries

### Changed
- `search_code` and `search_docs` now apply whitespace trimming and same-file deduplication to results
- Reduced token usage by ~7-8% through automatic result optimization

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
