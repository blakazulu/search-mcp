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
  "lazyIdleThreshold": 30
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
| `lazyIdleThreshold` | `number` | `30` | Seconds of inactivity before lazy strategy indexes |

---

## Indexing Strategies

Control when and how file changes are indexed. Choose based on your project size and freshness needs.

| Strategy | File Watching | When Indexing Happens | Best For |
|----------|---------------|----------------------|----------|
| `realtime` | All files continuously | Immediately on change | Small projects, instant freshness |
| `lazy` | All files continuously | On idle (30s) or before search | Large projects, reduce CPU |
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
  "indexingStrategy": "lazy",
  "lazyIdleThreshold": 30
}
```

**How it works:**
- Watches all project files (same as realtime)
- Queues changes instead of processing immediately
- Indexes when:
  1. System is idle for `lazyIdleThreshold` seconds (default: 30), OR
  2. Before any search executes (auto-flush)

**Best for:**
- Large projects (5,000+ files)
- Reducing CPU usage during active editing
- When slight search delay is acceptable

**Trade-off:** First search after edits may take slightly longer (while flushing)

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
