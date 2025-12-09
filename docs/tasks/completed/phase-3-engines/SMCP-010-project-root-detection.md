---
task_id: "SMCP-010"
title: "Project Root Detection"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-09"
completed_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 1.5
assigned_to: "blakazulu"
tags: ["engines", "project-detection", "filesystem"]
---

# Task: Project Root Detection

## Overview

Implement automatic project root detection by searching for common project markers (.git, package.json, etc.). Falls back to user prompt when no markers found. This determines the scope of indexing.

## Goals

- [x] Search upward for project markers
- [x] Support multiple project types (Node, Python, Rust, Go)
- [x] Handle fallback when no markers found
- [x] Return detected project path

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

- [x] 1.1 Define project markers list
    ```typescript
    const PROJECT_MARKERS = [
      '.git',           // Git repository
      'package.json',   // Node.js
      'pyproject.toml', // Python
      'Cargo.toml',     // Rust
      'go.mod',         // Go
    ] as const;
    ```

- [x] 1.2 Define marker check type
    ```typescript
    type MarkerType = 'directory' | 'file' | 'either';

    const MARKER_TYPES: Record<string, MarkerType> = {
      '.git': 'either',      // Can be directory or file (worktrees)
      'package.json': 'file',
      'pyproject.toml': 'file',
      'Cargo.toml': 'file',
      'go.mod': 'file',
    };
    ```

### Phase 2: Detection Algorithm (1 hour)

- [x] 2.1 Implement marker check
    ```typescript
    async function checkMarker(directory: string, marker: string): Promise<boolean>
    // Checks if marker exists in directory
    // Handles both file and directory markers
    // Also handles 'either' type for .git (worktrees support)
    ```

- [x] 2.2 Implement upward search
    ```typescript
    async function findProjectRoot(startPath: string): Promise<DetectionResult | null>
    // Starts from startPath
    // Searches upward checking each directory for markers
    // Stops at filesystem root
    // Returns first directory with a marker, or null
    ```

- [x] 2.3 Handle filesystem root detection
    - Detect when reached filesystem root
    - Handle Windows drive roots (C:\) vs Unix root (/)

### Phase 3: Main Function (0.5 hours)

- [x] 3.1 Implement main detection function
    ```typescript
    interface DetectionResult {
      projectPath: string;
      detectedBy: ProjectMarker;  // Which marker was found
    }

    async function detectProjectRoot(cwd?: string): Promise<DetectionResult>
    // Uses process.cwd() if cwd not provided
    // Returns detected project path and marker
    // Throws PROJECT_NOT_DETECTED error if not found
    ```

- [x] 3.2 Implement result with marker info
    - Include which marker was found
    - Useful for logging and debugging

### Phase 4: Export & Tests (0.25 hours)

- [x] 4.1 Export from `src/engines/projectRoot.ts`

- [x] 4.2 Write unit tests
    - Test detection from project root
    - Test detection from nested subdirectory
    - Test each marker type
    - Test no marker found case
    - Test filesystem root boundary
    - Test paths with spaces and special characters
    - Test path normalization

## Resources

- `docs/ENGINEERING.RFC.md` Section 5.1: Project Root Detection Engine
- `docs/PRD.md` Section 5.3: Project Root Detection

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Detects all marker types from RFC
- [x] Searches upward correctly
- [x] Stops at filesystem root
- [x] Throws correct error when not found
- [x] Unit tests pass (36 tests)
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1.5 hours (completion)

- Implemented `src/engines/projectRoot.ts` with full functionality
- Added `PROJECT_MARKERS` constant with all required markers
- Added `MARKER_TYPES` with 'either' type to support .git worktrees
- Implemented `checkMarker()` for type-aware marker detection
- Implemented `findProjectRoot()` for upward directory search
- Implemented `detectProjectRoot()` as main public API
- Implemented `isProjectRoot()` helper for validation
- Implemented `isFilesystemRoot()` for cross-platform root detection
- Exported all functions from `src/engines/index.ts`
- Created comprehensive test suite with 36 tests covering:
  - Constants and types validation
  - Filesystem root detection (Windows/Unix)
  - Marker detection (all 5 types)
  - Project root finding from various depths
  - Marker priority ordering
  - Nested project handling
  - Edge cases (spaces, special chars, path normalization)

## Implementation Notes

- Used 'either' marker type for `.git` to support git worktrees (where .git is a file)
- Properly handles Windows drive roots (C:\) vs Unix root (/)
- Normalizes paths using existing `normalizePath()` utility
- Integrates with existing error system using `projectNotDetected()` factory
- Logs detection process using existing logger for debugging

## Files Created/Modified

- `src/engines/projectRoot.ts` - New file with implementation
- `src/engines/index.ts` - Added exports for project root detection
- `tests/unit/engines/projectRoot.test.ts` - New test file with 36 tests

## Blockers

_None_

## Related Tasks

- SMCP-020: create_index Tool uses this for project detection
