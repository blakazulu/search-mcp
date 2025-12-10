---
task_id: "SMCP-043"
title: "Config Schema: Indexing Strategy"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-10"
completed_date: "2025-12-10"
due_date: ""
estimated_hours: 2
actual_hours: 1
assigned_to: "blakazulu"
tags: ["config", "indexing", "schema"]
---

# Task: Config Schema: Indexing Strategy

## Overview

Add `indexingStrategy` and `lazyIdleThreshold` configuration options to allow users to choose between different indexing behaviors (realtime, lazy, git).

## Goals

- [x] Add indexingStrategy enum to config schema
- [x] Add lazyIdleThreshold number field
- [x] Update DEFAULT_CONFIG with new fields
- [x] Update generateDefaultConfig with documentation

## Success Criteria

- [x] Config schema validates `indexingStrategy` as enum: 'realtime' | 'lazy' | 'git'
- [x] Config schema validates `lazyIdleThreshold` as positive number (default: 30)
- [x] Existing configs without new fields use defaults (backward compatible)
- [x] Generated config.json includes documentation for new options

## Dependencies

**Blocked by:**

- None (first task in chain)

**Blocks:**

- SMCP-044: Dirty Files Manager
- SMCP-045: Strategy Interface
- SMCP-049: Strategy Orchestrator

**Related:**

- SMCP-006: Config Manager (original implementation)

## Subtasks

### Phase 1: Schema Changes (1 hour)

- [x] 1.1 Add to ConfigSchema in `src/storage/config.ts`:
    ```typescript
    indexingStrategy: z.enum(['realtime', 'lazy', 'git']).default('realtime'),
    lazyIdleThreshold: z.number().positive().default(30),
    ```

- [x] 1.2 Update DEFAULT_CONFIG:
    ```typescript
    indexingStrategy: 'realtime',
    lazyIdleThreshold: 30,
    ```

- [x] 1.3 Update _availableOptions in generateDefaultConfig:
    ```typescript
    indexingStrategy: 'Indexing strategy: "realtime" (immediate), "lazy" (on idle/search), "git" (on commit)',
    lazyIdleThreshold: 'Seconds of inactivity before lazy indexing triggers (default: 30)',
    ```

### Phase 2: Testing (1 hour)

- [x] 2.1 Add unit tests for new config fields
- [x] 2.2 Test backward compatibility (config without new fields)
- [x] 2.3 Test validation (invalid enum values, negative threshold)

## Resources

- Plan: `/docs/indexing-strategies.md`
- Config implementation: `src/storage/config.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (if applicable)
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [x] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- Task created
- Subtasks defined

### 2025-12-10 - 1 hour (completed)

- Added `indexingStrategy` enum field to ConfigSchema ('realtime' | 'lazy' | 'git') with default 'realtime'
- Added `lazyIdleThreshold` positive number field to ConfigSchema with default 30
- Updated DEFAULT_CONFIG with new fields
- Updated _availableOptions in generateDefaultConfig with documentation for new options
- Added comprehensive unit tests:
  - Schema validation for valid indexingStrategy values (realtime, lazy, git)
  - Schema rejection of invalid indexingStrategy values
  - Schema validation for positive lazyIdleThreshold
  - Schema rejection of zero/negative/non-number lazyIdleThreshold
  - DEFAULT_CONFIG tests for new fields
  - Backward compatibility test for old configs without new fields
  - Generated config tests for new fields and documentation
- All 1530 tests pass
- Build succeeds

## Notes

- Default strategy is 'realtime' for backward compatibility
- lazyIdleThreshold only applies when indexingStrategy is 'lazy'

## Files Modified

- `src/storage/config.ts` - Added schema fields, defaults, and documentation
- `tests/unit/storage/config.test.ts` - Added 10 new test cases
