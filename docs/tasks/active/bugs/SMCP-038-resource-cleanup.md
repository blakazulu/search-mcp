---
task_id: "SMCP-038"
title: "Resource Cleanup & Signal Handling"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2024-12-09"
due_date: ""
estimated_hours: 5
actual_hours: 0
assigned_to: "Team"
tags: ["high", "resource-management", "signal-handling", "cleanup", "graceful-shutdown"]
---

# Task: Resource Cleanup & Signal Handling

## Overview

Implement proper resource cleanup on shutdown and add signal handlers (SIGTERM, SIGINT) for graceful termination. Currently, the server exits without cleaning up FileWatcher, LanceDB connections, or IntegrityEngine timers.

## Bugs Addressed

- **Bug #12**: No Resource Cleanup on Shutdown (`server.ts:367-382`)
- **Bug #13**: File Handle Leaks in Chunking (`chunking.ts:477-498`)
- **MCP-25**: No Signal Handlers (SIGTERM/SIGINT)
- **MCP-23**: Watcher Doesn't Recover From Errors

## Goals

- [ ] Create cleanup registry for resource management
- [ ] Add SIGTERM/SIGINT handlers
- [ ] Ensure all resources are properly cleaned up on shutdown
- [ ] Add watcher error recovery mechanism

## Success Criteria

- Clean shutdown on SIGTERM/SIGINT
- No zombie processes or orphaned file handles
- FileWatcher, LanceDB, IntegrityEngine all properly closed
- Build and all tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- SMCP-036: Concurrency & Mutex
- SMCP-037: Atomic File Writes

## Subtasks

### Phase 1: Create Cleanup Registry (1 hour)

- [ ] 1.1 Create `src/utils/cleanup.ts`
    ```typescript
    import { getLogger } from './logger.js';

    type CleanupHandler = () => Promise<void>;

    const cleanupHandlers: CleanupHandler[] = [];
    let isShuttingDown = false;

    /**
     * Register a cleanup handler to be called on shutdown.
     * Handlers are called in reverse order (LIFO).
     */
    export function registerCleanup(handler: CleanupHandler): void {
      cleanupHandlers.push(handler);
    }

    /**
     * Unregister a cleanup handler.
     */
    export function unregisterCleanup(handler: CleanupHandler): void {
      const index = cleanupHandlers.indexOf(handler);
      if (index !== -1) {
        cleanupHandlers.splice(index, 1);
      }
    }

    /**
     * Run all cleanup handlers in reverse order.
     */
    export async function runCleanup(): Promise<void> {
      if (isShuttingDown) return;
      isShuttingDown = true;

      const logger = getLogger();
      logger.info('cleanup', 'Running cleanup handlers...');

      // Run in reverse order (LIFO)
      for (const handler of cleanupHandlers.reverse()) {
        try {
          await handler();
        } catch (error) {
          logger.error('cleanup', 'Cleanup handler failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      cleanupHandlers.length = 0;
      logger.info('cleanup', 'Cleanup complete');
    }

    /**
     * Check if shutdown is in progress.
     */
    export function isShutdownInProgress(): boolean {
      return isShuttingDown;
    }
    ```

- [ ] 1.2 Add unit tests for cleanup registry

### Phase 2: Add Signal Handlers (1.5 hours)

- [ ] 2.1 Update `src/server.ts` shutdown function
    ```typescript
    import { registerCleanup, runCleanup } from './utils/cleanup.js';

    async function shutdown(signal?: string): Promise<void> {
      const logger = getLogger();
      logger.info('server', `Shutting down...${signal ? ` (${signal})` : ''}`);

      // Run all registered cleanup handlers
      await runCleanup();

      if (serverInstance) {
        try {
          await serverInstance.close();
        } catch (error) {
          logger.error('server', 'Error closing server', { error });
        }
        serverInstance = null;
      }

      process.exit(0);
    }

    // Register signal handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.error('server', 'Uncaught exception', { error });
      shutdown('uncaughtException');
    });
    ```

### Phase 3: Register Resource Cleanup (1.5 hours)

- [ ] 3.1 Update `FileWatcher` to register cleanup
    ```typescript
    // In FileWatcher constructor or start()
    registerCleanup(async () => {
      await this.stop();
    });
    ```

- [ ] 3.2 Update `LanceDBStore` to register cleanup
    ```typescript
    // In LanceDBStore.open()
    registerCleanup(async () => {
      await this.close();
    });
    ```

- [ ] 3.3 Update `IntegrityEngine` to register cleanup
    ```typescript
    // In IntegrityScheduler.start()
    registerCleanup(async () => {
      this.stop();
    });
    ```

- [ ] 3.4 Update `EmbeddingEngine` to register cleanup (if needed)

### Phase 4: Watcher Error Recovery (1 hour)

- [ ] 4.1 Add watcher restart logic on error
    ```typescript
    private onError(error: Error): void {
      const logger = getLogger();
      logger.error('FileWatcher', 'Watcher error', { error: error.message });
      this.stats.errors++;

      // Attempt restart after delay
      if (this.stats.errors < MAX_RESTART_ATTEMPTS) {
        setTimeout(() => {
          logger.info('FileWatcher', 'Attempting to restart watcher...');
          this.restart();
        }, RESTART_DELAY_MS);
      } else {
        logger.error('FileWatcher', 'Max restart attempts reached');
      }
    }
    ```

- [ ] 4.2 Implement `restart()` method in FileWatcher

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Node.js Process Signals](https://nodejs.org/api/process.html#signal-events)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `src/utils/cleanup.ts` created with tests
- [ ] `src/server.ts` has signal handlers
- [ ] FileWatcher registers cleanup
- [ ] LanceDBStore registers cleanup
- [ ] IntegrityEngine registers cleanup
- [ ] Watcher has error recovery logic
- [ ] Clean shutdown verified with `kill -SIGTERM <pid>`
- [ ] `npm run build` passes
- [ ] `npm run test` passes

## Progress Log

### 2024-12-09 - 0 hours

- Task created from bug hunt findings

## Notes

- Be careful with async operations in signal handlers
- Consider timeout for cleanup operations (don't hang forever)
- Windows doesn't support SIGTERM the same way - test on Windows
- Cleanup handlers should be idempotent (safe to call multiple times)

## Blockers

_None currently identified_
