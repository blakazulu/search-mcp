---
task_id: "SMCP-036"
title: "Async Mutex & Concurrency Control"
category: "Technical"
priority: "P0"
status: "not-started"
created_date: "2024-12-09"
due_date: ""
estimated_hours: 6
actual_hours: 0
assigned_to: "Team"
tags: ["critical", "concurrency", "race-condition", "mutex", "lancedb"]
---

# Task: Async Mutex & Concurrency Control

## Overview

Fix race conditions and concurrent access issues across the codebase. Multiple components can trigger simultaneous database operations without proper synchronization, leading to potential data corruption.

## Bugs Addressed

- **Bug #2**: Race Condition in FileWatcher Debouncing (`fileWatcher.ts:418-446`)
- **Bug #3**: Concurrent LanceDB Access Without Locking (`lancedb.ts:204-219`)
- **Bug #4**: Unhandled Promise Rejection in Debounce setTimeout (`fileWatcher.ts:429-443`)
- **Bug #15**: Race Condition Between Search and Indexing
- **MCP-10**: No Protection Against Concurrent Indexing

## Goals

- [ ] Create reusable async mutex utility
- [ ] Protect LanceDB operations with mutex
- [ ] Fix FileWatcher debouncing race condition
- [ ] Add proper error handling in async callbacks

## Success Criteria

- Concurrent operations are properly serialized
- No data corruption under concurrent load
- Unhandled promise rejections are caught and logged
- Build and all tests pass

## Dependencies

**Blocked by:**
- SMCP-035: SQL Injection Prevention (both modify lancedb.ts - coordinate changes)

**Blocks:** None

**Related:**
- SMCP-038: Resource Cleanup & Signal Handling

## Subtasks

### Phase 1: Create Async Mutex Utility (1 hour)

- [ ] 1.1 Create `src/utils/asyncMutex.ts`
    ```typescript
    export class AsyncMutex {
      private locked = false;
      private queue: Array<() => void> = [];

      async acquire(): Promise<void> {
        if (!this.locked) {
          this.locked = true;
          return;
        }
        return new Promise((resolve) => this.queue.push(resolve));
      }

      release(): void {
        const next = this.queue.shift();
        if (next) {
          next();
        } else {
          this.locked = false;
        }
      }

      async withLock<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
          return await fn();
        } finally {
          this.release();
        }
      }

      get isLocked(): boolean {
        return this.locked;
      }
    }
    ```

- [ ] 1.2 Add unit tests for AsyncMutex
    - Test sequential acquisition
    - Test concurrent acquisition (queuing)
    - Test error handling within lock
    - Test release after error

### Phase 2: Protect LanceDB Operations (2 hours)

- [ ] 2.1 Add mutex to `LanceDBStore` class (`src/storage/lancedb.ts`)
    ```typescript
    private readonly mutex = new AsyncMutex();
    ```

- [ ] 2.2 Wrap `insertChunks()` with mutex
- [ ] 2.3 Wrap `deleteByPath()` with mutex
- [ ] 2.4 Wrap `search()` with mutex (or use read-write lock pattern)
- [ ] 2.5 Wrap `getIndexedFiles()` with mutex

- [ ] 2.6 Apply same changes to `src/storage/docsLancedb.ts`

### Phase 3: Fix FileWatcher Debouncing (2 hours)

- [ ] 3.1 Fix race condition in `processingQueue` check (`fileWatcher.ts:418-446`)
    - Make check-and-add atomic using mutex

- [ ] 3.2 Fix unhandled promise rejection in setTimeout (`fileWatcher.ts:429-443`)
    ```typescript
    const timeout = setTimeout(() => {
      this.pendingEvents.delete(relativePath);

      if (this.processingQueue.has(relativePath)) {
        return;
      }
      this.processingQueue.add(relativePath);

      // Wrap in IIFE with error handling
      (async () => {
        try {
          await handler();
        } catch (error) {
          const logger = getLogger();
          this.stats.errors++;
          logger.error('FileWatcher', 'Error in debounced handler', {
            relativePath,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.processingQueue.delete(relativePath);
        }
      })();
    }, this.debounceDelay);
    ```

### Phase 4: Add Indexing Lock (1 hour)

- [ ] 4.1 Add global indexing lock to prevent concurrent `create_index` calls
- [ ] 4.2 Check lock state before starting indexing operation
- [ ] 4.3 Clear lock on completion or error

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Node.js Async Mutex patterns](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `src/utils/asyncMutex.ts` created with tests
- [ ] `src/storage/lancedb.ts` uses mutex for all write operations
- [ ] `src/storage/docsLancedb.ts` uses mutex for all write operations
- [ ] `src/engines/fileWatcher.ts` debouncing fixed
- [ ] Concurrent indexing prevented
- [ ] `npm run build` passes
- [ ] `npm run test` passes

## Progress Log

### 2024-12-09 - 0 hours

- Task created from bug hunt findings

## Notes

- Consider using read-write lock pattern if search performance is impacted
- The mutex should be per-store instance, not global
- File watcher mutex should be separate from LanceDB mutex
- Consider adding timeout to mutex acquisition to prevent deadlocks

## Blockers

_None currently identified_
