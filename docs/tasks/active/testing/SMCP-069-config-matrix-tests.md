---
task_id: "SMCP-069"
title: "Create Config Matrix Test Runner"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: "2025-12-18"
estimated_hours: 6
actual_hours: 0
assigned_to: "Team"
tags: ["testing", "config-matrix", "vitest"]
---

# Task: Create Config Matrix Test Runner

## Overview

Create the main test file that systematically tests all configuration combinations, running queries against each config and collecting quality/performance/efficiency metrics.

## Goals

- [ ] Test all 22 config combinations with all query types
- [ ] Collect metrics for each config/query pair
- [ ] Assert quality thresholds (latency, precision)
- [ ] Generate config matrix report

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

- [ ] 1.1 Create `tests/configs/configMatrix.test.ts`
- [ ] 1.2 Import utilities from configCombinations, metrics, fixtureSetup
- [ ] 1.3 Set up beforeAll: load queries, setup fixture, init collector
- [ ] 1.4 Set up afterAll: cleanup fixture, generate report
- [ ] 1.5 Generate config combinations using `generateConfigurations()`

### Phase 2: Test Loop Implementation (2.5 hours)

- [ ] 2.1 Outer loop: iterate through config combinations
- [ ] 2.2 beforeEach: create fresh index with current config
- [ ] 2.3 afterEach: cleanup index
- [ ] 2.4 Inner loop: iterate through test queries
- [ ] 2.5 For each query:
    - Run searchCode with current config
    - Collect metrics (latency, tokens, results)
    - Calculate precision@5 if expectedTopFiles defined
    - Store metrics in collector
- [ ] 2.6 Add assertions:
    - resultCount > 0
    - searchLatencyMs < 500
    - expectedTopFiles found in top results

### Phase 3: Performance Tests (1 hour)

- [ ] 3.1 Add indexing time measurement
- [ ] 3.2 Add memory usage tracking
- [ ] 3.3 Add deduplication effectiveness tracking
- [ ] 3.4 Assert performance targets met

### Phase 4: Full Codebase Option (1 hour)

- [ ] 4.1 Add FULL_CODEBASE environment variable check
- [ ] 4.2 If enabled, run additional tests against actual src/ directory
- [ ] 4.3 Skip synthetic fixtures when running full codebase tests
- [ ] 4.4 Document slower execution time in comments

## Resources

- [Config Matrix Testing Plan](/tests/config-matrix-testing-plan.md)
- [Existing hybrid search tests](/tests/integration/hybridSearch.test.ts)
- [Search code implementation](/src/tools/searchCode.ts)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `npx vitest run tests/configs/configMatrix.test.ts` passes
- [ ] Report generated successfully
- [ ] No test timeouts or memory issues
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on config-matrix-testing-plan.md

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
