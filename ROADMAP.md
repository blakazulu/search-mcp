# Roadmap

This document outlines the planned features and improvements for Search MCP.

---

## Current Version: 1.1.3

### What's Working
- Semantic search for code and documentation
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

## Medium Term (v1.2.x)

### New Features

| Feature | Description | Priority |
|---------|-------------|----------|
| `list_projects` | Show all indexed projects with stats | High |
| Hybrid Search | Combine vector + keyword search (BM25) for better results | High |
| PDF Doc Support | Add PDF text extraction to `search_docs` | Medium |

### Improvements

| Improvement | Description |
|-------------|-------------|
| Better error messages | More actionable error messages with suggestions |
| Search result ranking | Improve relevance scoring |
| Incremental reindexing | Only reindex changed parts of large files |

---

## Long Term (v1.3.x and beyond)

### Advanced Features

| Feature | Description | Complexity |
|---------|-------------|------------|
| AST Chunking | Language-aware code splitting via tree-sitter | High |
| Multi-Root Support | Index multiple folders as one project | Medium |
| Query Expansion | Rewrite queries for better retrieval | Medium |
| Custom Models | Allow users to specify embedding model | Medium |

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

---

## Completed

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
