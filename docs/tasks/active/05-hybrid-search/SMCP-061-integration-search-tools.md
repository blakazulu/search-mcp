---
task_id: "SMCP-061"
title: "Integration & Search Tools Update"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: ""
estimated_hours: 10
actual_hours: 0
assigned_to: "Team"
tags: ["hybrid-search", "fts", "integration", "tools"]
---

# Task: Integration & Search Tools Update

## Overview

Integrate the FTS engines into the existing codebase, update the search tools to support hybrid search modes, and wire everything together in the IndexManager. This is where all the pieces come together.

## Goals

- [ ] Integrate FTS engine into IndexManager
- [ ] Update search_code and search_docs tools with hybrid search support
- [ ] Add `mode` and `alpha` parameters to search tools
- [ ] Update get_index_status to show FTS engine info
- [ ] Build FTS index during create_index and reindex_project

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

- [ ] 1.1 Update `src/engines/indexManager.ts`
    - Add FTS engine instance variable
    - Initialize FTS engine in createIndex
    - Build FTS index after vector index
    - Pass file count to engine factory

- [ ] 1.2 Update chunk insertion flow
    - Add chunks to both vector and FTS indexes
    - Ensure atomic operations (both succeed or both fail)

- [ ] 1.3 Update reindex_file flow
    - Remove old chunks from FTS index by path
    - Add new chunks to FTS index
    - Handle FTS engine not initialized gracefully

- [ ] 1.4 Update metadata storage
    - Store ftsEngine type in metadata.json
    - Store ftsEngineReason for debugging
    - Store hybridSearch config snapshot

### Phase 2: Search Tools Update (4 hours)

- [ ] 2.1 Update `src/tools/searchCode.ts`
    - Add `mode` parameter: "vector" | "keyword" | "hybrid"
    - Add `alpha` parameter: 0.0 - 1.0
    - Implement mode switching logic
    - Default to "hybrid" when FTS available, "vector" otherwise

- [ ] 2.2 Update `src/tools/searchDocs.ts`
    - Same changes as searchCode
    - Share common hybrid search logic

- [ ] 2.3 Implement hybrid search in LanceDBStore
    - Add hybridSearch method
    - Run vector and keyword searches in parallel
    - Merge and re-rank results by hybrid score
    - Handle missing FTS engine (fall back to vector)

- [ ] 2.4 Update tool descriptions
    - Document new parameters in tool schema
    - Add examples in descriptions

### Phase 3: Status & Diagnostics (2 hours)

- [ ] 3.1 Update `src/tools/getIndexStatus.ts`
    - Add hybridSearch section to output
    - Show ftsEngine type
    - Show ftsEngineReason
    - Show defaultAlpha

- [ ] 3.2 Add FTS diagnostics
    - Count chunks in FTS index
    - Verify FTS/vector chunk counts match
    - Report any inconsistencies

- [ ] 3.3 Handle backward compatibility
    - Detect indexes without FTS
    - Return hybridSearch.enabled = false
    - Suggest reindex to enable hybrid search

## Resources

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md` (lines 1199-1265)
- Current search tools: `src/tools/searchCode.ts`, `src/tools/searchDocs.ts`
- IndexManager: `src/engines/indexManager.ts`
- LanceDB store: `src/storage/lancedb.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Hybrid search works in all three modes
- [ ] Backward compatibility verified
- [ ] No TypeScript errors
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on RFC

## Notes

- Hybrid search should fail gracefully to vector-only when FTS unavailable
- Consider caching FTS engine instance to avoid repeated initialization
- Alpha parameter should be validated (0.0 - 1.0 range)
- Default alpha from config, but allow per-query override

## Blockers

_None currently_

## Related Tasks

- SMCP-058: FTS Engine Interface & JS Implementation
- SMCP-059: SQLite FTS5 Native Engine
- SMCP-060: Engine Factory & Auto-Detection
- SMCP-062: Testing & Documentation
