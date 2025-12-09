---
task_id: "SMCP-038"
title: "Resource Cleanup & Signal Handling"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2024-12-09"
completed_date: "2024-12-09"
due_date: ""
estimated_hours: 5
actual_hours: 3
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

- [x] Create cleanup registry for resource management
- [x] Add SIGTERM/SIGINT handlers
- [x] Ensure all resources are properly cleaned up on shutdown
- [x] Add watcher error recovery mechanism

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

### Phase 1: Create Cleanup Registry (1 hour) ✅

- [x] 1.1 Create `src/utils/cleanup.ts` with:
    - `registerCleanup(handler, name)` - Register a cleanup handler with optional name for logging
    - `unregisterCleanup(handler)` - Unregister when resource is explicitly closed
    - `runCleanup(timeoutMs)` - Run all handlers in LIFO order with timeout protection
    - `isShutdownInProgress()` - Check if shutdown is in progress
    - `isCleanupCompleted()` - Check if cleanup has completed
    - `getCleanupHandlerCount()` and `resetCleanupRegistry()` for testing

- [x] 1.2 Add unit tests for cleanup registry (`tests/unit/utils/cleanup.test.ts`)

### Phase 2: Add Signal Handlers (1.5 hours) ✅

- [x] 2.1 Update `src/server.ts` shutdown function
    - Updated `shutdown()` to call `runCleanup()` before closing MCP server
    - Added `SIGTERM` handler with graceful shutdown
    - Added `SIGINT` handler with graceful shutdown
    - Updated `uncaughtException` handler to attempt graceful shutdown
    - Added shutdown-in-progress check to prevent duplicate attempts

### Phase 3: Register Resource Cleanup (1.5 hours) ✅

- [x] 3.1 Update `FileWatcher` to register cleanup
    - Registers in `start()`, unregisters in `stop()`

- [x] 3.2 Update `LanceDBStore` to register cleanup
    - Registers in `open()`, unregisters in `close()`

- [x] 3.3 Update `DocsLanceDBStore` to register cleanup
    - Registers in `open()`, unregisters in `close()`

- [x] 3.4 Update `IntegrityScheduler` to register cleanup
    - Registers in `start()`, unregisters in `stop()`

### Phase 4: Watcher Error Recovery (1 hour) ✅

- [x] 4.1 Add watcher restart logic on error
    - Added `MAX_RESTART_ATTEMPTS = 3` constant
    - Added `RESTART_DELAY_MS = 5000` constant
    - Updated `onError()` to schedule automatic restart with retry limit
    - Respects shutdown state (won't restart during shutdown)

- [x] 4.2 Implement `restart()` method in FileWatcher
    - Added `getRestartAttempts()` and `resetRestartAttempts()` methods

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Node.js Process Signals](https://nodejs.org/api/process.html#signal-events)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] `src/utils/cleanup.ts` created with tests
- [x] `src/server.ts` has signal handlers
- [x] FileWatcher registers cleanup
- [x] LanceDBStore registers cleanup
- [x] IntegrityEngine registers cleanup
- [x] Watcher has error recovery logic
- [x] `npm run build` passes
- [x] `npm run test` passes (1452 tests, no regressions)

## Progress Log

### 2024-12-09 - Task Created
- Task created from bug hunt findings

### 2024-12-09 - Task Completed (3 hours)
- Created `src/utils/cleanup.ts` with cleanup registry:
  - `registerCleanup(handler, name)` - Register with optional name for logging
  - `unregisterCleanup(handler)` - Unregister when resource explicitly closed
  - `runCleanup(timeoutMs)` - Run all handlers in LIFO order with timeout
  - `isShutdownInProgress()`, `isCleanupCompleted()` - State checks
- Updated `src/server.ts` with signal handlers:
  - SIGTERM and SIGINT handlers for graceful shutdown
  - Updated `shutdown()` to call `runCleanup()`
- Updated resource classes to register/unregister cleanup:
  - `FileWatcher` - registers in `start()`, unregisters in `stop()`
  - `LanceDBStore` - registers in `open()`, unregisters in `close()`
  - `DocsLanceDBStore` - registers in `open()`, unregisters in `close()`
  - `IntegrityScheduler` - registers in `start()`, unregisters in `stop()`
- Added FileWatcher error recovery:
  - `restart()` method with max 3 retry attempts
  - 5 second delay between restart attempts
  - Respects shutdown state
- Created unit tests in `tests/unit/utils/cleanup.test.ts`
- All 1452 tests pass (new tests added, no regressions)

## Implementation Details

### Files Created
- `src/utils/cleanup.ts` - Cleanup registry
- `tests/unit/utils/cleanup.test.ts` - Unit tests

### Files Modified
- `src/utils/index.ts` - Added exports for cleanup functions
- `src/server.ts` - Added signal handlers and updated shutdown
- `src/engines/fileWatcher.ts` - Cleanup registration and error recovery
- `src/storage/lancedb.ts` - Cleanup registration
- `src/storage/docsLancedb.ts` - Cleanup registration
- `src/engines/integrity.ts` - Cleanup registration

### Key Features
- LIFO cleanup order (last registered = first cleaned up)
- Timeout protection for cleanup handlers
- Idempotent cleanup (safe to call multiple times)
- Resources unregister themselves when explicitly closed
- FileWatcher auto-restart on error with retry limit

## Notes

- Cleanup handlers have timeout protection to prevent hanging
- Windows signal handling works via process events
- Cleanup handlers are idempotent (safe to call multiple times)

## Blockers

_None - task completed_
