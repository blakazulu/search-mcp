---
task_id: "SMCP-031"
title: "File Watcher Docs Integration"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 0
assigned_to: "blakazulu"
tags: ["engines", "watcher", "docs", "integration"]
---

# Task: File Watcher Docs Integration

## Overview

Integrate documentation file handling into the existing file watcher. When a doc file (.md, .txt) changes, route it to DocsIndexManager instead of the code IndexManager.

## Goals

- [ ] Detect doc file changes in file watcher
- [ ] Route doc changes to DocsIndexManager
- [ ] Route code changes to IndexManager (existing)
- [ ] Handle doc file deletion

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

- [ ] 1.1 Import isDocFile from docsChunking
    ```typescript
    import { isDocFile } from './docsChunking';
    ```

- [ ] 1.2 Update onChange handler
    ```typescript
    async handleChange(relativePath: string) {
      if (isDocFile(relativePath)) {
        await this.docsIndexManager.updateDocFile(relativePath);
      } else {
        await this.indexManager.updateFile(relativePath);
      }
    }
    ```

- [ ] 1.3 Update onDelete handler
    ```typescript
    async handleDelete(relativePath: string) {
      if (isDocFile(relativePath)) {
        await this.docsIndexManager.removeDocFile(relativePath);
      } else {
        await this.indexManager.removeFile(relativePath);
      }
    }
    ```

- [ ] 1.4 Update FileWatcher constructor
    - Accept DocsIndexManager as optional parameter
    - Only route to docs if docsIndexManager provided

### Phase 2: Tests (0.5 hours)

- [ ] 2.1 Update file watcher tests
    - Test doc file changes go to DocsIndexManager
    - Test code file changes go to IndexManager
    - Test correct routing based on extension

- [ ] 2.2 Test edge cases
    - README.md in root
    - Nested docs folder
    - Mixed code and docs in same directory

## Resources

- `src/engines/fileWatcher.ts` - Existing implementation
- `src/engines/docsChunking.ts` - isDocFile helper

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Doc files route to DocsIndexManager
- [ ] Code files route to IndexManager
- [ ] No duplicate processing
- [ ] Tests pass

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Simple routing logic based on file extension
- Uses isDocFile() from docsChunking.ts
- DocsIndexManager is optional (for backwards compat)

## Blockers

_None yet_

## Related Tasks

- SMCP-015: File Watcher Engine (base)
- SMCP-028: Docs Index Manager (doc handler)
- SMCP-027: Docs Chunking (isDocFile helper)
