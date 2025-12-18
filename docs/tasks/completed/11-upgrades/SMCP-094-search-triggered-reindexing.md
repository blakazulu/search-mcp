---
task_id: "SMCP-094"
title: "Search-Triggered Auto-Reindexing"
category: "Technical"
priority: "P3"
status: "redundant"
created_date: "2025-12-16"
closed_date: "2025-12-17"
due_date: ""
estimated_hours: 10
actual_hours: 0.5
assigned_to: "Team"
tags: ["indexing", "auto-update", "ux"]
---

# Task: Search-Triggered Auto-Reindexing

## Status: REDUNDANT

**Reason:** Existing functionality already covers this use case:

1. **`realtime` indexing strategy** - File watcher detects changes immediately while server is running
2. **`lazy` indexing strategy** - Queues changes and `flush()` processes them before search
3. **IntegrityEngine** - Detects drift on startup and periodically (24h default)

### Coverage Analysis

| Scenario | Already Handled By |
|----------|-------------------|
| Files change while server running | `realtime` strategy (file watcher) |
| Process changes before search | `lazy` strategy (`flush()`) |
| Files changed while server was off | IntegrityEngine (startup check) |
| Periodic drift detection | IntegrityEngine (24h interval) |

The only gap would be "check every N searches" but this adds minimal value over the existing startup check + file watcher combination.

## Original Overview (For Reference)

Implement automatic reindexing triggered by search operations. When users search, we check if the index is stale and silently reindex changed files. No daemon process needed.

## Original Problem Statement

- ~~Users must manually run `reindex_project` to update index~~ **FALSE: `realtime` strategy auto-updates**
- ~~Index becomes stale without user awareness~~ **FALSE: IntegrityEngine checks on startup**
- ~~No automatic freshness maintenance~~ **FALSE: File watcher + IntegrityEngine**

## Target Solution

```typescript
class SearchTriggeredIndexer {
    private searchCount = 0;
    private checkEveryNSearches = 10;
    private maxAutoReindexFiles = 5;
    private stalenessThreshold = 300000; // 5 minutes

    async preSearchHook(): Promise<void> {
        this.searchCount++;
        if (this.searchCount % this.checkEveryNSearches === 0) {
            const staleFiles = await this.findStaleFiles();
            if (staleFiles.length <= this.maxAutoReindexFiles) {
                await this.reindexFiles(staleFiles); // Silent reindex
            }
        }
    }
}
```

## Goals

- [ ] Check index freshness periodically during searches
- [ ] Auto-reindex small changes silently (≤5 files)
- [ ] No daemon process required
- [ ] Configurable thresholds
- [ ] Non-blocking (doesn't slow down search)

## Success Criteria

- Index stays fresh during normal usage
- Small changes reindexed automatically
- Large changes prompt user (don't auto-reindex 100 files)
- No noticeable search latency impact
- Works without background processes

## Implementation Details

### Configuration
```typescript
interface AutoReindexConfig {
    enabled: boolean;              // Default: true
    checkEveryNSearches: number;   // Default: 10
    maxAutoReindexFiles: number;   // Default: 5
    stalenessThresholdMs: number;  // Default: 300000 (5 min)
}
```

### Staleness Detection
```typescript
async function findStaleFiles(): Promise<string[]> {
    const indexedFiles = await store.getIndexedFiles();
    const currentFiles = await scanProjectFiles();

    const stale: string[] = [];
    for (const file of currentFiles) {
        const indexed = indexedFiles.get(file.path);
        if (!indexed || indexed.hash !== file.hash) {
            stale.push(file.path);
        }
    }
    return stale;
}
```

### Integration Point
```typescript
// In search_code tool handler
async function handleSearchCode(params) {
    // Check and maybe reindex before search
    await autoReindexer.preSearchHook();

    // Perform actual search
    return await search(params);
}
```

## Subtasks

### Phase 1: Core Implementation (4 hours)

- [ ] 1.1 Create `src/engines/autoReindexer.ts`
- [ ] 1.2 Implement staleness detection
- [ ] 1.3 Implement silent reindexing
- [ ] 1.4 Add configuration options

### Phase 2: Integration (3 hours)

- [ ] 2.1 Add pre-search hook to search_code
- [ ] 2.2 Add pre-search hook to search_docs
- [ ] 2.3 Track search count across sessions
- [ ] 2.4 Log reindex activity

### Phase 3: Testing (3 hours)

- [ ] 3.1 Test staleness detection accuracy
- [ ] 3.2 Test auto-reindex triggers
- [ ] 3.3 Verify no search latency impact
- [ ] 3.4 Test threshold behavior (>5 files)

## Resources

- [Current indexing pipeline](../../../src/tools/)

## Acceptance Checklist

- [ ] Auto-reindex works during searches
- [ ] Small changes handled silently
- [ ] Large changes don't auto-reindex
- [ ] No daemon process needed
- [ ] Configurable thresholds
- [ ] Tests pass

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on deep dive analysis
- Search-triggered reindexing provides an "always fresh" index feel
