---
task_id: "SMCP-045"
title: "Strategy Interface"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 1
actual_hours: 0.5
assigned_to: "blakazulu"
tags: ["interface", "indexing", "architecture"]
---

# Task: Strategy Interface

## Overview

Define the base interface that all indexing strategies must implement. This provides a consistent contract for the orchestrator to manage different strategies.

## Goals

- [x] Define IndexingStrategy interface
- [x] Define FileEvent type (as StrategyFileEvent to avoid collision with existing FileEvent)
- [x] Define StrategyStats type
- [x] Export from engines module

## Success Criteria

- ✅ Interface defines all required methods for strategy lifecycle
- ✅ FileEvent type captures add/change/unlink events
- ✅ StrategyStats provides status reporting data
- ✅ All three strategies (realtime, lazy, git) can implement interface

## Dependencies

**Blocked by:**

- SMCP-043: Config Schema (needs strategy name type)

**Blocks:**

- SMCP-046: Realtime Strategy
- SMCP-047: Lazy Strategy
- SMCP-048: Git Strategy
- SMCP-049: Strategy Orchestrator

**Related:**

- SMCP-015: File Watcher (existing implementation to extract from)

## Subtasks

### Phase 1: Interface Definition (1 hour)

- [x] 1.1 Create `src/engines/indexingStrategy.ts` with:

    ```typescript
    export interface StrategyFileEvent {
      type: 'add' | 'change' | 'unlink';
      relativePath: string;
      absolutePath: string;
    }

    export interface StrategyStats {
      name: string;
      isActive: boolean;
      pendingFiles: number;
      processedFiles: number;
      lastActivity: Date | null;
    }

    export interface IndexingStrategy {
      readonly name: 'realtime' | 'lazy' | 'git';
      initialize(): Promise<void>;
      start(): Promise<void>;
      stop(): Promise<void>;
      isActive(): boolean;
      onFileEvent(event: StrategyFileEvent): Promise<void>;
      flush(): Promise<void>;
      getStats(): StrategyStats;
    }
    ```

- [x] 1.2 Add JSDoc comments for each method

- [x] 1.3 Export from `src/engines/index.ts`

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 3)
- Existing watcher: `src/engines/fileWatcher.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable) - 1587 tests pass
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git (pending user approval)
- [x] No regressions introduced

## Progress Log

### 2025-12-10 - 0.5 hours

- ⏳ Task created
- 📝 Subtasks defined
- ✅ Created `src/engines/indexingStrategy.ts` with full interface definitions
- ✅ Added comprehensive JSDoc comments for all types and methods
- ✅ Exported from `src/engines/index.ts`
- ✅ Build passes, all 1587 tests pass with no regressions
- ✅ Named FileEvent as `StrategyFileEvent` to avoid collision with existing `FileEvent` in fileWatcher.ts
- ✅ Added helper exports: `STRATEGY_NAMES`, `StrategyName`, `isValidStrategyName()`

## Notes

- Interface methods:
  - `initialize()` - Load dependencies (fingerprints, policy, etc.)
  - `start()` - Begin watching/monitoring
  - `stop()` - Cleanup and save state
  - `isActive()` - Check if running
  - `onFileEvent()` - Handle file change (may queue or process)
  - `flush()` - Force processing of pending changes
  - `getStats()` - Return statistics for status reporting
