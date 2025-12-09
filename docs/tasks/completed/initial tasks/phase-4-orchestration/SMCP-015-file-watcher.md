---
task_id: "SMCP-015"
title: "File Watcher Engine"
category: "Technical"
priority: "P1"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 3
assigned_to: "blakazulu"
tags: ["orchestration", "watcher", "real-time"]
---

# Task: File Watcher Engine

## Overview

Implement real-time filesystem monitoring using chokidar. Watches for file changes and triggers incremental index updates. Includes debouncing to handle rapid saves and policy filtering to ignore unwanted changes.

## Goals

- [x] Monitor filesystem for add/change/delete events
- [x] Debounce rapid changes (500ms)
- [x] Apply indexing policy to filter events
- [x] Trigger incremental index updates

## Success Criteria

- File changes trigger index updates within 1 second
- Rapid saves are debounced (only one update)
- Ignored files (node_modules, etc.) don't trigger events
- Watcher survives file system edge cases

## Dependencies

**Blocked by:**

- SMCP-008: Fingerprints Manager
- SMCP-011: Indexing Policy Engine
- SMCP-014: Index Manager

**Blocks:**

- SMCP-016: Integrity Engine
- SMCP-023: delete_index Tool (must stop watcher)

**Related:**

- SMCP-011: Indexing Policy (filters events)
- SMCP-014: Index Manager (processes updates)

## Subtasks

### Phase 1: Watcher Configuration (0.5 hours)

- [x] 1.1 Define watcher options
    ```typescript
    import chokidar from 'chokidar';

    const WATCHER_OPTIONS: chokidar.WatchOptions = {
      ignored: [/* hardcoded deny patterns */],
      persistent: true,
      ignoreInitial: true,  // Don't trigger on startup scan
      awaitWriteFinish: {
        stabilityThreshold: 500,  // Debounce: 500ms
        pollInterval: 100,
      },
      followSymlinks: false,
    };
    ```

- [x] 1.2 Define event types
    ```typescript
    type WatchEvent = 'add' | 'change' | 'unlink';

    interface FileEvent {
      type: WatchEvent;
      path: string;      // Absolute path
      relativePath: string;
    }
    ```

### Phase 2: Event Processing (1.5 hours)

- [x] 2.1 Implement event handler
    ```typescript
    async function handleFileEvent(
      event: FileEvent,
      policy: IndexingPolicy,
      indexManager: IndexManager,
      fingerprints: FingerprintsManager
    ): Promise<void>
    ```

- [x] 2.2 Handle 'add' and 'change' events
    ```
    1. Check if file matches deny list → Ignore
    2. Check if file passes policy → If not, ignore
    3. Calculate SHA256 hash
    4. Compare with stored fingerprint
    5. If hash differs:
       - Delete old chunks for this file
       - Re-chunk and embed
       - Insert new chunks
       - Update fingerprint
    6. If hash same → Ignore (content unchanged)
    ```

- [x] 2.3 Handle 'unlink' (delete) event
    ```
    1. Delete all chunks for this file from LanceDB
    2. Remove entry from fingerprints.json
    3. Log deletion
    ```

### Phase 3: Debouncing (0.5 hours)

- [x] 3.1 Implement event debouncing
    ```typescript
    // chokidar's awaitWriteFinish handles basic debouncing
    // Add additional debouncing for rapid multi-file saves
    const pendingEvents = new Map<string, NodeJS.Timeout>();

    function debounceEvent(
      relativePath: string,
      handler: () => Promise<void>,
      delay: number = 500
    ): void
    ```

- [x] 3.2 Handle burst of changes
    - Multiple files changed in rapid succession
    - Queue and batch process when settled

### Phase 4: Watcher Class (1 hour)

- [x] 4.1 Create FileWatcher class
    ```typescript
    class FileWatcher {
      private watcher: chokidar.FSWatcher | null = null;
      private isRunning = false;

      constructor(
        projectPath: string,
        indexPath: string,
        indexManager: IndexManager,
        policy: IndexingPolicy,
        fingerprints: FingerprintsManager
      )

      async start(): Promise<void>
      async stop(): Promise<void>
      isWatching(): boolean

      // Event handlers (internal)
      private onAdd(path: string): void
      private onChange(path: string): void
      private onUnlink(path: string): void
      private onError(error: Error): void
    }
    ```

- [x] 4.2 Handle watcher lifecycle
    - Start watching after index creation
    - Stop watching on index deletion
    - Restart on errors

- [x] 4.3 Handle edge cases
    - Directory renames
    - Symbolic links
    - Permission changes

### Phase 5: Export & Tests (0.5 hours)

- [x] 5.1 Export from `src/engines/fileWatcher.ts`

- [x] 5.2 Write integration tests
    - Test file add detection
    - Test file change detection
    - Test file delete detection
    - Test debouncing behavior
    - Test policy filtering
    - Note: May need file system helpers for testing

## Resources

- `docs/ENGINEERING.RFC.md` Section 5.5: File Watcher Engine
- [chokidar documentation](https://github.com/paulmillr/chokidar)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Add/change/delete events handled correctly
- [x] Debouncing works (rapid saves coalesced)
- [x] Policy filtering prevents unwanted updates
- [x] Watcher handles errors gracefully
- [x] Integration tests pass
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 3 hours

- Implemented WATCHER_OPTIONS with chokidar configuration
- Added WatchEvent type and FileEvent interface
- Added WatcherStats interface for statistics tracking
- Implemented handleFileEvent() with deny pattern check and debouncing
- Implemented processFileEvent() for debounced event processing
- Implemented handleAddOrChange() with policy check, hash comparison, index update
- Implemented handleUnlink() for file deletion handling
- Implemented debounceEvent() with pendingEvents Map (500ms default)
- Created FileWatcher class with start(), stop(), isWatching(), getStats()
- Added createFileWatcher() factory function
- Windows-specific polling for better reliability
- Error handling that doesn't crash the server
- Exported from src/engines/index.ts
- Wrote comprehensive integration tests (34 tests)
- All 339 tests passing, build successful

## Notes

- chokidar is well-tested cross-platform
- awaitWriteFinish helps with editors that write in chunks
- Consider adding event queue for burst handling
- Watcher errors should not crash the MCP server
- Log watcher events at DEBUG level

## Blockers

_None_

## Related Tasks

- SMCP-014: Index Manager processes the actual updates
- SMCP-016: Integrity Engine catches missed events
- SMCP-023: delete_index must stop watcher first
