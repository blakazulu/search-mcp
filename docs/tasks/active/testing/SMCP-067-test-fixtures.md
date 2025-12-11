---
task_id: "SMCP-067"
title: "Create Test Fixtures for Config Matrix Testing"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: "2025-12-15"
estimated_hours: 4
actual_hours: 0
assigned_to: "Team"
tags: ["testing", "fixtures", "config-matrix"]
---

# Task: Create Test Fixtures for Config Matrix Testing

## Overview

Create reusable test fixtures including a synthetic project with known searchable content and query definitions for testing all Search MCP configuration combinations.

## Goals

- [ ] Create synthetic small-project fixture (~20 files)
- [ ] Create code-queries.json with expected results
- [ ] Create comparison-queries.json with 10 diverse queries
- [ ] Set up directory structure for test framework

## Success Criteria

- ✅ Synthetic project has auth, db, api, utils modules with known content
- ✅ Each query has expectedTopFiles for precision validation
- ✅ 10 query types cover: Conceptual, Pattern, Technical, Broad, Documentation, Exact, How-to, Implementation, API, Conceptual-Broad
- ✅ Fixtures can be reused across multiple test files

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

- [ ] 1.1 Create `tests/configs/` directory
- [ ] 1.2 Create `tests/fixtures/synthetic/` directory
- [ ] 1.3 Create `tests/fixtures/queries/` directory
- [ ] 1.4 Create `tests/reports/` directory
- [ ] 1.5 Add `tests/reports/` to `.gitignore`

### Phase 2: Synthetic Project Fixture (2 hours)

- [ ] 2.1 Create `small-project/src/auth/login.ts` - authentication logic
- [ ] 2.2 Create `small-project/src/auth/oauth.ts` - OAuth implementation
- [ ] 2.3 Create `small-project/src/db/query.ts` - database queries
- [ ] 2.4 Create `small-project/src/db/connection.ts` - connection pool
- [ ] 2.5 Create `small-project/src/api/routes.ts` - API routing
- [ ] 2.6 Create `small-project/src/api/middleware.ts` - middleware functions
- [ ] 2.7 Create `small-project/src/utils/hash.ts` - hash utilities
- [ ] 2.8 Create `small-project/src/utils/validation.ts` - input validation
- [ ] 2.9 Create `small-project/docs/README.md` - main documentation
- [ ] 2.10 Create `small-project/docs/api.md` - API documentation
- [ ] 2.11 Create `small-project/docs/security.md` - security guide
- [ ] 2.12 Add additional utility files to reach ~20 files

### Phase 3: Query Definitions (1.5 hours)

- [ ] 3.1 Create `code-queries.json` with 5-10 queries and expectedTopFiles
- [ ] 3.2 Create `comparison-queries.json` with 10 queries:
    - Query 1: "how does file watching work" (Conceptual)
    - Query 2: "error handling patterns" (Pattern)
    - Query 3: "LanceDB vector search" (Technical)
    - Query 4: "security vulnerabilities" (Broad)
    - Query 5: "configuration options" (Documentation)
    - Query 6: "hashPassword function" (Exact)
    - Query 7: "how to create an index" (How-to)
    - Query 8: "embedding model initialization" (Implementation)
    - Query 9: "MCP tool handler" (API)
    - Query 10: "performance optimization" (Conceptual-Broad)
- [ ] 3.3 Add grepPatterns and relevantFiles for each query

## Resources

- [Config Matrix Testing Plan](/tests/config-matrix-testing-plan.md)
- [Existing comparison test](/tests/benchmarks/search-comparison.test.ts)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Synthetic project files contain realistic, searchable content
- [ ] Query definitions are valid JSON
- [ ] Directory structure matches plan
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on config-matrix-testing-plan.md

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
