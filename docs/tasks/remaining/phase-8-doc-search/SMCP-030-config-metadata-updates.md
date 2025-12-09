---
task_id: "SMCP-030"
title: "Config & Metadata Updates"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1.5
actual_hours: 0
assigned_to: "blakazulu"
tags: ["storage", "config", "metadata", "docs"]
---

# Task: Config & Metadata Updates

## Overview

Update the configuration and metadata schemas to support documentation indexing. Add new config fields for doc patterns and add docs statistics to metadata.

## Goals

- [ ] Add docPatterns field to Config schema
- [ ] Add indexDocs field to Config schema
- [ ] Add docsStats to Metadata schema
- [ ] Add lastDocsIndex timestamp to Metadata

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

- [ ] 1.1 Update `src/storage/config.ts`

- [ ] 1.2 Add docPatterns field
    ```typescript
    docPatterns: z.array(z.string()).default(['**/*.md', '**/*.txt']),
    ```

- [ ] 1.3 Add indexDocs field
    ```typescript
    indexDocs: z.boolean().default(true),
    ```

- [ ] 1.4 Update Config interface
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

- [ ] 1.5 Update DEFAULT_CONFIG
    ```typescript
    export const DEFAULT_CONFIG: Config = {
      // ...existing...
      docPatterns: ['**/*.md', '**/*.txt'],
      indexDocs: true,
    };
    ```

- [ ] 1.6 Update config file template
    - Add docPatterns and indexDocs to generated config.json
    - Add to _availableOptions documentation

### Phase 2: Metadata Schema Updates (0.5 hours)

- [ ] 2.1 Update `src/storage/metadata.ts`

- [ ] 2.2 Add DocsStats interface
    ```typescript
    export interface DocsStats {
      totalDocs: number;
      totalDocChunks: number;
      docsStorageSizeBytes: number;
    }
    ```

- [ ] 2.3 Add DocsStats schema
    ```typescript
    export const DocsStatsSchema = z.object({
      totalDocs: z.number().int().nonnegative(),
      totalDocChunks: z.number().int().nonnegative(),
      docsStorageSizeBytes: z.number().int().nonnegative(),
    });
    ```

- [ ] 2.4 Update Metadata interface
    ```typescript
    export interface Metadata {
      // ...existing...
      docsStats?: DocsStats;
      lastDocsIndex?: string;
    }
    ```

- [ ] 2.5 Update MetadataSchema
    ```typescript
    docsStats: DocsStatsSchema.optional(),
    lastDocsIndex: z.string().datetime().optional(),
    ```

### Phase 3: Tests (0.25 hours)

- [ ] 3.1 Update config tests
    - Test new fields have defaults
    - Test validation of docPatterns array
    - Test indexDocs boolean

- [ ] 3.2 Update metadata tests
    - Test docsStats optional field
    - Test lastDocsIndex optional field

## Resources

- `src/storage/config.ts` - Existing config
- `src/storage/metadata.ts` - Existing metadata
- `docs/ENGINEERING.RFC.md` Section 3.4 & 7.1

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Config schema updated with doc fields
- [ ] Metadata schema updated with docs stats
- [ ] Default values correct
- [ ] Backward compatible
- [ ] Tests pass

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Must be backward compatible - existing configs without doc fields should work
- Optional fields in metadata (docsStats, lastDocsIndex)
- Consider migration for existing indexes

## Blockers

_None yet_

## Related Tasks

- SMCP-006: Config Manager (base)
- SMCP-007: Metadata Manager (base)
- SMCP-028: Docs Index Manager (consumer)
