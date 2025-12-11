---
task_id: "SMCP-058"
title: "FTS Engine Interface & JS Implementation"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: ""
estimated_hours: 8
actual_hours: 0
assigned_to: "Team"
tags: ["hybrid-search", "fts", "bm25", "natural"]
---

# Task: FTS Engine Interface & JS Implementation

## Overview

Create the unified FTS (Full-Text Search) engine interface and implement the pure JavaScript BM25 engine using the `natural` npm package. This is the foundation for hybrid search - it must work on all platforms without native dependencies.

## Goals

- [ ] Define unified FTSEngine interface that both JS and Native engines will implement
- [ ] Implement NaturalBM25Engine using the `natural` package
- [ ] Add `natural` as a required dependency
- [ ] Ensure the JS engine works standalone for keyword-only search

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

- [ ] 1.1 Create `src/engines/ftsEngine.ts` with interface
    - FTSSearchResult type
    - FTSStats type
    - FTSEngine interface (addChunks, removeByPath, search, normalizeScores, getStats, close)

- [ ] 1.2 Define error types for FTS operations
    - FTSNotInitializedError
    - FTSQueryError

### Phase 2: JS Engine Implementation (4 hours)

- [ ] 2.1 Add `natural` package dependency
    ```bash
    npm install natural
    npm install -D @types/natural
    ```

- [ ] 2.2 Create `src/engines/naturalBM25.ts`
    - Implement FTSEngine interface
    - Use TfIdf from natural for BM25 scoring
    - Handle document add/remove operations
    - Implement score normalization (0-1 range)

- [ ] 2.3 Implement serialization for persistence
    - Save index to disk (bm25-index.json)
    - Load index on startup
    - Handle index corruption gracefully

### Phase 3: Testing (2 hours)

- [ ] 3.1 Create `tests/engines/naturalBM25.test.ts`
    - Test addChunks with various content
    - Test removeByPath
    - Test search with exact matches
    - Test search with partial matches
    - Test score normalization
    - Test empty index handling
    - Test serialization/deserialization

- [ ] 3.2 Performance benchmarks
    - Measure indexing speed (chunks/sec)
    - Measure search latency
    - Measure memory usage

## Resources

- [natural npm package](https://www.npmjs.com/package/natural)
- [TF-IDF explanation](https://en.wikipedia.org/wiki/Tf%E2%80%93idf)
- RFC: `/docs/design/HYBRID-SEARCH-RFC.md` (lines 109-223)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Unit tests passing
- [ ] No TypeScript errors
- [ ] Code reviewed
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on RFC

## Notes

- The `natural` package's TfIdf doesn't support true document removal - may need to rebuild index or track deletions separately
- Consider lazy loading the natural package to reduce startup time
- Score normalization is critical for hybrid search to work correctly

## Blockers

_None currently_

## Related Tasks

- SMCP-059: SQLite FTS5 Native Engine
- SMCP-060: Engine Factory & Auto-Detection
- SMCP-061: Integration & Search Tools Update
- SMCP-062: Testing & Documentation
