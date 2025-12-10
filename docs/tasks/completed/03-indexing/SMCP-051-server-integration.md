---
task_id: "SMCP-051"
title: "Server Integration"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
completed_date: "2025-12-10"
due_date: ""
estimated_hours: 2
actual_hours: 1.5
assigned_to: "blakazulu"
tags: ["server", "indexing", "integration"]
---

# Task: Server Integration

## Overview

Wire the StrategyOrchestrator into the MCP server. Initialize orchestrator on startup, make it accessible to tools, and ensure proper cleanup on shutdown.

## Goals

- [x] Create orchestrator instance in server
- [x] Start configured strategy on server startup
- [x] Make orchestrator accessible to tools
- [x] Ensure cleanup on server shutdown

## Success Criteria

- [x] Orchestrator created with all dependencies
- [x] Strategy starts based on config.indexingStrategy
- [x] Tools can access orchestrator via context.orchestrator
- [x] Strategy stops cleanly on server shutdown
- [x] No orphaned file watchers

## Dependencies

**Blocked by:**

- SMCP-049: Strategy Orchestrator
- SMCP-050: Tool Integrations

**Blocks:**

- None (final task)

**Related:**

- SMCP-034: MCP Server (existing server implementation)
- SMCP-038: Resource Cleanup

## Subtasks

### Phase 1: Orchestrator Access Pattern (0.5 hours)

- [x] 1.1 Create orchestrator in ServerContext:
    - Added `orchestrator: StrategyOrchestrator | null` to ServerContext
    - Added `config: Config | null` to cache loaded configuration
    - Created helper functions: `getOrchestrator()`, `setOrchestrator()`, `getConfig()`, `setConfig()`

- [x] 1.2 Export from server module for tools to access via context

### Phase 2: Server Initialization (1 hour)

- [x] 2.1 Create `initializeOrchestrator()` function that:
    - Creates IndexManager and DocsIndexManager (if indexDocs enabled)
    - Creates FingerprintsManager and DocsFingerprintsManager (if indexDocs enabled)
    - Creates and initializes IndexingPolicy
    - Creates IntegrityEngine
    - Creates StrategyOrchestrator with all dependencies
    - Starts strategy based on config

- [x] 2.2 Create `maybeInitializeOrchestrator()` for startup:
    - Checks if index exists by loading metadata
    - Only initializes orchestrator if index already exists
    - Gracefully handles errors (continues without orchestrator)

- [x] 2.3 Create `initializeOrchestratorWithoutStarting()` for create_index:
    - Creates orchestrator but doesn't start a strategy
    - Allows create_index to start the strategy after indexing completes

- [x] 2.4 Updated `startServer()` to:
    - Detect project path early
    - Call `maybeInitializeOrchestrator()` to set up existing indexes

### Phase 3: Cleanup Integration (0.5 hours)

- [x] 3.1 Verified orchestrator registers cleanup handler in StrategyOrchestrator

- [x] 3.2 Verified shutdown sequence:
    - Strategy flush() called via cleanup handler
    - Strategy stop() called
    - Watcher closed
    - No orphaned resources

- [x] 3.3 Handle case where index doesn't exist yet:
    - `maybeInitializeOrchestrator()` returns early if no metadata
    - `create_index` creates orchestrator when needed
    - Tools receive `undefined` orchestrator in context when no index exists

## Implementation Details

### Server Context Updates (src/server.ts)

```typescript
interface ServerContext {
  cwd: string;
  projectPath: string | null;
  orchestrator: StrategyOrchestrator | null;  // NEW
  config: Config | null;  // NEW
}
```

### Tool Context Updates

All tools now receive orchestrator in their context:

```typescript
case 'search_code': {
  const context: ToolContext = {
    projectPath,
    orchestrator: serverContext.orchestrator || undefined,  // NEW
  };
  // ...
}
```

### Initialization Flow

1. **Server startup:**
   - Detect project path
   - Check if index exists (load metadata)
   - If index exists: initialize orchestrator with strategy

2. **create_index call:**
   - Create orchestrator without starting strategy
   - Run indexing
   - Start strategy after indexing completes
   - Store orchestrator in server context

3. **delete_index call:**
   - Clear orchestrator from server context
   - Cleanup handled by orchestrator's cleanup handler

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 9)
- Server: `src/server.ts`
- Cleanup: `src/utils/cleanup.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested - All 1748 tests pass
- [x] Documentation updated
- [ ] Changes committed to Git (awaiting user approval)
- [x] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- Task created
- Subtasks defined

### 2025-12-10 - 1.5 hours

- Implemented orchestrator access pattern in ServerContext
- Created initialization functions for startup and create_index scenarios
- Updated all tool handlers to pass orchestrator in context
- Handled edge case where no index exists yet
- Built and tested - all 1748 tests pass

## Notes

- Orchestrator is stored in ServerContext, not as module-level variable
- Lazy initialization: orchestrator only created when index exists
- Strategy is started AFTER create_index completes, not on server start
- delete_index clears orchestrator from context
- Tools receive orchestrator as optional property in their context
