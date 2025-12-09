---
task_id: "SMCP-014"
title: "Index Manager"
category: "Technical"
priority: "P0"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 6
actual_hours: 4
assigned_to: "blakazulu"
tags: ["orchestration", "indexing", "core"]
---

# Task: Index Manager

## Overview

Implement the central orchestrator for all indexing operations. Coordinates file discovery, policy filtering, chunking, embedding, and storage. Handles both full indexing and incremental updates. This is the core component that ties all engines together.

## Goals

- [x] Orchestrate full project indexing
- [x] Support incremental updates (single file)
- [x] Coordinate all engines (policy, chunking, embedding, storage)
- [x] Provide progress reporting

## Success Criteria

- Full index creates complete searchable database
- Incremental update correctly handles add/modify/delete
- Progress callbacks report accurate completion %
- All operations are atomic (rollback on failure)

## Dependencies

**Blocked by:**

- SMCP-008: Fingerprints Manager
- SMCP-009: LanceDB Store
- SMCP-011: Indexing Policy Engine
- SMCP-012: Chunking Engine
- SMCP-013: Embedding Engine

**Blocks:**

- SMCP-015: File Watcher Engine
- SMCP-016: Integrity Engine
- SMCP-020: create_index Tool
- SMCP-021: reindex_project Tool
- SMCP-022: reindex_file Tool

**Related:**

- All storage and engine components

## Subtasks

### Phase 1: Progress Reporting (0.5 hours)

- [x] 1.1 Define progress interface
    ```typescript
    interface IndexProgress {
      phase: 'scanning' | 'chunking' | 'embedding' | 'storing';
      current: number;
      total: number;
      currentFile?: string;
    }

    type ProgressCallback = (progress: IndexProgress) => void;
    ```

- [x] 1.2 Define indexing result interface
    ```typescript
    interface IndexResult {
      success: boolean;
      filesIndexed: number;
      chunksCreated: number;
      durationMs: number;
      errors?: string[];
    }
    ```

### Phase 2: File Discovery (1 hour)

- [x] 2.1 Implement file scanner
    ```typescript
    async function scanFiles(
      projectPath: string,
      policy: IndexingPolicy,
      onProgress?: ProgressCallback
    ): Promise<string[]>
    // Recursively finds all indexable files
    // Applies policy filtering
    // Returns list of relative paths
    ```

- [x] 2.2 Handle large directories
    - Use streaming/iterative approach
    - Report progress during scan
    - Respect maxFiles limit (warn if exceeded)

### Phase 3: Full Indexing Pipeline (2 hours)

- [x] 3.1 Implement full index function
    ```typescript
    async function createFullIndex(
      projectPath: string,
      indexPath: string,
      onProgress?: ProgressCallback
    ): Promise<IndexResult>
    ```

- [x] 3.2 Pipeline stages
    1. Initialize components (policy, store, fingerprints)
    2. Scan files (apply policy)
    3. For each file batch:
       - Read and chunk files
       - Generate embeddings
       - Store in LanceDB
       - Update fingerprints
    4. Save metadata
    5. Return results

- [x] 3.3 Implement batch processing
    ```typescript
    // Process files in batches to manage memory
    const FILE_BATCH_SIZE = 50;
    ```

### Phase 4: Incremental Updates (1.5 hours)

- [x] 4.1 Implement single file update
    ```typescript
    async function updateFile(
      projectPath: string,
      indexPath: string,
      relativePath: string
    ): Promise<void>
    // Handles add, modify, delete for single file
    ```

- [x] 4.2 Implement batch update from delta
    ```typescript
    async function applyDelta(
      projectPath: string,
      indexPath: string,
      delta: DeltaResult,
      onProgress?: ProgressCallback
    ): Promise<IndexResult>
    // Processes added, modified, removed files
    ```

- [x] 4.3 Handle file operations
    - Add: chunk, embed, insert
    - Modify: delete old chunks, then add
    - Remove: delete chunks, remove fingerprint

### Phase 5: Index Manager Class (0.75 hours)

- [x] 5.1 Create IndexManager class
    ```typescript
    class IndexManager {
      constructor(projectPath: string, indexPath: string)

      // Full operations
      async createIndex(onProgress?: ProgressCallback): Promise<IndexResult>
      async rebuildIndex(onProgress?: ProgressCallback): Promise<IndexResult>
      async deleteIndex(): Promise<void>

      // Incremental operations
      async updateFile(relativePath: string): Promise<void>
      async removeFile(relativePath: string): Promise<void>
      async applyDelta(delta: DeltaResult, onProgress?: ProgressCallback): Promise<IndexResult>

      // Accessors
      isIndexed(): Promise<boolean>
      getStats(): Promise<IndexStats>
    }
    ```

### Phase 6: Export & Tests (0.25 hours)

- [x] 6.1 Export from `src/engines/indexManager.ts`

- [x] 6.2 Write integration tests
    - Test full index creation
    - Test incremental add/modify/delete
    - Test progress reporting
    - Test error handling and rollback

## Resources

- `docs/ENGINEERING.RFC.md` Section 2.2: Component Responsibilities
- All engine sections (5.1-5.6)
- All storage sections (3.1-3.4)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Full indexing works end-to-end
- [x] Incremental updates work correctly
- [x] Progress reporting is accurate
- [x] Error handling prevents partial states
- [x] Integration tests pass
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 4 hours

- Implemented IndexProgress, ProgressCallback, IndexResult, IndexStats interfaces
- Implemented scanFiles() with glob and IndexingPolicy filtering
- Implemented createFullIndex() with 4-stage pipeline (scanning, chunking, embedding, storing)
- Implemented batch processing with FILE_BATCH_SIZE = 50
- Implemented updateFile(), removeFile(), applyDelta() for incremental updates
- Created IndexManager class with all required methods
- Integrated with FingerprintsManager, LanceDBStore, IndexingPolicy, chunking, embedding engines
- Exported from src/engines/index.ts
- Wrote comprehensive integration tests (45 tests)
- All 591 tests passing, build successful

## Notes

- This is the most complex component - ties everything together
- Consider transaction-like behavior for atomicity
- Memory management is critical for large projects
- Progress reporting should be granular enough for UX
- File batching prevents memory exhaustion

## Blockers

_None_

## Related Tasks

- SMCP-015: File Watcher calls updateFile on changes
- SMCP-016: Integrity Engine calls applyDelta for reconciliation
- SMCP-020: create_index Tool uses createIndex
