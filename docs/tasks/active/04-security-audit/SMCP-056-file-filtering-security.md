---
task_id: "SMCP-056"
title: "File Filtering Security (Deny List + Gitignore)"
category: "Security"
priority: "P2"
status: "not-started"
created_date: "2025-12-10"
estimated_hours: 6
assigned_to: "Team"
tags: ["security", "medium", "gitignore", "filtering"]
---

# Task: File Filtering Security (Deny List + Gitignore)

## Overview

Fix issues with file filtering that could allow sensitive files to be indexed. Issues include gitignore pattern scoping for nested directories, case-sensitive matching on Windows, extension-only binary detection, and Unicode path bypasses.

## Related Vulnerabilities

| # | Issue | Severity | File |
|---|-------|----------|------|
| 6 | Gitignore bypass via nested patterns | CRITICAL | indexPolicy.ts:200-209 |
| 15 | Case-sensitive deny list on Windows | HIGH | indexPolicy.ts:84-85 |
| 16 | Extension-only binary detection | HIGH | indexPolicy.ts:296-298 |
| 23 | Unicode path bypass | MEDIUM | Multiple |

## Goals

- [ ] Fix nested gitignore pattern scoping
- [ ] Add case-insensitive matching for Windows
- [ ] Add content-based binary detection
- [ ] Add Unicode path normalization

## Success Criteria

- Nested gitignore patterns work recursively
- `.ENV` blocked on Windows (case insensitive)
- Renamed binaries detected via content, not just extension
- Unicode tricks don't bypass filtering
- All tests pass

## Subtasks

### Phase 1: Fix Gitignore Pattern Scoping (2 hours)

- [ ] 1.1 Analyze current behavior in `src/engines/indexPolicy.ts`
    - Line 200-209: Understand how nested patterns are prefixed
    - Document expected vs actual behavior

- [ ] 1.2 Fix pattern prefixing
    - Use `**` prefix for recursive matching
    - Example: `secrets/*.key` → `secrets/**/*.key`
    - Test with nested directory structures

- [ ] 1.3 Add test cases
    - Test nested gitignore with deep files
    - Verify patterns match at all depths

### Phase 2: Case-Insensitive Matching (1.5 hours)

- [ ] 2.1 Detect platform and adjust matching
    ```typescript
    const isCaseInsensitiveFS = process.platform === 'win32';
    ```

- [ ] 2.2 Update deny list matching in `src/engines/indexPolicy.ts`
    - Line 84-85: Apply case-insensitive option to minimatch
    - Or: Normalize paths to lowercase before matching

- [ ] 2.3 Add test cases
    - Test `.ENV`, `.Env`, `.env` all blocked on Windows
    - Verify Linux stays case-sensitive

### Phase 3: Content-Based Binary Detection (1.5 hours)

- [ ] 3.1 Add binary content detection
    ```typescript
    async function isBinaryContent(filePath: string): Promise<boolean> {
      const buffer = await fs.promises.readFile(filePath, { length: 8192 });
      // Check for null bytes in first 8KB
      return buffer.includes(0);
    }
    ```

- [ ] 3.2 Update `src/engines/indexPolicy.ts`
    - Line 296-298: Use both extension AND content detection
    - Fall back to content check for unknown extensions

- [ ] 3.3 Add test cases
    - Renamed .exe → .txt detected as binary
    - Text file with .bin extension detected as text

### Phase 4: Unicode Path Normalization (1 hour)

- [ ] 4.1 Add Unicode normalization utility
    ```typescript
    function normalizePathUnicode(p: string): string {
      // Normalize to NFC form
      return p.normalize('NFC')
        // Remove zero-width characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Remove RTL overrides
        .replace(/[\u202A-\u202E]/g, '');
    }
    ```

- [ ] 4.2 Apply normalization before:
    - Deny list matching
    - Gitignore matching
    - Path comparison

- [ ] 4.3 Add test cases
    - RTL override in filename detected
    - Combining characters normalized

## Resources

- Unicode normalization: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
- Minimatch options: https://www.npmjs.com/package/minimatch

## Acceptance Checklist

- [ ] Nested gitignore patterns work
- [ ] Case-insensitive matching on Windows
- [ ] Binary content detection works
- [ ] Unicode normalization applied
- [ ] Tests added for all scenarios
- [ ] All existing tests pass

## Notes

- Content-based binary detection adds I/O overhead - consider caching or only checking unknown extensions
- Unicode normalization should be consistent across the codebase
- Consider logging when Unicode tricks are detected (security monitoring)

## Progress Log

### 2025-12-10

- Task created from security audit
