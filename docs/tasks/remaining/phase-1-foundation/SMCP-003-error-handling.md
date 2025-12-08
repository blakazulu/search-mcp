---
task_id: "SMCP-003"
title: "Error Handling System"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["foundation", "utilities", "errors"]
---

# Task: Error Handling System

## Overview

Implement a standardized error handling system with dual-message format (user-friendly + developer technical). All errors across the codebase will use this system for consistent error reporting.

## Goals

- [ ] Define all error codes from the RFC
- [ ] Create MCPError class with dual messages
- [ ] Implement error factory functions
- [ ] Integrate with logger for error tracking

## Success Criteria

- All 9 error codes from RFC are defined
- Each error has both userMessage and developerMessage
- Errors are properly typed with TypeScript
- Error factory functions simplify error creation

## Dependencies

**Blocked by:**

- SMCP-001: Project Setup
- SMCP-002: Logger Module

**Blocks:**

- SMCP-006: Config Manager
- SMCP-007: Metadata Manager
- SMCP-008: Fingerprints Manager
- SMCP-009: LanceDB Store
- All engines and tools

**Related:**

- SMCP-002: Logger (errors are logged)

## Subtasks

### Phase 1: Error Definitions (0.5 hours)

- [ ] 1.1 Define error codes enum
    ```typescript
    enum ErrorCode {
      INDEX_NOT_FOUND = 'INDEX_NOT_FOUND',
      MODEL_DOWNLOAD_FAILED = 'MODEL_DOWNLOAD_FAILED',
      INDEX_CORRUPT = 'INDEX_CORRUPT',
      FILE_LIMIT_WARNING = 'FILE_LIMIT_WARNING',
      PERMISSION_DENIED = 'PERMISSION_DENIED',
      DISK_FULL = 'DISK_FULL',
      FILE_NOT_FOUND = 'FILE_NOT_FOUND',
      INVALID_PATTERN = 'INVALID_PATTERN',
      PROJECT_NOT_DETECTED = 'PROJECT_NOT_DETECTED'
    }
    ```

- [ ] 1.2 Define MCPError interface
    ```typescript
    interface MCPError {
      code: ErrorCode;
      userMessage: string;
      developerMessage: string;
      cause?: Error;
    }
    ```

### Phase 2: Error Class (0.5 hours)

- [ ] 2.1 Create MCPError class extending Error
    ```typescript
    class MCPError extends Error {
      code: ErrorCode;
      userMessage: string;
      developerMessage: string;
      cause?: Error;
    }
    ```

- [ ] 2.2 Implement proper stack trace capture

- [ ] 2.3 Add toJSON() for serialization

### Phase 3: Error Factories (0.5 hours)

- [ ] 3.1 Create factory for each error type
    ```typescript
    function indexNotFound(indexPath: string): MCPError
    function modelDownloadFailed(error: Error): MCPError
    function indexCorrupt(details: string): MCPError
    function fileLimitWarning(count: number, limit: number): MCPError
    function permissionDenied(path: string): MCPError
    function diskFull(needed: number, available: number): MCPError
    function fileNotFound(path: string): MCPError
    function invalidPattern(pattern: string, error: string): MCPError
    function projectNotDetected(searchedPath: string): MCPError
    ```

- [ ] 3.2 Include RFC-specified messages in factories

### Phase 4: Integration & Tests (0.5 hours)

- [ ] 4.1 Add error logging integration
    - Log ERROR level on creation
    - Include developerMessage in log

- [ ] 4.2 Export from `src/errors/index.ts`

- [ ] 4.3 Write unit tests
    - Test each factory produces correct messages
    - Test error serialization
    - Test stack trace capture

## Resources

- `docs/ENGINEERING.RFC.md` Section 6: Error Handling
- `docs/ENGINEERING.RFC.md` Section 6.2: Error Catalog
- `docs/PRD.md` Section 7.2: Error Messages

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All 9 error codes implemented
- [ ] Each error has user + developer messages matching RFC
- [ ] Unit tests pass
- [ ] Errors integrate with logger
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- User messages should never expose internal paths or technical details
- Developer messages should include all debugging info
- Consider adding error codes to MCP response format
- FILE_LIMIT_WARNING is a soft limit (warning, not error)

## Blockers

_None yet_

## Related Tasks

- All subsequent tasks will use this error system
