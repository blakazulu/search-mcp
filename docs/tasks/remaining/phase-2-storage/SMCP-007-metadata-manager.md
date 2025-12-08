---
task_id: "SMCP-007"
title: "Metadata Manager"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["storage", "metadata", "statistics"]
---

# Task: Metadata Manager

## Overview

Implement metadata management for index statistics and state tracking. Stores version, timestamps, and stats about the indexed project. Used by get_index_status tool and for integrity tracking.

## Goals

- [ ] Define metadata schema with Zod
- [ ] Implement metadata persistence
- [ ] Track index statistics (files, chunks, size)
- [ ] Support incremental updates

## Success Criteria

- Metadata persists to `metadata.json`
- Stats accurately reflect index state
- Timestamps update on index operations
- Version tracking for future migrations

## Dependencies

**Blocked by:**

- SMCP-003: Error Handling System
- SMCP-005: Path Utilities

**Blocks:**

- SMCP-019: get_index_status Tool

**Related:**

- SMCP-006: Config Manager (similar pattern)
- SMCP-009: LanceDB Store (provides chunk counts)

## Subtasks

### Phase 1: Schema Definition (0.5 hours)

- [ ] 1.1 Define metadata schema
    ```typescript
    const MetadataSchema = z.object({
      version: z.string(),
      projectPath: z.string(),
      createdAt: z.string().datetime(),
      lastFullIndex: z.string().datetime(),
      lastIncrementalUpdate: z.string().datetime().optional(),
      stats: z.object({
        totalFiles: z.number(),
        totalChunks: z.number(),
        storageSizeBytes: z.number(),
      }),
    });

    type Metadata = z.infer<typeof MetadataSchema>;
    ```

- [ ] 1.2 Define current version constant
    ```typescript
    const CURRENT_VERSION = '1.0.0';
    ```

### Phase 2: Metadata I/O (0.75 hours)

- [ ] 2.1 Implement metadata loading
    ```typescript
    async function loadMetadata(indexPath: string): Promise<Metadata | null>
    // Returns null if metadata.json doesn't exist
    // Throws MCPError if corrupt
    ```

- [ ] 2.2 Implement metadata saving
    ```typescript
    async function saveMetadata(indexPath: string, metadata: Metadata): Promise<void>
    // Atomic write (write to temp, rename)
    ```

- [ ] 2.3 Implement metadata creation
    ```typescript
    function createMetadata(projectPath: string): Metadata
    // Creates initial metadata with zero stats
    ```

### Phase 3: Metadata Manager Class (0.5 hours)

- [ ] 3.1 Create MetadataManager class
    ```typescript
    class MetadataManager {
      constructor(indexPath: string)
      async load(): Promise<Metadata | null>
      async save(): Promise<void>
      async exists(): Promise<boolean>

      // Update methods
      updateStats(files: number, chunks: number, sizeBytes: number): void
      markFullIndex(): void
      markIncrementalUpdate(): void

      // Accessors
      getMetadata(): Metadata | null
    }
    ```

### Phase 4: Export & Tests (0.25 hours)

- [ ] 4.1 Export from `src/storage/metadata.ts`

- [ ] 4.2 Write unit tests
    - Test metadata creation
    - Test stats updates
    - Test timestamp updates
    - Test version tracking
    - Test corrupt file handling

## Resources

- `docs/ENGINEERING.RFC.md` Section 3.4: Metadata Schema
- `docs/ENGINEERING.RFC.md` Section 4.4: get_index_status output

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Schema matches RFC specification
- [ ] Stats accurately track index state
- [ ] Atomic writes prevent corruption
- [ ] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Use ISO 8601 datetime strings for consistency
- Atomic writes (temp + rename) prevent partial writes on crash
- Consider adding indexingDuration stat in future
- Storage size should include LanceDB directory size

## Blockers

_None yet_

## Related Tasks

- SMCP-009: LanceDB Store provides actual chunk counts
- SMCP-019: get_index_status Tool reads metadata
