---
task_id: "SMCP-050"
title: "Tool Integrations"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 3
actual_hours: 2
assigned_to: "blakazulu"
tags: ["tools", "indexing", "integration"]
---

# Task: Tool Integrations

## Overview

Update MCP tools to integrate with the strategy orchestrator. Search tools need to flush before returning results, status tool reports strategy info, and index management tools manage strategy lifecycle.

## Goals

- [x] Search tools flush lazy strategy before search
- [x] Status tool reports current strategy and pending files
- [x] Create index starts the configured strategy
- [x] Delete index stops strategy and cleans up

## Success Criteria

- [x] search_code flushes pending files before search (lazy mode)
- [x] search_docs flushes pending files before search (lazy mode)
- [x] get_index_status shows indexingStrategy and pendingFiles
- [x] create_index starts strategy after indexing completes
- [x] delete_index stops strategy and removes dirty-files.json

## Dependencies

**Blocked by:**

- SMCP-049: Strategy Orchestrator

**Blocks:**

- SMCP-051: Server Integration

**Related:**

- SMCP-017: Search Code Tool
- SMCP-029: Search Docs Tool
- SMCP-019: Get Index Status Tool
- SMCP-020: Create Index Tool
- SMCP-023: Delete Index Tool

## Subtasks

### Phase 1: Search Tools (1 hour)

- [x] 1.1 Modify `src/tools/searchCode.ts`:
    - Added `StrategyOrchestrator` type import
    - Extended `ToolContext` interface with optional `orchestrator` property
    - Added flush logic before search when using lazy strategy

- [x] 1.2 Modify `src/tools/searchDocs.ts`:
    - Same changes as searchCode.ts
    - Extended `DocsToolContext` with optional `orchestrator` property

### Phase 2: Status Tool (0.5 hours)

- [x] 2.1 Modify `src/tools/getIndexStatus.ts`:
    - Added `StrategyOrchestrator` and `StrategyName` type imports
    - Added `indexingStrategy` and `pendingFiles` to output interface
    - Added logic to get strategy stats from orchestrator in `collectStatus()`

- [x] 2.2 Update result type to include new fields

### Phase 3: Index Management Tools (1.5 hours)

- [x] 3.1 Modify `src/tools/createIndex.ts`:
    - Added `StrategyOrchestrator` and `Config` type imports
    - Extended `CreateIndexContext` with optional `orchestrator` and `config` properties
    - Added step to start strategy after indexing completes

- [x] 3.2 Modify `src/tools/deleteIndex.ts`:
    - Added `StrategyOrchestrator` type import
    - Extended `DeleteIndexContext` with optional `orchestrator` property
    - Added step to stop orchestrator before deletion
    - Added `dirty-files.json`, `docs.lancedb`, and `docs-fingerprints.json` to items to delete

- [x] 3.3 Import getDirtyFilesPath in deleteIndex

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 8)
- Tools: `src/tools/`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable)
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [x] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- Task created
- Subtasks defined

### 2025-12-10 - 2 hours

- Implemented all tool integrations
- Modified searchCode.ts with flush logic before search
- Modified searchDocs.ts with flush logic before search
- Modified getIndexStatus.ts to report strategy info (indexingStrategy, pendingFiles)
- Modified createIndex.ts to start strategy after indexing
- Modified deleteIndex.ts to stop strategy and cleanup dirty-files.json
- Updated safeDeleteIndex to also delete docs.lancedb, docs-fingerprints.json, dirty-files.json
- All 1748 tests passing, no regressions
- Build successful

## Notes

- Orchestrator is passed via optional properties in tool contexts (backward compatible)
- Only flush for lazy strategy (realtime doesn't need it, git uses integrity)
- Tool contexts extended with optional orchestrator property to avoid breaking changes
- Server integration (SMCP-051) will wire up the orchestrator to the actual tool calls
