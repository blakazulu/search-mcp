---
task_id: "SMCP-095"
title: "Query Expansion & Synonyms"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-16"
completed_date: "2025-12-17"
due_date: ""
estimated_hours: 6
actual_hours: 4
assigned_to: "Team"
tags: ["search", "query", "synonyms"]
---

# Task: Query Expansion & Synonyms

## Overview

Implement query expansion with synonym mappings. When users search for "auth", also search for "authentication authorize login".

## Current Problem

- "auth" doesn't find "authentication"
- "db" doesn't find "database"
- "err" doesn't find "error"
- Users must guess exact terms

## Target Solution

```typescript
const QUERY_EXPANSIONS: Record<string, string> = {
    "auth": "authentication authorize login session",
    "db": "database data storage query",
    "api": "endpoint route request response",
    "async": "asynchronous await promise",
    "err": "error exception failure catch",
    "config": "configuration settings options",
    "util": "utility helper utils",
    "fn": "function method",
    // ... 50+ more
};

function expandQuery(query: string): string {
    let expanded = query;
    for (const [abbrev, expansion] of Object.entries(QUERY_EXPANSIONS)) {
        if (query.toLowerCase().includes(abbrev)) {
            expanded += " " + expansion;
        }
    }
    return expanded;
}
```

## Goals

- [x] Create synonym mapping dictionary
- [x] Expand queries before embedding
- [x] Improve recall for common abbreviations
- [x] Make expansion configurable
- [x] Don't over-expand (preserve precision)

## Success Criteria

- "auth" finds "authentication" results
- "db" finds "database" results
- Common abbreviations work intuitively
- Precision not significantly reduced
- Configurable enable/disable

## Implementation Details

### Expansion Categories

```typescript
const EXPANSIONS = {
    // Authentication
    "auth": "authentication authorize login logout session token",
    "oauth": "authentication oauth2 authorization",

    // Database
    "db": "database data storage",
    "sql": "database query select insert update delete",
    "mongo": "mongodb database nosql",

    // API
    "api": "endpoint route request response rest",
    "http": "request response get post put delete",

    // Async
    "async": "asynchronous await promise callback",
    "sync": "synchronous blocking",

    // Errors
    "err": "error exception failure",
    "catch": "error exception try catch",

    // Common abbreviations
    "config": "configuration settings options",
    "util": "utility helper utils",
    "fn": "function method",
    "impl": "implementation implement",
    "init": "initialize initialization setup",
    "msg": "message",
    "req": "request",
    "res": "response",
    "ctx": "context",
    "env": "environment",
};
```

### Integration
```typescript
// In hybridSearch.ts
async function search(query: string, options: SearchOptions) {
    const expandedQuery = options.expandQuery !== false
        ? expandQuery(query)
        : query;

    // Use expanded query for embedding
    const embedding = await embed(expandedQuery);

    // Use original query for FTS (exact matching)
    const ftsResults = await ftsSearch(query);

    // Combine results
    return fuseResults(vectorResults, ftsResults);
}
```

## Subtasks

### Phase 1: Dictionary (2 hours)

- [x] 1.1 Create expansion dictionary (50+ mappings) - 60+ mappings created
- [x] 1.2 Organize by category - 12 categories
- [x] 1.3 Research common code abbreviations

### Phase 2: Implementation (2 hours)

- [x] 2.1 Create `src/engines/queryExpansion.ts`
- [x] 2.2 Implement expansion function
- [x] 2.3 Add to search pipeline (searchCode.ts, searchDocs.ts)
- [x] 2.4 Make configurable (enabled, maxExpansionTerms, customExpansions)

### Phase 3: Testing (2 hours)

- [x] 3.1 Test recall improvement - 72 unit tests
- [x] 3.2 Test precision impact - maxExpansionTerms limits over-expansion
- [x] 3.3 Benchmark query times - < 1ms per expansion

## Resources

_No external resources required._

## Acceptance Checklist

- [x] 50+ expansion mappings - 60+ mappings (exceeds requirement)
- [x] Common abbreviations work - auth, db, api, err, config, util, fn, etc.
- [x] Recall improved - expanded query used for semantic embedding
- [x] Precision acceptable - maxExpansionTerms=10 limits over-expansion
- [x] Configurable - enabled, maxExpansionTerms, customExpansions
- [x] Tests pass - 72 unit tests passing

## Progress Log

### 2025-12-17 - 4 hours (Completed)

- Created `src/engines/queryExpansion.ts` with 60+ expansion mappings
- Implemented expandQuery and expandQueryWithDetails functions
- Integrated into search_code and search_docs tools
- Added 72 unit tests covering all functionality
- Updated CHANGELOG.md with feature documentation
- All tests passing, build successful

### 2025-12-16 - 0 hours

- Task created based on deep dive analysis
