---
task_id: "SMCP-060"
title: "Engine Factory & Auto-Detection"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: ""
estimated_hours: 6
actual_hours: 0
assigned_to: "Team"
tags: ["hybrid-search", "fts", "auto-detection", "config"]
---

# Task: Engine Factory & Auto-Detection

## Overview

Create the engine factory that automatically selects the best FTS engine based on codebase size and native module availability. Also update the configuration schema to support user overrides and hybrid search settings.

## Goals

- [ ] Implement engine factory with auto-detection logic
- [ ] Update config schema with hybridSearch settings
- [ ] Support user preference override (auto/js/native)
- [ ] Provide clear feedback about which engine is selected and why

## Success Criteria

- ✅ Auto-detection selects JS for <5,000 files
- ✅ Auto-detection selects Native for >5,000 files (when available)
- ✅ User can override engine selection via config
- ✅ Graceful fallback from native to JS when native unavailable
- ✅ Clear logging of engine selection reason
- ✅ Config migration from v2 to v3 works correctly

## Dependencies

**Blocked by:**

- SMCP-058: FTS Engine Interface & JS Implementation
- SMCP-059: SQLite FTS5 Native Engine

**Blocks:**

- SMCP-061: Integration & Search Tools Update

**Related:**

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md`

## Subtasks

### Phase 1: Config Schema Update (2 hours)

- [ ] 1.1 Update `src/storage/config.ts`
    - Add hybridSearch settings to ProjectConfig interface
    - Bump version to 3
    - Define FTSEnginePreference type: 'auto' | 'js' | 'native'

- [ ] 1.2 Define default configuration
    ```typescript
    hybridSearch: {
      enabled: true,
      ftsEngine: 'auto',
      defaultAlpha: 0.7,
    }
    ```

- [ ] 1.3 Implement config migration
    - Detect v2 configs and upgrade to v3
    - Preserve existing settings
    - Add new hybridSearch defaults

### Phase 2: Engine Factory (3 hours)

- [ ] 2.1 Create `src/engines/ftsEngineFactory.ts`
    - Export createFTSEngine function
    - Export isNativeAvailable function
    - Export FTSEnginePreference type

- [ ] 2.2 Implement auto-detection logic
    ```typescript
    async function createFTSEngine(
      dbPath: string,
      preference: FTSEnginePreference,
      fileCount: number
    ): Promise<EngineSelectionResult>
    ```

- [ ] 2.3 Define selection thresholds
    - FILE_COUNT_THRESHOLD = 5000
    - Document rationale in code comments

- [ ] 2.4 Implement selection reasons
    - "User preference: js"
    - "User preference: native"
    - "User preference: native (unavailable, fell back to js)"
    - "Auto: X files > 5000 threshold, native available"
    - "Auto: X files > 5000 threshold, but native unavailable"
    - "Auto: X files <= 5000 threshold"

### Phase 3: Testing (1 hour)

- [ ] 3.1 Create `tests/engines/ftsEngineFactory.test.ts`
    - Test auto-detection with small file count
    - Test auto-detection with large file count
    - Test user preference override (js)
    - Test user preference override (native)
    - Test fallback when native unavailable
    - Mock isNativeAvailable for testing

- [ ] 3.2 Test config migration
    - Create v2 config, verify upgrade to v3
    - Verify existing settings preserved

## Resources

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md` (lines 940-1025)
- Current config: `src/storage/config.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Unit tests passing
- [ ] Config migration tested
- [ ] No TypeScript errors
- [ ] Changes committed to Git

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on RFC

## Notes

- The 5,000 file threshold is a balance between JS memory usage and native module complexity
- Consider making the threshold configurable in future versions
- Engine selection reason is stored in metadata for debugging

## Blockers

_None currently_

## Related Tasks

- SMCP-058: FTS Engine Interface & JS Implementation
- SMCP-059: SQLite FTS5 Native Engine
- SMCP-061: Integration & Search Tools Update
- SMCP-062: Testing & Documentation
