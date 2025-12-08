---
task_id: "SMCP-004"
title: "Hash Utilities"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 0
assigned_to: "blakazulu"
tags: ["foundation", "utilities", "crypto"]
---

# Task: Hash Utilities

## Overview

Implement SHA256 hashing utilities for file content fingerprinting and project path hashing. These are used for delta detection during indexing and for creating unique index directory names.

## Goals

- [ ] Create SHA256 hash function for strings
- [ ] Create SHA256 hash function for file content
- [ ] Create project path to index directory hash function

## Success Criteria

- `hashString(input)` returns consistent SHA256 hex digest
- `hashFile(path)` returns SHA256 of file content
- `hashProjectPath(path)` returns truncated hash for directory name
- All functions handle errors gracefully

## Dependencies

**Blocked by:**

- SMCP-001: Project Setup

**Blocks:**

- SMCP-008: Fingerprints Manager
- SMCP-009: LanceDB Store
- SMCP-012: Chunking Engine

**Related:**

- SMCP-005: Path Utilities

## Subtasks

### Phase 1: Core Hash Functions (0.5 hours)

- [ ] 1.1 Implement string hashing
    ```typescript
    function hashString(input: string): string
    // Returns full SHA256 hex digest (64 chars)
    ```

- [ ] 1.2 Implement file hashing
    ```typescript
    async function hashFile(filePath: string): Promise<string>
    // Reads file and returns SHA256 of content
    // Uses streaming for large files
    ```

- [ ] 1.3 Implement project path hashing
    ```typescript
    function hashProjectPath(projectPath: string): string
    // Returns first 16 chars of SHA256 for directory name
    // Normalizes path before hashing (resolve, lowercase on Windows)
    ```

### Phase 2: Error Handling (0.25 hours)

- [ ] 2.1 Handle file read errors
    - Return null or throw MCPError for missing files
    - Log errors with file path

- [ ] 2.2 Handle encoding edge cases
    - Use UTF-8 for string hashing
    - Use raw buffer for file hashing

### Phase 3: Export & Tests (0.25 hours)

- [ ] 3.1 Export from `src/utils/hash.ts`

- [ ] 3.2 Write unit tests
    - Test known SHA256 outputs
    - Test file hashing with temp files
    - Test project path normalization
    - Test error cases

## Resources

- Node.js `crypto` module documentation
- `docs/ENGINEERING.RFC.md` Section 3.3: Fingerprints Schema

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Hash outputs match expected SHA256 format
- [ ] File hashing works with streaming
- [ ] Project path hashing normalizes paths correctly
- [ ] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Use Node.js built-in `crypto` module (no external deps)
- File hashing should stream to avoid memory issues on large files
- Project path hash truncation (16 chars) provides enough uniqueness
- Consider caching file hashes to avoid re-reading unchanged files

## Blockers

_None yet_

## Related Tasks

- SMCP-008: Fingerprints Manager uses hashFile for delta detection
- SMCP-009: LanceDB Store uses content_hash in schema
