---
task_id: "SMCP-007"
title: "Metadata Manager"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-09"
completed_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 1.5
assigned_to: "blakazulu"
tags: ["storage", "metadata", "statistics"]
---

# Task: Metadata Manager

## Overview

Implement metadata management for index statistics and state tracking. Stores version, timestamps, and stats about the indexed project. Used by get_index_status tool and for integrity tracking.

## Goals

- [x] Define metadata schema with Zod
- [x] Implement metadata persistence
- [x] Track index statistics (files, chunks, size)
- [x] Support incremental updates

## Success Criteria

- [x] Metadata persists to `metadata.json`
- [x] Stats accurately reflect index state
- [x] Timestamps update on index operations
- [x] Version tracking for future migrations

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

- [x] 1.1 Define metadata schema
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

- [x] 1.2 Define current version constant
    ```typescript
    const CURRENT_VERSION = '1.0.0';
    ```

### Phase 2: Metadata I/O (0.75 hours)

- [x] 2.1 Implement metadata loading
    ```typescript
    async function loadMetadata(indexPath: string): Promise<Metadata | null>
    // Returns null if metadata.json doesn't exist
    // Throws MCPError if corrupt
    ```

- [x] 2.2 Implement metadata saving
    ```typescript
    async function saveMetadata(indexPath: string, metadata: Metadata): Promise<void>
    // Atomic write (write to temp, rename)
    ```

- [x] 2.3 Implement metadata creation
    ```typescript
    function createMetadata(projectPath: string): Metadata
    // Creates initial metadata with zero stats
    ```

### Phase 3: Metadata Manager Class (0.5 hours)

- [x] 3.1 Create MetadataManager class
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

- [x] 4.1 Export from `src/storage/metadata.ts`

- [x] 4.2 Write unit tests
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

- [x] All subtasks completed
- [x] Schema matches RFC specification
- [x] Stats accurately track index state
- [x] Atomic writes prevent corruption
- [x] Unit tests pass (66 tests)
- [ ] Changes committed to Git (awaiting user approval)

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1.5 hours

- Implemented metadata schema with Zod (MetadataSchema, StatsSchema)
- Created CURRENT_VERSION constant ('1.0.0')
- Implemented loadMetadata(), saveMetadata(), createMetadata() functions
- Implemented MetadataManager class with all methods
- Atomic writes using temp file + rename pattern
- Added exports to src/storage/index.ts
- Created comprehensive unit tests (66 tests)
- All tests passing, build successful, lint clean

## Notes

- Use ISO 8601 datetime strings for consistency
- Atomic writes (temp + rename) prevent partial writes on crash
- Consider adding indexingDuration stat in future
- Storage size should include LanceDB directory size

## Implementation Details

### Files Created

- `src/storage/metadata.ts` - Main implementation
- `tests/unit/storage/metadata.test.ts` - Unit tests (66 tests)

### Files Modified

- `src/storage/index.ts` - Added metadata exports

### Key Features

- **Schema Validation**: Zod schemas for Metadata and Stats with strict validation
- **Atomic Writes**: Uses temp file + rename for crash safety
- **MCPError Integration**: Throws INDEX_CORRUPT for invalid/corrupt metadata
- **ISO 8601 Timestamps**: All datetime fields use ISO 8601 format
- **MetadataManager Class**: Full lifecycle management with:
  - `initialize()` - Create new metadata
  - `load()` - Load from disk
  - `save()` - Persist to disk
  - `updateStats()` - Update file/chunk/size counts
  - `markFullIndex()` - Update lastFullIndex timestamp
  - `markIncrementalUpdate()` - Update lastIncrementalUpdate timestamp

## Blockers

_None_

## Related Tasks

- SMCP-009: LanceDB Store provides actual chunk counts
- SMCP-019: get_index_status Tool reads metadata
