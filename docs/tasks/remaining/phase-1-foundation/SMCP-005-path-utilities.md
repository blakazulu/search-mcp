---
task_id: "SMCP-005"
title: "Path Utilities"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 1
assigned_to: "blakazulu"
tags: ["foundation", "utilities", "filesystem"]
---

# Task: Path Utilities

## Overview

Implement path manipulation utilities for safe path operations across platforms. Includes path normalization, relative path conversion, and traversal prevention for security.

## Goals

- [x] Create cross-platform path normalization
- [x] Implement relative path conversion
- [x] Add path traversal prevention
- [x] Provide index storage path helpers

## Success Criteria

- Path functions work on Windows, macOS, and Linux
- Relative paths are always forward-slash separated
- Path traversal attacks (../) are detected and blocked
- Index storage paths follow RFC spec: `~/.mcp/search/indexes/<hash>/`

## Dependencies

**Blocked by:**

- SMCP-001: Project Setup

**Blocks:**

- SMCP-006: Config Manager
- SMCP-007: Metadata Manager
- SMCP-010: Project Root Detection
- SMCP-011: Indexing Policy Engine

**Related:**

- SMCP-004: Hash Utilities (for project path hashing)

## Subtasks

### Phase 1: Path Normalization (0.25 hours)

- [x] 1.1 Implement path normalization
    ```typescript
    function normalizePath(inputPath: string): string
    // Resolves to absolute path
    // Normalizes separators
    // Removes trailing slashes
    ```

- [x] 1.2 Implement relative path conversion
    ```typescript
    function toRelativePath(absolutePath: string, basePath: string): string
    // Returns forward-slash separated relative path
    // e.g., "src/utils/hash.ts"
    ```

### Phase 2: Security Functions (0.25 hours)

- [x] 2.1 Implement traversal detection
    ```typescript
    function isPathTraversal(relativePath: string): boolean
    // Detects ../ or absolute paths in relative context
    ```

- [x] 2.2 Implement safe path joining
    ```typescript
    function safeJoin(basePath: string, relativePath: string): string | null
    // Joins paths and validates result is within base
    // Returns null if traversal detected
    ```

### Phase 3: Storage Paths (0.25 hours)

- [x] 3.1 Implement global storage root
    ```typescript
    function getStorageRoot(): string
    // Returns ~/.mcp/search/
    // Creates directory if not exists
    ```

- [x] 3.2 Implement index path getter
    ```typescript
    function getIndexPath(projectPath: string): string
    // Returns ~/.mcp/search/indexes/<hash>/
    // Uses hashProjectPath for directory name
    ```

- [x] 3.3 Implement subdirectory helpers
    ```typescript
    function getLogsPath(indexPath: string): string
    function getConfigPath(indexPath: string): string
    function getMetadataPath(indexPath: string): string
    function getFingerprintsPath(indexPath: string): string
    function getLanceDbPath(indexPath: string): string
    ```

### Phase 4: Export & Tests (0.25 hours)

- [x] 4.1 Export from `src/utils/paths.ts`

- [x] 4.2 Write unit tests
    - Test cross-platform normalization
    - Test traversal detection
    - Test storage path generation
    - Test on Windows backslash handling

## Resources

- Node.js `path` module documentation
- `docs/ENGINEERING.RFC.md` Section 3.1: Global Storage Strategy
- `docs/ENGINEERING.RFC.md` Section 3: Storage paths

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Paths work correctly on Windows
- [x] Traversal prevention blocks ../ attacks
- [x] Storage paths match RFC spec
- [x] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1 hour

- Implemented `src/utils/paths.ts` with all required functions:
  - Path normalization: `normalizePath`, `toRelativePath`, `toAbsolutePath`
  - Security functions: `isPathTraversal`, `safeJoin`, `isWithinDirectory`
  - Storage paths: `getStorageRoot`, `getIndexPath`, `getIndexesDir`
  - Subdirectory helpers: `getLogsPath`, `getConfigPath`, `getMetadataPath`, `getFingerprintsPath`, `getLanceDbPath`
  - Utility functions: `expandTilde`, `getExtension`, `getBaseName`
- Updated `src/utils/index.ts` to export all path utilities
- Created comprehensive unit tests in `tests/unit/paths.test.ts` (48 tests)
- All 151 project tests pass
- Build succeeds with no TypeScript errors

## Notes

- Windows uses backslashes, Unix uses forward slashes
- Relative paths in index should always use forward slashes for consistency
- Home directory expansion (~) needs platform-specific handling
- Consider using `os.homedir()` for cross-platform home directory
- Added extra helper functions beyond spec: `toAbsolutePath`, `isWithinDirectory`, `getIndexesDir`, `expandTilde`, `getExtension`, `getBaseName`

## Blockers

_None_

## Related Tasks

- SMCP-004: Hash Utilities provides hashProjectPath
- SMCP-006: Config Manager uses getConfigPath
- SMCP-007: Metadata Manager uses getMetadataPath
