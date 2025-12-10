---
task_id: "SMCP-011"
title: "Indexing Policy Engine"
category: "Technical"
priority: "P1"
status: "done"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 3
assigned_to: "blakazulu"
tags: ["engines", "policy", "filtering", "security"]
---

# Task: Indexing Policy Engine

## Overview

Implement the file filtering engine that determines which files should be indexed. Enforces hardcoded deny list (security), user config patterns, gitignore rules, and binary file detection. This is critical for security (never indexing secrets) and performance.

## Goals

- [x] Enforce hardcoded deny list (cannot be overridden)
- [x] Apply user include/exclude patterns from config
- [x] Respect .gitignore rules
- [x] Detect and skip binary files
- [x] Enforce file size limits

## Success Criteria

- Hardcoded patterns ALWAYS block (node_modules, .env, etc.)
- User patterns work as documented
- Gitignore parsing handles nested .gitignore files
- Binary detection correctly identifies non-text files
- File size check respects configured limit

## Dependencies

**Blocked by:**

- SMCP-003: Error Handling System
- SMCP-005: Path Utilities
- SMCP-006: Config Manager

**Blocks:**

- SMCP-014: Index Manager
- SMCP-015: File Watcher Engine

**Related:**

- SMCP-006: Config Manager (provides include/exclude patterns)

## Subtasks

### Phase 1: Hardcoded Deny List (0.5 hours)

- [x] 1.1 Define hardcoded patterns
    ```typescript
    const HARDCODED_DENY_PATTERNS = {
      dependencies: [
        'node_modules/**',
        'jspm_packages/**',
        'bower_components/**',
        'vendor/**',
        '.venv/**',
        'venv/**',
      ],
      versionControl: [
        '.git/**',
        '.hg/**',
        '.svn/**',
      ],
      buildArtifacts: [
        'dist/**',
        'build/**',
        'out/**',
        'target/**',
        '__pycache__/**',
        '.next/**',
        '.nuxt/**',
      ],
      secrets: [
        '.env',
        '.env.*',
        '*.pem',
        '*.key',
        '*.p12',
        '*.pfx',
      ],
      logsAndLocks: [
        '*.log',
        '*.lock',
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'Gemfile.lock',
        'poetry.lock',
      ],
      ideConfig: [
        '.idea/**',
        '.vscode/**',
        '.DS_Store',
        '*.swp',
        '*.swo',
      ],
      testing: [
        'coverage/**',
        '.nyc_output/**',
        '.pytest_cache/**',
      ],
    };
    ```

- [x] 1.2 Create combined deny pattern list

### Phase 2: Gitignore Parsing (1 hour)

- [x] 2.1 Implement gitignore loading
    ```typescript
    async function loadGitignore(projectPath: string): Promise<Ignore>
    // Uses 'ignore' npm package
    // Loads .gitignore from project root
    // Handles nested .gitignore files
    ```

- [x] 2.2 Handle nested .gitignore files
    - Scan for .gitignore files in subdirectories
    - Apply rules relative to their location

### Phase 3: Binary Detection (0.5 hours)

- [x] 3.1 Implement binary detection
    ```typescript
    function isBinaryFile(filePath: string): boolean
    // Uses 'is-binary-path' package for extension check
    // Fast check based on file extension
    ```

- [x] 3.2 Define additional binary extensions if needed

### Phase 4: Policy Engine (1.5 hours)

- [x] 4.1 Implement shouldIndex function
    ```typescript
    interface PolicyResult {
      shouldIndex: boolean;
      reason?: string;  // Why it was excluded
    }

    async function shouldIndex(
      relativePath: string,
      absolutePath: string,
      config: Config,
      gitignore: Ignore | null
    ): Promise<PolicyResult>
    ```

- [x] 4.2 Implement priority order
    ```
    1. Hard Deny List     → If matches → SKIP (always)
    2. User Exclude       → If matches config.exclude → SKIP
    3. Gitignore          → If config.respectGitignore && matches → SKIP
    4. Binary Detection   → If is binary file → SKIP
    5. Size Check         → If > config.maxFileSize → SKIP
    6. User Include       → If matches config.include → INDEX
    7. Default            → INDEX
    ```

- [x] 4.3 Implement file size check
    ```typescript
    async function checkFileSize(
      filePath: string,
      maxSize: number
    ): Promise<boolean>
    // Returns true if file is under limit
    ```

### Phase 5: Policy Manager Class (0.25 hours)

- [x] 5.1 Create IndexingPolicy class
    ```typescript
    class IndexingPolicy {
      constructor(projectPath: string, config: Config)
      async initialize(): Promise<void>  // Load gitignore
      shouldIndex(relativePath: string, absolutePath: string): Promise<PolicyResult>
      isHardDenied(relativePath: string): boolean
    }
    ```

### Phase 6: Export & Tests (0.25 hours)

- [x] 6.1 Export from `src/engines/indexPolicy.ts`

- [x] 6.2 Write unit tests
    - Test hardcoded deny patterns
    - Test user include/exclude
    - Test gitignore integration
    - Test binary detection
    - Test file size limits
    - Test priority order

## Resources

- `docs/ENGINEERING.RFC.md` Section 5.2: Indexing Policy Engine
- `docs/PRD.md` Hardcoded Deny List table
- [ignore npm package](https://www.npmjs.com/package/ignore)
- [is-binary-path npm package](https://www.npmjs.com/package/is-binary-path)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Hardcoded patterns cannot be overridden
- [x] User config patterns work correctly
- [x] Gitignore parsing handles nested files
- [x] Binary files are correctly detected
- [x] Unit tests pass with >80% coverage
- [x] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

### 2025-12-09 - 3 hours

- Implemented hardcoded deny patterns (HARDCODED_DENY_PATTERNS) with all categories
- Implemented gitignore loading with nested .gitignore support
- Implemented binary file detection using is-binary-path package
- Implemented shouldIndex function with priority-based filtering
- Implemented file size checking
- Created IndexingPolicy class with initialize(), shouldIndex(), isHardDenied(), reloadGitignore()
- Added minimatch dependency for glob pattern matching
- Exported from src/engines/index.ts
- Wrote comprehensive unit tests (68 tests passing)
- All tests passing, build successful

## Notes

- Security critical: secrets (.env, *.key) must NEVER be indexed
- Hardcoded deny list is intentionally not configurable
- Binary detection by extension is faster than reading file content
- Consider logging skipped files at DEBUG level

## Blockers

_None_

## Related Tasks

- SMCP-014: Index Manager uses policy for file filtering
- SMCP-015: File Watcher uses policy for change events
