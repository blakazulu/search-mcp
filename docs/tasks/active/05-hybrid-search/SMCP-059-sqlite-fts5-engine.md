---
task_id: "SMCP-059"
title: "SQLite FTS5 Native Engine"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: ""
estimated_hours: 8
actual_hours: 0
assigned_to: "Team"
tags: ["hybrid-search", "fts", "sqlite", "fts5", "native"]
---

# Task: SQLite FTS5 Native Engine

## Overview

Implement the native SQLite FTS5 engine using `better-sqlite3` for high-performance keyword search on large codebases. This engine is optional - it will only be used when the native module is available and the codebase exceeds the size threshold.

## Goals

- [ ] Implement SQLiteFTS5Engine using better-sqlite3
- [ ] Add `better-sqlite3` as an optional dependency
- [ ] Support all FTS5 features (phrase search, prefix, boolean operators)
- [ ] Ensure graceful fallback when native module unavailable

## Success Criteria

- ✅ SQLiteFTS5Engine implements FTSEngine interface
- ✅ Native module loads successfully on Windows, macOS, Linux
- ✅ Graceful error when native module unavailable (no crash)
- ✅ Search latency < 50ms for 50,000 chunks
- ✅ Disk-backed index persists across restarts
- ✅ Incremental add/remove works correctly

## Dependencies

**Blocked by:**

- SMCP-058: FTS Engine Interface & JS Implementation (needs interface)

**Blocks:**

- SMCP-060: Engine Factory & Auto-Detection (needs both engines)
- SMCP-061: Integration & Search Tools Update (needs engines)

**Related:**

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md`

## Subtasks

### Phase 1: Setup & Native Module (2 hours)

- [ ] 1.1 Add `better-sqlite3` as optional dependency
    ```json
    "optionalDependencies": {
      "better-sqlite3": "^9.4.0"
    }
    ```

- [ ] 1.2 Create native module availability check
    - Dynamic import to avoid crash if not installed
    - Export `isNativeAvailable()` function
    - Log helpful message when unavailable

### Phase 2: FTS5 Engine Implementation (4 hours)

- [ ] 2.1 Create `src/engines/sqliteFTS5.ts`
    - Implement FTSEngine interface
    - Initialize SQLite database with FTS5 virtual table
    - Use porter tokenizer for stemming

- [ ] 2.2 Implement FTS5 table schema
    ```sql
    CREATE VIRTUAL TABLE chunks_fts USING fts5(
      id UNINDEXED,
      path UNINDEXED,
      text,
      start_line UNINDEXED,
      end_line UNINDEXED,
      tokenize='porter unicode61'
    );
    ```

- [ ] 2.3 Implement CRUD operations
    - addChunks: batch insert with transaction
    - removeByPath: DELETE WHERE path = ?
    - search: FTS5 MATCH with BM25 scoring

- [ ] 2.4 Implement query escaping
    - Handle special FTS5 characters
    - Support phrase search with quotes
    - Fallback to LIKE for invalid queries

- [ ] 2.5 Implement score normalization
    - FTS5 BM25 returns negative scores (more negative = better)
    - Convert to 0-1 range for hybrid scoring

### Phase 3: Testing (2 hours)

- [ ] 3.1 Create `tests/engines/sqliteFTS5.test.ts`
    - Test addChunks with batch operations
    - Test removeByPath
    - Test search with exact matches
    - Test search with FTS5 syntax (phrases, prefixes)
    - Test score normalization
    - Test database persistence
    - Test query escaping edge cases

- [ ] 3.2 Test native module unavailability
    - Mock better-sqlite3 import failure
    - Verify graceful error handling

- [ ] 3.3 Performance benchmarks
    - Compare with JS engine on same dataset
    - Measure at 1k, 10k, 50k chunks

## Resources

- [better-sqlite3 docs](https://github.com/WiseLibs/better-sqlite3)
- [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html)
- [FTS5 query syntax](https://www.sqlite.org/fts5.html#full_text_query_syntax)
- RFC: `/docs/design/HYBRID-SEARCH-RFC.md` (lines 373-615)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Unit tests passing
- [ ] Cross-platform testing (at least 2 platforms)
- [ ] No TypeScript errors
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on RFC

## Notes

- FTS5 BM25 scores are negative where more negative = better match
- Use transactions for batch operations to improve performance
- The `porter` tokenizer provides stemming (e.g., "running" matches "run")
- Consider WAL mode for better concurrent access

## Blockers

_None currently_

## Related Tasks

- SMCP-058: FTS Engine Interface & JS Implementation
- SMCP-060: Engine Factory & Auto-Detection
- SMCP-061: Integration & Search Tools Update
- SMCP-062: Testing & Documentation
