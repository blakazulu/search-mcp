# Roadmap

This document outlines the planned features and improvements for Search MCP.

---

## Current Version: 1.3.5

### What's Working
- Semantic search for code and documentation
- **Hybrid search** (vector + keyword) with configurable modes
- Three indexing strategies (realtime, lazy, git)
- Real-time file watching
- Local embedding model (no API keys needed)
- Cross-platform support (macOS, Linux, Windows)

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

---

## Backlog - Search Quality

Improvements to search relevance and result quality.

| Improvement | Description |
|-------------|-------------|
| Adaptive RRF constant | Tune k parameter based on corpus size (currently hardcoded k=60) |
| Content-based deduplication | Deduplicate results with identical content across different files |
| Query expansion | Rewrite queries to match synonyms (e.g., "hash" → "SHA256") |
| File importance signals | Rank by recency, import frequency, file connectivity |

---

## Medium Term (v1.4.x)

### New Features

| Feature | Description | Priority |
|---------|-------------|----------|
| `list_projects` | Show all indexed projects with stats | High |
| PDF Doc Support | Add PDF text extraction to `search_docs` | Medium |

### Improvements

| Improvement | Description |
|-------------|-------------|
| Better error messages | More actionable error messages with suggestions |
| Search result ranking | Improve relevance scoring |
| Incremental reindexing | Only reindex changed parts of large files |
| Multi-language code chunking | Extend code-aware chunking to: Java, Go, Rust, C#, C/C++, Kotlin, Swift, Ruby, PHP, CSS/SCSS/LESS, HTML, Vue/Svelte SFCs, SQL, YAML, JSON, XML, GraphQL, Shell/Bash, Terraform/HCL, Dockerfile |

---

## Long Term (v2.x and beyond)

### Advanced Features

| Feature | Description | Complexity |
|---------|-------------|------------|
| Multi-Root Support | Index multiple folders as one project | Medium |
| Query Expansion | Rewrite queries for better retrieval | Medium |
| Custom Models | Allow users to specify embedding model | Medium |
| AST Chunking | Language-aware splitting via tree-sitter | High |

### Documentation Support

| Feature | Description |
|---------|-------------|
| RST/AsciiDoc Support | Add .rst and .adoc to doc search |
| Markdown Header Chunking | Split docs by headers for better context |
| Code comment extraction | Index comments separately for doc search |

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

- **High** - Coming soon, actively planned
- **Medium** - On the roadmap, will happen
- **Low** - Nice to have, contributions welcome
