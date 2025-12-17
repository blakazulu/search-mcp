---
task_id: "SMCP-098"
title: "Incremental Reindexing"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 12
actual_hours: 0
assigned_to: "Team"
tags: ["indexing", "performance", "incremental", "efficiency"]
---

# Task: Incremental Reindexing

## Overview

Only reindex changed parts of large files instead of re-embedding the entire file. When a user edits one function in a 5000-line file, we currently re-embed all chunks; this task implements surgical updates.

## Current Problem

```typescript
// Current: Full file reindex on any change
async reindexFile(filePath: string) {
    // Delete ALL chunks for this file
    await this.deleteChunksForFile(filePath);

    // Re-read and re-chunk ENTIRE file
    const content = await fs.readFile(filePath, 'utf-8');
    const chunks = await this.chunker.chunk(content);

    // Re-embed ALL chunks (expensive!)
    for (const chunk of chunks) {
        const embedding = await this.embedder.embed(chunk.text);
        await this.store.upsert({ ...chunk, embedding });
    }
}
```

**Problem:**
- Large file (5000 lines) = ~50 chunks
- Edit 1 line = regenerate 50 embeddings
- Each embedding = ~50ms
- Total = 2.5 seconds for 1-line edit

## Target Solution

```typescript
// After: Surgical chunk updates
async reindexFileIncremental(filePath: string) {
    const content = await fs.readFile(filePath, 'utf-8');
    const newChunks = await this.chunker.chunkWithHashes(content);
    const oldChunks = await this.store.getChunksForFile(filePath);

    // Compare chunk hashes to find changes
    const { added, removed, unchanged } = diffChunks(oldChunks, newChunks);

    // Only process changed chunks
    await this.store.deleteChunks(removed.map(c => c.id));

    for (const chunk of added) {
        const embedding = await this.embedder.embed(chunk.text);
        await this.store.upsert({ ...chunk, embedding });
    }

    // Keep unchanged chunks (no embedding cost!)
    console.log(`Reindexed: ${added.length} new, ${removed.length} deleted, ${unchanged.length} kept`);
}
```

**Result:**
- Edit 1 line = ~2 chunks affected (with overlap)
- 2 embeddings × 50ms = 100ms (25x faster!)

## Goals

- [ ] Hash each chunk for change detection
- [ ] Diff old vs new chunks
- [ ] Only re-embed changed chunks
- [ ] Handle chunk boundary shifts
- [ ] Significant performance improvement for large files

## Success Criteria

- Single-line edits reindex in < 500ms (vs 2500ms)
- Chunk hashes stored in fingerprints
- Diff algorithm handles boundary shifts
- No data loss during incremental updates
- Works with all chunking strategies

## Dependencies

**Required:**

- SMCP-089: Merkle DAG Change Detection ✅ **COMPLETED** - Provides chunk-level tracking infrastructure

**Related:**

- SMCP-094: Search-Triggered Auto-Reindexing (uses this for efficiency)

### SMCP-089 Integration Notes

SMCP-089 implemented `MerkleTreeManager` which already provides:

- `ChunkNode` with `contentHash` for position-independent matching
- `diffChunks()` algorithm detecting added/modified/removed/moved chunks
- `MerkleDiff.chunkChanges` array with per-file chunk-level changes
- Persistence via `merkle-tree.json`

**This task can now leverage that infrastructure instead of implementing separate chunk hashing.**

```typescript
// Available from SMCP-089:
import {
  MerkleTreeManager,
  buildMerkleTree,
  computeChunkContentHash,  // Position-independent chunk hash
  ChunkDiff                 // { addedChunks, modifiedChunks, removedChunks, movedChunks }
} from './engines/merkleTree.js';
```

## Implementation Details

### Chunk Hashing

```typescript
interface HashedChunk {
    id: string;
    text: string;
    hash: string;          // SHA256 of normalized text
    startLine: number;
    endLine: number;
    filePath: string;
}

function hashChunk(text: string): string {
    // Normalize whitespace for stable hashing
    const normalized = text.trim().replace(/\s+/g, ' ');
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
```

### Chunk Diffing Algorithm

```typescript
interface ChunkDiff {
    added: HashedChunk[];      // New chunks (need embedding)
    removed: HashedChunk[];    // Deleted chunks (remove from store)
    unchanged: HashedChunk[];  // Same hash (keep existing)
    moved: Array<{            // Same hash, different position
        old: HashedChunk;
        new: HashedChunk;
    }>;
}

function diffChunks(oldChunks: HashedChunk[], newChunks: HashedChunk[]): ChunkDiff {
    const oldByHash = new Map(oldChunks.map(c => [c.hash, c]));
    const newByHash = new Map(newChunks.map(c => [c.hash, c]));

    const added: HashedChunk[] = [];
    const removed: HashedChunk[] = [];
    const unchanged: HashedChunk[] = [];
    const moved: Array<{ old: HashedChunk; new: HashedChunk }> = [];

    // Find added and unchanged
    for (const newChunk of newChunks) {
        const oldChunk = oldByHash.get(newChunk.hash);
        if (!oldChunk) {
            added.push(newChunk);
        } else if (oldChunk.startLine === newChunk.startLine) {
            unchanged.push(newChunk);
        } else {
            moved.push({ old: oldChunk, new: newChunk });
        }
    }

    // Find removed
    for (const oldChunk of oldChunks) {
        if (!newByHash.has(oldChunk.hash)) {
            removed.push(oldChunk);
        }
    }

    return { added, removed, unchanged, moved };
}
```

### Handling Chunk Boundary Shifts

When lines are inserted/deleted, chunk boundaries shift. Strategy:

```typescript
// Problem: Insert line at top pushes all chunks down
// Old: Chunk1 (lines 1-50), Chunk2 (lines 40-90)
// New: Chunk1 (lines 2-51), Chunk2 (lines 41-91)

// Solution: Hash-based matching (position-independent)
// If hash matches, content is same regardless of line numbers
// Update line numbers in metadata without re-embedding

async function handleMovedChunks(moved: Array<{ old: HashedChunk; new: HashedChunk }>) {
    for (const { old, new: newChunk } of moved) {
        // Just update metadata, no re-embedding needed
        await this.store.updateChunkMetadata(old.id, {
            startLine: newChunk.startLine,
            endLine: newChunk.endLine,
        });
    }
}
```

### Overlap Handling

With 200-token overlap, editing affects 2-3 chunks:

```
[Chunk 1: lines 1-50] [overlap: 40-50]
                      [Chunk 2: lines 40-90] [overlap: 80-90]
                                            [Chunk 3: lines 80-130]

Edit line 45:
- Chunk 1: hash changes (contains line 45)
- Chunk 2: hash changes (contains line 45 in overlap)
- Chunk 3: unchanged (line 45 not in range)

Result: Re-embed 2 chunks instead of all 3
```

### Storage Schema Update

```typescript
// fingerprints.json enhancement
interface EnhancedFingerprint {
    hash: string;           // File-level hash
    mtime: number;
    size: number;
    chunks: ChunkFingerprint[];  // NEW: Per-chunk tracking
}

interface ChunkFingerprint {
    id: string;
    hash: string;          // Chunk content hash
    startLine: number;
    endLine: number;
}
```

## Subtasks

### Phase 1: Chunk Hashing (3 hours)

- [ ] 1.1 Add hash generation to chunking engine
- [ ] 1.2 Store chunk hashes in fingerprints
- [ ] 1.3 Add chunk hash to LanceDB records
- [ ] 1.4 Migration for existing indexes

### Phase 2: Diff Algorithm (4 hours)

- [ ] 2.1 Implement chunk diffing algorithm
- [ ] 2.2 Handle boundary shifts
- [ ] 2.3 Handle moved chunks (metadata update only)
- [ ] 2.4 Unit tests for diff edge cases

### Phase 3: Integration (3 hours)

- [ ] 3.1 Update `reindexFile` to use incremental approach
- [ ] 3.2 Update file watcher to trigger incremental reindex
- [ ] 3.3 Add logging for incremental stats

### Phase 4: Testing (2 hours)

- [ ] 4.1 Performance benchmarks (before/after)
- [ ] 4.2 Edge cases: empty file, single chunk, huge file
- [ ] 4.3 Integration tests with real edits
- [ ] 4.4 Verify no data loss

## Resources

- [Current lancedb.ts](../../../src/storage/lancedb.ts)
- [Current chunking.ts](../../../src/engines/chunking.ts)
- [Fingerprints implementation](../../../src/storage/fingerprints.ts)

## Acceptance Checklist

- [ ] Chunk hashes stored
- [ ] Diff algorithm handles all cases
- [ ] Single-line edit < 500ms
- [ ] No data loss during updates
- [ ] Performance benchmarks show improvement
- [ ] Tests pass

## Progress Log

### 2025-12-17 - 0 hours

- SMCP-089 (Merkle DAG) completed - provides chunk-level hashing and diff infrastructure
- This task can now focus on integration rather than building diffing from scratch
- Key reusable components: `MerkleTreeManager`, `computeChunkContentHash()`, `ChunkDiff`

### 2025-12-16 - 0 hours

- Task created based on ROADMAP.md item
- Key optimization: hash-based change detection at chunk level

## Notes

- SMCP-089 (Merkle DAG) is now complete and provides chunk-level infrastructure
- This task integrates that infrastructure into `IndexManager.updateFile()`
- Consider LRU cache for recently computed chunk hashes
- May need to handle chunking strategy changes (force full reindex)
- Key integration points:
  - Build Merkle tree during initial indexing
  - Load tree on file change, compute diff
  - Use `chunkChanges` to do surgical updates in LanceDB
