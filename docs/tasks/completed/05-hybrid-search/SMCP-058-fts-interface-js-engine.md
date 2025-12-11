---
task_id: "SMCP-058"
title: "FTS Engine Interface & JS Implementation"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-11"
completed_date: "2025-12-11"
due_date: ""
estimated_hours: 8
actual_hours: 6
assigned_to: "Team"
tags: ["hybrid-search", "fts", "bm25", "natural"]
---

# Task: FTS Engine Interface & JS Implementation

## Overview

Create the unified FTS (Full-Text Search) engine interface and implement the pure JavaScript BM25 engine using the `natural` npm package. This is the foundation for hybrid search - it must work on all platforms without native dependencies.

## Goals

- [x] Define unified FTSEngine interface that both JS and Native engines will implement
- [x] Implement NaturalBM25Engine using the `natural` package
- [x] Add `natural` as a required dependency
- [x] Ensure the JS engine works standalone for keyword-only search

## Success Criteria

- ✅ FTSEngine interface defined with all required methods
- ✅ NaturalBM25Engine passes unit tests for add/remove/search operations
- ✅ BM25 scores are properly normalized to 0-1 range
- ✅ `npm install` succeeds on all platforms (no native deps)
- ✅ Search latency < 100ms for 5,000 chunks

## Dependencies

**Blocked by:**

- None (first task in sequence)

**Blocks:**

- SMCP-059: SQLite FTS5 Native Engine (needs interface)
- SMCP-060: Engine Factory & Auto-Detection (needs both engines)
- SMCP-061: Integration & Search Tools Update (needs engines)

**Related:**

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md`

## Subtasks

### Phase 1: Interface Definition (2 hours)

- [x] 1.1 Create `src/engines/ftsEngine.ts` with interface
    - FTSChunk, FTSSearchResult, FTSStats types
    - FTSEngine interface (addChunks, addChunk, removeByPath, search, normalizeScores, getStats, serialize, deserialize, hasData, clear, close)

- [x] 1.2 Define error types for FTS operations
    - FTSNotInitializedError
    - FTSQueryError
    - FTSSerializationError

### Phase 2: JS Engine Implementation (4 hours)

- [x] 2.1 Add `natural` package dependency
    ```bash
    npm install natural@^8.1.0
    npm install -D @types/natural@^5.1.5
    ```

- [x] 2.2 Create `src/engines/naturalBM25.ts`
    - Implement FTSEngine interface
    - Use TfIdf from natural for BM25 scoring
    - Handle document add/remove operations (with lazy deletion)
    - Implement score normalization (0-1 range)

- [x] 2.3 Implement serialization for persistence
    - Serialize document metadata to JSON
    - Rebuild TF-IDF index on deserialize
    - Handle index corruption gracefully

### Phase 3: Testing (2 hours)

- [x] 3.1 Create `tests/unit/engines/naturalBM25.test.ts`
    - Test addChunks with various content
    - Test removeByPath
    - Test search with exact matches
    - Test search with multi-word queries
    - Test score normalization
    - Test empty index handling
    - Test serialization/deserialization
    - Test edge cases (Unicode, special chars, large chunks)

- [x] 3.2 Performance benchmarks
    - Measure indexing speed (chunks/sec)
    - Measure search latency
    - All 51 tests passing

## Resources

- [natural npm package](https://www.npmjs.com/package/natural)
- [TF-IDF explanation](https://en.wikipedia.org/wiki/Tf%E2%80%93idf)
- RFC: `/docs/design/HYBRID-SEARCH-RFC.md` (lines 109-223)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Unit tests passing (51 tests)
- [x] No TypeScript errors
- [x] Code reviewed
- [x] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on RFC

### 2025-12-11 - 6 hours

- ✅ Created `src/engines/ftsEngine.ts` with interface and error types
- ✅ Created `src/engines/naturalBM25.ts` implementing FTSEngine interface
- ✅ Added `natural@^8.1.0` and `@types/natural@^5.1.5` dependencies
- ✅ Created comprehensive test suite with 51 tests
- ✅ Updated `src/engines/index.ts` with exports
- ✅ Updated CHANGELOG.md
- ✅ Build passes, all tests pass
- 📊 Progress: 100% complete

## Notes

- The `natural` package's TfIdf doesn't support true document removal - implemented lazy deletion with rebuild when deletion ratio exceeds 20%
- TF-IDF tokenizes on word boundaries, so partial word matching doesn't work (e.g., "validate" won't match "validateInput") - this is expected BM25 behavior
- Serialization stores document metadata and rebuilds TF-IDF index on load
- Score normalization is critical for hybrid search to work correctly

## Blockers

_None - task completed_

## Related Tasks

- SMCP-059: SQLite FTS5 Native Engine
- SMCP-060: Engine Factory & Auto-Detection
- SMCP-061: Integration & Search Tools Update
- SMCP-062: Testing & Documentation
