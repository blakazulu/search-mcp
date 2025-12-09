---
task_id: "SMCP-002"
title: "Logger Module"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 1.5
assigned_to: "blakazulu"
tags: ["foundation", "utilities", "logging"]
---

# Task: Logger Module

## Overview

Implement a logging utility that writes to rolling log files. The logger is needed for debugging all other components and provides visibility into MCP server operations.

## Goals

- [x] Create logger with configurable log levels
- [x] Implement file-based logging with rotation
- [x] Support structured log format with timestamps
- [x] Provide singleton logger instance

## Success Criteria

- Logger writes to `~/.mcp/search/indexes/<hash>/logs/`
- Log files rotate at 10MB with max 3 files retained
- Log format: `[ISO_TIMESTAMP] [LEVEL] [COMPONENT] Message`
- All log levels work: ERROR, WARN, INFO, DEBUG

## Dependencies

**Blocked by:**

- SMCP-001: Project Setup

**Blocks:**

- SMCP-003: Error Handling System
- SMCP-013: Embedding Engine
- All components that need logging

**Related:**

- SMCP-005: Path Utilities (for log directory paths)

## Subtasks

### Phase 1: Logger Interface (0.5 hours)

- [x] 1.1 Define log levels enum
    ```typescript
    enum LogLevel {
      ERROR = 0,
      WARN = 1,
      INFO = 2,
      DEBUG = 3
    }
    ```

- [x] 1.2 Define logger interface
    ```typescript
    interface Logger {
      error(component: string, message: string, meta?: object): void;
      warn(component: string, message: string, meta?: object): void;
      info(component: string, message: string, meta?: object): void;
      debug(component: string, message: string, meta?: object): void;
      setLevel(level: LogLevel): void;
    }
    ```

### Phase 2: File Writer (1 hour)

- [x] 2.1 Implement log directory creation
    - Create `~/.mcp/search/indexes/<hash>/logs/` if not exists
    - Handle permission errors gracefully

- [x] 2.2 Implement log file rotation
    - Current: `search-mcp.log`
    - Rotated: `search-mcp.1.log`, `search-mcp.2.log`
    - Rotate when file exceeds 10MB
    - Keep max 3 files

- [x] 2.3 Implement log formatting
    ```
    [2024-01-15T10:30:45.123Z] [INFO] [indexing] Indexed file: src/auth/login.ts (3 chunks)
    ```

### Phase 3: Singleton & Export (0.5 hours)

- [x] 3.1 Create singleton logger factory
    ```typescript
    function createLogger(indexPath: string): Logger
    function getLogger(): Logger  // Get existing instance
    ```

- [x] 3.2 Export from `src/utils/logger.ts`

- [x] 3.3 Add fallback to console when no index path set

### Phase 4: Unit Tests (0.5 hours)

- [x] 4.1 Test log level filtering
- [x] 4.2 Test log file creation
- [x] 4.3 Test log rotation trigger
- [x] 4.4 Test log format output

## Resources

- `docs/BACKLOG.md` Section 3: Logging Details
- `docs/ENGINEERING.RFC.md` Section 3.1: Storage paths

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Unit tests pass with >80% coverage
- [x] Logger handles missing directories gracefully
- [x] Log rotation works at 10MB threshold
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1.5 hours

- Implemented `src/utils/logger.ts` with:
  - LogLevel enum (ERROR=0, WARN=1, INFO=2, DEBUG=3)
  - Logger interface with all required methods
  - FileLogger class with file rotation support
  - Singleton pattern via createLogger() and getLogger()
  - Console fallback when no log directory set
  - getDefaultLogDir() helper for index hash paths
  - parseLogLevel() utility function
- Created comprehensive test suite `tests/unit/utils/logger.test.ts` (32 tests)
- Updated `src/utils/index.ts` to export all logger functions and types
- All tests pass (34 total tests in project)
- Build completes successfully

## Notes

- Consider using `pino` for performance, but simple fs.appendFile may suffice for MVP
- Log rotation can use simple file size check on each write
- Ensure logs don't block MCP operations (async writes)
- DEBUG level should be off by default in production

## Implementation Details

**Files Created:**
- `src/utils/logger.ts` - Main logger implementation
- `tests/unit/utils/logger.test.ts` - Unit tests

**Files Modified:**
- `src/utils/index.ts` - Added logger exports

**Key Features:**
- Async write queue to prevent blocking MCP operations
- Configurable max file size (default: 10MB) and max files (default: 3)
- Graceful fallback to console logging on permission errors
- Metadata support via optional JSON object parameter
- setLogDir() method for switching between projects/indexes

## Blockers

_None_

## Related Tasks

- SMCP-003: Error Handling (uses logger for error logging)
- SMCP-013: Embedding Engine (logs model download progress)
