---
task_id: "SMCP-006"
title: "Config Manager"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 3
actual_hours: 2
assigned_to: "blakazulu"
tags: ["storage", "configuration", "zod"]
---

# Task: Config Manager

## Overview

Implement configuration management for project-level settings. Handles loading, validating, and providing defaults for index configuration. Auto-generates config.json on first index with documented options.

## Goals

- [x] Create config schema with Zod validation
- [x] Implement config loading with defaults
- [x] Auto-generate config.json with comments
- [x] Provide typed config access

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

- [x] 1.1 Define config schema with Zod
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

- [x] 1.2 Implement maxFileSize parser
    ```typescript
    function parseFileSize(size: string): number
    // Converts "1MB" -> 1048576, "500KB" -> 512000
    ```

- [x] 1.3 Define default config constant

### Phase 2: Config I/O (1 hour)

- [x] 2.1 Implement config loading
    ```typescript
    async function loadConfig(indexPath: string): Promise<Config>
    // Loads from indexPath/config.json
    // Falls back to defaults if missing or invalid
    // Logs warning on validation errors
    ```

- [x] 2.2 Implement config saving
    ```typescript
    async function saveConfig(indexPath: string, config: Config): Promise<void>
    // Saves config.json with pretty formatting
    ```

- [x] 2.3 Implement config generation with comments
    ```typescript
    async function generateDefaultConfig(indexPath: string): Promise<void>
    // Creates config.json with _comment fields
    // Includes _hardcodedExcludes documentation
    // Includes _availableOptions documentation
    ```

### Phase 3: Config Manager Class (0.5 hours)

- [x] 3.1 Create ConfigManager class
    ```typescript
    class ConfigManager {
      constructor(indexPath: string)
      async load(): Promise<Config>
      async save(config: Config): Promise<void>
      async ensureExists(): Promise<void>
      getConfig(): Config  // Cached access
    }
    ```

- [x] 3.2 Implement caching with reload support

### Phase 4: Export & Tests (0.5 hours)

- [x] 4.1 Export from `src/storage/config.ts`

- [x] 4.2 Write unit tests
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

- [x] All subtasks completed
- [x] Config schema matches RFC specification
- [x] Invalid config falls back gracefully
- [x] Generated config includes documentation comments
- [x] Unit tests pass (49 tests)
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 2 hours

- Implemented complete Config Manager in `src/storage/config.ts`
- Created comprehensive test suite with 49 tests in `tests/unit/storage/config.test.ts`
- Updated `src/storage/index.ts` to export all config module exports
- All tests passing, build successful

## Implementation Details

### Files Created/Modified

1. **`src/storage/config.ts`** - Main implementation
   - `parseFileSize()` - Converts "1MB" to bytes
   - `formatFileSize()` - Converts bytes to "1MB" format
   - `ConfigSchema` - Zod schema with validation
   - `Config` type - TypeScript type from schema
   - `DEFAULT_CONFIG` - Default configuration values
   - `HARDCODED_EXCLUDES` - Cannot be overridden exclusions
   - `loadConfig()` - Load with fallback to defaults
   - `saveConfig()` - Save with pretty formatting
   - `generateDefaultConfig()` - Create documented config file
   - `ConfigManager` class - Full config management with caching

2. **`src/storage/index.ts`** - Updated exports

3. **`tests/unit/storage/config.test.ts`** - 49 unit tests covering:
   - File size parsing (KB, MB, case-insensitive)
   - Schema validation (valid, invalid, partial configs)
   - Default config values
   - Hardcoded excludes
   - Config loading (existing, missing, invalid JSON, invalid values)
   - Config saving (with documentation preservation)
   - Config generation (with _comment, _hardcodedExcludes, _availableOptions)
   - ConfigManager class (load, save, ensureExists, getConfig, reloadIfChanged)

### Key Features

- **Zod validation**: Full schema validation with meaningful error messages
- **Graceful fallback**: Invalid configs fall back to defaults with warning logs
- **Documentation**: Generated configs include helpful comments and option descriptions
- **Caching**: ConfigManager caches loaded config with reload detection
- **Type safety**: Full TypeScript types inferred from Zod schema

## Notes

- Config file includes `_comment`, `_hardcodedExcludes`, `_availableOptions` as documentation
- These underscore-prefixed fields are ignored during validation
- Consider watching config file for changes (future enhancement)
- File size units: KB and MB only (no GB needed for file size limits)

## Blockers

_None_

## Related Tasks

- SMCP-011: Indexing Policy uses config for include/exclude patterns
- SMCP-014: Index Manager uses config during indexing
