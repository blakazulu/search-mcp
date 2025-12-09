---
task_id: "SMCP-033"
title: "Enhanced Tool Descriptions"
category: "Technical"
priority: "P2"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1.5
actual_hours: 1.5
assigned_to: "blakazulu"
tags: ["tools", "config", "ai-hints"]
---

# Task: Enhanced Tool Descriptions

## Overview

Implement the `enhancedToolDescriptions` config option that adds AI guidance hints to tool descriptions. When enabled, tool descriptions include tips that help the AI make smarter decisions about when to use search vs. reading from context.

## Goals

- [x] Add `enhancedToolDescriptions` to config schema
- [x] Implement dynamic tool description generation
- [x] Add hints for `search_code` and `search_docs` tools
- [x] Default to `false` (opt-in feature)

## Success Criteria

- Config option correctly parsed and validated
- Tool descriptions change based on config value
- Default behavior unchanged (standard descriptions)
- Enhanced descriptions include actionable AI hints

## Dependencies

**Blocked by:**

- SMCP-006: Config Manager
- SMCP-029: search_docs Tool

**Blocks:**

- None

**Related:**

- SMCP-017: search_code Tool
- SMCP-029: search_docs Tool

## Subtasks

### Phase 1: Config Schema Update (0.25 hours)

- [x] 1.1 Add to config interface
    ```typescript
    interface ProjectConfig {
      // ... existing fields
      enhancedToolDescriptions: boolean;  // default: false
    }
    ```

- [x] 1.2 Add to config defaults
    ```typescript
    const DEFAULT_CONFIG: ProjectConfig = {
      // ... existing defaults
      enhancedToolDescriptions: false,
    };
    ```

- [x] 1.3 Add validation
    - Validate as boolean
    - Default to `false` if missing or invalid

### Phase 2: Tool Description Constants (0.5 hours)

- [x] 2.1 Define standard descriptions
    ```typescript
    const STANDARD_DESCRIPTIONS = {
      search_code: 'Search your codebase for relevant code using natural language',
      search_docs: 'Search documentation files (.md, .txt)',
      search_by_path: 'Find files by name or glob pattern',
      // ... other tools
    };
    ```

- [x] 2.2 Define enhanced hints
    ```typescript
    const ENHANCED_HINTS = {
      search_code: ' TIP: Prefer this over reading full files when looking for specific functions, patterns, or implementations.',
      search_docs: ' TIP: For follow-up questions about a doc already in context, use this tool instead of re-reading the entire file - more precise results, less context usage.',
      // Only search tools get hints - others unchanged
    };
    ```

### Phase 3: Dynamic Description Generation (0.5 hours)

- [x] 3.1 Implement description getter
    ```typescript
    export function getToolDescription(
      toolName: string,
      enhanced: boolean
    ): string {
      const base = STANDARD_DESCRIPTIONS[toolName];
      if (!enhanced || !ENHANCED_HINTS[toolName]) {
        return base;
      }
      return base + ENHANCED_HINTS[toolName];
    }
    ```

- [x] 3.2 Update tool registration
    - Created `createSearchCodeTool(enhanced)` factory function
    - Created `createSearchDocsTool(enhanced)` factory function
    - Default exports use `enhanced=false`

### Phase 4: Tests (0.25 hours)

- [x] 4.1 Test config parsing
    - Test with `enhancedToolDescriptions: true`
    - Test with `enhancedToolDescriptions: false`
    - Test with missing field (should default to false)

- [x] 4.2 Test description generation
    - Test standard descriptions returned when disabled
    - Test enhanced descriptions returned when enabled
    - Test tools without hints return standard description

## Resources

- `docs/ENGINEERING.RFC.md` Section 4.8: Enhanced Tool Descriptions
- `docs/PRD.md` Section 5.5: Configuration

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Config option works correctly
- [x] Enhanced descriptions include helpful hints
- [x] Default is `false` (opt-in)
- [x] Tests pass (1273 tests)
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1.5 hours

- Added `enhancedToolDescriptions` to ConfigSchema (default: false)
- Created `src/tools/toolDescriptions.ts` with STANDARD_DESCRIPTIONS and ENHANCED_HINTS
- Implemented `getToolDescription(toolName, enhanced)` function
- Added helper functions: hasEnhancedHint(), getToolNames(), getEnhancedToolNames()
- Created `createSearchCodeTool(enhanced)` factory in searchCode.ts
- Created `createSearchDocsTool(enhanced)` factory in searchDocs.ts
- Updated exports in tools/index.ts
- Created comprehensive tests for tool descriptions
- Updated config tests for new field
- All 1273 tests passing

## Notes

- This is an opt-in feature to avoid unexpected behavior changes
- Only `search_code` and `search_docs` get enhanced hints initially
- Hints should be concise but actionable
- Future: Could add hints to other tools if useful

## Blockers

_None_

## Related Tasks

- SMCP-006: Config Manager provides config loading
- SMCP-017: search_code Tool receives enhanced description
- SMCP-029: search_docs Tool receives enhanced description
