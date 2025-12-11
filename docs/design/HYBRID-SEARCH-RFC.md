# RFC: Hybrid Search Implementation

## Overview

This document outlines two approaches for implementing hybrid search (combining vector/semantic search with keyword/BM25 search) in Search MCP.

**Current State:** Pure semantic vector search only (Xenova/all-MiniLM-L6-v2, 384 dimensions)

**Goal:** Combine vector search with keyword search to improve result quality for:
- Exact function/class name lookups (`handleWebSocket`, `UserService`)
- Specific error messages or log strings
- Comments like `TODO`, `FIXME`, `HACK`
- Mixed queries ("the validateInput function logic")

---

## Why Hybrid Search?

| Query Type | Vector Only | Keyword Only | Hybrid |
|------------|-------------|--------------|--------|
| "How does caching work?" | ✅ Excellent | ❌ Poor | ✅ Excellent |
| "findUserById" | ❌ Poor | ✅ Excellent | ✅ Excellent |
| "error handling in auth" | ✅ Good | ~ Fair | ✅ Excellent |
| "TODO" | ❌ Poor | ✅ Excellent | ✅ Excellent |
| "parseJSON function" | ~ Fair | ✅ Excellent | ✅ Excellent |

Vector search excels at semantic understanding but misses exact matches.
Keyword search excels at exact matches but misses conceptual relationships.
Hybrid search combines both strengths.

---

## Scoring Formula

```
hybrid_score = alpha * vector_score + (1 - alpha) * bm25_score
```

Where:
- `alpha` = weight for vector search (default: 0.7)
- `vector_score` = normalized semantic similarity (0.0 - 1.0)
- `bm25_score` = normalized BM25 score (0.0 - 1.0)

**Recommended default:** `alpha = 0.7` (70% semantic, 30% keyword)

---

## API Changes

### New Parameters for `search_code` and `search_docs`

```typescript
interface SearchParams {
  query: string;
  top_k?: number;        // Default: 10
  mode?: "vector" | "keyword" | "hybrid";  // Default: "hybrid"
  alpha?: number;        // Default: 0.7 (only used when mode="hybrid")
}
```

### Example Usage

```typescript
// Pure semantic (current behavior)
search_code({ query: "authentication flow", mode: "vector" })

// Pure keyword
search_code({ query: "handleWebSocket", mode: "keyword" })

// Hybrid (recommended)
search_code({ query: "the validateInput function", mode: "hybrid", alpha: 0.7 })
```

---

# Option A: Pure JavaScript BM25

## Approach

Use the `natural` npm package for TF-IDF/BM25 scoring entirely in JavaScript.

## Dependencies

```json
{
  "dependencies": {
    "natural": "^6.10.0"
  }
}
```

**Package size:** ~2 MB
**Native dependencies:** None (pure JS)

## Architecture

```
Query
  ├── Embed with Xenova → Vector Search (LanceDB)
  └── Tokenize with natural → BM25 Search (In-Memory Index)
          ↓
    Merge & Re-rank Results
          ↓
    Return Top K
```

## Implementation

### 1. New File: `src/engines/bm25.ts`

```typescript
import { TfIdf, WordTokenizer } from 'natural';

interface BM25Index {
  tfidf: TfIdf;
  documents: Map<string, { id: string; path: string; startLine: number; endLine: number }>;
}

export class BM25Engine {
  private index: BM25Index | null = null;
  private tokenizer = new WordTokenizer();

  /**
   * Build BM25 index from chunks
   */
  async buildIndex(chunks: Array<{ id: string; text: string; path: string; startLine: number; endLine: number }>): Promise<void> {
    const tfidf = new TfIdf();
    const documents = new Map();

    for (const chunk of chunks) {
      tfidf.addDocument(chunk.text, chunk.id);
      documents.set(chunk.id, {
        id: chunk.id,
        path: chunk.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      });
    }

    this.index = { tfidf, documents };
  }

  /**
   * Search using BM25
   */
  search(query: string, topK: number): Array<{ id: string; score: number }> {
    if (!this.index) {
      throw new Error('BM25 index not built');
    }

    const results: Array<{ id: string; score: number }> = [];

    this.index.tfidf.tfidfs(query, (docIndex, measure) => {
      const docId = this.index!.tfidf.documents[docIndex].__key;
      results.push({ id: docId, score: measure });
    });

    // Sort by score descending and take top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Normalize BM25 scores to 0-1 range
   */
  normalizeScores(results: Array<{ id: string; score: number }>): Array<{ id: string; score: number }> {
    if (results.length === 0) return results;

    const maxScore = Math.max(...results.map(r => r.score));
    if (maxScore === 0) return results.map(r => ({ ...r, score: 0 }));

    return results.map(r => ({
      id: r.id,
      score: r.score / maxScore,
    }));
  }

  /**
   * Add single document to index (for incremental updates)
   */
  addDocument(chunk: { id: string; text: string; path: string; startLine: number; endLine: number }): void {
    if (!this.index) {
      this.index = { tfidf: new TfIdf(), documents: new Map() };
    }

    this.index.tfidf.addDocument(chunk.text, chunk.id);
    this.index.documents.set(chunk.id, {
      id: chunk.id,
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
    });
  }

  /**
   * Remove document from index
   */
  removeDocument(chunkId: string): void {
    // Note: natural's TfIdf doesn't support removal
    // Would need to rebuild index or track deletions
    this.index?.documents.delete(chunkId);
  }

  /**
   * Serialize index to disk
   */
  serialize(): string {
    if (!this.index) return '';
    return JSON.stringify({
      documents: Array.from(this.index.documents.entries()),
      // TfIdf internal state would need custom serialization
    });
  }

  /**
   * Load index from disk
   */
  deserialize(data: string): void {
    // Would need to rebuild TfIdf from documents
    // natural's TfIdf doesn't support direct deserialization
  }
}
```

### 2. Modify: `src/storage/lancedb.ts`

Add hybrid search method:

```typescript
import { BM25Engine } from '../engines/bm25';

export class LanceDBStore {
  private bm25Engine: BM25Engine | null = null;

  /**
   * Initialize BM25 index alongside vector index
   */
  async initBM25(): Promise<void> {
    const allChunks = await this.getAllChunks();
    this.bm25Engine = new BM25Engine();
    await this.bm25Engine.buildIndex(allChunks);
  }

  /**
   * Hybrid search combining vector and BM25
   */
  async hybridSearch(
    queryText: string,
    queryVector: number[],
    topK: number,
    alpha: number = 0.7
  ): Promise<SearchResult[]> {
    // Run both searches in parallel
    const [vectorResults, bm25Results] = await Promise.all([
      this.vectorSearch(queryVector, topK * 2), // Get more candidates
      this.bm25Engine?.search(queryText, topK * 2) ?? [],
    ]);

    // Normalize BM25 scores
    const normalizedBM25 = this.bm25Engine?.normalizeScores(bm25Results) ?? [];

    // Create score maps
    const vectorScores = new Map(vectorResults.map(r => [r.id, r.score]));
    const bm25Scores = new Map(normalizedBM25.map(r => [r.id, r.score]));

    // Merge candidates
    const allIds = new Set([...vectorScores.keys(), ...bm25Scores.keys()]);

    const hybridResults = Array.from(allIds).map(id => {
      const vScore = vectorScores.get(id) ?? 0;
      const kScore = bm25Scores.get(id) ?? 0;
      const hybridScore = alpha * vScore + (1 - alpha) * kScore;

      return {
        id,
        score: hybridScore,
        vectorScore: vScore,
        keywordScore: kScore,
      };
    });

    // Sort by hybrid score and take top K
    hybridResults.sort((a, b) => b.score - a.score);

    // Fetch full chunk data for top results
    return this.getChunksByIds(hybridResults.slice(0, topK).map(r => r.id));
  }
}
```

### 3. Modify: `src/tools/searchCode.ts`

```typescript
export const searchCodeTool = {
  name: 'search_code',
  description: 'Search codebase using semantic, keyword, or hybrid search',
  parameters: {
    query: { type: 'string', required: true },
    top_k: { type: 'number', default: 10 },
    mode: { type: 'string', enum: ['vector', 'keyword', 'hybrid'], default: 'hybrid' },
    alpha: { type: 'number', default: 0.7, min: 0, max: 1 },
  },
  async execute({ query, top_k, mode, alpha }) {
    const store = await getStore();

    switch (mode) {
      case 'vector':
        const embedding = await embed(query);
        return store.vectorSearch(embedding, top_k);

      case 'keyword':
        return store.keywordSearch(query, top_k);

      case 'hybrid':
      default:
        const queryEmbedding = await embed(query);
        return store.hybridSearch(query, queryEmbedding, top_k, alpha);
    }
  },
};
```

## Performance Characteristics

### Indexing

| Metric | Current | With BM25 | Impact |
|--------|---------|-----------|--------|
| 100 files | 1s | 1.5s | +50% |
| 1,000 files | 10s | 15s | +50% |
| 10,000 files | 100s | 150s | +50% |
| Memory during indexing | 300 MB | 450 MB | +50% |

### Search

| Metric | Current | With BM25 | Impact |
|--------|---------|-----------|--------|
| Query latency | 20 ms | 50-80 ms | +150-300% |
| Memory (idle) | 80 MB | 150 MB | +87% |

### Storage

| Metric | Current | With BM25 | Impact |
|--------|---------|-----------|--------|
| Disk size | 50 MB | 70 MB | +40% |

## Pros

1. **No native dependencies** - Works on all platforms without compilation
2. **Simple installation** - Just `npm install natural`
3. **Easy to implement** - Well-documented API
4. **Good enough for most projects** - <5,000 files handles well

## Cons

1. **Memory overhead** - Keeps inverted index in RAM
2. **No persistence** - Must rebuild index on startup (or implement custom serialization)
3. **Slower than native** - 2-3x slower than SQLite FTS5
4. **No incremental deletion** - natural's TfIdf doesn't support document removal
5. **Limited query syntax** - No phrase matching, wildcards, or boolean operators

## Migration Path

1. Add as optional feature behind flag
2. Build BM25 index during `create_index` (alongside vectors)
3. Store BM25 index in `bm25.json` (custom serialization)
4. Default to `mode: "hybrid"` for new indexes
5. Fall back to `mode: "vector"` for old indexes

---

# Option B: SQLite FTS5

## Approach

Use SQLite's Full-Text Search 5 (FTS5) extension via `better-sqlite3` for native performance keyword search.

## Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^9.4.0"
  },
  "optionalDependencies": {
    "better-sqlite3": "^9.4.0"
  }
}
```

**Package size:** ~8 MB (includes native binary)
**Native dependencies:** Yes (pre-built binaries for most platforms)

## Architecture

```
Query
  ├── Embed with Xenova → Vector Search (LanceDB)
  └── FTS5 Query → Keyword Search (SQLite)
          ↓
    Merge & Re-rank Results
          ↓
    Return Top K
```

## Storage Layout Change

```
~/.mcp/search/indexes/<hash>/
├── index.lancedb/          # Vector store (existing)
├── docs.lancedb/           # Docs vector store (existing)
├── fts.sqlite              # NEW: FTS5 database
├── fingerprints.json
├── docs-fingerprints.json
├── config.json
└── metadata.json
```

## Implementation

### 1. New File: `src/engines/fts5.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'path';

interface FTS5Options {
  dbPath: string;
}

export class FTS5Engine {
  private db: Database.Database;

  constructor(options: FTS5Options) {
    this.db = new Database(options.dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Create FTS5 virtual table
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        id UNINDEXED,
        path UNINDEXED,
        text,
        start_line UNINDEXED,
        end_line UNINDEXED,
        content='',
        tokenize='porter unicode61'
      );
    `);

    // Create helper table for BM25 scoring
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_metadata (
        id TEXT PRIMARY KEY,
        path TEXT,
        start_line INTEGER,
        end_line INTEGER
      );
    `);
  }

  /**
   * Index a chunk for full-text search
   */
  addChunk(chunk: { id: string; text: string; path: string; startLine: number; endLine: number }): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO chunks_fts (id, path, text, start_line, end_line)
      VALUES (?, ?, ?, ?, ?)
    `);

    insert.run(chunk.id, chunk.path, chunk.text, chunk.startLine, chunk.endLine);
  }

  /**
   * Batch index multiple chunks
   */
  addChunks(chunks: Array<{ id: string; text: string; path: string; startLine: number; endLine: number }>): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO chunks_fts (id, path, text, start_line, end_line)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((chunks) => {
      for (const chunk of chunks) {
        insert.run(chunk.id, chunk.path, chunk.text, chunk.startLine, chunk.endLine);
      }
    });

    transaction(chunks);
  }

  /**
   * Remove chunk from index
   */
  removeChunk(chunkId: string): void {
    this.db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(chunkId);
  }

  /**
   * Remove all chunks for a file path
   */
  removeByPath(filePath: string): void {
    this.db.prepare('DELETE FROM chunks_fts WHERE path = ?').run(filePath);
  }

  /**
   * Search using FTS5 with BM25 scoring
   */
  search(query: string, topK: number): Array<{ id: string; path: string; text: string; startLine: number; endLine: number; score: number }> {
    // Escape special FTS5 characters
    const escapedQuery = this.escapeQuery(query);

    const stmt = this.db.prepare(`
      SELECT
        id,
        path,
        text,
        start_line as startLine,
        end_line as endLine,
        bm25(chunks_fts) as score
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
      ORDER BY bm25(chunks_fts)
      LIMIT ?
    `);

    try {
      return stmt.all(escapedQuery, topK) as any[];
    } catch (e) {
      // If FTS query fails, fall back to LIKE search
      return this.fallbackSearch(query, topK);
    }
  }

  /**
   * Fallback search using LIKE for invalid FTS queries
   */
  private fallbackSearch(query: string, topK: number): Array<{ id: string; path: string; text: string; startLine: number; endLine: number; score: number }> {
    const stmt = this.db.prepare(`
      SELECT
        id,
        path,
        text,
        start_line as startLine,
        end_line as endLine,
        1.0 as score
      FROM chunks_fts
      WHERE text LIKE ?
      LIMIT ?
    `);

    return stmt.all(`%${query}%`, topK) as any[];
  }

  /**
   * Escape special FTS5 query characters
   */
  private escapeQuery(query: string): string {
    // FTS5 special characters: " * ^ - ( )
    // For simple queries, wrap each word in quotes
    return query
      .split(/\s+/)
      .map(word => `"${word.replace(/"/g, '""')}"`)
      .join(' ');
  }

  /**
   * Normalize BM25 scores to 0-1 range
   * Note: BM25 returns negative scores where more negative = better match
   */
  normalizeScores(results: Array<{ score: number }>): Array<{ score: number }> {
    if (results.length === 0) return results;

    // BM25 scores are negative, convert to positive (0 = best, higher = worse)
    const scores = results.map(r => -r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore || 1;

    return results.map((r, i) => ({
      ...r,
      score: (scores[i] - minScore) / range, // Normalize to 0-1
    }));
  }

  /**
   * Get index statistics
   */
  getStats(): { totalChunks: number; totalTokens: number } {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM chunks_fts');
    const { count } = countStmt.get() as { count: number };

    return {
      totalChunks: count,
      totalTokens: 0, // Would need separate tracking
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.db.exec('DELETE FROM chunks_fts');
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
```

### 2. Modify: `src/storage/lancedb.ts`

```typescript
import { FTS5Engine } from '../engines/fts5';
import path from 'path';

export class LanceDBStore {
  private fts5Engine: FTS5Engine | null = null;

  /**
   * Initialize FTS5 engine
   */
  async initFTS5(indexPath: string): Promise<void> {
    const ftsPath = path.join(indexPath, 'fts.sqlite');
    this.fts5Engine = new FTS5Engine({ dbPath: ftsPath });
  }

  /**
   * Add chunk to both vector and FTS indexes
   */
  async addChunk(chunk: ChunkRecord): Promise<void> {
    // Add to LanceDB (vector)
    await this.table.add([chunk]);

    // Add to FTS5
    this.fts5Engine?.addChunk({
      id: chunk.id,
      text: chunk.text,
      path: chunk.path,
      startLine: chunk.start_line,
      endLine: chunk.end_line,
    });
  }

  /**
   * Hybrid search combining vector and FTS5
   */
  async hybridSearch(
    queryText: string,
    queryVector: number[],
    topK: number,
    alpha: number = 0.7
  ): Promise<SearchResult[]> {
    if (!this.fts5Engine) {
      // Fall back to vector-only if FTS not available
      return this.vectorSearch(queryVector, topK);
    }

    // Run both searches in parallel
    const [vectorResults, ftsResults] = await Promise.all([
      this.vectorSearch(queryVector, topK * 2),
      Promise.resolve(this.fts5Engine.search(queryText, topK * 2)),
    ]);

    // Normalize FTS scores
    const normalizedFTS = this.fts5Engine.normalizeScores(ftsResults);

    // Create score maps
    const vectorScores = new Map(vectorResults.map(r => [r.id, r.score]));
    const ftsScores = new Map(normalizedFTS.map(r => [r.id, r.score]));

    // Get all candidate IDs
    const allIds = new Set([...vectorScores.keys(), ...ftsScores.keys()]);

    // Calculate hybrid scores
    const hybridResults = Array.from(allIds).map(id => {
      const vScore = vectorScores.get(id) ?? 0;
      const fScore = ftsScores.get(id) ?? 0;
      const hybridScore = alpha * vScore + (1 - alpha) * fScore;

      // Find the full result data
      const vectorResult = vectorResults.find(r => r.id === id);
      const ftsResult = ftsResults.find(r => r.id === id);
      const baseResult = vectorResult ?? ftsResult;

      return {
        ...baseResult,
        score: hybridScore,
        vectorScore: vScore,
        keywordScore: fScore,
      };
    });

    // Sort by hybrid score and return top K
    return hybridResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Keyword-only search using FTS5
   */
  async keywordSearch(query: string, topK: number): Promise<SearchResult[]> {
    if (!this.fts5Engine) {
      throw new Error('FTS5 not initialized');
    }

    const results = this.fts5Engine.search(query, topK);
    const normalized = this.fts5Engine.normalizeScores(results);

    return normalized.map(r => ({
      id: r.id,
      relativePath: r.path,
      text: r.text,
      startLine: r.startLine,
      endLine: r.endLine,
      score: r.score,
    }));
  }
}
```

### 3. Modify: `src/tools/searchCode.ts`

Same as Option A - identical API surface.

## Performance Characteristics

### Indexing

| Metric | Current | With FTS5 | Impact |
|--------|---------|-----------|--------|
| 100 files | 1s | 1.1s | +10% |
| 1,000 files | 10s | 11s | +10% |
| 10,000 files | 100s | 110s | +10% |
| Memory during indexing | 300 MB | 320 MB | +7% |

### Search

| Metric | Current | With FTS5 | Impact |
|--------|---------|-----------|--------|
| Query latency | 20 ms | 30-50 ms | +50-150% |
| Memory (idle) | 80 MB | 90 MB | +12% |

### Storage

| Metric | Current | With FTS5 | Impact |
|--------|---------|-----------|--------|
| Disk size | 50 MB | 80 MB | +60% |

## Pros

1. **Native performance** - C-based SQLite is very fast
2. **Disk-backed** - Index survives restarts without custom serialization
3. **Full FTS5 features** - Phrase search, prefix matching, boolean operators
4. **Efficient updates** - True incremental add/delete
5. **Low memory** - Uses disk, not RAM
6. **Battle-tested** - SQLite FTS5 is used by millions of apps

## Cons

1. **Native dependency** - Requires compilation or pre-built binary
2. **Platform issues** - May fail on some architectures (Alpine Linux, ARM)
3. **Larger package** - 8MB vs 2MB for pure JS
4. **Two databases** - LanceDB + SQLite adds complexity
5. **Installation friction** - May need Python/build tools on some systems

## FTS5 Query Syntax (Bonus Features)

```sql
-- Phrase search
"error handling"

-- Prefix search
auth*

-- Boolean AND
error AND handling

-- Boolean OR
error OR exception

-- Boolean NOT
error NOT warning

-- Proximity search (words within 10 tokens)
NEAR(error handling, 10)

-- Column-specific search
text:handleWebSocket
```

## Migration Path

1. Add `better-sqlite3` as optional dependency
2. Feature-detect native module availability
3. Fall back to vector-only if FTS5 unavailable
4. Build FTS5 index during `create_index`
5. Default to hybrid when FTS5 is available

---

# Comparison Summary

| Aspect | Option A (Pure JS) | Option B (SQLite FTS5) |
|--------|-------------------|------------------------|
| **Dependencies** | `natural` (pure JS) | `better-sqlite3` (native) |
| **Package size** | +2 MB | +8 MB |
| **Installation** | Always works | May need build tools |
| **Indexing speed** | +50% slower | +10% slower |
| **Search latency** | 50-80 ms | 30-50 ms |
| **Memory (idle)** | +70 MB | +10 MB |
| **Disk storage** | +20 MB | +30 MB |
| **Incremental updates** | Rebuild required | Native support |
| **Query features** | Basic | Full (phrase, prefix, boolean) |
| **Cross-platform** | Excellent | Good (most platforms) |
| **Maintenance** | Lower | Higher |

## Recommendation

| Use Case | Recommended Option |
|----------|-------------------|
| Simplicity first | Option A (Pure JS) |
| Performance critical | Option B (SQLite FTS5) |
| Must work everywhere | Option A (Pure JS) |
| Large codebases (10k+ files) | Option B (SQLite FTS5) |
| Power users (advanced queries) | Option B (SQLite FTS5) |

**For Search MCP:** Implement both options with automatic selection based on codebase size and native module availability.

---

# Dual-Engine Architecture (Recommended Approach)

Instead of choosing one option, implement **both engines** with automatic selection and user override capability.

## Design Goals

1. **Zero configuration for most users** - Auto-detect best engine
2. **Graceful degradation** - Always works, even if native module fails
3. **User control** - Power users can force specific engine
4. **Transparent** - Show which engine is active in status

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Configuration                        │
│                                                             │
│  config.json: { "ftsEngine": "auto" | "js" | "native" }    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Engine Selector                          │
│                                                             │
│  1. Check user preference                                   │
│  2. If "auto": count files during scan                      │
│  3. If >5,000 files AND native available → use native       │
│  4. Otherwise → use JS                                      │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   JS Engine (natural)   │     │  Native Engine (FTS5)   │
│                         │     │                         │
│  - Always available     │     │  - Optional dependency  │
│  - Pure JavaScript      │     │  - better-sqlite3       │
│  - In-memory index      │     │  - Disk-backed index    │
│  - Good for <5k files   │     │  - Good for >5k files   │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Unified FTSEngine Interface                │
│                                                             │
│  - addChunks(chunks[])                                      │
│  - removeByPath(path)                                       │
│  - search(query, topK) → results[]                          │
│  - getStats() → { chunks, engine }                          │
│  - close()                                                  │
└─────────────────────────────────────────────────────────────┘
```

## Unified Interface

```typescript
// src/engines/ftsEngine.ts

export interface FTSSearchResult {
  id: string;
  path: string;
  text: string;
  startLine: number;
  endLine: number;
  score: number;
}

export interface FTSStats {
  totalChunks: number;
  engine: 'js' | 'native';
}

export interface FTSEngine {
  /** Add multiple chunks to the index */
  addChunks(chunks: Array<{
    id: string;
    text: string;
    path: string;
    startLine: number;
    endLine: number;
  }>): Promise<void>;

  /** Remove all chunks for a file path */
  removeByPath(path: string): void;

  /** Search with BM25 scoring */
  search(query: string, topK: number): FTSSearchResult[];

  /** Normalize scores to 0-1 range */
  normalizeScores(results: FTSSearchResult[]): FTSSearchResult[];

  /** Get index statistics */
  getStats(): FTSStats;

  /** Close/cleanup resources */
  close(): void;
}
```

## Engine Selection Logic

```typescript
// src/engines/ftsEngineFactory.ts

import { FTSEngine } from './ftsEngine';
import { NaturalBM25Engine } from './naturalBM25';

export type FTSEnginePreference = 'auto' | 'js' | 'native';

interface EngineSelectionResult {
  engine: FTSEngine;
  type: 'js' | 'native';
  reason: string;
}

/**
 * Check if native FTS5 module is available
 */
async function isNativeAvailable(): Promise<boolean> {
  try {
    // Dynamic import to avoid crash if not installed
    await import('better-sqlite3');
    return true;
  } catch {
    return false;
  }
}

/**
 * Create the appropriate FTS engine based on preference and environment
 */
export async function createFTSEngine(
  dbPath: string,
  preference: FTSEnginePreference,
  fileCount: number
): Promise<EngineSelectionResult> {

  // User explicitly chose JS
  if (preference === 'js') {
    return {
      engine: new NaturalBM25Engine(dbPath),
      type: 'js',
      reason: 'User preference: js',
    };
  }

  // User explicitly chose native
  if (preference === 'native') {
    if (await isNativeAvailable()) {
      const { SQLiteFTS5Engine } = await import('./sqliteFTS5');
      return {
        engine: new SQLiteFTS5Engine(dbPath),
        type: 'native',
        reason: 'User preference: native',
      };
    }
    // Fall back to JS with warning
    console.warn('Native FTS engine requested but better-sqlite3 not available. Using JS engine.');
    return {
      engine: new NaturalBM25Engine(dbPath),
      type: 'js',
      reason: 'User preference: native (unavailable, fell back to js)',
    };
  }

  // Auto mode: decide based on codebase size and availability
  const FILE_COUNT_THRESHOLD = 5000;

  if (fileCount > FILE_COUNT_THRESHOLD && await isNativeAvailable()) {
    const { SQLiteFTS5Engine } = await import('./sqliteFTS5');
    return {
      engine: new SQLiteFTS5Engine(dbPath),
      type: 'native',
      reason: `Auto: ${fileCount} files > ${FILE_COUNT_THRESHOLD} threshold, native available`,
    };
  }

  return {
    engine: new NaturalBM25Engine(dbPath),
    type: 'js',
    reason: fileCount > FILE_COUNT_THRESHOLD
      ? `Auto: ${fileCount} files > ${FILE_COUNT_THRESHOLD} threshold, but native unavailable`
      : `Auto: ${fileCount} files <= ${FILE_COUNT_THRESHOLD} threshold`,
  };
}
```

## Configuration Schema

```typescript
// src/storage/config.ts

export interface ProjectConfig {
  version: number;           // Schema version (bump to 3)
  projectPath: string;

  // NEW: Hybrid search configuration
  hybridSearch: {
    enabled: boolean;        // Default: true
    ftsEngine: 'auto' | 'js' | 'native';  // Default: 'auto'
    defaultAlpha: number;    // Default: 0.7
  };
}

// Default configuration
export const DEFAULT_CONFIG: ProjectConfig = {
  version: 3,
  projectPath: '',
  hybridSearch: {
    enabled: true,
    ftsEngine: 'auto',
    defaultAlpha: 0.7,
  },
};
```

## Config File Example

```json
// ~/.mcp/search/indexes/<hash>/config.json
{
  "version": 3,
  "projectPath": "/path/to/project",
  "hybridSearch": {
    "enabled": true,
    "ftsEngine": "auto",
    "defaultAlpha": 0.7
  }
}
```

## Package.json Changes

```json
{
  "dependencies": {
    "natural": "^6.10.0"
  },
  "optionalDependencies": {
    "better-sqlite3": "^9.4.0"
  }
}
```

This setup ensures:
- `npm install` always succeeds (pure JS is required dependency)
- Native module installs automatically where supported
- Fails gracefully on platforms without build tools

## Auto-Detection Thresholds

| Codebase Size | File Count | Auto-Selected Engine | Reason |
|---------------|------------|---------------------|--------|
| Small | <1,000 | JS | Native overhead not worth it |
| Medium | 1,000-5,000 | JS | JS handles well |
| Large | 5,000-20,000 | Native (if available) | Memory savings matter |
| Monorepo | >20,000 | Native (if available) | JS would be too slow |

## User Experience

### Scenario 1: Small Project, Auto Mode

```
$ create_index

Scanning project... 847 files found
Building vector index... done (12.3s)
Building keyword index (JS engine)... done (3.2s)

Index created successfully.
  Files indexed: 847
  Chunks: 2,341
  FTS Engine: js (auto-selected for small codebase)
  Hybrid search: enabled (alpha=0.7)
```

### Scenario 2: Large Project, Auto Mode, Native Available

```
$ create_index

Scanning project... 12,847 files found
Detected large codebase. Using native FTS engine for better performance.
Building vector index... done (89.4s)
Building keyword index (native engine)... done (8.1s)

Index created successfully.
  Files indexed: 12,847
  Chunks: 45,231
  FTS Engine: native (auto-selected for large codebase)
  Hybrid search: enabled (alpha=0.7)
```

### Scenario 3: Large Project, Auto Mode, Native Unavailable

```
$ create_index

Scanning project... 12,847 files found
Detected large codebase. Native FTS unavailable, using JS engine.
TIP: Install 'better-sqlite3' for faster keyword search on large projects.
     npm install better-sqlite3
Building vector index... done (89.4s)
Building keyword index (JS engine)... done (41.2s)

Index created successfully.
  Files indexed: 12,847
  Chunks: 45,231
  FTS Engine: js (native unavailable)
  Hybrid search: enabled (alpha=0.7)
```

### Scenario 4: User Forces Native Engine

```json
// config.json
{
  "hybridSearch": {
    "ftsEngine": "native"
  }
}
```

```
$ create_index

Scanning project... 500 files found
Using native FTS engine (user preference).
Building vector index... done (4.1s)
Building keyword index (native engine)... done (0.8s)

Index created successfully.
  Files indexed: 500
  Chunks: 1,203
  FTS Engine: native (user preference)
  Hybrid search: enabled (alpha=0.7)
```

## get_index_status Output Changes

```json
{
  "status": "ready",
  "projectPath": "/path/to/project",
  "stats": {
    "totalFiles": 12847,
    "totalChunks": 45231,
    "indexSize": "127 MB"
  },
  "hybridSearch": {
    "enabled": true,
    "ftsEngine": "native",
    "ftsEngineReason": "Auto: 12847 files > 5000 threshold, native available",
    "defaultAlpha": 0.7
  }
}
```

## Integration with Index Manager

```typescript
// src/engines/indexManager.ts

export class IndexManager {
  private ftsEngine: FTSEngine | null = null;
  private ftsEngineType: 'js' | 'native' | null = null;

  async createIndex(projectPath: string): Promise<void> {
    // 1. Scan files to get count
    const files = await this.scanFiles(projectPath);
    const fileCount = files.length;

    // 2. Load or create config
    const config = await this.loadConfig(projectPath);

    // 3. Select FTS engine based on file count and config
    const { engine, type, reason } = await createFTSEngine(
      this.getIndexPath(projectPath),
      config.hybridSearch.ftsEngine,
      fileCount
    );

    this.ftsEngine = engine;
    this.ftsEngineType = type;

    console.log(`FTS Engine: ${type} (${reason})`);

    // 4. Build vector index (existing logic)
    await this.buildVectorIndex(files);

    // 5. Build FTS index
    const chunks = await this.getAllChunks();
    await this.ftsEngine.addChunks(chunks);

    // 6. Save metadata with engine info
    await this.saveMetadata({
      ftsEngine: type,
      ftsEngineReason: reason,
    });
  }
}
```

## Switching Engines

If a user changes `ftsEngine` in config after initial indexing:

```typescript
async function handleEngineSwitch(
  currentEngine: 'js' | 'native',
  newPreference: FTSEnginePreference,
  fileCount: number
): Promise<{ needsReindex: boolean; message: string }> {

  const { type: newEngine } = await createFTSEngine('', newPreference, fileCount);

  if (currentEngine === newEngine) {
    return { needsReindex: false, message: 'Engine unchanged' };
  }

  return {
    needsReindex: true,
    message: `Engine changed from ${currentEngine} to ${newEngine}. Run reindex_project to rebuild keyword index.`,
  };
}
```

---

# Implementation Checklist

## Phase 1: Core Infrastructure

- [ ] Add `natural` as required dependency
- [ ] Add `better-sqlite3` as optional dependency
- [ ] Create unified `FTSEngine` interface (`src/engines/ftsEngine.ts`)
- [ ] Implement `NaturalBM25Engine` class (`src/engines/naturalBM25.ts`)
- [ ] Implement `SQLiteFTS5Engine` class (`src/engines/sqliteFTS5.ts`)
- [ ] Create engine factory with auto-detection (`src/engines/ftsEngineFactory.ts`)

## Phase 2: Integration

- [ ] Update config schema with `hybridSearch` settings
- [ ] Integrate FTS engine into `IndexManager`
- [ ] Add hybrid search method to `LanceDBStore`
- [ ] Update `search_code` tool with `mode` and `alpha` parameters
- [ ] Update `search_docs` tool with `mode` and `alpha` parameters
- [ ] Build FTS index during `create_index`
- [ ] Handle incremental updates in `reindex_file`
- [ ] Update `get_index_status` to show FTS engine info

## Phase 3: Testing

- [ ] Unit tests for `NaturalBM25Engine`
- [ ] Unit tests for `SQLiteFTS5Engine`
- [ ] Unit tests for engine factory (auto-detection logic)
- [ ] Integration tests for hybrid search
- [ ] Performance benchmarks (indexing speed, search latency, memory)
- [ ] Cross-platform testing (Windows, macOS, Linux)
- [ ] Test native module unavailable fallback

## Phase 4: Documentation

- [ ] Update API reference with new parameters
- [ ] Add hybrid search examples to docs
- [ ] Document `alpha` tuning recommendations
- [ ] Document FTS engine configuration options
- [ ] Add troubleshooting for native dependency issues

## Phase 5: Release

- [ ] Add to CHANGELOG.md
- [ ] Update ROADMAP.md (move from backlog to completed)
- [ ] Version bump (minor version - 1.2.0)
- [ ] NPM publish
- [ ] Announce feature in release notes
