---
task_id: "SMCP-049"
title: "Strategy Orchestrator"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 3
actual_hours: 2
assigned_to: "blakazulu"
tags: ["orchestrator", "indexing", "lifecycle"]
---

# Task: Strategy Orchestrator

## Overview

Create a StrategyOrchestrator class that manages the lifecycle of indexing strategies. Handles strategy creation, switching, and provides a unified interface for the server and tools.

## Goals

- [x] Create StrategyOrchestrator class
- [x] Implement strategy factory method
- [x] Support runtime strategy switching
- [x] Register cleanup handlers

## Success Criteria

- [x] Orchestrator can create any strategy by name
- [x] Strategy switching flushes pending before stopping old strategy
- [x] No data loss when switching strategies
- [x] Proper cleanup registration
- [x] Provides flush() for tools to call before search

## Dependencies

**Blocked by:**

- SMCP-043: Config Schema (COMPLETED)
- SMCP-046: Realtime Strategy (COMPLETED)
- SMCP-047: Lazy Strategy (COMPLETED)
- SMCP-048: Git Strategy (COMPLETED)

**Blocks:**

- SMCP-050: Tool Integrations
- SMCP-051: Server Integration

**Related:**

- SMCP-038: Resource Cleanup (cleanup pattern)

## Subtasks

### Phase 1: Create Orchestrator Class (1.5 hours)

- [x] 1.1 Create `src/engines/strategyOrchestrator.ts`:
    - Import all strategy classes
    - Import Config type
    - Import cleanup utilities

- [x] 1.2 Implement constructor with dependencies:
    - projectPath
    - indexPath
    - indexManager
    - docsIndexManager (nullable)
    - integrityEngine
    - policy
    - fingerprints
    - docsFingerprints (nullable)

- [x] 1.3 Implement state:
    - currentStrategy: IndexingStrategy | null
    - cleanupHandler: CleanupHandler | null

### Phase 2: Strategy Factory (1 hour)

- [x] 2.1 Implement `createStrategy(name, config)`:
    ```typescript
    switch (name) {
      case 'realtime': return new RealtimeStrategy(...);
      case 'lazy': return new LazyStrategy(...);
      case 'git': return new GitStrategy(...);
      default: throw new Error(`Unknown strategy: ${name}`);
    }
    ```

- [x] 2.2 Implement `setStrategy(config)`:
    - Check if same strategy already running
    - Flush current strategy
    - Stop current strategy
    - Create new strategy
    - Initialize and start
    - Register cleanup handler

### Phase 3: Public Interface (0.5 hours)

- [x] 3.1 Implement `getCurrentStrategy()`:
    - Return current strategy or null

- [x] 3.2 Implement `flush()`:
    - Delegate to current strategy's flush()

- [x] 3.3 Implement `stop()`:
    - Flush and stop current strategy
    - Unregister cleanup handler

- [x] 3.4 Implement `getStats()`:
    - Delegate to current strategy's getStats()

- [x] 3.5 Export from `src/engines/index.ts`

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 7)
- Cleanup pattern: `src/utils/cleanup.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable)
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git (pending user approval)
- [x] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- Task created
- Subtasks defined

### 2025-12-10 - 2 hours

- Created `src/engines/strategyOrchestrator.ts` with full implementation
- Implemented StrategyOrchestrator class with:
  - Constructor accepting StrategyOrchestratorDependencies
  - createStrategy() private factory method
  - setStrategy(config) for starting/switching strategies
  - getCurrentStrategy() accessor
  - flush() delegation method
  - stop() for graceful shutdown
  - getStats() delegation method
  - isActive() status check
  - Cleanup handler registration/unregistration
- Implemented factory function createStrategyOrchestrator()
- Exported from `src/engines/index.ts`
- Created comprehensive test suite (43 tests) in `tests/unit/engines/strategyOrchestrator.test.ts`
- All 626 project tests pass with no regressions
- Build successful with no TypeScript errors

## Implementation Summary

### New Files

| File | Purpose |
|------|---------|
| `src/engines/strategyOrchestrator.ts` | Strategy lifecycle management |
| `tests/unit/engines/strategyOrchestrator.test.ts` | Unit tests (43 tests) |

### Modified Files

| File | Changes |
|------|---------|
| `src/engines/index.ts` | Added exports for StrategyOrchestrator |

### Key Features

1. **Strategy Creation**: Factory method creates appropriate strategy based on config
2. **Idempotent setStrategy()**: Calling with same active strategy is a no-op
3. **Safe Switching**: Always flushes old strategy before stopping
4. **Cleanup Registration**: Ensures graceful shutdown on server exit
5. **Null-safe Operations**: flush(), stop(), getStats() all safe when no strategy active

## Notes

- Always flush before switching to prevent data loss
- DirtyFilesManager is created fresh for lazy strategy (not shared)
- Cleanup handler ensures strategy stops on server shutdown
- setStrategy() is idempotent - calling with same strategy is no-op
