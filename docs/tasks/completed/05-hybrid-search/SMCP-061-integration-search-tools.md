---
task_id: "SMCP-061"
title: "Integration & Search Tools Update"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-11"
completed_date: "2025-12-11"
due_date: ""
estimated_hours: 10
actual_hours: 8
assigned_to: "Team"
tags: ["hybrid-search", "fts", "integration", "tools"]
---

# Task: Integration & Search Tools Update

## Overview

Integrate the FTS engines into the existing codebase, update the search tools to support hybrid search modes, and wire everything together in the IndexManager. This is where all the pieces come together.

## Goals

- [x] Integrate FTS engine into IndexManager
- [x] Update search_code and search_docs tools with hybrid search support
- [x] Add `mode` and `alpha` parameters to search tools
- [x] Update get_index_status to show FTS engine info
- [x] Build FTS index during create_index and reindex_project

## Success Criteria

- ✅ Hybrid search works end-to-end (create index → search)
- ✅ All three modes work: vector, keyword, hybrid
- ✅ Alpha parameter correctly weights vector vs keyword scores
- ✅ FTS index built alongside vector index
- ✅ Incremental updates work (reindex_file)
- ✅ get_index_status shows FTS engine type and reason
- ✅ Backward compatible with existing indexes (vector-only fallback)

## Dependencies

**Blocked by:**

- SMCP-058: FTS Engine Interface & JS Implementation
- SMCP-059: SQLite FTS5 Native Engine
- SMCP-060: Engine Factory & Auto-Detection

**Blocks:**

- SMCP-062: Testing & Documentation

**Related:**

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md`

## Subtasks

### Phase 1: IndexManager Integration (4 hours)

- [x] 1.1 Update `src/engines/indexManager.ts`
    - Add FTS engine imports and initialization
    - Initialize FTS engine in createFullIndex
    - Build FTS index after vector index
    - Pass file count to engine factory

- [x] 1.2 Update chunk insertion flow
    - Add chunks to both vector and FTS indexes
    - FTS index persisted to disk after creation

- [x] 1.3 Update reindex_file flow
    - Remove old chunks from FTS index by path
    - Add new chunks to FTS index
    - Handle FTS engine not initialized gracefully

- [x] 1.4 Update metadata storage
    - Added HybridSearchInfoSchema to metadata.ts
    - Store ftsEngine type, reason, chunkCount
    - Added updateHybridSearchInfo(), getHybridSearchInfo(), isHybridSearchEnabled()

### Phase 2: Search Tools Update (4 hours)

- [x] 2.1 Update `src/tools/searchCode.ts`
    - Add `mode` parameter: "vector" | "fts" | "hybrid"
    - Add `alpha` parameter: 0.0 - 1.0
    - Implement mode switching logic with RRF fusion
    - Default to "hybrid" when FTS available, "vector" otherwise

- [x] 2.2 Update `src/tools/searchDocs.ts`
    - Same mode and alpha parameters added
    - Falls back to vector-only (FTS for docs is future work)

- [x] 2.3 Create `src/engines/hybridSearch.ts`
    - SearchMode type definition
    - calculateRRFScore() for Reciprocal Rank Fusion
    - fuseResults() to merge vector and FTS results
    - performHybridSearch() main function
    - validateSearchMode() and validateAlpha() helpers

- [x] 2.4 Update tool descriptions
    - Document new parameters in tool schema
    - Output includes searchMode indicator

### Phase 3: Status & Diagnostics (2 hours)

- [x] 3.1 Update `src/tools/getIndexStatus.ts`
    - Add HybridSearchStatus interface
    - Show ftsEngine type and reason
    - Show ftsChunkCount and defaultAlpha

- [x] 3.2 Add FTS diagnostics
    - Count chunks in FTS index via metadata
    - Report FTS engine status

- [x] 3.3 Handle backward compatibility
    - Detect indexes without FTS
    - Return hybridSearch.available = false
    - Graceful fallback to vector-only search

## Resources

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md` (lines 1199-1265)
- Current search tools: `src/tools/searchCode.ts`, `src/tools/searchDocs.ts`
- IndexManager: `src/engines/indexManager.ts`
- LanceDB store: `src/storage/lancedb.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Hybrid search works in all three modes
- [x] Backward compatibility verified
- [x] No TypeScript errors
- [x] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on RFC

### 2025-12-11 - 8 hours

- ✅ Updated `src/engines/indexManager.ts` with FTS integration
- ✅ Created `src/engines/hybridSearch.ts` with RRF fusion logic
- ✅ Updated `src/storage/metadata.ts` with HybridSearchInfoSchema
- ✅ Updated `src/storage/lancedb.ts` with getChunksById(), getAllChunksForFTS()
- ✅ Updated `src/tools/searchCode.ts` with mode and alpha parameters
- ✅ Updated `src/tools/searchDocs.ts` with mode and alpha parameters
- ✅ Updated `src/tools/getIndexStatus.ts` with hybridSearch status
- ✅ Updated `src/tools/reindexFile.ts` with FTS incremental updates
- ✅ Added `src/utils/paths.ts` helpers for FTS index paths
- ✅ Added loadFTSEngine() to ftsEngineFactory.ts
- ✅ Build passes, 2115 tests passing
- 📊 Progress: 100% complete

## Notes

- Hybrid search uses Reciprocal Rank Fusion (RRF) for merging results
- Default mode is "hybrid" with alpha=0.7 (70% semantic, 30% keyword)
- Falls back gracefully to vector-only when FTS unavailable
- Alpha parameter validated (0.0 - 1.0 range)
- searchDocs currently vector-only (FTS for docs is future work)

## Blockers

_None - task completed_

## Related Tasks

- SMCP-058: FTS Engine Interface & JS Implementation
- SMCP-059: SQLite FTS5 Native Engine
- SMCP-060: Engine Factory & Auto-Detection
- SMCP-062: Testing & Documentation
