---
task_id: "SMCP-010"
title: "Project Root Detection"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["engines", "project-detection", "filesystem"]
---

# Task: Project Root Detection

## Overview

Implement automatic project root detection by searching for common project markers (.git, package.json, etc.). Falls back to user prompt when no markers found. This determines the scope of indexing.

## Goals

- [ ] Search upward for project markers
- [ ] Support multiple project types (Node, Python, Rust, Go)
- [ ] Handle fallback when no markers found
- [ ] Return detected project path

## Success Criteria

- Correctly identifies project root from any subdirectory
- Recognizes all marker types from RFC
- Returns PROJECT_NOT_DETECTED error when no markers found
- Works on Windows, macOS, and Linux

## Dependencies

**Blocked by:**

- SMCP-003: Error Handling System
- SMCP-005: Path Utilities

**Blocks:**

- SMCP-020: create_index Tool

**Related:**

- None

## Subtasks

### Phase 1: Marker Definition (0.25 hours)

- [ ] 1.1 Define project markers list
    ```typescript
    const PROJECT_MARKERS = [
      '.git',           // Git repository
      'package.json',   // Node.js
      'pyproject.toml', // Python
      'Cargo.toml',     // Rust
      'go.mod',         // Go
    ] as const;
    ```

- [ ] 1.2 Define marker check type
    ```typescript
    type MarkerType = 'directory' | 'file';

    const MARKER_TYPES: Record<string, MarkerType> = {
      '.git': 'directory',
      'package.json': 'file',
      'pyproject.toml': 'file',
      'Cargo.toml': 'file',
      'go.mod': 'file',
    };
    ```

### Phase 2: Detection Algorithm (1 hour)

- [ ] 2.1 Implement marker check
    ```typescript
    async function checkMarker(directory: string, marker: string): Promise<boolean>
    // Checks if marker exists in directory
    // Handles both file and directory markers
    ```

- [ ] 2.2 Implement upward search
    ```typescript
    async function findProjectRoot(startPath: string): Promise<string | null>
    // Starts from startPath
    // Searches upward checking each directory for markers
    // Stops at filesystem root
    // Returns first directory with a marker, or null
    ```

- [ ] 2.3 Handle filesystem root detection
    - Detect when reached filesystem root
    - Handle Windows drive roots (C:\) vs Unix root (/)

### Phase 3: Main Function (0.5 hours)

- [ ] 3.1 Implement main detection function
    ```typescript
    interface DetectionResult {
      projectPath: string;
      detectedBy: string;  // Which marker was found
    }

    async function detectProjectRoot(cwd?: string): Promise<DetectionResult>
    // Uses process.cwd() if cwd not provided
    // Returns detected project path and marker
    // Throws PROJECT_NOT_DETECTED error if not found
    ```

- [ ] 3.2 Implement result with marker info
    - Include which marker was found
    - Useful for logging and debugging

### Phase 4: Export & Tests (0.25 hours)

- [ ] 4.1 Export from `src/engines/projectRoot.ts`

- [ ] 4.2 Write unit tests
    - Test detection from project root
    - Test detection from nested subdirectory
    - Test each marker type
    - Test no marker found case
    - Test filesystem root boundary

## Resources

- `docs/ENGINEERING.RFC.md` Section 5.1: Project Root Detection Engine
- `docs/PRD.md` Section 5.3: Project Root Detection

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Detects all marker types from RFC
- [ ] Searches upward correctly
- [ ] Stops at filesystem root
- [ ] Throws correct error when not found
- [ ] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Search upward means checking parent directories recursively
- Stop searching when reaching filesystem root
- Consider caching detection result for performance
- .git can be a file (worktrees) or directory (normal repos)

## Blockers

_None yet_

## Related Tasks

- SMCP-020: create_index Tool uses this for project detection
