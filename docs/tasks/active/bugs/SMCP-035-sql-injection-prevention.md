---
task_id: "SMCP-035"
title: "SQL Injection Prevention & Query Safety"
category: "Technical"
priority: "P0"
status: "not-started"
created_date: "2024-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "Team"
tags: ["security", "critical", "sql-injection", "lancedb"]
---

# Task: SQL Injection Prevention & Query Safety

## Overview

Fix SQL injection vulnerabilities in LanceDB query construction. The current implementation uses simple string concatenation with inadequate escaping, allowing potential SQL injection attacks through malicious file paths.

## Bugs Addressed

- **Bug #1**: SQL Injection in `lancedb.ts:444-451,578`
- **Bug #22**: Glob-to-SQL Pattern Conversion Incomplete (`lancedb.ts:166-178`)
- **MCP-1** (partial): Tool Description Prompt Injection defense layer

## Goals

- [ ] Create safe SQL escaping utility functions
- [ ] Update all LanceDB query construction to use safe escaping
- [ ] Add comprehensive test coverage for injection attempts

## Success Criteria

- All SQL queries use parameterized-style escaping
- Injection test cases pass (special chars: `'`, `"`, `\`, `%`, `_`, `[`, null bytes)
- No regressions in existing search/delete functionality
- Build and all tests pass

## Dependencies

**Blocked by:** None

**Blocks:**
- SMCP-036: Concurrency & Mutex (both modify lancedb.ts)

**Related:**
- SMCP-040: Path Security & Validation

## Subtasks

### Phase 1: Create SQL Escaping Utility (1 hour)

- [ ] 1.1 Create `src/utils/sql.ts` with escaping functions
    ```typescript
    export function escapeSqlString(value: string): string {
      return value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "''")
        .replace(/\0/g, '')
        .replace(/[\x00-\x1f]/g, '');
    }

    export function escapeLikePattern(value: string): string {
      return escapeSqlString(value)
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/\[/g, '\\[');
    }
    ```

- [ ] 1.2 Add unit tests for escaping functions
    - Test single quotes: `test' OR '1'='1`
    - Test backslashes: `path\to\file`
    - Test LIKE wildcards: `100%_complete.ts`
    - Test null bytes: `test\x00injection`
    - Test control characters

### Phase 2: Update LanceDB Store (1.5 hours)

- [ ] 2.1 Update `deleteByPath()` in `src/storage/lancedb.ts:444-451`
    ```typescript
    const escapedPath = escapeSqlString(relativePath);
    const beforeCount = await table.countRows(`path = '${escapedPath}'`);
    await table.delete(`path = '${escapedPath}'`);
    ```

- [ ] 2.2 Update `searchByPath()` in `src/storage/lancedb.ts:578`
    ```typescript
    const escapedPattern = escapeLikePattern(globToLikePattern(pattern));
    const results = await table.filter(`path LIKE '${escapedPattern}'`).execute();
    ```

- [ ] 2.3 Update `globToLikePattern()` in `src/storage/lancedb.ts:166-178`
    - Handle escaped characters properly
    - Handle bracket expressions `[abc]`

### Phase 3: Update DocsLanceDB Store (1 hour)

- [ ] 3.1 Apply same fixes to `src/storage/docsLancedb.ts:362,369,493`
    - Update all SQL string construction
    - Use same escaping utilities

### Phase 4: Testing (0.5 hours)

- [ ] 4.1 Create integration tests for injection attempts
- [ ] 4.2 Run full test suite
- [ ] 4.3 Manual testing with special character file paths

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- LanceDB filter documentation

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `src/utils/sql.ts` created with tests
- [ ] `src/storage/lancedb.ts` updated
- [ ] `src/storage/docsLancedb.ts` updated
- [ ] Unit tests added for escaping functions
- [ ] Integration tests for injection attempts
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] No regressions in search functionality

## Progress Log

### 2024-12-09 - 0 hours

- Task created from bug hunt findings

## Notes

- LanceDB uses SQL-like filter syntax but may have its own quirks
- Consider if LanceDB has built-in parameterized query support (check docs)
- The escaping approach is defense-in-depth; paths should also be validated upstream

## Blockers

_None currently identified_
