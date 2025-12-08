---
task_id: "SMCP-008"
title: "Fingerprints Manager"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["storage", "fingerprints", "delta-detection"]
---

# Task: Fingerprints Manager

## Overview

Implement file fingerprint tracking for delta detection during incremental indexing. Maps relative file paths to SHA256 content hashes. Used to detect which files have changed since last index.

## Goals

- [ ] Implement fingerprint storage (path -> hash map)
- [ ] Support delta detection (changed/added/removed files)
- [ ] Provide efficient batch updates
- [ ] Handle atomic saves

## Success Criteria

- Fingerprints persist to `fingerprints.json`
- Delta detection correctly identifies changed files
- Batch operations are efficient for large projects
- Concurrent access is safe

## Dependencies

**Blocked by:**

- SMCP-003: Error Handling System
- SMCP-004: Hash Utilities
- SMCP-005: Path Utilities

**Blocks:**

- SMCP-014: Index Manager
- SMCP-015: File Watcher Engine
- SMCP-016: Integrity Engine

**Related:**

- SMCP-004: Hash Utilities (provides hashFile)

## Subtasks

### Phase 1: Data Structure (0.5 hours)

- [ ] 1.1 Define fingerprint types
    ```typescript
    type Fingerprints = Map<string, string>;
    // Key: relative path (e.g., "src/index.ts")
    // Value: SHA256 hash of file content

    interface DeltaResult {
      added: string[];    // Files in current but not in stored
      modified: string[]; // Files with different hash
      removed: string[];  // Files in stored but not in current
      unchanged: string[]; // Files with same hash
    }
    ```

### Phase 2: Fingerprints I/O (0.5 hours)

- [ ] 2.1 Implement loading
    ```typescript
    async function loadFingerprints(indexPath: string): Promise<Fingerprints>
    // Returns empty Map if file doesn't exist
    // Parses JSON object to Map
    ```

- [ ] 2.2 Implement saving
    ```typescript
    async function saveFingerprints(indexPath: string, fingerprints: Fingerprints): Promise<void>
    // Atomic write (temp + rename)
    // Converts Map to JSON object
    ```

### Phase 3: Delta Detection (0.5 hours)

- [ ] 3.1 Implement delta calculation
    ```typescript
    async function calculateDelta(
      stored: Fingerprints,
      currentFiles: string[],  // List of relative paths
      projectPath: string
    ): Promise<DeltaResult>
    // Hashes current files and compares with stored
    ```

- [ ] 3.2 Optimize for large file sets
    - Batch hash calculations
    - Early exit on unchanged files

### Phase 4: Manager Class (0.25 hours)

- [ ] 4.1 Create FingerprintsManager class
    ```typescript
    class FingerprintsManager {
      constructor(indexPath: string, projectPath: string)
      async load(): Promise<void>
      async save(): Promise<void>

      // Single file operations
      get(relativePath: string): string | undefined
      set(relativePath: string, hash: string): void
      delete(relativePath: string): void
      has(relativePath: string): boolean

      // Batch operations
      async calculateDelta(currentFiles: string[]): Promise<DeltaResult>
      updateFromDelta(delta: DeltaResult, newHashes: Map<string, string>): void

      // Accessors
      getAll(): Fingerprints
      count(): number
    }
    ```

### Phase 5: Export & Tests (0.25 hours)

- [ ] 5.1 Export from `src/storage/fingerprints.ts`

- [ ] 5.2 Write unit tests
    - Test add/modify/remove detection
    - Test empty fingerprints handling
    - Test large file set performance
    - Test atomic save behavior

## Resources

- `docs/ENGINEERING.RFC.md` Section 3.3: Fingerprints Schema
- `docs/ENGINEERING.RFC.md` Section 5.5: File Watcher uses fingerprints

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Delta detection correctly identifies all change types
- [ ] Atomic writes prevent corruption
- [ ] Performance acceptable for 50,000+ files
- [ ] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Relative paths should always use forward slashes
- Hash comparison is case-sensitive (SHA256 is hex lowercase)
- Consider caching file stats to skip unchanged files quickly
- Large fingerprints.json files (50k entries) should still be fast to parse

## Blockers

_None yet_

## Related Tasks

- SMCP-014: Index Manager uses delta for incremental indexing
- SMCP-015: File Watcher updates fingerprints on file changes
- SMCP-016: Integrity Engine reconciles fingerprints with filesystem
