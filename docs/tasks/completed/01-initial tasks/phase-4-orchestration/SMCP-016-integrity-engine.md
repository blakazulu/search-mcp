---
task_id: "SMCP-016"
title: "Integrity Engine"
category: "Technical"
priority: "P2"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 3
actual_hours: 2
assigned_to: "blakazulu"
tags: ["orchestration", "integrity", "reconciliation"]
---

# Task: Integrity Engine

## Overview

Implement periodic integrity checking to fix drift from missed file watcher events. Compares stored fingerprints with current filesystem state and queues necessary updates. Runs on MCP server startup and periodically.

## Goals

- [x] Detect drift between index and filesystem
- [x] Queue updates for out-of-sync files
- [x] Run on startup and periodically (24h default)
- [x] Minimize impact on normal operations

## Success Criteria

- Detects added/modified/removed files since last sync
- Reconciliation updates index to match filesystem
- Startup check completes without blocking operations
- Periodic checks run in background

## Dependencies

**Blocked by:**

- SMCP-008: Fingerprints Manager
- SMCP-014: Index Manager
- SMCP-015: File Watcher Engine

**Blocks:**

- None (final orchestration component)

**Related:**

- SMCP-008: Fingerprints Manager (delta detection)
- SMCP-014: Index Manager (applies updates)

## Subtasks

### Phase 1: Drift Detection (1 hour)

- [x] 1.1 Implement filesystem scan
    ```typescript
    async function scanCurrentState(
      projectPath: string,
      policy: IndexingPolicy
    ): Promise<Map<string, string>>
    // Returns map of relativePath -> contentHash
    // Only includes files that pass policy
    ```

- [x] 1.2 Implement drift calculation
    ```typescript
    interface DriftReport {
      added: string[];      // Files on disk but not in index
      modified: string[];   // Files with different hash
      removed: string[];    // Files in index but not on disk
      inSync: number;       // Count of unchanged files
      lastChecked: Date;
    }

    async function calculateDrift(
      projectPath: string,
      fingerprints: FingerprintsManager,
      policy: IndexingPolicy
    ): Promise<DriftReport>
    ```

### Phase 2: Reconciliation (1 hour)

- [x] 2.1 Implement reconcile function
    ```typescript
    async function reconcile(
      projectPath: string,
      indexPath: string,
      indexManager: IndexManager,
      fingerprints: FingerprintsManager,
      policy: IndexingPolicy,
      onProgress?: ProgressCallback
    ): Promise<ReconcileResult>
    ```

- [x] 2.2 Process drift categories
    ```
    For added files:
      - Chunk, embed, insert into index
      - Add to fingerprints

    For modified files:
      - Delete old chunks
      - Re-chunk, embed, insert
      - Update fingerprint

    For removed files:
      - Delete chunks from index
      - Remove from fingerprints
    ```

- [x] 2.3 Handle large drift
    - If many files changed, process in batches
    - Report progress during reconciliation

### Phase 3: Scheduling (0.5 hours)

- [x] 3.1 Implement startup check
    ```typescript
    async function runStartupCheck(
      projectPath: string,
      indexPath: string
    ): Promise<DriftReport>
    // Quick check on MCP server startup
    // Logs drift summary
    ```

- [x] 3.2 Implement periodic scheduling
    ```typescript
    const DEFAULT_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    class IntegrityScheduler {
      constructor(checkInterval?: number)
      start(): void
      stop(): void
      runNow(): Promise<DriftReport>
    }
    ```

### Phase 4: Integrity Engine Class (0.25 hours)

- [x] 4.1 Create IntegrityEngine class
    ```typescript
    class IntegrityEngine {
      constructor(
        projectPath: string,
        indexPath: string,
        indexManager: IndexManager,
        fingerprints: FingerprintsManager,
        policy: IndexingPolicy
      )

      async checkDrift(): Promise<DriftReport>
      async reconcile(onProgress?: ProgressCallback): Promise<ReconcileResult>

      startPeriodicCheck(intervalMs?: number): void
      stopPeriodicCheck(): void
    }
    ```

### Phase 5: Export & Tests (0.25 hours)

- [x] 5.1 Export from `src/engines/integrity.ts`

- [x] 5.2 Write tests
    - Test drift detection accuracy
    - Test reconciliation for each category
    - Test scheduling behavior
    - Note: May need mock filesystem

## Resources

- `docs/ENGINEERING.RFC.md` Section 5.6: Integrity Engine
- `docs/PRD.md` Section 8: Success Metrics (< 1s lag)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Drift detection correctly identifies all changes
- [x] Reconciliation updates index correctly
- [x] Startup check runs without blocking
- [x] Periodic check runs in background
- [x] Tests pass
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 2 hours

- Implemented DriftReport and ReconcileResult interfaces
- Implemented scanCurrentState() with policy filtering and batch hashing
- Implemented calculateDrift() comparing filesystem with fingerprints
- Implemented reconcile() using IndexManager.applyDelta()
- Created IntegrityScheduler class with start(), stop(), runNow()
- Created IntegrityEngine class with checkDrift(), reconcile(), startPeriodicCheck(), stopPeriodicCheck()
- Added isIndexingActive/setIndexingActive to prevent concurrent reconciliation
- Implemented runStartupCheck() and runStartupCheckBackground() for non-blocking startup
- Added createIntegrityEngine() factory function
- Constants: DEFAULT_CHECK_INTERVAL (24h), RECONCILE_BATCH_SIZE (50), HASH_BATCH_SIZE (50)
- Exported from src/engines/index.ts
- Wrote comprehensive unit tests (57 tests)
- All 351 tests passing, build successful

## Notes

- Startup check should be non-blocking (run in background)
- Consider adding configurable check interval
- Log drift summary at INFO level
- Heavy reconciliation should warn user
- Don't run reconciliation during active indexing

## Blockers

_None_

## Related Tasks

- SMCP-015: File Watcher is primary, Integrity is backup
- SMCP-014: Index Manager does actual updates
