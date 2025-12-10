---
task_id: "SMCP-051"
title: "Server Integration"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["server", "indexing", "integration"]
---

# Task: Server Integration

## Overview

Wire the StrategyOrchestrator into the MCP server. Initialize orchestrator on startup, make it accessible to tools, and ensure proper cleanup on shutdown.

## Goals

- [ ] Create orchestrator instance in server
- [ ] Start configured strategy on server startup
- [ ] Make orchestrator accessible to tools
- [ ] Ensure cleanup on server shutdown

## Success Criteria

- ✅ Orchestrator created with all dependencies
- ✅ Strategy starts based on config.indexingStrategy
- ✅ Tools can access orchestrator via getOrchestrator()
- ✅ Strategy stops cleanly on server shutdown
- ✅ No orphaned file watchers

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

- [ ] 1.1 Create module-level orchestrator access:
    ```typescript
    // In src/server.ts or new src/context.ts
    let orchestrator: StrategyOrchestrator | null = null;

    export function getOrchestrator(): StrategyOrchestrator | null {
      return orchestrator;
    }

    export function setOrchestrator(o: StrategyOrchestrator): void {
      orchestrator = o;
    }
    ```

- [ ] 1.2 Export from appropriate module for tools to import

### Phase 2: Server Initialization (1 hour)

- [ ] 2.1 Create orchestrator after index manager:
    ```typescript
    const orchestrator = new StrategyOrchestrator(
      projectPath,
      indexPath,
      indexManager,
      docsIndexManager,
      integrityEngine,
      policy,
      fingerprints,
      docsFingerprints,
    );
    setOrchestrator(orchestrator);
    ```

- [ ] 2.2 Start strategy based on config:
    ```typescript
    const config = await configManager.load();
    await orchestrator.setStrategy(config);
    ```

- [ ] 2.3 Determine correct initialization order:
    - ConfigManager loaded
    - IndexManager created
    - DocsIndexManager created (if indexDocs)
    - IntegrityEngine created
    - Orchestrator created
    - Strategy started

### Phase 3: Cleanup Integration (0.5 hours)

- [ ] 3.1 Verify orchestrator registers its cleanup handler

- [ ] 3.2 Test shutdown sequence:
    - Strategy flush() called
    - Strategy stop() called
    - Watcher closed
    - No orphaned resources

- [ ] 3.3 Handle case where index doesn't exist yet (no strategy to start)

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 9)
- Server: `src/server.ts`
- Cleanup: `src/utils/cleanup.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined

## Notes

- May need to disable existing FileWatcher if it's still being created
- Consider lazy initialization (only start strategy when index exists)
- getOrchestrator() returns null if no index exists yet
- Strategy is started AFTER create_index completes, not on server start
- On server start, check if index exists before starting strategy
