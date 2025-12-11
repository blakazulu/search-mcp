# Configuration Reference

[← Back to README](../README.md)

Complete reference for customizing Search MCP behavior.

---

## Table of Contents

- [Config Location](#config-location)
- [Full Example](#full-example)
- [All Options](#all-options)
- [Indexing Strategies](#indexing-strategies)
  - [Realtime (Default)](#realtime-default)
  - [Lazy](#lazy)
  - [Git](#git)
  - [Choosing a Strategy](#choosing-a-strategy)
- [Security Features](#security-features)
  - [Symlink Protection](#symlink-protection)
  - [Path Traversal Protection](#path-traversal-protection)
  - [Secure File Access](#secure-file-access)
- [Hardcoded Deny List](#hardcoded-deny-list)
- [Enhanced Tool Descriptions](#enhanced-tool-descriptions)

---

## Config Location

Configuration is stored per-project at:

```
~/.mcp/search/indexes/<SHA256(project_path)>/config.json
```

The config file is **auto-generated** on first indexing with sensible defaults. Edit it to customize behavior.

---

## Full Example

```json
{
  "_comment": "Search MCP Configuration - Edit to customize indexing behavior",

  "include": ["**/*"],
  "exclude": [],

  "respectGitignore": true,
  "maxFileSize": "1MB",
  "maxFiles": 50000,

  "docPatterns": ["**/*.md", "**/*.txt"],
  "indexDocs": true,

  "enhancedToolDescriptions": false,

  "indexingStrategy": "realtime",

  "_hardcodedExcludes": [
    "// These patterns are ALWAYS excluded and cannot be overridden:",
    "// - node_modules/, jspm_packages/, bower_components/  (dependencies)",
    "// - .git/, .hg/, .svn/  (version control)",
    "// - dist/, build/, out/, target/  (build artifacts)",
    "// - .env, .env.*, *.pem, *.key  (secrets)",
    "// - *.log, *.lock, package-lock.json, yarn.lock  (logs/locks)",
    "// - .idea/, .vscode/, .DS_Store  (IDE config)",
    "// - coverage/  (test coverage)",
    "// - Binary files (images, videos, etc.) are auto-detected and skipped"
  ],

  "_availableOptions": {
    "include": "Glob patterns for files to index. Default: all files.",
    "exclude": "Glob patterns to skip (in addition to hardcoded excludes).",
    "respectGitignore": "If true, also excludes files matching .gitignore.",
    "maxFileSize": "Skip files larger than this. Supports: '500KB', '1MB', '2MB'.",
    "maxFiles": "Warn if project exceeds this many files.",
    "docPatterns": "Glob patterns for documentation files.",
    "indexDocs": "If true, index docs separately with prose-optimized chunking.",
    "enhancedToolDescriptions": "If true, add AI hints to tool descriptions.",
    "indexingStrategy": "Indexing strategy: 'realtime' (immediate), 'lazy' (on search), 'git' (on commit)"
  }
}
```

---

## All Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `include` | `string[]` | `["**/*"]` | Glob patterns for files to index |
| `exclude` | `string[]` | `[]` | Additional glob patterns to skip |
| `respectGitignore` | `boolean` | `true` | Honor `.gitignore` rules |
| `maxFileSize` | `string` | `"1MB"` | Skip files larger than this (`"500KB"`, `"1MB"`, `"2MB"`) |
| `maxFiles` | `number` | `50000` | Warn if project exceeds this file count |
| `docPatterns` | `string[]` | `["**/*.md", "**/*.txt"]` | Glob patterns for documentation files |
| `indexDocs` | `boolean` | `true` | Enable documentation indexing (separate from code) |
| `enhancedToolDescriptions` | `boolean` | `false` | Add AI hints to tool descriptions |
| `indexingStrategy` | `string` | `"realtime"` | When to index: `"realtime"`, `"lazy"`, or `"git"` |

---

## Indexing Strategies

Control when and how file changes are indexed. Choose based on your project size and freshness needs.

| Strategy | File Watching | When Indexing Happens | Best For |
|----------|---------------|----------------------|----------|
| `realtime` | All files continuously | Immediately on change | Small projects, instant freshness |
| `lazy` | All files continuously | Before search (on-demand) | Large projects, index only when needed |
| `git` | Only `.git/logs/HEAD` | After each git commit | Minimal overhead, committed-only search |

---

### Realtime (Default)

```json
{
  "indexingStrategy": "realtime"
}
```

**How it works:**
- Watches all project files using chokidar
- Indexes changes immediately (with ~300ms debounce)
- Search results always reflect the latest saved file

**Best for:**
- Small to medium projects (< 5,000 files)
- When you need instant search freshness
- Active development with frequent searches

**Trade-off:** Higher CPU usage during active file editing

---

### Lazy

```json
{
  "indexingStrategy": "lazy"
}
```

**How it works:**
- Watches all project files (same as realtime)
- Queues changes instead of processing immediately
- Indexes only when a search is performed (true lazy loading)

**Best for:**
- Large projects (5,000+ files)
- Reducing CPU usage during active editing
- When you only need updated results at search time

**Trade-off:** First search after edits may take slightly longer (while indexing pending changes)

---

### Git

```json
{
  "indexingStrategy": "git"
}
```

**How it works:**
- Only watches `.git/logs/HEAD` (updated on every commit)
- No file watchers on project files (minimal overhead)
- Reconciles entire index after each commit using integrity engine

**Best for:**
- Very large projects where file watching is expensive
- When you only need to search committed code
- CI/CD environments
- Projects with many generated/temporary files

**Trade-off:** Uncommitted changes are not searchable

**Requirement:** Project must be a git repository

---

### Choosing a Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Which strategy?                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Small project (< 5K files)?                                │
│    └── YES → Use "realtime" (default)                       │
│    └── NO  ↓                                                │
│                                                             │
│  Need to search uncommitted code?                           │
│    └── YES → Use "lazy"                                     │
│    └── NO  → Use "git"                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Features

Search MCP includes built-in security protections that cannot be disabled:

### Symlink Protection

Symbolic links are automatically detected and handled securely:

- **During indexing**: Symlinks are silently skipped with a warning logged
- **For explicit file access**: Symlinks return a `SYMLINK_NOT_ALLOWED` error

This prevents symlink attacks where a malicious symlink could point to sensitive files outside your project (e.g., `ln -s /etc/passwd malicious.txt`).

**Supported symlink types:**
- Unix symbolic links
- Windows symbolic links
- Windows junction points

### Path Traversal Protection

All file paths are validated to prevent directory traversal attacks:

- Paths like `../../../etc/passwd` are rejected
- All path operations use `safeJoin()` validation
- Paths must stay within the project directory

### Secure File Access

All file read operations use secure utilities that combine:
1. Path traversal prevention via `safeJoin()`
2. Symlink detection via `lstat()`
3. Proper error handling

---

## Hardcoded Deny List

These patterns are **always excluded** and cannot be overridden:

| Category | Patterns |
|----------|----------|
| Dependencies | `node_modules/`, `jspm_packages/`, `bower_components/`, `vendor/`, `.venv/`, `venv/` |
| Version Control | `.git/`, `.hg/`, `.svn/` |
| Build Artifacts | `dist/`, `build/`, `out/`, `target/`, `__pycache__/`, `.next/`, `.nuxt/` |
| Secrets | `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx` |
| Logs/Locks | `*.log`, `*.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` |
| IDE Config | `.idea/`, `.vscode/`, `.DS_Store`, `*.swp`, `*.swo` |
| Testing | `coverage/`, `.nyc_output/`, `.pytest_cache/` |

Binary files (images, videos, etc.) are also auto-detected and skipped.

---

## Enhanced Tool Descriptions

When `enhancedToolDescriptions: true`, tool descriptions include hints that guide AI behavior.

**Standard (default):**

```
search_docs: "Search documentation files (.md, .txt)"
```

**Enhanced:**

```
search_docs: "Search documentation files (.md, .txt). TIP: For follow-up
questions about a doc already in context, use this tool instead of
re-reading the entire file - more precise results, less context usage."
```

This helps the AI make smarter decisions about when to use search vs. reading full files.

---

## Next Steps

- [Getting Started](./getting-started.md) - Installation guide
- [Examples](./examples.md) - Common use cases
- [Troubleshooting](./troubleshooting.md) - Solve common issues
