---
task_id: "SMCP-001"
title: "Project Setup"
category: "Technical"
priority: "P0"
status: "completed"
created_date: "2025-12-09"
completed_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 1
assigned_to: "blakazulu"
tags: ["setup", "foundation", "typescript", "npm"]
---

# Task: Project Setup

## Overview

Initialize the Search MCP project with TypeScript configuration, npm package setup, folder structure, and all required dependencies. This is the foundation task that all other tasks depend on.

## Goals

- [x] Create package.json with correct metadata and scripts
- [x] Configure TypeScript with strict settings
- [x] Set up folder structure per architecture spec
- [x] Install all runtime and dev dependencies
- [x] Create entry point files

## Success Criteria

- [x] `npm install` completes without errors
- [x] `npm run build` compiles TypeScript successfully
- [x] `npm run test` runs (even with no tests yet)
- [x] Folder structure matches `docs/ENGINEERING.RFC.md` Appendix A

## Dependencies

**Blocked by:**

- None (this is the first task)

**Blocks:**

- SMCP-002: Logger Module
- SMCP-003: Error Handling System
- SMCP-004: Hash Utilities
- SMCP-005: Path Utilities
- All subsequent tasks

**Related:**

- None

## Subtasks

### Phase 1: Package Configuration (0.5 hours)

- [x] 1.1 Create `package.json`
    - Name: `@blakazulu/search-mcp`
    - Version: `1.0.0`
    - Type: `module` (ESM)
    - Main: `dist/index.js`
    - Bin: `dist/index.js`
    - Scripts: build, test, lint, dev
    - Engine: Node >= 18

- [x] 1.2 Add runtime dependencies
    ```json
    {
      "@modelcontextprotocol/sdk": "^1.5.0",
      "@xenova/transformers": "^2.17.0",
      "vectordb": "^0.4.0",
      "chokidar": "^3.5.0",
      "glob": "^10.0.0",
      "ignore": "^5.3.0",
      "is-binary-path": "^2.1.0",
      "uuid": "^9.0.0",
      "zod": "^3.22.0"
    }
    ```

- [x] 1.3 Add dev dependencies
    ```json
    {
      "typescript": "^5.3.0",
      "vitest": "^1.0.0",
      "@types/node": "^20.0.0",
      "@types/uuid": "^9.0.0"
    }
    ```

### Phase 2: TypeScript Configuration (0.5 hours)

- [x] 2.1 Create `tsconfig.json`
    - Target: ES2022
    - Module: NodeNext
    - ModuleResolution: NodeNext
    - Strict: true
    - OutDir: dist
    - RootDir: src
    - Declaration: true

- [x] 2.2 Verify compiler settings work with ESM

### Phase 3: Folder Structure (0.5 hours)

- [x] 3.1 Create source directories
    ```
    src/
    ├── index.ts           # Entry point (empty export)
    ├── server.ts          # MCP server (placeholder)
    ├── tools/             # MCP tool handlers
    ├── engines/           # Core processing logic
    ├── storage/           # Persistence layer
    ├── errors/            # Error definitions
    └── utils/             # Utility modules
    ```

- [x] 3.2 Create placeholder index files in each directory

- [x] 3.3 Create tests directory
    ```
    tests/
    ├── unit/
    ├── integration/
    └── e2e/
    ```

### Phase 4: Build Verification (0.5 hours)

- [x] 4.1 Run `npm install` - verify no errors
- [x] 4.2 Run `npm run build` - verify compilation
- [x] 4.3 Run `npm run test` - verify test runner works
- [x] 4.4 Verify `dist/` output structure

## Resources

- `docs/ENGINEERING.RFC.md` Section 8: Dependencies
- `docs/ENGINEERING.RFC.md` Appendix A: Directory Structure
- [MCP SDK Documentation](https://modelcontextprotocol.io/)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] `npm install` works
- [x] `npm run build` produces `dist/` output
- [x] `npm run test` executes without config errors
- [x] Folder structure matches RFC spec
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 1 hour

- Created package.json with all metadata, scripts, and dependencies
- Created tsconfig.json with strict TypeScript configuration
- Created source directory structure (src/tools, src/engines, src/storage, src/errors, src/utils)
- Created placeholder index.ts files in all directories
- Created tests directory structure (tests/unit, tests/integration, tests/e2e)
- Created vitest.config.ts for test configuration
- Created initial test file (tests/unit/setup.test.ts)
- Ran npm install - 328 packages installed successfully
- Ran npm run build - TypeScript compilation successful
- Ran npm run test - 2 tests passed
- Verified dist/ output structure matches source structure

## Notes

- Use ESM (`"type": "module"`) for modern Node.js compatibility
- MCP SDK requires specific import patterns
- Xenova transformers auto-downloads model on first use (~90MB)
- LanceDB (`vectordb` package) may have platform-specific binaries
- **Note:** npm warns that `vectordb` is deprecated and suggests using `@lancedb/lancedb` instead. Consider upgrading in a future task.
- Added vitest.config.ts for proper test configuration
- Added sample test file to verify test runner works

## Blockers

_None_

## Related Tasks

- All Phase 1-7 tasks depend on this setup
