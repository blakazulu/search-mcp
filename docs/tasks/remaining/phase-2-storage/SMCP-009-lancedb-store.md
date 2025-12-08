---
task_id: "SMCP-009"
title: "LanceDB Store"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "blakazulu"
tags: ["storage", "vectordb", "lancedb", "embeddings"]
---

# Task: LanceDB Store

## Overview

Implement the vector database wrapper using LanceDB for storing and searching code chunk embeddings. This is the core storage component that enables semantic search capabilities.

## Goals

- [ ] Create LanceDB table with correct schema
- [ ] Implement CRUD operations for chunks
- [ ] Implement vector similarity search
- [ ] Handle database lifecycle (open, close, delete)

## Success Criteria

- Table schema matches RFC specification
- Vector search returns relevant results sorted by score
- Batch insert handles 1000+ chunks efficiently
- Delete by file path removes all chunks for a file

## Dependencies

**Blocked by:**

- SMCP-003: Error Handling System
- SMCP-004: Hash Utilities

**Blocks:**

- SMCP-014: Index Manager
- SMCP-017: search_now Tool
- SMCP-018: search_by_path Tool
- SMCP-019: get_index_status Tool
- SMCP-023: delete_index Tool

**Related:**

- SMCP-013: Embedding Engine (provides vectors)
- SMCP-012: Chunking Engine (provides chunks)

## Subtasks

### Phase 1: Schema Definition (0.5 hours)

- [ ] 1.1 Define chunk interface
    ```typescript
    interface ChunkRecord {
      id: string;           // UUIDv4
      path: string;         // Relative file path
      text: string;         // Chunk content
      vector: number[];     // Float32[384] embedding
      start_line: number;   // Start line in source
      end_line: number;     // End line in source
      content_hash: string; // SHA256 of source file
    }
    ```

- [ ] 1.2 Define search result interface
    ```typescript
    interface SearchResult {
      path: string;
      text: string;
      score: number;       // 0.0 - 1.0 similarity
      startLine: number;
      endLine: number;
    }
    ```

### Phase 2: Database Initialization (1 hour)

- [ ] 2.1 Implement database connection
    ```typescript
    async function openDatabase(indexPath: string): Promise<Database>
    // Opens or creates LanceDB at indexPath/index.lancedb/
    ```

- [ ] 2.2 Implement table creation
    ```typescript
    async function ensureTable(db: Database): Promise<Table>
    // Creates 'project_docs' table if not exists
    // Uses vector(384) for embedding dimension
    ```

- [ ] 2.3 Handle stale lockfiles
    - Detect and remove stale .lock files on startup
    - Log warning when lockfile cleanup occurs

### Phase 3: CRUD Operations (1.5 hours)

- [ ] 3.1 Implement batch insert
    ```typescript
    async function insertChunks(table: Table, chunks: ChunkRecord[]): Promise<void>
    // Batch insert with progress tracking
    // Handles large batches (1000+ chunks)
    ```

- [ ] 3.2 Implement delete by file path
    ```typescript
    async function deleteByPath(table: Table, relativePath: string): Promise<number>
    // Deletes all chunks for given file
    // Returns count of deleted chunks
    ```

- [ ] 3.3 Implement get files list
    ```typescript
    async function getIndexedFiles(table: Table): Promise<string[]>
    // Returns unique list of all indexed file paths
    ```

- [ ] 3.4 Implement count operations
    ```typescript
    async function countChunks(table: Table): Promise<number>
    async function countFiles(table: Table): Promise<number>
    ```

### Phase 4: Vector Search (0.5 hours)

- [ ] 4.1 Implement similarity search
    ```typescript
    async function search(
      table: Table,
      queryVector: number[],
      topK: number = 10
    ): Promise<SearchResult[]>
    // Returns top K most similar chunks
    // Normalizes scores to 0.0 - 1.0 range
    ```

- [ ] 4.2 Implement path pattern search
    ```typescript
    async function searchByPath(
      table: Table,
      pattern: string,
      limit: number = 20
    ): Promise<string[]>
    // Returns files matching glob pattern
    // Uses SQL LIKE or regex matching
    ```

### Phase 5: Store Class & Export (0.5 hours)

- [ ] 5.1 Create LanceDBStore class
    ```typescript
    class LanceDBStore {
      constructor(indexPath: string)
      async open(): Promise<void>
      async close(): Promise<void>
      async delete(): Promise<void>  // Deletes entire database

      // CRUD
      async insertChunks(chunks: ChunkRecord[]): Promise<void>
      async deleteByPath(path: string): Promise<number>
      async getIndexedFiles(): Promise<string[]>

      // Search
      async search(vector: number[], topK?: number): Promise<SearchResult[]>
      async searchByPath(pattern: string, limit?: number): Promise<string[]>

      // Stats
      async countChunks(): Promise<number>
      async countFiles(): Promise<number>
      async getStorageSize(): Promise<number>
    }
    ```

- [ ] 5.2 Export from `src/storage/lancedb.ts`

- [ ] 5.3 Write unit tests
    - Test table creation
    - Test insert and search round-trip
    - Test delete by path
    - Test search relevance (known queries)

## Resources

- `docs/ENGINEERING.RFC.md` Section 3.2: Database Schema
- [LanceDB Documentation](https://lancedb.github.io/lancedb/)
- `vectordb` npm package docs

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Schema matches RFC (384-dim vectors)
- [ ] Search returns results sorted by similarity
- [ ] Batch insert handles 1000+ chunks
- [ ] Delete removes all chunks for a file
- [ ] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- LanceDB stores data in `index.lancedb/` directory
- Vector dimension (384) must match embedding model output
- Consider adding IVF index for faster search on large datasets
- Score normalization may depend on LanceDB version

## Blockers

_None yet_

## Related Tasks

- SMCP-012: Chunking Engine provides chunks with line numbers
- SMCP-013: Embedding Engine provides 384-dim vectors
- SMCP-017: search_now Tool uses similarity search
