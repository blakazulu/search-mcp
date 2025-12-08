---
task_id: "SMCP-001"
title: "Project Setup"
category: "Technical"
priority: "P0"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 2
actual_hours: 0
assigned_to: "blakazulu"
tags: ["setup", "foundation", "typescript", "npm"]
---

# Task: Project Setup

## Overview

Initialize the Search MCP project with TypeScript configuration, npm package setup, folder structure, and all required dependencies. This is the foundation task that all other tasks depend on.

## Goals

- [ ] Create package.json with correct metadata and scripts
- [ ] Configure TypeScript with strict settings
- [ ] Set up folder structure per architecture spec
- [ ] Install all runtime and dev dependencies
- [ ] Create entry point files

## Success Criteria

- `npm install` completes without errors
- `npm run build` compiles TypeScript successfully
- `npm run test` runs (even with no tests yet)
- Folder structure matches `docs/ENGINEERING.RFC.md` Appendix A

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

- [ ] 1.1 Create `package.json`
    - Name: `@blakazulu/search-mcp`
    - Version: `1.0.0`
    - Type: `module` (ESM)
    - Main: `dist/index.js`
    - Bin: `dist/index.js`
    - Scripts: build, test, lint, dev
    - Engine: Node >= 18

- [ ] 1.2 Add runtime dependencies
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

- [ ] 1.3 Add dev dependencies
    ```json
    {
      "typescript": "^5.3.0",
      "vitest": "^1.0.0",
      "@types/node": "^20.0.0",
      "@types/uuid": "^9.0.0"
    }
    ```

### Phase 2: TypeScript Configuration (0.5 hours)

- [ ] 2.1 Create `tsconfig.json`
    - Target: ES2022
    - Module: NodeNext
    - ModuleResolution: NodeNext
    - Strict: true
    - OutDir: dist
    - RootDir: src
    - Declaration: true

- [ ] 2.2 Verify compiler settings work with ESM

### Phase 3: Folder Structure (0.5 hours)

- [ ] 3.1 Create source directories
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

- [ ] 3.2 Create placeholder index files in each directory

- [ ] 3.3 Create tests directory
    ```
    tests/
    ├── unit/
    ├── integration/
    └── e2e/
    ```

### Phase 4: Build Verification (0.5 hours)

- [ ] 4.1 Run `npm install` - verify no errors
- [ ] 4.2 Run `npm run build` - verify compilation
- [ ] 4.3 Run `npm run test` - verify test runner works
- [ ] 4.4 Verify `dist/` output structure

## Resources

- `docs/ENGINEERING.RFC.md` Section 8: Dependencies
- `docs/ENGINEERING.RFC.md` Appendix A: Directory Structure
- [MCP SDK Documentation](https://modelcontextprotocol.io/)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] `npm install` works
- [ ] `npm run build` produces `dist/` output
- [ ] `npm run test` executes without config errors
- [ ] Folder structure matches RFC spec
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Use ESM (`"type": "module"`) for modern Node.js compatibility
- MCP SDK requires specific import patterns
- Xenova transformers auto-downloads model on first use (~90MB)
- LanceDB (`vectordb` package) may have platform-specific binaries

## Blockers

_None yet_

## Related Tasks

- All Phase 1-7 tasks depend on this setup
