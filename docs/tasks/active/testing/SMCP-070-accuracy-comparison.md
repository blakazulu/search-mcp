---
task_id: "SMCP-070"
title: "Create Accuracy Comparison Tests (MCP vs Grep vs D&D)"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: "2025-12-18"
estimated_hours: 5
actual_hours: 0
assigned_to: "Team"
tags: ["testing", "accuracy", "comparison", "benchmarks"]
---

# Task: Create Accuracy Comparison Tests (MCP vs Grep vs D&D)

## Overview

Create tests that compare MCP search accuracy against baseline approaches (grep+read, drag-and-drop) for each configuration, extending the methodology from search-comparison-test.md.

## Goals

- [ ] Test MCP vs Grep efficiency for each config
- [ ] Test MCP vs Drag-and-Drop efficiency for each config
- [ ] Track deduplication effectiveness per config
- [ ] Identify best config for accuracy/efficiency

## Success Criteria

- ✅ All 10 comparison queries tested for each config
- ✅ Efficiency ratios calculated (MCP vs Grep ~20x, MCP vs D&D ~2x)
- ✅ Deduplication reduction tracked per config
- ✅ Report generated in `tests/reports/accuracy-comparison-YYYY-MM-DD.md`
- ✅ Best config identified for each metric

## Dependencies

**Blocked by:**

- SMCP-067: Test Fixtures
- SMCP-068: Config Utilities (especially comparisonMetrics.ts)

**Blocks:**

- SMCP-071: Report Generator (needs comparison data)

**Related:**

- tests/benchmarks/search-comparison.test.ts (methodology reference)
- docs/search-comparison-test.md (output format reference)

## Subtasks

### Phase 1: Test Structure (1 hour)

- [ ] 1.1 Create `tests/configs/accuracyComparison.test.ts`
- [ ] 1.2 Import comparisonMetrics utilities
- [ ] 1.3 Load 10 comparison queries from comparison-queries.json
- [ ] 1.4 Set up results storage for all configs
- [ ] 1.5 Set up afterAll to generate comparison report

### Phase 2: MCP Measurement (1.5 hours)

- [ ] 2.1 For each config/query pair:
    - Run searchCode with config
    - Measure: resultCount, totalChars, estimatedTokens
    - Measure: searchTimeMs (exclude warmup)
    - Track: raw results vs deduplicated
    - Assess: relevance (HIGH/MEDIUM/LOW)

### Phase 3: Baseline Measurements (1.5 hours)

- [ ] 3.1 Grep baseline for each query:
    - Call simulateGrep(srcDir, grepPatterns)
    - Calculate: filesMatched, totalMatches
    - Calculate: totalChars, estimatedTokens
    - Assess: relevance based on noise ratio
- [ ] 3.2 Drag-and-Drop baseline for each query:
    - Call findDragDropFiles(srcDir, relevantFiles)
    - Calculate: filesCount, totalChars, estimatedTokens
    - Assess: userEffort (LOW/MEDIUM/HIGH/VERY HIGH)

### Phase 4: Efficiency Calculations (1 hour)

- [ ] 4.1 Calculate MCP vs Grep ratio per query
- [ ] 4.2 Calculate MCP vs D&D ratio per query
- [ ] 4.3 Calculate totals across all queries
- [ ] 4.4 Track deduplication effectiveness:
    - Raw results count
    - After dedup count
    - Reduction percentage
- [ ] 4.5 Identify best config for:
    - Best MCP vs Grep ratio
    - Best MCP vs D&D ratio
    - Best deduplication
    - Best relevance

## Resources

- [Config Matrix Testing Plan](/tests/config-matrix-testing-plan.md)
- [Search Comparison Methodology](/docs/search-comparison-test.md)
- [Existing comparison test](/tests/benchmarks/search-comparison.test.ts)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `npx vitest run tests/configs/accuracyComparison.test.ts` passes
- [ ] Comparison report generated successfully
- [ ] Ratios match expected ranges (MCP ~20x vs Grep)
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on config-matrix-testing-plan.md

## Notes

- Token estimation: chars / 4 (standard approximation)
- First query may have warmup overhead - exclude from timing
- Grep simulation should match patterns used in search-comparison-test.md
- D&D relevantFiles should represent optimal expert file selection

## Blockers

_None currently_

## Related Tasks

- SMCP-067: Test Fixtures (dependency)
- SMCP-068: Config Utilities (dependency)
- SMCP-069: Config Matrix Tests (parallel development)
- SMCP-071: Report Generator (uses output from this)
