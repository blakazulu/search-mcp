---
task_id: "SMCP-074"
title: "Update Tools and Add Migration Detection"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-12"
due_date: "2025-12-17"
estimated_hours: 4
actual_hours: 3
assigned_to: "Team"
tags: ["tools", "migration", "search", "indexing"]
---

# Task: Update Tools and Add Migration Detection

## Overview

Update all MCP tools to use the correct embedding engines (code vs docs), add migration detection to warn users when their index was created with a different model, and update the index manager to save model metadata.

## Goals

- [x] Update search tools to use correct embedding engines
- [x] Update index manager to use correct engines and save metadata
- [x] Implement migration detection with user-friendly error messages
- [x] Update create/reindex tools to save model information

## Success Criteria

- [x] `search_code` uses code embedding engine (BGE-small, 384 dims)
- [x] `search_docs` uses docs embedding engine (BGE-base, 768 dims)
- [x] Index creation saves model names to metadata
- [x] Searching with mismatched model triggers clear error suggesting reindex
- [x] `get_index_status` shows current model information
- [x] All tool tests pass

## Dependencies

**Blocked by:**

- SMCP-072: Need dual embedding engines
- SMCP-073: Need storage with configurable dimensions and metadata fields

**Blocks:**

- None

**Related:**

- Parent: dual-embedding-models feature

## Subtasks

### Phase 1: Update Index Manager (1 hour)

- [x] 1.1 Import `getCodeEmbeddingEngine` and `getDocsEmbeddingEngine`
- [x] 1.2 Update code indexing to use code engine
- [x] 1.3 Update docs indexing to use docs engine
- [x] 1.4 Save model names to metadata after indexing
- [x] 1.5 Pass correct dimension to LanceDBStore constructor

### Phase 2: Update Search Tools (1 hour)

- [x] 2.1 Update `searchCode.ts` to use `getCodeEmbeddingEngine()`
- [x] 2.2 Update `searchDocs.ts` to use `getDocsEmbeddingEngine()`
- [x] 2.3 Add model validation before search
- [x] 2.4 Return helpful error if model mismatch detected

### Phase 3: Implement Migration Detection (1 hour)

- [x] 3.1 Create `checkModelCompatibility()` function in `src/utils/modelCompatibility.ts`
- [x] 3.2 Compare stored model names with current constants
- [x] 3.3 Return incompatibility details if mismatch
- [x] 3.4 Integrate check into search tools
- [x] 3.5 Create user-friendly error message suggesting `reindex_project`

### Phase 4: Update Create/Reindex Tools (0.5 hours)

- [x] 4.1 Update `createIndex.ts` to save model metadata
- [x] 4.2 Update `reindexProject.ts` to update model metadata
- [x] 4.3 Ensure old index data is fully replaced on reindex

### Phase 5: Update Status Tool (0.5 hours)

- [x] 5.1 Update `getIndexStatus.ts` to show model information
- [x] 5.2 Display code model name and dimension
- [x] 5.3 Display docs model name and dimension
- [x] 5.4 Show warning if models don't match current version

## Resources

- Internal reference: `src/engines/indexManager.ts`
- Internal reference: `src/tools/searchCode.ts`
- Internal reference: `src/tools/searchDocs.ts`
- Internal reference: `src/tools/createIndex.ts`
- Internal reference: `src/tools/reindexProject.ts`
- Internal reference: `src/tools/getIndexStatus.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (unit and integration tests pass)
- [x] TypeScript compiles without errors
- [x] Error messages are clear and actionable
- [x] Documentation updated in docs/dual-embedding-models.md
- [x] CHANGELOG.md updated

## Progress Log

### 2025-12-12 - 0 hours

- Task created
- Subtasks defined

### 2025-12-12 - 3 hours

- Implemented all 5 phases
- Created new utility file `src/utils/modelCompatibility.ts` with:
  - `checkModelCompatibility()` - Full model compatibility check
  - `checkCodeModelCompatibility()` - Code model only check
  - `checkDocsModelCompatibility()` - Docs model only check
  - `getCurrentModelConfig()` - Returns current model configuration
  - `buildStatusWarning()` - Builds non-blocking status warning
- Updated `src/engines/indexManager.ts` to use `getCodeEmbeddingEngine()` and save code model info
- Updated `src/engines/docsIndexManager.ts` to use `getDocsEmbeddingEngine()` with 768 dimensions
- Updated `src/tools/searchCode.ts` to use code engine and add migration detection
- Updated `src/tools/searchDocs.ts` to use docs engine (768 dims) and add migration detection
- Updated `src/tools/getIndexStatus.ts` to show embedding model info and warnings
- Updated `src/storage/metadata.ts` to include embedding model info in `createMetadata()`
- Updated tests to use correct dimensions
- All 150 tool tests pass
- All 147 engine tests pass
- Build passes, no TypeScript errors
- CHANGELOG.md updated

## Notes

- Migration error should be non-blocking for `get_index_status` (show warning, not error)
- For search operations, migration error should be blocking
- Consider: should we auto-detect and suggest reindex, or just fail?
  - Decision: Fail with clear error suggesting `reindex_project`

## Error Message Template

```
Index model mismatch detected.

Your index was created with:
  Code: Xenova/all-MiniLM-L6-v2 (384 dims)
  Docs: Xenova/all-MiniLM-L6-v2 (384 dims)

Current version uses:
  Code: Xenova/bge-small-en-v1.5 (384 dims)
  Docs: Xenova/bge-base-en-v1.5 (768 dims)

Please run `reindex_project` to rebuild your index with the new models.
This will improve search quality by ~10-13%.
```

## Blockers

_None identified_

## Related Tasks

- SMCP-072: Embedding engine (prerequisite)
- SMCP-073: Storage layer (prerequisite)
