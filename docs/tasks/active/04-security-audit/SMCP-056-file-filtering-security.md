---
task_id: "SMCP-056"
title: "File Filtering Security (Deny List + Gitignore)"
category: "Security"
priority: "P2"
status: "completed"
created_date: "2025-12-10"
completed_date: "2025-12-10"
estimated_hours: 6
actual_hours: 4
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

- [x] Fix nested gitignore pattern scoping
- [x] Add case-insensitive matching for Windows
- [x] Add content-based binary detection
- [x] Add Unicode path normalization

## Success Criteria

- [x] Nested gitignore patterns work recursively
- [x] `.ENV` blocked on Windows (case insensitive)
- [x] Renamed binaries detected via content, not just extension
- [x] Unicode tricks don't bypass filtering
- [x] All tests pass (93 tests in indexPolicy.test.ts)

## Subtasks

### Phase 1: Fix Gitignore Pattern Scoping (2 hours) - COMPLETED

- [x] 1.1 Analyze current behavior in `src/engines/indexPolicy.ts`
    - Line 200-209: Understood how nested patterns are prefixed
    - Issue: Patterns like `secrets/*.key` only matched direct children, not `secrets/deep/*.key`

- [x] 1.2 Fix pattern prefixing
    - Updated `loadGitignoreFile` function to add both direct and recursive patterns
    - Example: `secrets/*.key` now generates both `secrets/*.key` and `secrets/**/*.key`
    - Handles negation patterns, anchored patterns, and already-recursive patterns

- [x] 1.3 Add test cases
    - Added `Nested Gitignore Pattern Scoping (Security)` test suite
    - Tests recursive matching, multiple nested gitignores, wildcard patterns, negation patterns

### Phase 2: Case-Insensitive Matching (1.5 hours) - COMPLETED

- [x] 2.1 Detect platform and adjust matching
    - Added `IS_CASE_INSENSITIVE_FS = process.platform === 'win32'` constant

- [x] 2.2 Update deny list matching in `src/engines/indexPolicy.ts`
    - Updated `matchesAnyPattern` to accept `caseInsensitive` parameter
    - `isHardDenied` now uses case-insensitive matching on Windows via minimatch `nocase` option

- [x] 2.3 Add test cases
    - Added `Case-Insensitive Matching (Security)` test suite
    - Tests `.ENV`, `.Env`, `.eNv`, `NODE_MODULES` all blocked on Windows

### Phase 3: Content-Based Binary Detection (1.5 hours) - COMPLETED

- [x] 3.1 Add binary content detection
    - Implemented `isBinaryContent(absolutePath, maxBytesToCheck)` function
    - Checks for null bytes in first 8KB of file
    - Handles file read errors gracefully

- [x] 3.2 Update `src/engines/indexPolicy.ts`
    - Added `KNOWN_TEXT_EXTENSIONS` set for fast extension lookup
    - `shouldIndex` now performs content-based check for unknown extensions
    - Added `isBinaryFileOrContent` for comprehensive binary detection

- [x] 3.3 Add test cases
    - Added `Content-Based Binary Detection (Security)` test suite
    - Tests renamed exe detection, text with unknown extension, empty files

### Phase 4: Unicode Path Normalization (1 hour) - COMPLETED

- [x] 4.1 Add Unicode normalization utility
    - Implemented `normalizePathUnicode(p)` function
    - Normalizes to NFC form
    - Removes zero-width characters (U+200B-U+200D, U+FEFF)
    - Removes RTL/LTR override characters (U+202A-U+202E)
    - Logs warnings when bypass attempts are detected

- [x] 4.2 Apply normalization before:
    - Deny list matching (in `matchesAnyPattern`)
    - Gitignore matching (in `shouldIndex`)
    - All path comparisons in the policy function

- [x] 4.3 Add test cases
    - Added `Unicode Path Normalization (Security)` test suite
    - Tests NFC/NFD normalization, zero-width character removal, RTL override removal
    - Tests combined attack scenarios

## Resources

- Unicode normalization: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
- Minimatch options: https://www.npmjs.com/package/minimatch

## Acceptance Checklist

- [x] Nested gitignore patterns work
- [x] Case-insensitive matching on Windows
- [x] Binary content detection works
- [x] Unicode normalization applied
- [x] Tests added for all scenarios
- [x] All existing tests pass

## Notes

- Content-based binary detection adds I/O overhead - implemented optimization to only check unknown extensions
- Unicode normalization is consistent across matchesAnyPattern and shouldIndex
- Logging implemented when Unicode tricks are detected (security monitoring via logger.warn)

## Progress Log

### 2025-12-10

- Task created from security audit
- Implemented all four security phases:
  1. Fixed gitignore pattern scoping for nested directories
  2. Added case-insensitive deny list matching for Windows
  3. Added content-based binary detection for unknown extensions
  4. Added Unicode path normalization with security logging
- Added 50+ new security test cases
- All 93 indexPolicy tests pass
- Build passes successfully
