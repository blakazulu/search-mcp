---
task_id: "SMCP-053"
title: "Tool Input Validation & Authorization"
category: "Security"
priority: "P0"
status: "completed"
created_date: "2025-12-10"
completed_date: "2025-12-10"
estimated_hours: 6
assigned_to: "Team"
tags: ["security", "critical", "input-validation", "authorization"]
---

# Task: Tool Input Validation & Authorization

## Overview

Fix critical authorization bypass in destructive tools and add input validation to prevent DoS attacks via malformed inputs. Currently, confirmation checks use `=== false` instead of `=== true`, allowing bypass. Query strings have no length limits.

## Related Vulnerabilities

| # | Issue | Severity | File |
|---|-------|----------|------|
| 2 | Confirmation bypass (=== false vs !== true) | CRITICAL | createIndex.ts, reindexProject.ts, deleteIndex.ts |
| 8 | Glob pattern ReDoS | HIGH | searchByPath.ts |
| 13 | Path info disclosure in errors | HIGH | Multiple |
| 17 | No query length validation | MEDIUM | searchCode.ts, searchDocs.ts |

## Goals

- [x] Fix confirmation bypass in all destructive tools
- [x] Add query string length validation
- [x] Add glob pattern complexity validation
- [x] Sanitize paths in error messages

## Success Criteria

- [x] Direct API calls without `confirmed: true` are rejected
- [x] Query strings > 1000 chars rejected
- [x] ReDoS-prone glob patterns rejected
- [x] Error messages don't expose full system paths
- [x] All tests pass (1823 tests passing)

## Subtasks

### Phase 1: Fix Confirmation Bypass (2 hours)

- [x] 1.1 Update `src/tools/createIndex.ts`
    - Changed `if (context.confirmed === false)` to `if (context.confirmed !== true)`
    - Prevents undefined/null bypass attacks

- [x] 1.2 Update `src/tools/reindexProject.ts`
    - Same fix as above

- [x] 1.3 Update `src/tools/deleteIndex.ts`
    - Same fix as above

- [x] 1.4 Add tests for confirmation bypass
    - Test that undefined confirmed is rejected
    - Test that explicit true works
    - Test that explicit false is rejected
    - Test that null confirmed is rejected

### Phase 2: Add Query Validation (1.5 hours)

- [x] 2.1 Create constants file `src/utils/limits.ts`
    ```typescript
    export const MAX_QUERY_LENGTH = 1000;
    export const MAX_GLOB_PATTERN_LENGTH = 200;
    export const MAX_GLOB_PATTERN_WILDCARDS = 10;
    export const MAX_GLOB_BRACE_GROUPS = 5;
    export const MAX_GLOB_BRACE_ITEMS = 20;
    ```

- [x] 2.2 Update `src/tools/searchCode.ts`
    - Added `.max(MAX_QUERY_LENGTH)` to Zod schema
    - Added helpful error message for exceeded length

- [x] 2.3 Update `src/tools/searchDocs.ts`
    - Added `.max(MAX_QUERY_LENGTH)` to Zod schema

### Phase 3: Add Glob Pattern Validation (1.5 hours)

- [x] 3.1 Update `src/tools/searchByPath.ts`
    - Added pattern complexity validation
    - Check for excessive wildcards
    - Check pattern length
    - Test against ReDoS patterns

- [x] 3.2 Create pattern validation utility `isPatternSafe()` in `src/utils/limits.ts`
    - Rejects patterns with too many wildcards (>10)
    - Rejects patterns that could cause exponential backtracking
    - Rejects excessive brace groups and items
    - Comprehensive ReDoS pattern detection

### Phase 4: Sanitize Error Paths (1 hour)

- [x] 4.1 Create error path sanitization utilities in `src/utils/paths.ts`
    - `sanitizePath()` - Replace home directory with ~, make relative paths
    - `sanitizeIndexPath()` - Sanitize index paths to `~/.mcp/search/indexes/<project-hash>`

- [x] 4.2 Update error messages in:
    - `src/errors/index.ts` - Updated factory functions (indexNotFound, permissionDenied, fileNotFound, projectNotDetected, symlinkNotAllowed)
    - `src/tools/searchCode.ts` - Uses sanitized paths
    - `src/tools/searchDocs.ts` - Uses sanitized paths
    - `src/tools/reindexProject.ts` - Uses sanitized paths
    - `src/tools/reindexFile.ts` - Uses sanitized paths

## Resources

- Zod validation docs: https://zod.dev/
- ReDoS prevention: https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS

## Acceptance Checklist

- [x] All destructive tools require explicit `confirmed: true`
- [x] Query lengths validated
- [x] Glob patterns validated for complexity
- [x] No system paths in error messages
- [x] Tests added (29 new tests for limits.ts, plus confirmation bypass tests)
- [x] All existing tests pass (1823 tests passing)

## Notes

- Consider adding rate limiting in a future task (not in scope here)
- The MCP server does handle confirmation at protocol level, but direct API access should also be protected

## Progress Log

### 2025-12-10

- Task created from security audit
- **COMPLETED**: Full implementation of tool input validation and authorization

#### Implementation Summary

1. **Fixed Confirmation Bypass (CRITICAL)**:
   - Updated `createIndex.ts`, `reindexProject.ts`, `deleteIndex.ts`
   - Changed `if (context.confirmed === false)` to `if (context.confirmed !== true)`
   - Prevents bypass via undefined/null values
   - Added tests for undefined, null, false, and true confirmation values

2. **Created `src/utils/limits.ts`** with constants and validation:
   - `MAX_QUERY_LENGTH = 1000`
   - `MAX_GLOB_PATTERN_LENGTH = 200`
   - `MAX_GLOB_PATTERN_WILDCARDS = 10`
   - `MAX_GLOB_BRACE_GROUPS = 5`
   - `MAX_GLOB_BRACE_ITEMS = 20`
   - `REDOS_PATTERNS` array for dangerous pattern detection
   - `isPatternSafe()` validation function

3. **Added Query Length Validation**:
   - Updated `searchCode.ts` and `searchDocs.ts` Zod schemas
   - Query strings > 1000 chars rejected with clear error

4. **Added Glob Pattern Validation**:
   - Updated `searchByPath.ts` with pattern complexity validation
   - Rejects ReDoS-prone patterns
   - Checks wildcard count, pattern length, brace groups

5. **Added Path Sanitization**:
   - Created `sanitizePath()` and `sanitizeIndexPath()` in `paths.ts`
   - Updated error factory functions in `errors/index.ts`
   - Error messages now show `~` instead of full home paths
   - Index paths shown as `~/.mcp/search/indexes/<project-hash>`

6. **Added Tests**:
   - `tests/unit/utils/limits.test.ts` - 29 tests for pattern validation
   - Confirmation bypass tests in tool test files

#### Test Results
- All 1823 tests pass with no regressions
