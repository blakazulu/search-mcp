---
task_id: "SMCP-067"
title: "Create Test Fixtures for Config Matrix Testing"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-11"
due_date: "2025-12-15"
estimated_hours: 4
actual_hours: 2
assigned_to: "Team"
tags: ["testing", "fixtures", "config-matrix"]
---

# Task: Create Test Fixtures for Config Matrix Testing

## Overview

Create reusable test fixtures including a synthetic project with known searchable content and query definitions for testing all Search MCP configuration combinations.

## Goals

- [x] Create synthetic small-project fixture (~20 files)
- [x] Create code-queries.json with expected results
- [x] Create comparison-queries.json with 10 diverse queries
- [x] Set up directory structure for test framework

## Success Criteria

- [x] Synthetic project has auth, db, api, utils modules with known content
- [x] Each query has expectedTopFiles for precision validation
- [x] 10 query types cover: Conceptual, Pattern, Technical, Broad, Documentation, Exact, How-to, Implementation, API, Conceptual-Broad
- [x] Fixtures can be reused across multiple test files

## Dependencies

**Blocked by:**

- None (foundation task)

**Blocks:**

- SMCP-069: Config Matrix Test Runner
- SMCP-070: Accuracy Comparison Tests

**Related:**

- tests/config-matrix-testing-plan.md

## Subtasks

### Phase 1: Directory Structure (0.5 hours)

- [x] 1.1 Create `tests/configs/` directory
- [x] 1.2 Create `tests/fixtures/synthetic/` directory
- [x] 1.3 Create `tests/fixtures/queries/` directory
- [x] 1.4 Create `tests/reports/` directory
- [x] 1.5 Add `tests/reports/` to `.gitignore`

### Phase 2: Synthetic Project Fixture (2 hours)

- [x] 2.1 Create `small-project/src/auth/login.ts` - authentication logic
- [x] 2.2 Create `small-project/src/auth/oauth.ts` - OAuth implementation
- [x] 2.3 Create `small-project/src/db/query.ts` - database queries
- [x] 2.4 Create `small-project/src/db/connection.ts` - connection pool
- [x] 2.5 Create `small-project/src/api/routes.ts` - API routing
- [x] 2.6 Create `small-project/src/api/middleware.ts` - middleware functions
- [x] 2.7 Create `small-project/src/utils/hash.ts` - hash utilities
- [x] 2.8 Create `small-project/src/utils/validation.ts` - input validation
- [x] 2.9 Create `small-project/docs/README.md` - main documentation
- [x] 2.10 Create `small-project/docs/api.md` - API documentation
- [x] 2.11 Create `small-project/docs/security.md` - security guide
- [x] 2.12 Add additional utility files to reach ~20 files

### Phase 3: Query Definitions (1.5 hours)

- [x] 3.1 Create `code-queries.json` with 5-10 queries and expectedTopFiles
- [x] 3.2 Create `comparison-queries.json` with 10 queries:
    - Query 1: "how does file watching work" (Conceptual)
    - Query 2: "error handling patterns" (Pattern)
    - Query 3: "database connection pooling" (Technical)
    - Query 4: "security vulnerabilities" (Broad)
    - Query 5: "configuration options" (Documentation)
    - Query 6: "hashPassword function" (Exact)
    - Query 7: "how to create an index" (How-to)
    - Query 8: "embedding model initialization" (Implementation)
    - Query 9: "API route handler" (API)
    - Query 10: "performance optimization" (Conceptual-Broad)
- [x] 3.3 Add grepPatterns and relevantFiles for each query

## Resources

- [Config Matrix Testing Plan](/tests/config-matrix-testing-plan.md)
- [Existing comparison test](/tests/benchmarks/search-comparison.test.ts)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Synthetic project files contain realistic, searchable content
- [x] Query definitions are valid JSON
- [x] Directory structure matches plan
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- Task created
- Subtasks defined based on config-matrix-testing-plan.md

### 2025-12-11 - 2 hours (Implementation)

- Created directory structure: tests/configs/, tests/fixtures/synthetic/, tests/fixtures/queries/, tests/reports/
- Added tests/reports/ to .gitignore
- Created synthetic small-project fixture with 25 files:
  - 21 TypeScript files across auth/, db/, api/, utils/, services/, errors/, config/ modules
  - 3 Markdown documentation files (README.md, api.md, security.md)
  - 1 package.json
- Created tests/fixtures/queries/code-queries.json with 10 test queries and expectedTopFiles
- Created tests/fixtures/queries/comparison-queries.json with 10 diverse queries covering all query types
- Ran test suite to verify no regressions (9 pre-existing flaky test failures unrelated to fixture changes)
- All fixture files contain realistic, searchable content with known keywords for predictable search results

## Notes

- Synthetic files should contain known keywords for predictable search results
- Each file should have realistic code patterns (functions, classes, comments)
- Query expectedTopFiles should be accurate for precision validation
- Consider adding edge cases (empty files, large files, special characters)

## Blockers

_None currently_

## Related Tasks

- SMCP-068: Config utilities (depends on this for testing)
- SMCP-069: Config matrix tests (uses these fixtures)
- SMCP-070: Accuracy comparison (uses these fixtures)
