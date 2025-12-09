---
task_id: "SMCP-031"
title: "File Watcher Docs Integration"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 1
assigned_to: "blakazulu"
tags: ["engines", "watcher", "docs", "integration"]
---

# Task: File Watcher Docs Integration

## Overview

Integrate documentation file handling into the existing file watcher. When a doc file (.md, .txt) changes, route it to DocsIndexManager instead of the code IndexManager.

## Goals

- [x] Detect doc file changes in file watcher
- [x] Route doc changes to DocsIndexManager
- [x] Route code changes to IndexManager (existing)
- [x] Handle doc file deletion

## Success Criteria

- Doc file changes trigger docs index update
- Code file changes still trigger code index update
- No duplication (file goes to one or the other)
- Debouncing still works for doc files

## Dependencies

**Blocked by:**

- SMCP-015: File Watcher Engine (completed)
- SMCP-028: Docs Index Manager

**Blocks:**

- None

**Related:**

- SMCP-015: File Watcher Engine
- SMCP-027: Docs Chunking (isDocFile helper)

## Subtasks

### Phase 1: Update File Watcher (0.5 hours)

- [x] 1.1 Import isDocFile from docsChunking
    ```typescript
    import { isDocFile } from './docsChunking';
    ```

- [x] 1.2 Update onChange handler
    ```typescript
    async handleChange(relativePath: string) {
      if (isDocFile(relativePath)) {
        await this.docsIndexManager.updateDocFile(relativePath);
      } else {
        await this.indexManager.updateFile(relativePath);
      }
    }
    ```

- [x] 1.3 Update onDelete handler
    ```typescript
    async handleDelete(relativePath: string) {
      if (isDocFile(relativePath)) {
        await this.docsIndexManager.removeDocFile(relativePath);
      } else {
        await this.indexManager.removeFile(relativePath);
      }
    }
    ```

- [x] 1.4 Update FileWatcher constructor
    - Accept DocsIndexManager as optional parameter
    - Only route to docs if docsIndexManager provided

### Phase 2: Tests (0.5 hours)

- [x] 2.1 Update file watcher tests
    - Test doc file changes go to DocsIndexManager
    - Test code file changes go to IndexManager
    - Test correct routing based on extension

- [x] 2.2 Test edge cases
    - README.md in root
    - Nested docs folder
    - Mixed code and docs in same directory

## Resources

- `src/engines/fileWatcher.ts` - Existing implementation
- `src/engines/docsChunking.ts` - isDocFile helper

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Doc files route to DocsIndexManager
- [x] Code files route to IndexManager
- [x] No duplicate processing
- [x] Tests pass

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1 hour

- Imported isDocFile from docsChunking.ts
- Imported DocsIndexManager and DocsFingerprintsManager
- Updated FileWatcher constructor to accept optional DocsIndexManager and DocsFingerprintsManager
- Added handleDocAddOrChange method for routing doc file changes
- Added handleDocUnlink method for routing doc file deletions
- Updated handleAddOrChange to check isDocFile and route accordingly
- Updated handleUnlink to check isDocFile and route accordingly
- Updated start method to load docs fingerprints if provided
- Updated createFileWatcher factory function with new optional parameters
- Added comprehensive tests for doc file routing
- All 48 file watcher tests pass
- Full test suite (451 tests) passes
- Build passes with no errors

## Notes

- Simple routing logic based on file extension
- Uses isDocFile() from docsChunking.ts
- DocsIndexManager is optional (for backwards compat)
- DocsFingerprintsManager is also optional and used for doc file change detection
- Doc files are skipped (eventsSkipped++) when no DocsIndexManager is provided

## Blockers

_None_

## Related Tasks

- SMCP-015: File Watcher Engine (base)
- SMCP-028: Docs Index Manager (doc handler)
- SMCP-027: Docs Chunking (isDocFile helper)
