---
task_id: "SMCP-097"
title: "Multi-Language Code Chunking"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 16
actual_hours: 0
assigned_to: "Team"
tags: ["chunking", "languages", "code-aware", "quality"]
---

# Task: Multi-Language Code Chunking

## Overview

Extend code-aware chunking to support additional programming languages beyond TypeScript/JavaScript and Python. Currently we only have heuristic-based chunking for 2 languages; this task adds support for 20+ languages.

## Current State

```typescript
// Current: Only TS/JS and Python
const CODE_AWARE_LANGUAGES = ['typescript', 'javascript', 'python'];

// Heuristic patterns for function/class detection
const PATTERNS = {
    typescript: /^(export\s+)?(async\s+)?function\s+\w+/,
    python: /^(async\s+)?def\s+\w+/,
};
```

## Target Solution

```typescript
// After: 20+ languages with proper patterns
const LANGUAGE_PATTERNS: Record<string, LanguageConfig> = {
    // Existing
    typescript: { /* ... */ },
    javascript: { /* ... */ },
    python: { /* ... */ },

    // New - C-family
    java: {
        extensions: ['.java'],
        patterns: {
            class: /^(public|private|protected)?\s*(abstract|final)?\s*class\s+\w+/,
            method: /^(public|private|protected)?\s*(static)?\s*\w+\s+\w+\s*\(/,
            interface: /^(public)?\s*interface\s+\w+/,
        },
        separators: ['\n\n', '\n', ' '],
    },
    go: {
        extensions: ['.go'],
        patterns: {
            function: /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/,
            struct: /^type\s+\w+\s+struct\s*\{/,
            interface: /^type\s+\w+\s+interface\s*\{/,
        },
    },
    rust: {
        extensions: ['.rs'],
        patterns: {
            function: /^(pub\s+)?(async\s+)?fn\s+\w+/,
            struct: /^(pub\s+)?struct\s+\w+/,
            impl: /^impl(\s+<[^>]+>)?\s+\w+/,
            trait: /^(pub\s+)?trait\s+\w+/,
        },
    },
    // ... 17 more languages
};
```

## Goals

- [ ] Add chunking patterns for 20+ languages
- [ ] Maintain semantic boundaries (functions, classes, etc.)
- [ ] Auto-detect language from file extension
- [ ] Fallback to generic chunking for unknown languages
- [ ] No performance regression

## Success Criteria

- All 20+ target languages supported
- Chunks respect semantic boundaries
- Extension-to-language mapping works correctly
- Test coverage for each language
- Chunking performance unchanged

## Dependencies

**Related:**

- SMCP-086: AST-Based Chunking (superior approach, this is interim)

## Implementation Details

### Target Languages (20)

**Tier 1 - High Priority:**
1. Java (.java)
2. Go (.go)
3. Rust (.rs)
4. C# (.cs)
5. C/C++ (.c, .cpp, .h, .hpp)
6. Kotlin (.kt, .kts)
7. Swift (.swift)

**Tier 2 - Medium Priority:**
8. Ruby (.rb)
9. PHP (.php)
10. Scala (.scala)
11. Shell/Bash (.sh, .bash)

**Tier 3 - Markup/Config:**
12. CSS/SCSS/LESS (.css, .scss, .less)
13. HTML (.html, .htm)
14. Vue SFCs (.vue)
15. Svelte (.svelte)
16. SQL (.sql)
17. YAML (.yaml, .yml)
18. JSON (.json)
19. XML (.xml)
20. GraphQL (.graphql, .gql)

**Tier 4 - Infrastructure:**
21. Terraform/HCL (.tf, .hcl)
22. Dockerfile (Dockerfile, .dockerfile)

### Language Patterns

```typescript
// Example: Java patterns
const JAVA_PATTERNS = {
    class: /^(public|private|protected)?\s*(abstract|final|static)?\s*class\s+(\w+)/,
    interface: /^(public)?\s*interface\s+(\w+)/,
    enum: /^(public)?\s*enum\s+(\w+)/,
    method: /^\s*(public|private|protected)?\s*(static)?\s*(final)?\s*[\w<>\[\]]+\s+(\w+)\s*\(/,
    annotation: /^@\w+/,
};

// Example: Go patterns
const GO_PATTERNS = {
    function: /^func\s+(\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/,
    struct: /^type\s+(\w+)\s+struct\s*\{/,
    interface: /^type\s+(\w+)\s+interface\s*\{/,
    const: /^const\s+(\w+|\()/,
    var: /^var\s+(\w+|\()/,
};

// Example: Rust patterns
const RUST_PATTERNS = {
    function: /^(pub(\(.+\))?\s+)?(async\s+)?fn\s+(\w+)/,
    struct: /^(pub(\(.+\))?\s+)?struct\s+(\w+)/,
    enum: /^(pub(\(.+\))?\s+)?enum\s+(\w+)/,
    impl: /^impl(\s+<[^>]+>)?\s+(\w+)/,
    trait: /^(pub(\(.+\))?\s+)?trait\s+(\w+)/,
    macro: /^macro_rules!\s+(\w+)/,
};
```

### Extension Mapping

```typescript
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
    // JavaScript family
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',

    // C-family
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.scala': 'scala',
    '.cs': 'csharp',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',

    // Systems
    '.go': 'go',
    '.rs': 'rust',
    '.swift': 'swift',

    // Scripting
    '.py': 'python',
    '.rb': 'ruby',
    '.php': 'php',
    '.sh': 'shell',
    '.bash': 'shell',

    // Markup/Config
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.html': 'html',
    '.htm': 'html',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.sql': 'sql',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.json': 'json',
    '.xml': 'xml',
    '.graphql': 'graphql',
    '.gql': 'graphql',

    // Infrastructure
    '.tf': 'terraform',
    '.hcl': 'hcl',
    '.dockerfile': 'dockerfile',
};
```

## Subtasks

### Phase 1: Tier 1 Languages (6 hours)

- [ ] 1.1 Add Java chunking patterns
- [ ] 1.2 Add Go chunking patterns
- [ ] 1.3 Add Rust chunking patterns
- [ ] 1.4 Add C# chunking patterns
- [ ] 1.5 Add C/C++ chunking patterns
- [ ] 1.6 Add Kotlin chunking patterns
- [ ] 1.7 Add Swift chunking patterns
- [ ] 1.8 Unit tests for Tier 1 languages

### Phase 2: Tier 2-3 Languages (6 hours)

- [ ] 2.1 Add Ruby chunking patterns
- [ ] 2.2 Add PHP chunking patterns
- [ ] 2.3 Add Shell/Bash chunking patterns
- [ ] 2.4 Add CSS/SCSS/LESS chunking patterns
- [ ] 2.5 Add HTML/Vue/Svelte chunking patterns
- [ ] 2.6 Add SQL chunking patterns
- [ ] 2.7 Add YAML/JSON/XML chunking patterns
- [ ] 2.8 Add GraphQL chunking patterns

### Phase 3: Integration & Testing (4 hours)

- [ ] 3.1 Add Terraform/HCL/Dockerfile patterns
- [ ] 3.2 Update extension mapping
- [ ] 3.3 Integration tests with real code samples
- [ ] 3.4 Performance benchmarks
- [ ] 3.5 Documentation update

## Resources

- [Current chunking.ts](../../../src/engines/chunking.ts)
- [Tree-sitter grammars](https://tree-sitter.github.io/tree-sitter/) (reference for patterns)
- [Language-specific style guides](https://google.github.io/styleguide/)

## Acceptance Checklist

- [ ] 20+ languages supported
- [ ] All Tier 1 languages have comprehensive patterns
- [ ] Extension mapping covers common extensions
- [ ] Unit tests for each language
- [ ] No performance regression
- [ ] Documentation updated

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on ROADMAP.md item
- Interim solution before AST-based chunking (SMCP-086)

## Notes

- This is a heuristic-based approach; SMCP-086 (AST chunking) is the superior long-term solution
- Focus on common patterns, not edge cases
- Some languages (JSON, YAML) may use different strategies (indent-based)
- Consider contributing patterns to the community
