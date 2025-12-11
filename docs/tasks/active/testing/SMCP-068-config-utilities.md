---
task_id: "SMCP-068"
title: "Create Config Combination Generator and Metrics Utilities"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-11"
due_date: "2025-12-16"
estimated_hours: 5
actual_hours: 2
assigned_to: "Team"
tags: ["testing", "config", "metrics", "utilities"]
---

# Task: Create Config Combination Generator and Metrics Utilities

## Overview

Create utility modules for generating configuration combinations and collecting metrics during config matrix testing. These utilities will be shared across multiple test files.

## Goals

- [x] Create config combination generator (~22 meaningful configs)
- [x] Create metrics collector for quality/performance/efficiency
- [x] Create comparison metrics utility for MCP vs Grep vs D&D
- [x] Create fixture setup/cleanup utilities

## Success Criteria

- [x] Generator produces ~22 focused config combinations (not full 360 cartesian)
- [x] Metrics collector tracks: latency, tokens, precision, memory
- [x] Comparison utilities can simulate grep and calculate D&D baselines
- [x] All utilities are type-safe with proper TypeScript interfaces

## Dependencies

**Blocked by:**

- SMCP-067: Test Fixtures (completed)

**Blocks:**

- SMCP-069: Config Matrix Test Runner
- SMCP-070: Accuracy Comparison Tests

**Related:**

- src/storage/config.ts (ConfigSchema source of truth)

## Subtasks

### Phase 1: Config Combination Generator (2 hours)

- [x] 1.1 Create `tests/configs/configCombinations.ts`
- [x] 1.2 Define `ConfigCombination` interface
- [x] 1.3 Implement baseline configs (default, all-features, minimal)
- [x] 1.4 Implement alpha variations (0.0, 0.3, 0.5, 0.7, 1.0)
- [x] 1.5 Implement FTS engine variations (auto, js, native)
- [x] 1.6 Implement indexing strategy variations (realtime, lazy, git)
- [x] 1.7 Implement chunking variations (character, code-aware)
- [x] 1.8 Add edge case combinations (lazy+code-aware, git+native, vector-only)
- [x] 1.9 Export `generateConfigurations()` function

### Phase 2: Metrics Collector (1.5 hours)

- [x] 2.1 Create `tests/configs/metrics.ts`
- [x] 2.2 Define `TestMetrics` interface:
    - configName, queryId, queryType
    - resultCount, topResultPath, topResultScore
    - relevanceHits, precisionAt5
    - searchLatencyMs, indexingTimeMs, memoryUsageMB
    - totalChars, estimatedTokens, avgChunkSize
- [x] 2.3 Implement `MetricsCollector` class
- [x] 2.4 Add `collectSearchMetrics()` method
- [x] 2.5 Add `getSummary()` method for aggregation

### Phase 3: Comparison Metrics Utility (1 hour)

- [x] 3.1 Create `tests/configs/comparisonMetrics.ts`
- [x] 3.2 Implement `simulateGrep(dir, patterns)` - find matching files
- [x] 3.3 Implement `calculateGrepTokens(files)` - total tokens if all read
- [x] 3.4 Implement `findDragDropFiles(dir, fileNames)` - optimal files
- [x] 3.5 Implement `calculateDragDropTokens(files)` - D&D token count
- [x] 3.6 Implement `compareApproaches()` - calculate efficiency ratios

### Phase 4: Fixture Setup Utilities (0.5 hours)

- [x] 4.1 Create `tests/configs/fixtureSetup.ts`
- [x] 4.2 Implement `setupFixture(name)` - create temp project, copy fixtures
- [x] 4.3 Implement `cleanupFixture(context)` - remove temp dirs
- [x] 4.4 Implement `createIndexWithConfig(projectPath, config)` - index with specific config

## Resources

- [Config Matrix Testing Plan](/tests/config-matrix-testing-plan.md)
- [ConfigSchema](/src/storage/config.ts)
- [Existing benchmark utilities](/tests/benchmarks/search-comparison.test.ts)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] TypeScript compiles without errors
- [x] All interfaces exported for use by test files
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on config-matrix-testing-plan.md

### 2025-12-11 - 2 hours (Implementation)

- ✅ Created `tests/configs/configCombinations.ts`:
  - ConfigCombination interface with name, description, category, config
  - 21 configurations across 6 categories:
    - baseline (3): default, all-features, minimal
    - alpha (5): 0.0, 0.3, 0.5, 0.7, 1.0
    - fts (3): auto, js, native
    - strategy (3): realtime, lazy, git
    - chunking (2): character, code-aware
    - edge-case (5): lazy-code-aware, git-native, vector-only, fts-only-native, code-aware-balanced
  - Helper functions: generateConfigurations(), getConfigurationsByCategory(), getConfigurationSummary()

- ✅ Created `tests/configs/metrics.ts`:
  - TestMetrics interface with all required fields
  - MetricsCollector class with methods:
    - collectSearchMetrics() - collect metrics for a search
    - getAllMetrics() - get all collected metrics
    - getMetricsForConfig() - filter by config
    - getSummary() - aggregate metrics for a config
    - getAllSummaries() - summaries for all configs
    - compareConfigs() - compare two configurations
    - findBestConfig() - find best config for a metric
  - Utility functions: estimateTokens(), getMemoryUsageMB(), calculatePrecisionAtK()

- ✅ Created `tests/configs/comparisonMetrics.ts`:
  - GrepResult, DragDropResult, MCPResult, ComparisonResult interfaces
  - simulateGrep() - find files matching regex patterns
  - calculateGrepTokens() - total tokens for grep approach
  - findDragDropFiles() - find files by name patterns
  - calculateDragDropTokens() - total tokens for D&D approach
  - simulateDragDrop() - full D&D simulation with effort rating
  - compareApproaches() - compare MCP vs Grep vs D&D
  - formatComparisonRow() - generate markdown table row
  - calculateComparisonTotals() - aggregate comparison stats

- ✅ Created `tests/configs/fixtureSetup.ts`:
  - FixtureContext interface with cleanup function
  - setupFixture() - set up fixture with optional temp copy
  - cleanupFixture() - clean up fixture and index
  - createIndexWithConfig() - create index with specific config
  - createIndexWithCombination() - create index using ConfigCombination
  - deleteIndex() - delete index for a project
  - indexExists() - check if index exists
  - loadQueries() - load query definitions from fixtures
  - listFixtures() - list available fixtures

- ✅ Verified all utilities work correctly:
  - Config generator produces 21 configurations
  - MetricsCollector tracks and aggregates metrics properly
  - Build succeeds without TypeScript errors

## Notes

- Use pairwise/orthogonal approach to reduce 360 combinations to ~22
- Metrics should match what search-comparison-test.md reports
- estimateTokens: chars / 4 (standard approximation)
- Memory tracking via process.memoryUsage().heapUsed

## Blockers

_None_

## Related Tasks

- SMCP-067: Test Fixtures (completed)
- SMCP-069: Config Matrix Tests (uses these utilities)
- SMCP-070: Accuracy Comparison (uses comparisonMetrics)
