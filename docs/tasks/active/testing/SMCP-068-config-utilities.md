---
task_id: "SMCP-068"
title: "Create Config Combination Generator and Metrics Utilities"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: "2025-12-16"
estimated_hours: 5
actual_hours: 0
assigned_to: "Team"
tags: ["testing", "config", "metrics", "utilities"]
---

# Task: Create Config Combination Generator and Metrics Utilities

## Overview

Create utility modules for generating configuration combinations and collecting metrics during config matrix testing. These utilities will be shared across multiple test files.

## Goals

- [ ] Create config combination generator (~22 meaningful configs)
- [ ] Create metrics collector for quality/performance/efficiency
- [ ] Create comparison metrics utility for MCP vs Grep vs D&D
- [ ] Create fixture setup/cleanup utilities

## Success Criteria

- ✅ Generator produces ~22 focused config combinations (not full 360 cartesian)
- ✅ Metrics collector tracks: latency, tokens, precision, memory
- ✅ Comparison utilities can simulate grep and calculate D&D baselines
- ✅ All utilities are type-safe with proper TypeScript interfaces

## Dependencies

**Blocked by:**

- SMCP-067: Test Fixtures (needed for testing utilities)

**Blocks:**

- SMCP-069: Config Matrix Test Runner
- SMCP-070: Accuracy Comparison Tests

**Related:**

- src/storage/config.ts (ConfigSchema source of truth)

## Subtasks

### Phase 1: Config Combination Generator (2 hours)

- [ ] 1.1 Create `tests/configs/configCombinations.ts`
- [ ] 1.2 Define `ConfigCombination` interface
- [ ] 1.3 Implement baseline configs (default, all-features, minimal)
- [ ] 1.4 Implement alpha variations (0.0, 0.3, 0.5, 0.7, 1.0)
- [ ] 1.5 Implement FTS engine variations (auto, js, native)
- [ ] 1.6 Implement indexing strategy variations (realtime, lazy, git)
- [ ] 1.7 Implement chunking variations (character, code-aware)
- [ ] 1.8 Add edge case combinations (lazy+code-aware, git+native, vector-only)
- [ ] 1.9 Export `generateConfigurations()` function

### Phase 2: Metrics Collector (1.5 hours)

- [ ] 2.1 Create `tests/configs/metrics.ts`
- [ ] 2.2 Define `TestMetrics` interface:
    - configName, queryId, queryType
    - resultCount, topResultPath, topResultScore
    - relevanceHits, precisionAt5
    - searchLatencyMs, indexingTimeMs, memoryUsageMB
    - totalChars, estimatedTokens, avgChunkSize
- [ ] 2.3 Implement `MetricsCollector` class
- [ ] 2.4 Add `collectSearchMetrics()` method
- [ ] 2.5 Add `getSummary()` method for aggregation

### Phase 3: Comparison Metrics Utility (1 hour)

- [ ] 3.1 Create `tests/configs/comparisonMetrics.ts`
- [ ] 3.2 Implement `simulateGrep(dir, patterns)` - find matching files
- [ ] 3.3 Implement `calculateGrepTokens(files)` - total tokens if all read
- [ ] 3.4 Implement `findDragDropFiles(dir, fileNames)` - optimal files
- [ ] 3.5 Implement `calculateDragDropTokens(files)` - D&D token count
- [ ] 3.6 Implement `compareApproaches()` - calculate efficiency ratios

### Phase 4: Fixture Setup Utilities (0.5 hours)

- [ ] 4.1 Create `tests/configs/fixtureSetup.ts`
- [ ] 4.2 Implement `setupFixture(name)` - create temp project, copy fixtures
- [ ] 4.3 Implement `cleanupFixture(context)` - remove temp dirs
- [ ] 4.4 Implement `createIndexWithConfig(projectPath, config)` - index with specific config

## Resources

- [Config Matrix Testing Plan](/tests/config-matrix-testing-plan.md)
- [ConfigSchema](/src/storage/config.ts)
- [Existing benchmark utilities](/tests/benchmarks/search-comparison.test.ts)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Unit tests pass for utility functions
- [ ] TypeScript compiles without errors
- [ ] All interfaces exported for use by test files
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on config-matrix-testing-plan.md

## Notes

- Use pairwise/orthogonal approach to reduce 360 combinations to ~22
- Metrics should match what search-comparison-test.md reports
- estimateTokens: chars / 4 (standard approximation)
- Memory tracking via process.memoryUsage().heapUsed

## Blockers

_None currently_

## Related Tasks

- SMCP-067: Test Fixtures (dependency)
- SMCP-069: Config Matrix Tests (uses these utilities)
- SMCP-070: Accuracy Comparison (uses comparisonMetrics)
