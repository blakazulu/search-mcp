---
task_id: "SMCP-095"
title: "Query Expansion & Synonyms"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 6
actual_hours: 0
assigned_to: "Team"
tags: ["search", "query", "synonyms", "inspired-by-mcp-vector-search"]
---

# Task: Query Expansion & Synonyms

## Overview

Implement query expansion with synonym mappings, inspired by mcp-vector-search's 59 expansion rules. When users search for "auth", also search for "authentication authorize login".

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

- [ ] Create synonym mapping dictionary
- [ ] Expand queries before embedding
- [ ] Improve recall for common abbreviations
- [ ] Make expansion configurable
- [ ] Don't over-expand (preserve precision)

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

- [ ] 1.1 Create expansion dictionary (50+ mappings)
- [ ] 1.2 Organize by category
- [ ] 1.3 Research common code abbreviations

### Phase 2: Implementation (2 hours)

- [ ] 2.1 Create `src/engines/queryExpansion.ts`
- [ ] 2.2 Implement expansion function
- [ ] 2.3 Add to search pipeline
- [ ] 2.4 Make configurable

### Phase 3: Testing (2 hours)

- [ ] 3.1 Test recall improvement
- [ ] 3.2 Test precision impact
- [ ] 3.3 Benchmark query times

## Resources

- [mcp-vector-search expansions](../../../examples/mcp-vector-search-main/)

## Acceptance Checklist

- [ ] 50+ expansion mappings
- [ ] Common abbreviations work
- [ ] Recall improved
- [ ] Precision acceptable
- [ ] Configurable
- [ ] Tests pass

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on deep dive analysis
- mcp-vector-search has 59 expansion rules
