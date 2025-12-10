---
task_id: "SMCP-049"
title: "Strategy Orchestrator"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "blakazulu"
tags: ["orchestrator", "indexing", "lifecycle"]
---

# Task: Strategy Orchestrator

## Overview

Create a StrategyOrchestrator class that manages the lifecycle of indexing strategies. Handles strategy creation, switching, and provides a unified interface for the server and tools.

## Goals

- [ ] Create StrategyOrchestrator class
- [ ] Implement strategy factory method
- [ ] Support runtime strategy switching
- [ ] Register cleanup handlers

## Success Criteria

- ✅ Orchestrator can create any strategy by name
- ✅ Strategy switching flushes pending before stopping old strategy
- ✅ No data loss when switching strategies
- ✅ Proper cleanup registration
- ✅ Provides flush() for tools to call before search

## Dependencies

**Blocked by:**

- SMCP-043: Config Schema
- SMCP-046: Realtime Strategy
- SMCP-047: Lazy Strategy
- SMCP-048: Git Strategy

**Blocks:**

- SMCP-050: Tool Integrations
- SMCP-051: Server Integration

**Related:**

- SMCP-038: Resource Cleanup (cleanup pattern)

## Subtasks

### Phase 1: Create Orchestrator Class (1.5 hours)

- [ ] 1.1 Create `src/engines/strategyOrchestrator.ts`:
    - Import all strategy classes
    - Import Config type
    - Import cleanup utilities

- [ ] 1.2 Implement constructor with dependencies:
    - projectPath
    - indexPath
    - indexManager
    - docsIndexManager (nullable)
    - integrityEngine
    - policy
    - fingerprints
    - docsFingerprints (nullable)

- [ ] 1.3 Implement state:
    - currentStrategy: IndexingStrategy | null
    - cleanupHandler: CleanupHandler | null

### Phase 2: Strategy Factory (1 hour)

- [ ] 2.1 Implement `createStrategy(name, config)`:
    ```typescript
    switch (name) {
      case 'realtime': return new RealtimeStrategy(...);
      case 'lazy': return new LazyStrategy(...);
      case 'git': return new GitStrategy(...);
      default: throw new Error(`Unknown strategy: ${name}`);
    }
    ```

- [ ] 2.2 Implement `setStrategy(config)`:
    - Check if same strategy already running
    - Flush current strategy
    - Stop current strategy
    - Create new strategy
    - Initialize and start
    - Register cleanup handler

### Phase 3: Public Interface (0.5 hours)

- [ ] 3.1 Implement `getCurrentStrategy()`:
    - Return current strategy or null

- [ ] 3.2 Implement `flush()`:
    - Delegate to current strategy's flush()

- [ ] 3.3 Implement `stop()`:
    - Flush and stop current strategy
    - Unregister cleanup handler

- [ ] 3.4 Implement `getStats()`:
    - Delegate to current strategy's getStats()

- [ ] 3.5 Export from `src/engines/index.ts`

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 7)
- Cleanup pattern: `src/utils/cleanup.ts`

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

- Always flush before switching to prevent data loss
- DirtyFilesManager is created fresh for lazy strategy (not shared)
- Cleanup handler ensures strategy stops on server shutdown
- setStrategy() is idempotent - calling with same strategy is no-op
