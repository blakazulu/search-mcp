---
task_id: "SMCP-028"
title: "Docs Index Manager"
category: "Technical"
priority: "P1"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 3
actual_hours: 3
assigned_to: "blakazulu"
tags: ["engines", "indexing", "docs", "orchestration"]
---

# Task: Docs Index Manager

## Overview

Create an orchestrator for documentation indexing operations. Coordinates scanning doc files, chunking with prose-optimized parameters, generating embeddings, and storing in the docs LanceDB table.

## Goals

- [x] Create DocsIndexManager class
- [x] Scan for doc files using docPatterns config
- [x] Use prose-optimized chunking
- [x] Store in DocsLanceDBStore
- [x] Track in DocsFingerprintsManager
- [x] Support incremental updates

## Success Criteria

- Full docs indexing works end-to-end
- Uses larger chunks than code
- Incremental updates detect doc changes
- Progress reporting works
- Stats tracked in metadata.docsStats

## Dependencies

**Blocked by:**

- SMCP-025: Docs LanceDB Store
- SMCP-026: Docs Fingerprints Manager
- SMCP-027: Docs Chunking Config
- SMCP-013: Embedding Engine (completed)

**Blocks:**

- SMCP-029: search_docs Tool
- SMCP-031: File Watcher Docs Integration

**Related:**

- SMCP-014: Index Manager (base implementation)

## Subtasks

### Phase 1: Create DocsIndexManager Class (1.5 hours)

- [x] 1.1 Create `src/engines/docsIndexManager.ts`

- [x] 1.2 Define class structure
    ```typescript
    export class DocsIndexManager {
      private readonly projectPath: string;
      private readonly indexPath: string;
      private store: DocsLanceDBStore;
      private fingerprints: DocsFingerprintsManager;

      constructor(projectPath: string, indexPath: string);
      async initialize(): Promise<void>;
      async close(): Promise<void>;
    }
    ```

- [x] 1.3 Implement scanDocFiles()
    ```typescript
    async scanDocFiles(
      config: Config,
      onProgress?: ProgressCallback
    ): Promise<string[]>
    ```
    - Use config.docPatterns to find files
    - Apply same deny list as code
    - Filter to only doc extensions

- [x] 1.4 Implement createDocsIndex()
    ```typescript
    async createDocsIndex(
      onProgress?: ProgressCallback
    ): Promise<DocsIndexResult>
    ```
    - Scan doc files
    - Chunk with DOC_SPLIT_OPTIONS
    - Generate embeddings
    - Store in DocsLanceDBStore
    - Update docs-fingerprints.json

### Phase 2: Incremental Updates (1 hour)

- [x] 2.1 Implement updateDocFile()
    ```typescript
    async updateDocFile(relativePath: string): Promise<void>
    ```
    - Check fingerprint
    - Re-chunk if changed
    - Update store

- [x] 2.2 Implement removeDocFile()
    ```typescript
    async removeDocFile(relativePath: string): Promise<void>
    ```
    - Delete chunks from store
    - Remove from fingerprints

- [x] 2.3 Implement getDocsStats()
    ```typescript
    async getDocsStats(): Promise<DocsStats>
    ```
    - Return totalDocs, totalDocChunks, storageSizeBytes

### Phase 3: Tests (0.5 hours)

- [x] 3.1 Create `tests/unit/engines/docsIndexManager.test.ts`
    - Test full indexing flow
    - Test incremental updates
    - Test doc file detection

## Resources

- `src/engines/indexManager.ts` - Base implementation pattern
- `docs/ENGINEERING.RFC.md` Section 4.8: search_docs behavior

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Full docs indexing works
- [x] Uses prose-optimized chunking
- [x] Incremental updates work
- [x] Stats reporting works
- [x] Tests pass (47 tests)
- [x] Exported from `src/engines/index.ts`

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 3 hours

- Created `src/engines/docsIndexManager.ts` with DocsIndexManager class
- Implemented scanDocFiles(), createDocsIndex(), updateDocFile(), removeDocFile()
- Implemented applyDocsDelta() for batch operations
- Implemented getDocsStats() for statistics
- Progress reporting with DocsProgressCallback
- Uses prose-optimized chunking via DOC_SPLIT_OPTIONS
- Created comprehensive test suite with 47 tests
- All 1161 tests passing

## Notes

- Similar structure to IndexManager but simpler (docs only)
- Uses DOC_SPLIT_OPTIONS from docsChunking.ts
- Shares embedding engine with code indexing
- Config drives which files are considered docs

## Blockers

_None_

## Related Tasks

- SMCP-014: Index Manager (pattern to follow)
- SMCP-025: Docs LanceDB Store (storage)
- SMCP-026: Docs Fingerprints (delta detection)
- SMCP-027: Docs Chunking (chunking params)
