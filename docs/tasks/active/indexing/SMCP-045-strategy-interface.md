---
task_id: "SMCP-045"
title: "Strategy Interface"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 1
actual_hours: 0
assigned_to: "blakazulu"
tags: ["interface", "indexing", "architecture"]
---

# Task: Strategy Interface

## Overview

Define the base interface that all indexing strategies must implement. This provides a consistent contract for the orchestrator to manage different strategies.

## Goals

- [ ] Define IndexingStrategy interface
- [ ] Define FileEvent type
- [ ] Define StrategyStats type
- [ ] Export from engines module

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

- [ ] 1.1 Create `src/engines/indexingStrategy.ts` with:

    ```typescript
    export interface FileEvent {
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
      onFileEvent(event: FileEvent): Promise<void>;
      flush(): Promise<void>;
      getStats(): StrategyStats;
    }
    ```

- [ ] 1.2 Add JSDoc comments for each method

- [ ] 1.3 Export from `src/engines/index.ts`

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 3)
- Existing watcher: `src/engines/fileWatcher.ts`

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

- Interface methods:
  - `initialize()` - Load dependencies (fingerprints, policy, etc.)
  - `start()` - Begin watching/monitoring
  - `stop()` - Cleanup and save state
  - `isActive()` - Check if running
  - `onFileEvent()` - Handle file change (may queue or process)
  - `flush()` - Force processing of pending changes
  - `getStats()` - Return statistics for status reporting
