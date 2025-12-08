---
task_id: "SMCP-006"
title: "Config Manager"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "blakazulu"
tags: ["storage", "configuration", "zod"]
---

# Task: Config Manager

## Overview

Implement configuration management for project-level settings. Handles loading, validating, and providing defaults for index configuration. Auto-generates config.json on first index with documented options.

## Goals

- [ ] Create config schema with Zod validation
- [ ] Implement config loading with defaults
- [ ] Auto-generate config.json with comments
- [ ] Provide typed config access

## Success Criteria

- Config validates against Zod schema
- Invalid config falls back to defaults with warning
- Auto-generated config includes helpful comments
- Config changes are detected on reload

## Dependencies

**Blocked by:**

- SMCP-003: Error Handling System
- SMCP-005: Path Utilities

**Blocks:**

- SMCP-011: Indexing Policy Engine
- SMCP-014: Index Manager

**Related:**

- SMCP-007: Metadata Manager (similar pattern)

## Subtasks

### Phase 1: Schema Definition (1 hour)

- [ ] 1.1 Define config schema with Zod
    ```typescript
    const ConfigSchema = z.object({
      include: z.array(z.string()).default(['**/*']),
      exclude: z.array(z.string()).default([]),
      respectGitignore: z.boolean().default(true),
      maxFileSize: z.string().regex(/^\d+(KB|MB)$/).default('1MB'),
      maxFiles: z.number().positive().default(50000),
    });

    type Config = z.infer<typeof ConfigSchema>;
    ```

- [ ] 1.2 Implement maxFileSize parser
    ```typescript
    function parseFileSize(size: string): number
    // Converts "1MB" -> 1048576, "500KB" -> 512000
    ```

- [ ] 1.3 Define default config constant

### Phase 2: Config I/O (1 hour)

- [ ] 2.1 Implement config loading
    ```typescript
    async function loadConfig(indexPath: string): Promise<Config>
    // Loads from indexPath/config.json
    // Falls back to defaults if missing or invalid
    // Logs warning on validation errors
    ```

- [ ] 2.2 Implement config saving
    ```typescript
    async function saveConfig(indexPath: string, config: Config): Promise<void>
    // Saves config.json with pretty formatting
    ```

- [ ] 2.3 Implement config generation with comments
    ```typescript
    async function generateDefaultConfig(indexPath: string): Promise<void>
    // Creates config.json with _comment fields
    // Includes _hardcodedExcludes documentation
    // Includes _availableOptions documentation
    ```

### Phase 3: Config Manager Class (0.5 hours)

- [ ] 3.1 Create ConfigManager class
    ```typescript
    class ConfigManager {
      constructor(indexPath: string)
      async load(): Promise<Config>
      async save(config: Config): Promise<void>
      async ensureExists(): Promise<void>
      getConfig(): Config  // Cached access
    }
    ```

- [ ] 3.2 Implement caching with reload support

### Phase 4: Export & Tests (0.5 hours)

- [ ] 4.1 Export from `src/storage/config.ts`

- [ ] 4.2 Write unit tests
    - Test schema validation
    - Test default fallback
    - Test file size parsing
    - Test config generation
    - Test invalid config handling

## Resources

- `docs/ENGINEERING.RFC.md` Section 7: Configuration
- `docs/ENGINEERING.RFC.md` Section 7.1: Auto-Generated Config
- `docs/PRD.md` Section 5.4: Configuration

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Config schema matches RFC specification
- [ ] Invalid config falls back gracefully
- [ ] Generated config includes documentation comments
- [ ] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Config file includes `_comment`, `_hardcodedExcludes`, `_availableOptions` as documentation
- These underscore-prefixed fields are ignored during validation
- Consider watching config file for changes (future enhancement)
- File size units: KB and MB only (no GB needed for file size limits)

## Blockers

_None yet_

## Related Tasks

- SMCP-011: Indexing Policy uses config for include/exclude patterns
- SMCP-014: Index Manager uses config during indexing
