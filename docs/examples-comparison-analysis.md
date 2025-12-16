# Examples vs Search-MCP: Comprehensive Comparison Analysis

> Generated: 2025-12-16

This document analyzes the four example implementations in `/examples` and compares them against search-mcp's current capabilities.

---

## Executive Summary

| Project | Language | Vector DB | Embedding Model | GPU Support | Key Strength |
|---------|----------|-----------|-----------------|-------------|--------------|
| **search-mcp** | TypeScript | LanceDB | BGE (384/768-dim) | DirectML | Hybrid search + GPU |
| cursor-local-indexing | Python | ChromaDB | MiniLM (384-dim) | No | Docker deployment |
| claude-context-local | Python | FAISS | EmbeddingGemma (768-dim) | FAISS GPU | AST + Merkle DAG |
| mcp-vector-search | Python | ChromaDB | MiniLM (384-dim) | No | CLI/UX excellence |
| code-index-mcp | Python | None (text search) | None | No | Hybrid shallow/deep indexing |

---

## 1. cursor-local-indexing-main

### Overview
Experimental Python-based MCP server optimized for Cursor IDE with Docker-first deployment.

### Technology Stack
- **Vector Database:** ChromaDB (persistent)
- **Embedding Model:** Sentence Transformers `all-MiniLM-L6-v2` (384-dim)
- **Code Parsing:** LlamaIndex CodeSplitter + Tree-sitter
- **File Watching:** Watchdog
- **MCP Framework:** FastMCP (SSE/HTTP transport)
- **Deployment:** Docker & Docker Compose

### Key Features
1. **Language-Aware Chunking**
   - 40 lines per chunk, 15-line overlap, 1500 char max
   - Falls back to line-based splitting for unsupported languages
   - Supports 20+ programming languages

2. **Search Implementation**
   - ChromaDB vector similarity with configurable thresholds
   - Multi-project support via collection isolation
   - Results include: snippet, file path, language, line numbers, relevance score

3. **Real-Time Monitoring**
   - Watchdog-based file watching
   - Incremental indexing on create/modify/delete

### What It Does Better Than search-mcp
| Feature | cursor-local | search-mcp |
|---------|--------------|------------|
| Docker deployment | Out-of-the-box | Not available |
| Multi-project isolation | Built-in collections | Single project per index |
| Line-based chunking | 40 lines with overlap | Character-based (~4000 chars) |

### What search-mcp Has That It Doesn't
- GPU acceleration (DirectML)
- Hybrid search (vector + FTS)
- Dual embedding models (code vs docs)
- Native TypeScript (no Python runtime needed)
- Separate docs indexing with optimized chunking

---

## 2. claude-context-local-main

### Overview
Sophisticated semantic code search with AST-based chunking and Merkle tree-based incremental indexing. The most feature-rich example.

### Technology Stack
- **Embedding Model:** Google EmbeddingGemma-300m (768-dim) - local inference
- **Vector Index:** FAISS (flat or IVF based on dataset size)
- **Metadata Store:** SQLiteDict with WAL mode
- **Code Parsing:**
  - Python: Custom AST-based chunker with rich metadata
  - Others: Tree-sitter (JS/TS/Go/Java/Rust/C/C++/C#/Svelte)
- **Incremental Indexing:** Merkle DAG-based change detection
- **GPU Support:** FAISS GPU acceleration (auto-detects NVIDIA)

### Key Features

1. **Advanced AST-Based Chunking**
   ```
   Python AST Extraction:
   - Functions with signatures, docstrings, decorators
   - Classes with methods and relationships
   - Module-level documentation
   - Parent-child relationship tracking
   ```

2. **Sophisticated Search Ranking**
   ```
   Multi-Factor Ranking Algorithm:
   - Base similarity score
   - Chunk type boosting (dynamic based on query intent)
   - Name matching with CamelCase-aware tokenization
   - Path/filename relevance
   - Tag overlap with detected intent
   - Docstring presence bonus
   - Complexity penalty for oversized chunks
   ```

3. **Query Intent Detection**
   - Detects: function search, error handling, database, API, auth, testing
   - Optimizes query expansion to preserve code specificity
   - Dynamic chunk type boosting based on intent

4. **Merkle DAG Incremental Indexing**
   - Content-hash based change detection
   - Snapshot persistence for state management
   - Only reprocesses modified files
   - Efficient for large codebases with frequent small changes

5. **GPU FAISS Support**
   - Auto-detects NVIDIA GPUs
   - Moves index to GPU for faster search
   - CPU fallback with graceful degradation

### What It Does Better Than search-mcp

| Feature | claude-context-local | search-mcp |
|---------|---------------------|------------|
| Ranking algorithm | Multi-factor (7+ signals) | RRF hybrid (2 signals) |
| Query intent detection | Yes (6 categories) | No |
| AST metadata extraction | Rich (signatures, decorators, relationships) | Basic (line numbers only) |
| Chunk type boosting | Dynamic based on intent | None |
| Change detection | Merkle DAG (efficient) | SHA256 fingerprints (full-file) |
| Name matching | CamelCase-aware tokenization | None |

### What search-mcp Has That It Doesn't
- DirectML GPU support (Windows AMD/Intel/NVIDIA)
- Keyword search (FTS5/BM25) as alternative to vector
- Dual FTS engines (JS for small, SQLite for large)
- Native TypeScript (no Python runtime)
- Configurable alpha weight for hybrid balance

---

## 3. mcp-vector-search-main

### Overview
Modern CLI-first semantic code search tool with comprehensive platform integration. Best user experience of all examples.

### Technology Stack
- **Vector Database:** ChromaDB with connection pooling
- **Embedding Model:** Sentence Transformers (configurable, default MiniLM)
- **Code Parsing:** Tree-sitter AST (8 languages native, 50+ fallback)
- **File Watching:** Watchdog with incremental reindexing
- **MCP Framework:** Native MCP SDK
- **CLI Framework:** Typer with rich output

### Key Features

1. **Zero-Config Setup**
   ```bash
   mcp-vector-search setup  # Single command, everything works
   ```
   - Auto-detects project languages
   - Smart defaults for all settings
   - Multi-platform integration (Claude Code, Cursor, Windsurf, VSCode)

2. **Connection Pooling**
   - 13.6% performance improvement
   - Persistent connections to ChromaDB
   - Reduced latency for repeated searches

3. **Comprehensive Language Support**
   ```
   Full AST Support (8 languages):
   - Python: Functions, classes, methods, docstrings
   - JavaScript/TypeScript: ES6+, decorators, types
   - Dart/Flutter: Widgets, state classes, async
   - PHP: Classes, traits, magic methods, Laravel
   - Ruby: Modules, special syntax (?/!), Rails
   - HTML/Markdown: Semantic extraction by heading

   Fallback Support (50+ types):
   - C/C++, Rust, Java, Go, etc.
   - Web frameworks (Vue, Svelte, Astro)
   - Styling (CSS, SCSS, Sass)
   - Database (SQL variants)
   - Configuration (JSON, YAML, XML)
   ```

4. **Multiple Auto-Indexing Strategies**
   - Search-triggered: Reindex when stale detected
   - Git hooks: Reindex on commits
   - Scheduled tasks: Periodic reindexing
   - Manual: On-demand via CLI

5. **Smart "Did You Mean" Suggestions**
   - Typo correction for search queries
   - Fuzzy matching for file names

### What It Does Better Than search-mcp

| Feature | mcp-vector-search | search-mcp |
|---------|-------------------|------------|
| CLI experience | Excellent (Typer + rich) | None (MCP-only) |
| Zero-config setup | Single command | Manual config |
| Connection pooling | Yes (13.6% faster) | No |
| Platform integrations | 4 platforms documented | Generic MCP |
| Typo suggestions | "Did you mean?" | None |
| Language parsers | 8 native + 50 fallback | Character-based |

### What search-mcp Has That It Doesn't
- GPU acceleration (DirectML)
- Hybrid search (vector + FTS combined)
- Dual embedding models (optimized per content type)
- Native FTS5 engine for large codebases
- TypeScript (no Python runtime needed)

---

## 4. code-index-mcp-master

### Overview
Intelligent code indexing optimized for LLM analysis with dual-strategy (shallow/deep) parsing. No vector embeddings - pure text search.

### Technology Stack
- **Search Backends:** Auto-detects ugrep, ripgrep, ag, or grep
- **Code Parsing:**
  - Tree-sitter: Python, JavaScript, TypeScript, Java, Go, Objective-C, Zig
  - Fallback: 50+ file types without regex
- **File Watching:** Native OS monitoring (cross-platform)
- **Analysis:** Symbol extraction, complexity metrics, import tracking

### Key Features

1. **Dual-Strategy Indexing**
   ```
   Shallow Index:
   - File list only
   - Fast for file discovery
   - Auto-refreshes on file changes

   Deep Index:
   - Full symbol extraction
   - Functions, classes, methods
   - On-demand via build_deep_index
   ```

2. **Native Search Tool Auto-Detection**
   - Priority: ugrep > ripgrep > ag > grep
   - Uses best available tool on system
   - No embedded search engine overhead

3. **File Analysis & Complexity Metrics**
   ```
   get_file_summary returns:
   - Function/class listing
   - Import/export tracking
   - Complexity scores
   - Line counts
   ```

4. **Smart File Change Batching**
   - Groups rapid changes
   - Shallow refresh is near-instant
   - Deep rebuild on explicit request

### What It Does Better Than search-mcp

| Feature | code-index-mcp | search-mcp |
|---------|----------------|------------|
| Shallow/deep strategy | Yes (speed vs detail tradeoff) | No (always full) |
| Native search tools | Uses ripgrep/ugrep/ag | Built-in only |
| Complexity metrics | Yes | No |
| Symbol extraction | Functions, classes, imports | None |
| Temp directory management | Built-in tools | None |

### What search-mcp Has That It Doesn't
- **Vector search** (semantic similarity)
- Embedding models
- GPU acceleration
- Hybrid search
- Docs-specific indexing

---

## Feature Gap Analysis

### Features search-mcp Should Consider Adding

#### High Priority (Significant Value)

1. **Multi-Factor Search Ranking** (from claude-context-local)
   - Query intent detection
   - Chunk type boosting
   - Name matching with CamelCase tokenization
   - Current: RRF hybrid only

2. **AST-Based Chunking with Metadata** (from claude-context-local)
   - Function signatures, docstrings, decorators
   - Parent-child relationships
   - Semantic tags
   - Current: Character-based with basic line tracking

3. **Zero-Config CLI** (from mcp-vector-search)
   - `search-mcp setup` command
   - Auto-detect project settings
   - Current: MCP-only interface

4. **Merkle DAG Change Detection** (from claude-context-local)
   - More efficient than full-file hashing
   - Better for large codebases with small changes
   - Current: SHA256 per-file fingerprints

#### Medium Priority (Nice to Have)

5. **Connection Pooling** (from mcp-vector-search)
   - 13.6% performance improvement
   - Current: Standard connections

6. **Shallow/Deep Index Strategy** (from code-index-mcp)
   - Fast file discovery vs full symbol extraction
   - Current: Always full indexing

7. **Symbol Extraction & Complexity Metrics** (from code-index-mcp)
   - Functions, classes, imports per file
   - Complexity scores for LLM context
   - Current: None

8. **Docker Deployment** (from cursor-local-indexing)
   - Easy containerized deployment
   - Current: npm package only

#### Lower Priority (Edge Cases)

9. **Multi-Project Collection Isolation** (from cursor-local-indexing)
   - Current: One project per index directory

10. **Native Search Tool Integration** (from code-index-mcp)
    - Use ripgrep/ugrep when available
    - Current: Built-in FTS only

---

## What search-mcp Does Better Than All Examples

| Feature | search-mcp Advantage |
|---------|---------------------|
| **DirectML GPU** | Only implementation with Windows GPU support (AMD/Intel/NVIDIA) |
| **Hybrid Search** | RRF combining vector + keyword (none of the examples have this) |
| **Dual FTS Engines** | Auto-selects JS vs SQLite FTS5 based on codebase size |
| **TypeScript Native** | No Python runtime required |
| **Dual Embedding Models** | Optimized models for code (384-dim) vs docs (768-dim) |
| **Configurable Alpha** | User can tune vector vs keyword balance |
| **LanceDB** | More efficient than ChromaDB for local use |
| **Docs-Specific Search** | Separate tool optimized for prose content |

---

## Recommendations

### Immediate Wins (Low Effort, High Impact)

1. **Add CLI wrapper** - Simple Typer-style CLI for common operations
2. **Connection pooling** - Easy performance win for LanceDB

### Medium-Term Improvements

3. **Implement query intent detection** - Boost ranking quality significantly
4. **Add AST-based metadata** - Tree-sitter integration for richer chunks
5. **Merkle DAG for change detection** - Efficiency for large codebases

### Long-Term Roadmap

6. **Symbol extraction API** - For LLM-friendly code summaries
7. **Multi-project support** - Collection isolation
8. **Docker packaging** - For enterprise deployments

---

## Conclusion

search-mcp has strong foundations with unique advantages:
- **GPU acceleration** (DirectML) - none of the examples have this
- **Hybrid search** - combining vector + keyword is unique
- **TypeScript native** - no Python dependency

The main gaps are in:
- **Search ranking sophistication** - claude-context-local's multi-factor ranking is superior
- **AST-based chunking** - character-based chunking loses semantic context
- **CLI/UX** - mcp-vector-search sets the bar for developer experience

Prioritizing multi-factor ranking and AST metadata would close the biggest quality gaps while maintaining search-mcp's performance advantages.
