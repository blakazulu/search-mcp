---
task_id: "SMCP-073"
title: "Update Storage Layer for Configurable Dimensions"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-12"
due_date: "2025-12-16"
estimated_hours: 3
actual_hours: 2
assigned_to: "Team"
tags: ["storage", "lancedb", "vector-dimension", "metadata"]
---

# Task: Update Storage Layer for Configurable Dimensions

## Overview

Update LanceDB storage classes and metadata to support different vector dimensions for code (384) and docs (768) indexes. Add model name tracking to metadata for migration detection.

## Goals

- [x] Make vector dimension configurable in LanceDBStore
- [x] Update DocsLanceDBStore to support configurable dimensions
- [x] Store model names in metadata for migration detection
- [x] Export new dimension constants

## Success Criteria

- `LanceDBStore` accepts dimension parameter (defaults to 384)
- `DocsLanceDBStore` uses 768 dimensions
- Metadata schema includes `codeModelName` and `docsModelName` fields
- Vector dimension validation works with configurable dimensions
- All existing storage tests pass

## Dependencies

**Blocked by:**

- SMCP-072: Need embedding constants defined first

**Blocks:**

- SMCP-074: Tools need updated storage and metadata

**Related:**

- Parent: dual-embedding-models feature

## Subtasks

### Phase 1: Update LanceDBStore (1 hour)

- [x] 1.1 Change `VECTOR_DIMENSION` from constant to constructor parameter
- [x] 1.2 Add `vectorDimension` property to class
- [x] 1.3 Update `search()` to validate against instance dimension
- [x] 1.4 Update constructor signature: `constructor(indexPath: string, vectorDimension?: number)`
- [x] 1.5 Default dimension to `CODE_EMBEDDING_DIMENSION` (384)
- [x] 1.6 Export `CODE_VECTOR_DIMENSION` and `DOCS_VECTOR_DIMENSION` constants

### Phase 2: Update DocsLanceDBStore (0.5 hours)

- [x] 2.1 Import `DOCS_EMBEDDING_DIMENSION` from embedding engine
- [x] 2.2 Update to support configurable dimensions (default 384 for backward compat)
- [x] 2.3 Update vector validation in search method
- [x] 2.4 Verify table schema handles different dimension

### Phase 3: Update Metadata Schema (1 hour)

- [x] 3.1 Add `codeModelName?: string` to `IndexMetadata` interface
- [x] 3.2 Add `docsModelName?: string` to `IndexMetadata` interface
- [x] 3.3 Add `codeModelDimension?: number` to metadata (for validation)
- [x] 3.4 Add `docsModelDimension?: number` to metadata (for validation)
- [x] 3.5 Update `saveMetadata()` to persist new fields
- [x] 3.6 Update `loadMetadata()` to read new fields

### Phase 4: Update Tests (0.5 hours)

- [x] 4.1 Update LanceDBStore tests for configurable dimension
- [x] 4.2 Add tests for dimension validation
- [x] 4.3 Update metadata tests for new fields
- [x] 4.4 Verify DocsLanceDBStore uses correct dimension

## Resources

- Internal reference: `src/storage/lancedb.ts`
- Internal reference: `src/storage/docsLancedb.ts`
- Internal reference: `src/storage/metadata.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (unit tests pass)
- [x] TypeScript compiles without errors
- [x] No regressions in existing functionality
- [x] Backward compatible (existing indexes still work)

## Progress Log

### 2025-12-12 - 0 hours

- Task created
- Subtasks defined

### 2025-12-12 - 2 hours

- Implemented all 4 phases
- LanceDBStore now accepts `vectorDimension` parameter (defaults to 384)
- Added `CODE_VECTOR_DIMENSION` (384) and `DOCS_VECTOR_DIMENSION` (768) constants
- DocsLanceDBStore now accepts configurable dimension (defaults to 384 for backward compat)
- Added `EmbeddingModelInfoSchema` to metadata with `codeModelName`, `codeModelDimension`, `docsModelName`, `docsModelDimension`
- Added `MetadataManager` methods: `updateEmbeddingModelInfo()`, `getCodeModelName()`, `getDocsModelName()`, etc.
- All 465 storage tests pass
- Build passes, no TypeScript errors
- Backward compatible: existing indexes without `embeddingModels` field still work

## Notes

- Existing indexes will have undefined model fields in metadata - this is expected
- SMCP-074 handles the migration detection logic
- LanceDB schema is flexible - same table can have different vector sizes in different databases

## Blockers

_None identified_

## Related Tasks

- SMCP-072: Embedding engine (prerequisite)
- SMCP-074: Tools and migration (depends on this)
