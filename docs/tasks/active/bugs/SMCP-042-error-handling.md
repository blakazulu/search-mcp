---
task_id: "SMCP-042"
title: "Error Handling & State Management"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2024-12-09"
due_date: ""
estimated_hours: 8
actual_hours: 0
assigned_to: "Team"
tags: ["medium", "error-handling", "state-management", "indexing", "robustness"]
---

# Task: Error Handling & State Management

## Overview

Improve error handling throughout the codebase, add indexing state tracking, and fix various state management issues that can leave the system in inconsistent states.

## Bugs Addressed

- **Bug #8**: Hardcoded Confirmation Bypass (`server.ts:183-249`)
- **Bug #21**: Stack Trace Information Leakage (`server.ts:411`)
- **Bug #23**: Missing Initialization Reset in Integrity Engine (`integrity.ts:526-557`)
- **Bug #24**: DocsIndexManager Error Handling Gap (`docsIndexManager.ts:995-1008`)
- **Bug #25**: Silent Error Masking in Delta Calculation (`fingerprints.ts:260-268`)
- **MCP-9**: No Incomplete Indexing Detection
- **MCP-11**: Model Download Failure During Indexing
- **MCP-12**: Disk Full During Indexing - No Detection
- **MCP-13**: Zero-Vector Injection on Embedding Failure
- **MCP-15**: Search Returns Stale Results During Reindex

## Goals

- [ ] Add indexing state tracking to detect incomplete indexes
- [ ] Fix confirmation flow (remove hardcoded bypass)
- [ ] Add disk space checks before indexing
- [ ] Improve error handling and state consistency
- [ ] Remove stack trace leakage in production

## Success Criteria

- Incomplete indexes are detected and reported
- Disk full errors are caught and reported properly
- No silent error masking
- State is consistent after errors
- Build and all tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- SMCP-037: Atomic File Writes
- SMCP-038: Resource Cleanup

## Subtasks

### Phase 1: Indexing State Tracking (2 hours)

- [ ] 1.1 Add indexing state to metadata schema
    ```typescript
    interface IndexMetadata {
      // ... existing fields ...
      indexingState: 'complete' | 'in_progress' | 'failed';
      indexingStartedAt?: string;  // ISO timestamp
      lastCheckpoint?: string;     // ISO timestamp
      expectedFiles?: number;      // Set at scan time
      processedFiles?: number;     // Updated per batch
    }
    ```

- [ ] 1.2 Update IndexManager to track state
    ```typescript
    // At start of createIndex:
    metadataManager.setIndexingState('in_progress', {
      startedAt: new Date().toISOString(),
      expectedFiles: filesToIndex.length,
      processedFiles: 0,
    });
    await metadataManager.save();

    // After each batch:
    metadataManager.updateProgress(processedCount);

    // On completion:
    metadataManager.setIndexingState('complete');
    await metadataManager.save();

    // On error:
    metadataManager.setIndexingState('failed');
    await metadataManager.save();
    ```

- [ ] 1.3 Add startup validation to detect incomplete indexes
    ```typescript
    async function validateIndex(indexPath: string): Promise<{
      valid: boolean;
      reason?: string;
    }> {
      const metadata = await loadMetadata(indexPath);
      if (metadata?.indexingState === 'in_progress') {
        return { valid: false, reason: 'Indexing was interrupted' };
      }
      // ... other checks ...
    }
    ```

### Phase 2: Fix Confirmation Flow (0.5 hours)

- [ ] 2.1 Remove `confirmed: true` hardcoding in `server.ts:183-249`
    - MCP's `requiresConfirmation` flag handles this already
    - Remove the `confirmed` checks from tool handlers

- [ ] 2.2 Update tools to rely on MCP confirmation flow
    - `createIndex.ts`
    - `reindexProject.ts`
    - `deleteIndex.ts`

### Phase 3: Disk Space Checks (1 hour)

- [ ] 3.1 Add disk space check utility
    ```typescript
    import { statfs } from 'fs/promises';

    export async function checkDiskSpace(path: string): Promise<{
      available: number;
      total: number;
    }> {
      const stats = await statfs(path);
      return {
        available: stats.bfree * stats.bsize,
        total: stats.blocks * stats.bsize,
      };
    }

    export async function hasSufficientSpace(
      path: string,
      requiredBytes: number
    ): Promise<boolean> {
      const { available } = await checkDiskSpace(path);
      // Require at least 10% extra buffer
      return available > requiredBytes * 1.1;
    }
    ```

- [ ] 3.2 Add disk space check before indexing
- [ ] 3.3 Use `diskFull()` error factory that was never used

### Phase 4: Fix State Management Issues (2 hours)

- [ ] 4.1 Fix Integrity Engine reset (`integrity.ts:526-557`)
    ```typescript
    // Ensure _isIndexingActive is reset on error
    try {
      this._isIndexingActive = true;
      await this.performIndexing();
    } finally {
      this._isIndexingActive = false;  // Always reset
    }
    ```

- [ ] 4.2 Fix DocsIndexManager error handling (`docsIndexManager.ts:995-1008`)
    ```typescript
    try {
      await this.close();
      const result = await createDocsIndex(...);
      await this.initialize();
      return result;
    } catch (error) {
      // Attempt to reinitialize on error
      try {
        await this.initialize();
      } catch {
        // Log but don't throw - already have an error
      }
      throw error;
    }
    ```

- [ ] 4.3 Fix silent error masking in fingerprints (`fingerprints.ts:260-268`)
    - Log permission errors instead of silently treating as "added"

### Phase 5: Zero-Vector Handling (1 hour)

- [ ] 5.1 Add flag for failed embeddings instead of zero vectors
    ```typescript
    interface ChunkRecord {
      // ... existing fields ...
      embeddingFailed?: boolean;  // Flag for failed embeddings
    }
    ```

- [ ] 5.2 Skip storing chunks with failed embeddings
    - Or store with flag so they can be identified

- [ ] 5.3 Report embedding failure statistics in index status

### Phase 6: Stack Trace Cleanup (0.5 hours)

- [ ] 6.1 Remove stack traces from user-facing errors
    ```typescript
    // Only include stack trace in debug mode
    const errorResponse = {
      code: error.code,
      message: error.userMessage,
      ...(process.env.DEBUG && { stack: error.stack }),
    };
    ```

### Phase 7: Stale Search Results Warning (1 hour)

- [ ] 7.1 Add index status check to search tools
    ```typescript
    // In searchCode:
    if (metadata.indexingState === 'in_progress') {
      // Include warning in response
      return {
        ...results,
        warning: 'Index is currently being rebuilt. Results may be incomplete.',
      };
    }
    ```

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Node.js statfs](https://nodejs.org/api/fs.html#fspromisesstatfspath-options)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Indexing state tracking implemented
- [ ] Confirmation flow fixed
- [ ] Disk space checks added
- [ ] State management issues fixed
- [ ] Zero-vector handling improved
- [ ] Stack traces not leaked to users
- [ ] Stale results warning added
- [ ] `npm run build` passes
- [ ] `npm run test` passes

## Progress Log

### 2024-12-09 - 0 hours

- Task created from bug hunt findings

## Notes

- Indexing state should persist across process restarts
- Consider adding "resumable indexing" in the future
- Disk space check may not work on all filesystems (network drives)
- Zero-vector detection could be a search quality improvement project

## Blockers

_None currently identified_
