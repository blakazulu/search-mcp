---
task_id: "SMCP-053"
title: "Tool Input Validation & Authorization"
category: "Security"
priority: "P0"
status: "not-started"
created_date: "2025-12-10"
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

- [ ] Fix confirmation bypass in all destructive tools
- [ ] Add query string length validation
- [ ] Add glob pattern complexity validation
- [ ] Sanitize paths in error messages

## Success Criteria

- Direct API calls without `confirmed: true` are rejected
- Query strings > 1000 chars rejected
- ReDoS-prone glob patterns rejected
- Error messages don't expose full system paths
- All tests pass

## Subtasks

### Phase 1: Fix Confirmation Bypass (2 hours)

- [ ] 1.1 Update `src/tools/createIndex.ts`
    - Line 266: Change `if (context.confirmed === false)` to `if (context.confirmed !== true)`
    - Add explicit check for undefined

- [ ] 1.2 Update `src/tools/reindexProject.ts`
    - Line 206: Same fix as above

- [ ] 1.3 Update `src/tools/deleteIndex.ts`
    - Line 291: Same fix as above

- [ ] 1.4 Add tests for confirmation bypass
    - Test that undefined confirmed is rejected
    - Test that explicit true works
    - Test that explicit false is rejected

### Phase 2: Add Query Validation (1.5 hours)

- [ ] 2.1 Create constants file `src/utils/limits.ts`
    ```typescript
    export const MAX_QUERY_LENGTH = 1000;
    export const MAX_GLOB_PATTERN_LENGTH = 200;
    export const MAX_GLOB_PATTERN_WILDCARDS = 10;
    ```

- [ ] 2.2 Update `src/tools/searchCode.ts`
    - Line 36: Add `.max(MAX_QUERY_LENGTH)` to Zod schema
    - Add helpful error message for exceeded length

- [ ] 2.3 Update `src/tools/searchDocs.ts`
    - Line 38: Add `.max(MAX_QUERY_LENGTH)` to Zod schema

### Phase 3: Add Glob Pattern Validation (1.5 hours)

- [ ] 3.1 Update `src/tools/searchByPath.ts`
    - Line 143-150: Add pattern complexity validation
    - Check for excessive wildcards
    - Check pattern length
    - Test against ReDoS patterns

- [ ] 3.2 Create pattern validation utility
    ```typescript
    function isPatternSafe(pattern: string): boolean {
      // Reject patterns with too many wildcards
      // Reject patterns that could cause exponential backtracking
    }
    ```

### Phase 4: Sanitize Error Paths (1 hour)

- [ ] 4.1 Create error path sanitization utility
    ```typescript
    function sanitizePath(fullPath: string): string {
      // Replace home directory with ~
      // Replace project-specific paths with relative
    }
    ```

- [ ] 4.2 Update error messages in:
    - `src/tools/searchCode.ts:148` - indexNotFound
    - `src/tools/searchDocs.ts` - similar errors
    - Other tools as needed

## Resources

- Zod validation docs: https://zod.dev/
- ReDoS prevention: https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS

## Acceptance Checklist

- [ ] All destructive tools require explicit `confirmed: true`
- [ ] Query lengths validated
- [ ] Glob patterns validated for complexity
- [ ] No system paths in error messages
- [ ] Tests added
- [ ] All existing tests pass

## Notes

- Consider adding rate limiting in a future task (not in scope here)
- The MCP server does handle confirmation at protocol level, but direct API access should also be protected

## Progress Log

### 2025-12-10

- Task created from security audit
