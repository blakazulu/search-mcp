# Roadmap

This document outlines the planned features and improvements for Search MCP.

---

## Current Version: 1.4.0

### What's Working
- Semantic search for code and documentation
- **Hybrid search** (vector + keyword) with configurable modes
- Three indexing strategies (realtime, lazy, git)
- Real-time file watching
- Local embedding model (no API keys needed)
- Cross-platform support (macOS, Linux, Windows)
- **GPU acceleration via DirectML** (Windows)

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

## Planned Features (Task Tracked)

These features have detailed task files in `docs/tasks/active/11-upgrades/`.

### GPU Acceleration (P0-P1)

| Task | Title | Priority | Hours |
|------|-------|----------|-------|
| [SMCP-091](docs/tasks/active/11-upgrades/SMCP-091-lancedb-gpu-acceleration.md) | LanceDB GPU Acceleration (CUDA/MPS) | P0 | 20 |
| [SMCP-092](docs/tasks/active/11-upgrades/SMCP-092-cuda-mps-embedding-support.md) | CUDA/MPS Embedding Support | P1 | 16 |

### Indexing & Performance (P1-P2)

| Task | Title | Priority | Hours |
|------|-------|----------|-------|
| [SMCP-089](docs/tasks/active/11-upgrades/SMCP-089-merkle-dag-change-detection.md) | Merkle DAG Change Detection | P1 | 10 |
| [SMCP-093](docs/tasks/active/11-upgrades/SMCP-093-connection-pooling.md) | Connection Pooling for LanceDB | P1 | 8 |
| [SMCP-094](docs/tasks/active/11-upgrades/SMCP-094-search-triggered-reindexing.md) | Search-Triggered Auto-Reindexing | P1 | 10 |
| [SMCP-098](docs/tasks/active/11-upgrades/SMCP-098-incremental-reindexing.md) | Incremental Reindexing | P2 | 12 |

### Search Quality (P1-P2)

| Task | Title | Priority | Hours |
|------|-------|----------|-------|
| [SMCP-085](docs/tasks/active/11-upgrades/SMCP-085-query-intent-detection.md) | Query Intent Detection | P1 | 8 |
| [SMCP-087](docs/tasks/active/11-upgrades/SMCP-087-multi-factor-search-ranking.md) | Multi-Factor Search Ranking | P1 | 12 |
| [SMCP-095](docs/tasks/active/11-upgrades/SMCP-095-query-expansion.md) | Query Expansion & Synonyms | P2 | 6 |
| [SMCP-096](docs/tasks/active/11-upgrades/SMCP-096-domain-embedding-prompts.md) | Domain-Specific Embedding Prompts | P2 | 4 |

### Code Intelligence (P2-P3)

| Task | Title | Priority | Hours |
|------|-------|----------|-------|
| [SMCP-086](docs/tasks/active/11-upgrades/SMCP-086-ast-based-chunking.md) | AST-Based Chunking | P2 | 16 |
| [SMCP-090](docs/tasks/active/11-upgrades/SMCP-090-symbol-extraction.md) | Symbol Extraction | P2 | 8 |
| [SMCP-097](docs/tasks/active/11-upgrades/SMCP-097-multi-language-code-chunking.md) | Multi-Language Code Chunking | P2 | 16 |

### Documentation Search (P2-P3)

| Task | Title | Priority | Hours |
|------|-------|----------|-------|
| [SMCP-099](docs/tasks/active/11-upgrades/SMCP-099-markdown-header-chunking.md) | Markdown Header Chunking | P2 | 6 |
| [SMCP-100](docs/tasks/active/11-upgrades/SMCP-100-code-comment-extraction.md) | Code Comment Extraction | P3 | 8 |

### User Experience (P2)

| Task | Title | Priority | Hours |
|------|-------|----------|-------|
| [SMCP-088](docs/tasks/active/11-upgrades/SMCP-088-zero-config-cli.md) | Zero-Config CLI | P2 | 6 |

**Total Planned Hours: 166**

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

| Improvement | Description | Impact | Related Task |
|-------------|-------------|--------|--------------|
| FTS engine memory caching | Keep deserialized FTS in memory instead of reading from disk every search | ~10x faster searches | - |
| Search result caching | LRU cache for repeated queries with smart invalidation | ~10x for repeated queries | - |
| Adaptive batch sizing | Tune embedding batch size based on content length and memory | Better memory efficiency | - |
| Adaptive RRF constant | Tune k parameter based on corpus size (currently hardcoded k=60) | Better ranking | SMCP-087 |

---

## Backlog - Search Quality

Improvements to search relevance and result quality.

| Improvement | Description | Related Task |
|-------------|-------------|--------------|
| Content-based deduplication | Deduplicate results with identical content across different files | - |
| Query expansion | Rewrite queries to match synonyms (e.g., "hash" → "SHA256") | **SMCP-095** |
| File importance signals | Rank by recency, import frequency, file connectivity | **SMCP-087** |

---

## Medium Term (v1.5.x)

### New Features

| Feature | Description | Priority | Related Task |
|---------|-------------|----------|--------------|
| `list_projects` | Show all indexed projects with stats | High | - |
| PDF Doc Support | Add PDF text extraction to `search_docs` | Medium | - |
| GPU Acceleration | CUDA/MPS for indexing and embedding | High | **SMCP-091, SMCP-092** |

### Improvements

| Improvement | Description | Related Task |
|-------------|-------------|--------------|
| Better error messages | More actionable error messages with suggestions | - |
| Search result ranking | Improve relevance scoring | **SMCP-087** |
| Incremental reindexing | Only reindex changed parts of large files | **SMCP-098** |
| Multi-language code chunking | Extend code-aware chunking to 20+ languages | **SMCP-097** |

---

## Long Term (v2.x and beyond)

### Advanced Features

| Feature | Description | Complexity | Related Task |
|---------|-------------|------------|--------------|
| Multi-Root Support | Index multiple folders as one project | Medium | - |
| Query Expansion | Rewrite queries for better retrieval | Medium | **SMCP-095** |
| Custom Models | Allow users to specify embedding model | Medium | - |
| AST Chunking | Language-aware splitting via tree-sitter | High | **SMCP-086** |

### Documentation Support

| Feature | Description | Related Task |
|---------|-------------|--------------|
| RST/AsciiDoc Support | Add .rst and .adoc to doc search | - |
| Markdown Header Chunking | Split docs by headers for better context | **SMCP-099** |
| Code comment extraction | Index comments separately for doc search | **SMCP-100** |

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
