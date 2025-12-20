# Roadmap

This document outlines the planned features and improvements for Search MCP.

---

## Current Version: 1.6.x

### What's Working
- Semantic search for code and documentation
- **Hybrid search** (vector + keyword) with configurable modes
- Three indexing strategies (realtime, lazy, git)
- Real-time file watching
- Local embedding model (no API keys needed)
- Cross-platform support (macOS, Linux, Windows)
- **GPU acceleration via DirectML** (Windows)
- **AST-based chunking** with Tree-sitter (10+ languages)
- **Query intent detection** and expansion
- **Multi-factor search ranking**
- **Zero-config CLI** with interactive setup
- **Symbol extraction** with complexity metrics
- **Markdown header chunking** for docs
- **Incremental reindexing** for large files

---

## Short Term (Next Release)

### CI/CD Pipeline
- [ ] GitHub Actions for automated testing on PRs
- [ ] Automated npm publishing on release
- [ ] Code coverage reporting
- [ ] Branch protection rules

### Quality Improvements
- [ ] Improve flaky file watcher tests
- [ ] Add integration test suite

---

## Backlog - Critical/High Priority

Security and stability issues that should be addressed.

| Issue | Location | Description | Severity |
|-------|----------|-------------|----------|
| IndexingLock race condition | `asyncMutex.ts:493-520` | Race between `isLocked` check and `acquire()` can cause deadlocks | Critical |
| TOCTOU symlink vulnerability | `secureFileAccess.ts:70-78` | Symlinks could be swapped between check and read | High |
| Unbounded reconciliation queue | `fileWatcher.ts:213` | Memory can grow unbounded during large git operations | High |

---

## Backlog - Performance

Performance optimizations that would improve search speed and resource usage.

| Improvement | Description | Impact |
|-------------|-------------|--------|
| FTS engine memory caching | Keep deserialized FTS in memory instead of reading from disk every search | ~10x faster searches |
| Search result caching | LRU cache for repeated queries with smart invalidation | ~10x for repeated queries |
| Adaptive batch sizing | Tune embedding batch size based on content length and memory | Better memory efficiency |
| Adaptive RRF constant | Tune k parameter based on corpus size (currently hardcoded k=60) | Better ranking |

---

## Backlog - Search Quality

Improvements to search relevance and result quality.

| Improvement | Description |
|-------------|-------------|
| Content-based deduplication | Deduplicate results with identical content across different files |

---

## Medium Term (Next Minor Release)

### New Features

| Feature | Description | Priority |
|---------|-------------|----------|
| `list_projects` | Show all indexed projects with stats | High |
| PDF Doc Support | Add PDF text extraction to `search_docs` | Medium |

### Improvements

| Improvement | Description |
|-------------|-------------|
| Better error messages | More actionable error messages with suggestions |

---

## Long Term (v2.x and beyond)

### Advanced Features

| Feature | Description | Complexity |
|---------|-------------|------------|
| Multi-Root Support | Index multiple folders as one project | Medium |
| Custom Models | Allow users to specify embedding model | Medium |

### Documentation Support

| Feature | Description |
|---------|-------------|
| RST/AsciiDoc Support | Add .rst and .adoc to doc search |

### User Experience

| Feature | Description |
|---------|-------------|
| Search History | Track and recall recent searches |
| Index Stats Dashboard | Visual stats via web UI |
| VS Code Extension | Native VS Code integration |

---

## Under Consideration

These are ideas we're evaluating but haven't committed to:

- **Cloud sync** - Optional sync of indexes across machines
- **Team sharing** - Share indexes with team members
- **Custom deny lists** - User-configurable sensitive file patterns
- **Embedding caching** - Cache embeddings to speed up reindexing
- **Incremental backups** - Automatic index backups
- **Vector quantization** - int8 compression for 4x storage reduction
- **Inode tracking** - Handle hard links and detect file renames
- **Query analytics** - Optional logging to understand search patterns
- **Reconciliation checkpoints** - Resume interrupted index rebuilds
- **Incremental LanceDB updates** - Avoid full rebuild for single-file edits
- **Config schema versioning** - Handle config format changes across versions
- **LanceDB version pinning** - Test and pin compatible LanceDB version

---

## Completed

### v1.6.x
- [x] **AST-based chunking** (SMCP-086) - Tree-sitter powered semantic chunking for 10+ languages
- [x] **Query intent detection** (SMCP-085) - Smart query classification and routing
- [x] **Multi-factor search ranking** (SMCP-087) - Improved relevance with file importance signals
- [x] **Zero-config CLI** (SMCP-088) - Interactive setup with `npx @liraz-sbz/search-mcp setup`
- [x] **Merkle DAG change detection** (SMCP-089) - Efficient incremental updates
- [x] **Symbol extraction** (SMCP-090) - `get_file_summary` tool with complexity metrics
- [x] **Connection pooling** (SMCP-093) - LanceDB connection management
- [x] **Search-triggered reindexing** (SMCP-094) - Auto-reindex stale indexes
- [x] **Query expansion** (SMCP-095) - Synonym and related term expansion
- [x] **Domain embedding prompts** (SMCP-096) - Optimized prompts for code/docs
- [x] **Multi-language code chunking** (SMCP-097) - Extended language support
- [x] **Incremental reindexing** (SMCP-098) - Partial file reindexing
- [x] **Markdown header chunking** (SMCP-099) - Section-aware doc chunking
- [x] **Code comment extraction** (SMCP-100) - Index comments for doc search
- [x] **Clean CLI output** (SMCP-101) - Improved user experience

### v1.5.x
- [x] **LanceDB GPU acceleration** (SMCP-091) - DirectML support on Windows
- [x] **CUDA/MPS embedding support** (SMCP-092) - GPU backend options

### v1.4.0
- [x] **GPU Acceleration via DirectML** - Windows GPU support for faster indexing
- [x] Human-readable index summary and docs diagnostics
- [x] Detailed index statistics and unified code+docs indexing

### v1.3.x
- [x] WebGPU acceleration planning and documentation

### v1.2.0
- [x] **Hybrid Search** - Combine vector + keyword search (BM25) for better results
  - [x] FTS Engine Interface with JS implementation (NaturalBM25Engine)
  - [x] Native SQLite FTS5 engine (optional, for large codebases)
  - [x] Auto-detection of best engine based on project size
  - [x] Search modes: hybrid, vector, fts
  - [x] Alpha parameter for tuning semantic vs keyword weight
  - [x] Reciprocal Rank Fusion (RRF) for result merging
  - [x] Comprehensive integration tests (48 tests)
- [x] **Search Efficiency Improvements** - 7.3% token reduction
  - [x] Deduplicate same-file search results (smart merging)
  - [x] Trim whitespace from chunk boundaries
  - [x] Compact output format (`compact: true` parameter)
- [x] **Code-aware chunking** - Heuristic-based semantic splitting
  - [x] TypeScript/JavaScript support (functions, classes, interfaces)
  - [x] Python support (functions, classes, decorators)
  - [x] Configurable via `chunkingStrategy` setting
- [x] get_config tool
- [x] Updated documentation (API reference, configuration, examples)

### v1.1.x
- [x] Migrate to @lancedb/lancedb (from deprecated vectordb)
- [x] Cross-platform path documentation
- [x] Fix confirmation flow for tools
- [x] Documentation improvements

### v1.0.0
- [x] Core MCP server implementation
- [x] 8 MCP tools (create, search, reindex, delete, etc.)
- [x] Realtime, lazy, and git indexing strategies
- [x] Security hardening (path traversal, symlinks, DoS protection)
- [x] Comprehensive test suite (1875+ tests)

---

## Contributing

Have an idea? We'd love to hear it!

- Open a [GitHub Issue](https://github.com/blakazulu/search-mcp/issues) to suggest features
- Check the [Contributing Guide](CONTRIBUTING.md) to submit a PR
- Vote on existing issues to help us prioritize

---

## Priority Legend

- **P0** - Critical, do immediately
- **P1** - High priority, next up
- **P2** - Medium priority, planned
- **P3** - Low priority, when time permits
