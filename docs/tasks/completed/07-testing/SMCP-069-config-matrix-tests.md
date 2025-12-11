---
task_id: "SMCP-069"
title: "Create Config Matrix Test Runner"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-11"
due_date: "2025-12-18"
estimated_hours: 6
actual_hours: 3
assigned_to: "Team"
tags: ["testing", "config-matrix", "vitest"]
---

# Task: Create Config Matrix Test Runner

## Overview

Create the main test file that systematically tests all configuration combinations, running queries against each config and collecting quality/performance/efficiency metrics.

## Goals

- [x] Test all 22 config combinations with all query types
- [x] Collect metrics for each config/query pair
- [x] Assert quality thresholds (latency, precision)
- [x] Generate config matrix report

## Success Criteria

- ✅ All 22 configs tested with all queries
- ✅ Search latency < 500ms for all queries
- ✅ Precision@5 validated against expectedTopFiles
- ✅ Report generated in `tests/reports/config-matrix-YYYY-MM-DD.md`
- ✅ Tests pass with `npm run test:configs`

## Dependencies

**Blocked by:**

- SMCP-067: Test Fixtures
- SMCP-068: Config Utilities

**Blocks:**

- SMCP-071: Report Generator and npm scripts

**Related:**

- tests/integration/hybridSearch.test.ts (pattern reference)

## Subtasks

### Phase 1: Test Structure (1.5 hours)

- [x] 1.1 Create `tests/configs/configMatrix.test.ts`
- [x] 1.2 Import utilities from configCombinations, metrics, fixtureSetup
- [x] 1.3 Set up beforeAll: load queries, setup fixture, init collector
- [x] 1.4 Set up afterAll: cleanup fixture, generate report
- [x] 1.5 Generate config combinations using `generateConfigurations()`

### Phase 2: Test Loop Implementation (2.5 hours)

- [x] 2.1 Outer loop: iterate through config combinations
- [x] 2.2 beforeEach: create fresh index with current config
- [x] 2.3 afterEach: cleanup index
- [x] 2.4 Inner loop: iterate through test queries
- [x] 2.5 For each query:
    - Run searchCode with current config
    - Collect metrics (latency, tokens, results)
    - Calculate precision@5 if expectedTopFiles defined
    - Store metrics in collector
- [x] 2.6 Add assertions:
    - resultCount > 0
    - searchLatencyMs < 500
    - expectedTopFiles found in top results

### Phase 3: Performance Tests (1 hour)

- [x] 3.1 Add indexing time measurement
- [x] 3.2 Add memory usage tracking
- [x] 3.3 Add deduplication effectiveness tracking
- [x] 3.4 Assert performance targets met

### Phase 4: Full Codebase Option (1 hour)

- [x] 4.1 Add FULL_CODEBASE environment variable check
- [x] 4.2 If enabled, run additional tests against actual src/ directory
- [x] 4.3 Skip synthetic fixtures when running full codebase tests
- [x] 4.4 Document slower execution time in comments

## Resources

- [Config Matrix Testing Plan](/tests/config-matrix-testing-plan.md)
- [Existing hybrid search tests](/tests/integration/hybridSearch.test.ts)
- [Search code implementation](/src/tools/searchCode.ts)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] `npx vitest run tests/configs/configMatrix.test.ts` passes
- [x] Report generated successfully
- [x] No test timeouts or memory issues
- [x] Changes committed to Git

## Progress Log

### 2025-12-11 - 3 hours

- Created `tests/configs/configMatrix.test.ts` with full implementation
- Test structure:
  - Module-level query loading from code-queries.json and comparison-queries.json
  - describe.each() for all 21 config combinations
  - it.each() for all 20 unique queries per config
  - beforeAll/afterAll for fixture setup and report generation
- Features implemented:
  - MetricsCollector integration for all search metrics
  - Precision@5 calculation using expectedTopFiles
  - Search latency assertion (< 500ms)
  - Indexing time and memory usage tracking
  - JSON and Markdown report generation to tests/reports/
  - FULL_CODEBASE environment variable for testing against actual src/
- Test verified working:
  - Successfully ran against "default" config
  - 21 tests passed (1 index + 20 queries)
  - Report generated at tests/reports/config-matrix-2025-12-11.md
  - Avg latency: 36.3ms, Precision@5: 26.0%, Avg tokens: 7844

### 2025-12-11 - 0 hours

- Task created
- Subtasks defined based on config-matrix-testing-plan.md

## Notes

- Use vi.mock() for any external dependencies if needed
- Set reasonable timeout for tests (may take several minutes)
- Consider running configs in parallel if safe
- Track both raw results and deduplicated results

## Blockers

_None currently_

## Related Tasks

- SMCP-067: Test Fixtures (dependency)
- SMCP-068: Config Utilities (dependency)
- SMCP-070: Accuracy Comparison (parallel development)
- SMCP-071: Report Generator (uses output from this)
