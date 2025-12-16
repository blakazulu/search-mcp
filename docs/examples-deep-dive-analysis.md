# Deep Code Analysis: Examples vs Search-MCP

> Generated: 2025-12-16
> Based on full source code review of all 4 example projects

---

## Executive Summary

After a thorough code review of all 4 example implementations, here are the key findings:

### Are We Doing Things Right?
**Mostly yes, but with gaps.** Our architecture is solid, but we're missing several production-ready features that the examples implement.

### What Are We Missing?
| Feature | Who Has It | Priority |
|---------|-----------|----------|
| Multi-factor search ranking | claude-context-local | **Critical** |
| Query intent detection | claude-context-local | **Critical** |
| AST-based chunking with metadata | claude-context-local, cursor-local | **High** |
| Connection pooling | mcp-vector-search | **High** |
| Search-triggered auto-reindexing | mcp-vector-search | **High** |
| "Did you mean?" typo correction | mcp-vector-search | **Medium** |
| Query expansion/synonyms | mcp-vector-search | **Medium** |
| Boilerplate detection & penalty | mcp-vector-search | **Medium** |
| Native search tool integration | code-index-mcp | **Low** |
| Two-tier shallow/deep indexing | code-index-mcp | **Low** |

### Where Are They Better?
| Area | Best Implementation | Why Better |
|------|---------------------|------------|
| **Search Ranking** | claude-context-local | 7+ factors vs our 2 (RRF only) |
| **Chunking** | claude-context-local | Rich metadata extraction |
| **UX** | mcp-vector-search | Zero-config, typo handling |
| **Change Detection** | claude-context-local | Merkle DAG vs our file hash |
| **Error Recovery** | mcp-vector-search | Comprehensive with suggestions |

---

## 1. CURSOR-LOCAL-INDEXING

### What They Do

| Component | Their Approach |
|-----------|---------------|
| **Embedding** | ChromaDB + SentenceTransformer (all-MiniLM-L6-v2) |
| **Chunking** | Tree-sitter AST-aware, 40 lines, 1500 chars max |
| **Search** | Simple cosine similarity threshold (30%) |
| **File Watching** | Watchdog with incremental updates |
| **Storage** | ChromaDB collections per project |

### What They Do Better

1. **AST-Aware Chunking**
   ```python
   # They use tree-sitter to split at code boundaries
   splitter = CodeSplitter(
       language=parser_language,
       chunk_lines=40,
       chunk_lines_overlap=15,
       max_chars=1500,
       parser=code_parser  # AST-aware!
   )
   ```
   - **We use**: Character-based chunking (~4000 chars)
   - **Impact**: Their chunks preserve function/class boundaries, ours may split mid-function

2. **Multi-Project Collections**
   - Each project gets isolated ChromaDB collection
   - Single server indexes multiple projects
   - **We have**: One index per project directory

3. **Rich Chunk Metadata**
   ```python
   {
       "file_path": file_path,
       "file_name": file_name,
       "language": language,
       "start_line": start_line,
       "end_line": end_line
   }
   ```

### What We Do Better

1. **Hybrid Search** - They only have vector search, we have vector + FTS
2. **GPU Acceleration** - They have none, we have DirectML
3. **Dual Embedding Models** - We use different models for code vs docs
4. **Configuration** - We have config files, they only have env vars

### Features to Consider Adding

| Feature | Effort | Value |
|---------|--------|-------|
| AST-aware chunking | High | High |
| Multi-project support | Medium | Medium |
| Language detection in metadata | Low | Medium |

---

## 2. CLAUDE-CONTEXT-LOCAL (Most Sophisticated)

### What They Do

| Component | Their Approach |
|-----------|---------------|
| **Embedding** | EmbeddingGemma-300m (768-dim) with domain prompts |
| **Chunking** | Tree-sitter + Python AST with 15+ metadata fields |
| **Search** | FAISS + 7-factor ranking algorithm |
| **Change Detection** | Merkle DAG with snapshots |
| **GPU** | FAISS GPU + PyTorch CUDA/MPS |

### What They Do Better (Critical!)

#### 1. Multi-Factor Search Ranking (Their Crown Jewel)
```python
def calculate_rank_score(result):
    score = result.similarity_score  # Base FAISS score

    # Factor 1: Dynamic chunk type boost
    if has_class_keyword:
        type_boosts = {'class': 1.3, 'function': 1.05}
    elif is_entity_query:
        type_boosts = {'class': 1.15, 'function': 1.1}
    score *= type_boosts.get(result.chunk_type, 1.0)

    # Factor 2: Name matching (CamelCase-aware)
    name_boost = _calculate_name_boost(query, result.name)
    score *= name_boost  # Up to 1.4x for exact match

    # Factor 3: Path relevance
    path_boost = _calculate_path_boost(query, result.path)
    score *= path_boost

    # Factor 4: Tag overlap with intent
    if intent_tags and result.tags:
        overlap = len(set(intent_tags) & set(result.tags))
        score *= (1.0 + overlap * 0.1)

    # Factor 5: Docstring presence bonus
    if result.docstring:
        score *= 1.05

    # Factor 6: Complexity penalty
    if len(result.content) > 1000:
        score *= 0.98

    return score
```

**We only have**: RRF (Reciprocal Rank Fusion) combining vector + FTS scores
**Impact**: Their results are significantly more relevant for common queries

#### 2. Query Intent Detection
```python
query_patterns = {
    'function_search': [r'\bfunction\b', r'\bdef\b', r'implement'],
    'error_handling': [r'\berror\b', r'exception\b', r'catch'],
    'database': [r'\bdatabase\b', r'\bquery\b', r'\bsql\b'],
    'api': [r'\bapi\b', r'\bendpoint\b', r'\broute\b'],
    'authentication': [r'\bauth\b', r'\blogin\b', r'\btoken\b'],
    'testing': [r'\btest\b', r'\bmock\b', r'\bassert\b']
}
```
- Detects what user is looking for
- Dynamically boosts relevant chunk types
- **We have**: Nothing - treat all queries the same

#### 3. Rich Metadata Extraction (15+ fields per chunk)
```python
@dataclass
class CodeChunk:
    name: str
    parent_name: str          # Class name for methods
    chunk_type: str           # function, class, method, module
    docstring: str
    decorators: list[str]
    imports: list[str]
    complexity_score: float
    tags: list[str]           # async, generator, export, etc.
    folder_structure: str
    content_preview: str
    start_line: int
    end_line: int
```
**We have**: path, text, start_line, end_line, content_hash (5 fields)

#### 4. Domain-Specific Embedding Prompts
```python
# Document embedding
embed(text, prompt_name="Retrieval-document")

# Query embedding
embed(query, prompt_name="InstructionRetrieval")
```
- Different prompts for indexing vs searching
- Aligns with sentence-transformer best practices
- **We have**: Same embedding for both

#### 5. Merkle DAG Change Detection
```python
def hash_file(path) -> str:
    # Stream large files in 8KB chunks
    while chunk := f.read(8192):
        sha256.update(chunk)
    return sha256.hexdigest()

def hash_directory(path, child_hashes) -> str:
    # Include sorted child hashes for determinism
    for child_hash in sorted(child_hashes):
        sha256.update(child_hash.encode())
    return sha256.hexdigest()
```
- Hierarchical hashing enables fast change detection
- Only traverses changed branches
- **We have**: Full file hash comparison (slower for large codebases)

#### 6. Smart Content Truncation
```python
# Budget allocation for embedding content:
# 1. Docstring: 300 chars
# 2. Code head: 70% of remaining
# 3. "... (truncated) ..." marker
# 4. Code tail: 30% of remaining
# Total max: 6000 chars
```
- Preserves semantic meaning in truncated content
- **We have**: Simple character truncation

### What We Do Better

1. **Hybrid Search** - They only have FAISS vector, we have vector + FTS
2. **FTS Engine Options** - We have JS + SQLite FTS5
3. **DirectML Support** - Works with AMD/Intel GPUs too
4. **TypeScript Native** - No Python runtime needed

### Features to Consider Adding (HIGH PRIORITY)

| Feature | Effort | Value | Task |
|---------|--------|-------|------|
| Multi-factor ranking | High | **Critical** | SMCP-087 |
| Query intent detection | Medium | **Critical** | SMCP-085 |
| Rich chunk metadata | High | **High** | SMCP-086 |
| Name matching boost | Medium | **High** | SMCP-087 |
| Domain prompts | Low | **Medium** | New task? |
| Merkle DAG | High | **Medium** | SMCP-089 |

---

## 3. MCP-VECTOR-SEARCH (Best UX)

### What They Do

| Component | Their Approach |
|-----------|---------------|
| **CLI** | Typer + Rich + click-didyoumean |
| **Embedding** | SentenceTransformer (all-MiniLM-L6-v2) |
| **Storage** | ChromaDB with connection pooling |
| **Search** | 7-factor reranking + query expansion |
| **Auto-Index** | Search-triggered + git hooks |

### What They Do Better

#### 1. Connection Pooling (13.6% Performance Gain)
```python
class ChromaConnectionPool:
    def __init__(
        self,
        max_connections: int = 10,
        min_connections: int = 2,
        max_idle_time: float = 300.0,
        max_connection_age: float = 3600.0,
    ):
        self.connections = []
        self.stats = {
            "connections_created": 0,
            "connections_reused": 0,
            "pool_hits": 0,
            "pool_misses": 0,
        }
```
- Reuses database connections
- Automatic cleanup of stale connections
- **We have**: Direct connections (recreated each time)

#### 2. Search-Triggered Auto-Reindexing
```python
class SearchTriggeredIndexer:
    def __init__(self):
        self._check_every_n_searches = 10

    async def pre_search_hook(self):
        # Before every Nth search, check staleness
        if self._needs_reindexing():
            # Auto-reindex up to 5 files silently
            await self._reindex_stale_files(max_files=5)
```
- No daemon process needed
- Reindexes during normal usage
- **We have**: Manual reindex only

#### 3. Query Expansion (59 Synonyms)
```python
_QUERY_EXPANSIONS = {
    "auth": "authentication authorize login",
    "db": "database data storage",
    "api": "application programming interface endpoint",
    "async": "asynchronous await promise",
    "err": "error exception failure",
    "config": "configuration settings options",
    # ... 59 total expansions
}
```
- Expands abbreviated queries
- Improves recall for common terms
- **We have**: No query expansion

#### 4. Boilerplate Detection & Penalty
```python
# Reranking penalties:
score -= _PENALTY_TEST_FILE        # -0.02 for tests
score -= _PENALTY_BOILERPLATE      # -0.15 for common patterns
```
- Deprioritizes test files, generated code
- **We have**: All files weighted equally

#### 5. Comprehensive "Did You Mean?" System
```python
COMMON_TYPOS = {
    "serach": "search",
    "indx": "index",
    "s": "search",      # Single letter shortcuts
    "find": "search",   # Command aliases
    "grep": "search",
}

def get_fuzzy_matches(command, available, cutoff=0.6):
    # SequenceMatcher with 60% threshold
    # Returns top 3 matches
```
- 344 lines of typo mappings!
- Fuzzy matching with suggestions
- **We have**: Basic error messages

#### 6. Git Hook Integration
```python
# Installs .git/hooks/post-commit
# Auto-reindexes on git commit
```
- Automatic reindexing on commits
- **We have**: Manual only

#### 7. Graceful Segfault Handling
```python
def _handle_segfault(signum, frame):
    print("""
    ⚠️  Segmentation Fault Detected

    To fix this, please run:
      1. mcp-vector-search reset index --force
      2. mcp-vector-search index
    """)
```
- Catches Rust panics from ChromaDB
- Provides recovery instructions
- **We have**: Crash with no guidance

### What We Do Better

1. **Hybrid Search** - They only have vector
2. **GPU Acceleration** - They have none
3. **Dual FTS Engines** - Auto-selects based on size
4. **TypeScript Native** - No Python

### Features to Consider Adding

| Feature | Effort | Value | Task |
|---------|--------|-------|------|
| Connection pooling | Medium | **High** | New task |
| Search-triggered reindex | Medium | **High** | New task |
| Query expansion | Low | **Medium** | New task |
| "Did you mean?" | Medium | **Medium** | SMCP-088 |
| Boilerplate penalty | Low | **Medium** | SMCP-087 |
| Git hooks | Low | **Low** | New task |

---

## 4. CODE-INDEX-MCP (No Vectors, Native Tools)

### What They Do

| Component | Their Approach |
|-----------|---------------|
| **Search** | Native tools (ripgrep > ugrep > ag > grep) |
| **Indexing** | Two-tier: Shallow (files) + Deep (symbols) |
| **Parsing** | 7 AST + 50 fallback file types |
| **Storage** | JSON (shallow) + SQLite (deep) |
| **Watching** | Watchdog with 2-second debounce |

### What They Do Better

#### 1. Two-Tier Indexing Strategy
```python
# SHALLOW INDEX: Fast, always current
# - Just file paths
# - JSON storage
# - Updated on every file change

# DEEP INDEX: Comprehensive, on-demand
# - Full symbol extraction
# - SQLite storage
# - Built when requested
```
- Shallow for browsing, deep for analysis
- Different update frequencies
- **We have**: Single full index

#### 2. Native Search Tool Integration
```python
# Auto-detection order:
# 1. ripgrep (fastest)
# 2. ugrep
# 3. ag (silver searcher)
# 4. grep
# 5. Python regex (fallback)
```
- Leverages OS-optimized tools
- ripgrep is 40x faster than Python regex
- **We have**: Built-in FTS only

#### 3. Symbol Extraction with Call Tracking
```python
@dataclass
class SymbolInfo:
    type: str               # function, class, method
    file: str
    line: int
    signature: str          # "def foo(x, y) -> bool:"
    docstring: str
    called_by: list[str]    # Callers of this symbol
```
- Tracks who calls whom
- **We have**: No symbol extraction

#### 4. Variable Type Inference
```python
# Tracks: const x = new MyClass()
# Later resolves: x.method() -> MyClass.method()
variable_scopes: List[Dict[str, str]] = [{}]

def _infer_expression_type(value_node):
    # Infers type from constructor calls
```
- Cross-reference method calls to classes
- **We have**: Nothing like this

#### 5. Debounced File Watching
```python
class DebounceEventHandler:
    def __init__(self, callback, debounce_interval=2):
        self.pending_files = set()
        self.timer = None

    def on_modified(self, event):
        self.pending_files.add(event.src_path)
        self._reset_timer()  # Restart 2-second timer
```
- Groups rapid changes
- Single batch update
- **We have**: Individual file processing

### What We Do Better

1. **Semantic Search** - They have no vector search at all
2. **Hybrid Search** - We combine vector + keyword
3. **GPU Acceleration** - They have none
4. **Cross-language similarity** - Their exact matching can't find similar code

### Features to Consider Adding

| Feature | Effort | Value |
|---------|--------|-------|
| Native tool fallback | Medium | Low (we have FTS) |
| Symbol extraction | High | Medium (SMCP-090) |
| Debounced watching | Low | Medium |
| Two-tier indexing | High | Low |

---

## Consolidated Recommendations

### Critical Priority (Must Have)

| Feature | Source | Impact | Task |
|---------|--------|--------|------|
| **Multi-factor ranking** | claude-context-local | Search quality | SMCP-087 |
| **Query intent detection** | claude-context-local | Search relevance | SMCP-085 |
| **Rich chunk metadata** | claude-context-local | Ranking data | SMCP-086 |

### High Priority (Should Have)

| Feature | Source | Impact | Task |
|---------|--------|--------|------|
| **Connection pooling** | mcp-vector-search | 13% faster | New |
| **Search-triggered reindex** | mcp-vector-search | Fresh index | New |
| **Name matching boost** | claude-context-local | Better ranking | SMCP-087 |
| **AST-aware chunking** | cursor-local, claude-context-local | Better chunks | SMCP-086 |

### Medium Priority (Nice to Have)

| Feature | Source | Impact | Task |
|---------|--------|--------|------|
| **Query expansion** | mcp-vector-search | Better recall | New |
| **"Did you mean?"** | mcp-vector-search | Better UX | SMCP-088 |
| **Boilerplate penalty** | mcp-vector-search | Cleaner results | SMCP-087 |
| **Domain prompts** | claude-context-local | Better embeddings | New |
| **Merkle DAG** | claude-context-local | Faster change detection | SMCP-089 |

### Low Priority (Future)

| Feature | Source | Impact |
|---------|--------|--------|
| Symbol extraction | code-index-mcp | Analysis tools |
| Native tool fallback | code-index-mcp | Exact search option |
| Git hooks | mcp-vector-search | Auto-reindex |
| Multi-project | cursor-local | Enterprise use |

---

## New Tasks to Create

Based on this analysis, we should create these additional tasks:

1. **SMCP-093: Connection Pooling for LanceDB**
   - Port mcp-vector-search's pooling strategy
   - Expected 10-15% performance improvement

2. **SMCP-094: Search-Triggered Auto-Reindexing**
   - Check staleness before searches
   - Auto-reindex small changes silently

3. **SMCP-095: Query Expansion & Synonyms**
   - Add synonym mappings for common abbreviations
   - Improve recall for abbreviated queries

4. **SMCP-096: Domain-Specific Embedding Prompts**
   - Different prompts for document vs query encoding
   - Aligns with embedding model best practices

---

## Architecture Comparison

| Aspect | search-mcp | claude-context-local | mcp-vector-search | code-index-mcp |
|--------|------------|---------------------|-------------------|----------------|
| **Language** | TypeScript | Python | Python | Python |
| **Vector DB** | LanceDB | FAISS | ChromaDB | None |
| **Embedding** | BGE (384/768) | Gemma (768) | MiniLM (384) | None |
| **Search** | Hybrid (V+FTS) | Vector only | Vector only | Text only |
| **Ranking** | RRF (2 factors) | 7+ factors | 7 factors | Relevance |
| **GPU** | DirectML | CUDA/MPS | None | None |
| **Chunking** | Character-based | AST + metadata | AST | AST |
| **Change Detection** | File hash | Merkle DAG | File watching | File watching |
| **Auto-reindex** | Manual | On change | Search-triggered | On watch |

---

## Conclusion

**Our Strengths:**
1. Hybrid search (vector + FTS) - unique among all examples
2. DirectML GPU support - broadest GPU compatibility
3. Dual FTS engines - auto-scales with codebase size
4. TypeScript native - no Python runtime needed

**Our Gaps:**
1. Search ranking is too simple (2 factors vs 7+)
2. No query intent detection
3. Chunk metadata is minimal
4. No auto-reindexing
5. No connection pooling

**Recommended Priority:**
1. SMCP-087 (Multi-factor ranking) - biggest impact on search quality
2. SMCP-085 (Query intent) - enables smart ranking
3. SMCP-086 (AST chunking) - provides data for ranking
4. SMCP-093 (Connection pooling) - easy performance win
5. SMCP-094 (Auto-reindex) - better user experience
