---
task_id: "SMCP-071"
title: "Create Report Generator and npm Scripts"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-11"
due_date: "2025-12-20"
estimated_hours: 4
actual_hours: 0
assigned_to: "Team"
tags: ["testing", "reports", "documentation", "npm-scripts"]
---

# Task: Create Report Generator and npm Scripts

## Overview

Create the report generator that produces markdown reports from test results, and add npm scripts for running config matrix tests.

## Goals

- [ ] Generate config matrix report (config-matrix-YYYY-MM-DD.md)
- [ ] Generate accuracy comparison report (accuracy-comparison-YYYY-MM-DD.md)
- [ ] Add npm scripts for running tests
- [ ] Update CHANGELOG.md with new testing framework

## Success Criteria

- ✅ Reports include executive summary, comparison tables, recommendations
- ✅ Report format matches search-comparison-test.md style
- ✅ `npm run test:configs` works correctly
- ✅ Reports saved to tests/reports/ directory
- ✅ CHANGELOG updated with testing framework feature

## Dependencies

**Blocked by:**

- SMCP-069: Config Matrix Tests (provides data)
- SMCP-070: Accuracy Comparison (provides data)

**Blocks:**

- None (final task in chain)

**Related:**

- docs/search-comparison-test.md (output format reference)

## Subtasks

### Phase 1: Report Generator Module (2 hours)

- [ ] 1.1 Create `tests/configs/reportGenerator.ts`
- [ ] 1.2 Implement `generateConfigMatrixReport(results)`:
    - Executive summary (best config per metric)
    - Config comparison table
    - Alpha parameter analysis by query type
    - FTS engine comparison
    - Indexing strategy comparison
    - Chunking strategy comparison
    - Feature coverage summary
    - Recommendations
- [ ] 1.3 Implement `generateAccuracyReport(results)`:
    - MCP vs Grep vs D&D summary table
    - Per-config comparison tables
    - Best config for accuracy
    - Deduplication effectiveness
    - Key takeaways
- [ ] 1.4 Add date stamping to filenames
- [ ] 1.5 Ensure reports are valid markdown

### Phase 2: npm Scripts (1 hour)

- [ ] 2.1 Add to package.json:
    ```json
    "test:configs": "vitest run tests/configs/",
    "test:configs:watch": "vitest tests/configs/",
    "test:configs:full": "cross-env FULL_CODEBASE=true vitest run tests/configs/"
    ```
- [ ] 2.2 Install cross-env if not present (for Windows compatibility)
- [ ] 2.3 Test all scripts work correctly
- [ ] 2.4 Add script descriptions to README or CLAUDE.md

### Phase 3: Documentation Updates (1 hour)

- [ ] 3.1 Update CHANGELOG.md with new testing framework
- [ ] 3.2 Add testing commands to CLAUDE.md
- [ ] 3.3 Update tests/config-matrix-testing-plan.md status to "implemented"
- [ ] 3.4 Add example report outputs to plan document

## Resources

- [Config Matrix Testing Plan](/tests/config-matrix-testing-plan.md)
- [Search Comparison Report Format](/docs/search-comparison-test.md)
- [Existing benchmark output](/tests/benchmarks/results.json)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `npm run test:configs` generates reports
- [ ] Reports are readable and well-formatted
- [ ] CHANGELOG.md updated
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on config-matrix-testing-plan.md

## Notes

- Report format should match professional documentation style
- Include timestamp in reports for tracking
- Consider adding JSON output alongside markdown for programmatic use
- Recommendations should be actionable and data-driven

## Blockers

_None currently_

## Related Tasks

- SMCP-067: Test Fixtures (foundation)
- SMCP-068: Config Utilities (foundation)
- SMCP-069: Config Matrix Tests (dependency)
- SMCP-070: Accuracy Comparison (dependency)
