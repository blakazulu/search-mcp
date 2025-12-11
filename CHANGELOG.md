# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.3]: https://github.com/blakazulu/search-mcp/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/blakazulu/search-mcp/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/blakazulu/search-mcp/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/blakazulu/search-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/blakazulu/search-mcp/releases/tag/v1.0.0
