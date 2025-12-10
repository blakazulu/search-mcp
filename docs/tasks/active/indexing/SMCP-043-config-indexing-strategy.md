---
task_id: "SMCP-043"
title: "Config Schema: Indexing Strategy"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["config", "indexing", "schema"]
---

# Task: Config Schema: Indexing Strategy

## Overview

Add `indexingStrategy` and `lazyIdleThreshold` configuration options to allow users to choose between different indexing behaviors (realtime, lazy, git).

## Goals

- [ ] Add indexingStrategy enum to config schema
- [ ] Add lazyIdleThreshold number field
- [ ] Update DEFAULT_CONFIG with new fields
- [ ] Update generateDefaultConfig with documentation

## Success Criteria

- ✅ Config schema validates `indexingStrategy` as enum: 'realtime' | 'lazy' | 'git'
- ✅ Config schema validates `lazyIdleThreshold` as positive number (default: 30)
- ✅ Existing configs without new fields use defaults (backward compatible)
- ✅ Generated config.json includes documentation for new options

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

- [ ] 1.1 Add to ConfigSchema in `src/storage/config.ts`:
    ```typescript
    indexingStrategy: z.enum(['realtime', 'lazy', 'git']).default('realtime'),
    lazyIdleThreshold: z.number().positive().default(30),
    ```

- [ ] 1.2 Update DEFAULT_CONFIG:
    ```typescript
    indexingStrategy: 'realtime',
    lazyIdleThreshold: 30,
    ```

- [ ] 1.3 Update _availableOptions in generateDefaultConfig:
    ```typescript
    indexingStrategy: 'Indexing strategy: "realtime" (immediate), "lazy" (on idle/search), "git" (on commit)',
    lazyIdleThreshold: 'Seconds of inactivity before lazy indexing triggers (default: 30)',
    ```

### Phase 2: Testing (1 hour)

- [ ] 2.1 Add unit tests for new config fields
- [ ] 2.2 Test backward compatibility (config without new fields)
- [ ] 2.3 Test validation (invalid enum values, negative threshold)

## Resources

- Plan: `/docs/indexing-strategies.md`
- Config implementation: `src/storage/config.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined

## Notes

- Default strategy is 'realtime' for backward compatibility
- lazyIdleThreshold only applies when indexingStrategy is 'lazy'
