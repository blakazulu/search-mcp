---
task_id: "SMCP-030"
title: "Config & Metadata Updates"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1.5
actual_hours: 1
assigned_to: "blakazulu"
tags: ["storage", "config", "metadata", "docs"]
---

# Task: Config & Metadata Updates

## Overview

Update the configuration and metadata schemas to support documentation indexing. Add new config fields for doc patterns and add docs statistics to metadata.

## Goals

- [x] Add docPatterns field to Config schema
- [x] Add indexDocs field to Config schema
- [x] Add docsStats to Metadata schema
- [x] Add lastDocsIndex timestamp to Metadata

## Success Criteria

- Config schema includes doc-specific fields
- Metadata includes doc statistics
- Default values match ENGINEERING.RFC.md
- Validation works for new fields
- Backward compatible with existing configs

## Dependencies

**Blocked by:**

- SMCP-006: Config Manager (completed)
- SMCP-007: Metadata Manager (completed)

**Blocks:**

- SMCP-028: Docs Index Manager

**Related:**

- SMCP-006: Config Manager
- SMCP-007: Metadata Manager

## Subtasks

### Phase 1: Config Schema Updates (0.75 hours)

- [x] 1.1 Update `src/storage/config.ts`

- [x] 1.2 Add docPatterns field
    ```typescript
    docPatterns: z.array(z.string()).default(['**/*.md', '**/*.txt']),
    ```

- [x] 1.3 Add indexDocs field
    ```typescript
    indexDocs: z.boolean().default(true),
    ```

- [x] 1.4 Update Config interface
    ```typescript
    export interface Config {
      include: string[];
      exclude: string[];
      respectGitignore: boolean;
      maxFileSize: string;
      maxFiles: number;
      docPatterns: string[];  // NEW
      indexDocs: boolean;     // NEW
    }
    ```

- [x] 1.5 Update DEFAULT_CONFIG
    ```typescript
    export const DEFAULT_CONFIG: Config = {
      // ...existing...
      docPatterns: ['**/*.md', '**/*.txt'],
      indexDocs: true,
    };
    ```

- [x] 1.6 Update config file template
    - Add docPatterns and indexDocs to generated config.json
    - Add to _availableOptions documentation

### Phase 2: Metadata Schema Updates (0.5 hours)

- [x] 2.1 Update `src/storage/metadata.ts`

- [x] 2.2 Add DocsStats interface
    ```typescript
    export interface DocsStats {
      totalDocs: number;
      totalDocChunks: number;
      docsStorageSizeBytes: number;
    }
    ```

- [x] 2.3 Add DocsStats schema
    ```typescript
    export const DocsStatsSchema = z.object({
      totalDocs: z.number().int().nonnegative(),
      totalDocChunks: z.number().int().nonnegative(),
      docsStorageSizeBytes: z.number().int().nonnegative(),
    });
    ```

- [x] 2.4 Update Metadata interface
    ```typescript
    export interface Metadata {
      // ...existing...
      docsStats?: DocsStats;
      lastDocsIndex?: string;
    }
    ```

- [x] 2.5 Update MetadataSchema
    ```typescript
    docsStats: DocsStatsSchema.optional(),
    lastDocsIndex: z.string().datetime().optional(),
    ```

### Phase 3: Tests (0.25 hours)

- [x] 3.1 Update config tests
    - Test new fields have defaults
    - Test validation of docPatterns array
    - Test indexDocs boolean

- [x] 3.2 Update metadata tests
    - Test docsStats optional field
    - Test lastDocsIndex optional field

## Resources

- `src/storage/config.ts` - Existing config
- `src/storage/metadata.ts` - Existing metadata
- `docs/ENGINEERING.RFC.md` Section 3.4 & 7.1

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Config schema updated with doc fields
- [x] Metadata schema updated with docs stats
- [x] Default values correct
- [x] Backward compatible
- [x] Tests pass

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1 hour

- Added docPatterns and indexDocs fields to ConfigSchema
- Updated DEFAULT_CONFIG with new fields
- Updated generateDefaultConfig to include new fields in _availableOptions
- Added DocsStatsSchema to metadata.ts
- Updated MetadataSchema with docsStats (optional) and lastDocsIndex (optional)
- Added DocsStats type export
- Added updateDocsStats(), markDocsIndex(), and getDocsStats() methods to MetadataManager
- Updated config tests for new fields (57 tests pass)
- Updated metadata tests for new fields (88 tests pass)
- All 1219 tests pass
- Build succeeds with no errors

## Notes

- Must be backward compatible - existing configs without doc fields should work
- Optional fields in metadata (docsStats, lastDocsIndex)
- Consider migration for existing indexes

## Blockers

_None_

## Related Tasks

- SMCP-006: Config Manager (base)
- SMCP-007: Metadata Manager (base)
- SMCP-028: Docs Index Manager (consumer)
