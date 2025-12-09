# Search MCP

> **"Install once. It just works. Claude always knows your code."**

A local-first Model Context Protocol (MCP) server that provides semantic search capabilities for your codebase.

**Supported Clients:** Claude Desktop • Claude Code • Cursor • Windsurf • Antigravity • Any MCP-compatible client

---

## Table of Contents

- [For Users (Quick Start)](#for-users-quick-start)
  - [Installation](#installation)
  - [Configure: Claude Desktop](#claude-desktop) | [Claude Code](#claude-code-cli) | [Cursor](#cursor) | [Windsurf](#windsurf) | [Antigravity](#antigravity)
  - [Example Use Cases](#example-use-cases)
  - [Best Practices](#best-practices)
- [For Developers (Technical Details)](#for-developers-technical-details)
- [Troubleshooting](#troubleshooting)

---

# For Users (Quick Start)

This section is for everyone - no technical knowledge required.

## What Does This Do?

Search MCP makes your AI assistant (Claude, Cursor, etc.) **smarter about your code**. Instead of you copying and pasting files into the chat, the AI can automatically search your project and find exactly what it needs.

**Before Search MCP:**
```
You: "How does login work?"
AI: "I don't have access to your code. Please paste the relevant files."
You: *pastes 5 files*
AI: "Now I can help..."
```

**After Search MCP:**
```
You: "How does login work?"
AI: *automatically searches your code*
AI: "Based on src/auth/login.ts, here's how login works..."
```

## Features

- **Just Works** - No setup, no API keys, no accounts
- **Private** - Your code never leaves your computer
- **Always Current** - Automatically updates when you save files
- **Safe** - Never indexes passwords, secrets, or junk files

## Installation

### Step 1: Install Node.js

If you don't have Node.js, download it from [nodejs.org](https://nodejs.org/) (version 18 or higher).

### Step 2: Install Search MCP

Open your terminal and run:

```bash
npm install -g @blakazulu/search-mcp
```

### Step 3: Configure Your AI Assistant

Choose your AI assistant below and follow the instructions:

---

#### Claude Desktop

1. Find your config file:
   - **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
2. Open the file in any text editor
3. Add this configuration (or merge with existing):

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

4. Save the file and restart Claude Desktop

---

#### Claude Code (CLI)

**Option A: Use the CLI command (recommended)**
```bash
claude mcp add --transport stdio search -- npx -y @blakazulu/search-mcp
```

**Option B: Edit config file directly**

Edit `~/.claude.json` and add:
```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

Verify installation:
```bash
claude mcp list
```

---

#### Cursor

1. Find your config file:
   - **Global (all projects):** `~/.cursor/mcp.json`
   - **Project-specific:** `.cursor/mcp.json` in your project folder
2. Create or edit the file and add:

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

3. Restart Cursor

**Alternative:** Go to File > Preferences > Cursor Settings > MCP > Add new MCP server

---

#### Windsurf

1. Find your config file:
   - **Location:** `~/.codeium/windsurf/mcp_config.json`
2. Create or edit the file and add:

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

3. Restart Windsurf

**Alternative:** Click Windsurf Settings (bottom right) > Cascade > MCP > Add Server

---

#### Antigravity

1. In Antigravity, click the **⋯** menu in the Agent pane
2. Select **MCP Servers**
3. Click **Manage MCP Servers** > **View raw config**
4. Add to the config:

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

5. Save and restart the Agent session

---

#### Other MCP Clients

For any MCP-compatible client, use this standard configuration:

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

Check your client's documentation for the config file location.

### Step 4: Start Using It

Now let's make sure everything works!

---

**Step 4.1: Open Your Project**

Open your project folder in your AI assistant (Claude Desktop, Cursor, etc.)

---

**Step 4.2: Ask Your First Question**

Type a question about your code:
```
"How does the authentication work?"
```
or
```
"What files handle user login?"
```

---

**Step 4.3: Confirm Indexing**

Since this is your first time, you'll see a message like:

```
This project hasn't been indexed yet.
Would you like to index it now? (Y/n)
```

**Type "yes" or "y" to continue.**

---

**Step 4.4: Wait for Indexing**

You'll see progress updates:

```
Indexing project at /Users/you/my-project
Please wait - do not interrupt this process...

Found 450 files
Creating chunks... [████████████████████] 100%
Generating embeddings... [████████████████████] 100%

Done! Indexed 450 files (1,205 chunks) in 45 seconds.
```

This usually takes **under 1 minute** for most projects.

---

**Step 4.5: Get Your Answer**

Once indexing completes, the AI will answer your question:

```
Based on src/auth/login.ts and src/middleware/auth.ts,
here's how authentication works in your project...
```

---

**Step 4.6: You're Done!**

From now on, just ask questions naturally. The AI will automatically search your code and find relevant files. No more indexing prompts - it just works.

---

**Alternative: Manual Indexing**

You can also explicitly ask to index your project:
```
"Index this project"
```
or
```
"Create a search index for this codebase"
```

---

## What Can You Ask?

Once set up, just talk naturally:

- "How does user registration work?"
- "Find all files related to payments"
- "What's the database schema?"
- "Show me where errors are handled"

The AI will automatically search your code and find relevant files.

## Example Use Cases

### 🔍 Understanding Unfamiliar Code

**Scenario:** You just joined a new project and need to understand how things work.

```
You: "How does authentication work in this project?"
AI: *searches codebase*
AI: "Based on src/auth/middleware.ts and src/auth/jwt.ts, authentication uses JWT tokens.
     The middleware validates tokens on each request and attaches the user to req.user..."
```

---

### 🐛 Debugging Issues

**Scenario:** You're seeing an error and need to find where it originates.

```
You: "Where is the 'InvalidUserError' thrown?"
AI: *searches for error*
AI: "InvalidUserError is thrown in 3 places:
     1. src/services/user.ts:45 - when user lookup fails
     2. src/api/auth.ts:78 - when password validation fails
     3. src/middleware/validate.ts:23 - when session expired..."
```

---

### 📝 Documentation Lookup

**Scenario:** You need to check what the PRD says about a feature.

```
You: "What does the documentation say about the payment flow?"
AI: *searches docs*
AI: "According to docs/PRD.md, the payment flow should:
     1. Validate card details before submission
     2. Show a confirmation modal with total amount
     3. Retry failed payments up to 3 times..."
```

---

### 🔗 Finding Connections

**Scenario:** You need to understand how different parts of the code connect.

```
You: "What files import the UserService?"
AI: *searches imports*
AI: "UserService is imported by 8 files:
     - src/api/users.ts
     - src/api/auth.ts
     - src/jobs/notifications.ts
     - src/tests/user.test.ts..."
```

---

### 🛠️ Making Changes Safely

**Scenario:** You need to modify a function but want to know the impact.

```
You: "I want to change the calculateTotal function. What else uses it?"
AI: *searches usage*
AI: "calculateTotal is used in:
     - src/cart/checkout.ts - calculates order total
     - src/reports/sales.ts - generates daily reports
     - src/tests/cart.test.ts - 12 test cases
     Be careful: the reports module expects a specific return format..."
```

---

### 📂 Finding Files by Pattern

**Scenario:** You know part of a filename but not the full path.

```
You: "Find all test files for authentication"
AI: *searches by pattern*
AI: "Found 4 auth-related test files:
     - src/tests/auth.test.ts
     - src/tests/auth-middleware.test.ts
     - src/tests/integration/auth-flow.test.ts
     - e2e/login.spec.ts"
```

---

### 🆕 Onboarding to a Feature

**Scenario:** You're assigned to work on a feature you've never touched.

```
You: "I need to work on the notification system. Give me an overview."
AI: *searches codebase*
AI: "The notification system consists of:
     - src/services/notifications.ts - core service (sends emails, push, SMS)
     - src/jobs/notification-worker.ts - background job processor
     - src/templates/ - email templates
     Key entry point is NotificationService.send(). It queues messages
     that the worker processes every 30 seconds..."
```

---

### 📚 Learning Codebase Patterns

**Scenario:** You want to follow existing patterns when adding new code.

```
You: "How do other API endpoints handle errors in this project?"
AI: *searches patterns*
AI: "API endpoints follow a consistent pattern:
     1. Wrap handlers in asyncHandler() (src/utils/async.ts)
     2. Throw AppError with status code for expected errors
     3. Global error handler in src/middleware/error.ts formats response
     Example from src/api/users.ts:45..."
```

## Best Practices

### Don't Drag Docs — Ask Instead

**The Problem:**
When you drag a document into the chat, the AI reads the **entire file** into its context window. For large docs (PRDs, specs, guides), this:
- Fills up the AI's memory quickly
- Degrades response quality as context grows
- Wastes tokens on irrelevant sections

**The Solution:**
Instead of dragging, just **ask about the doc**:

| ❌ Don't Do This | ✅ Do This Instead |
|-----------------|-------------------|
| *Drags PRD.md into chat* | "What does the PRD say about authentication?" |
| *Drags API-guide.md into chat* | "Search the docs for rate limiting" |
| *Drags multiple docs* | "Find documentation about the payment flow" |

The AI will use `search_docs` to retrieve only the relevant chunks, keeping your context clean.

---

### Hybrid Approach: When You Already Dragged a Doc

If you've already dragged a document into the chat, you can still benefit from Search MCP for **follow-up questions**:

```
You: *drags large-spec.md into chat*
You: "Summarize this document"
AI: *reads the full doc you dragged*
AI: "Here's a summary..."

You: "Now find where it mentions error handling"
AI: *uses search_docs instead of re-reading the whole file*
AI: "Based on section 4.2 of the spec, error handling should..."
```

**How it works:**
- The AI recognizes the doc is already indexed
- For follow-up searches, it uses `search_docs` for precision
- Avoids re-reading the entire document for each question

---

### When TO Drag Files

Dragging is still useful for:
- **Small files** (< 100 lines) - Quick to read entirely
- **Files outside your project** - External docs not in the index
- **One-time references** - Files you won't ask about again
- **Showing exact content** - When you need the AI to see specific formatting

---

### Quick Reference

| Scenario | Best Approach |
|----------|---------------|
| Large project doc (PRD, RFC, guide) | Ask: "Search docs for X" |
| Code file you're editing | AI auto-searches with `search_code` |
| External doc (not in project) | Drag into chat |
| Small config file | Either works |
| Multiple related questions about a doc | Ask (uses search) |
| Need AI to see exact formatting | Drag |

## Privacy Promise

- **Your code stays on your computer** - Nothing is uploaded anywhere
- **No accounts needed** - No sign-ups, no API keys
- **No tracking** - We don't collect any data about you or your code

---

# For Developers (Technical Details)

This section covers architecture, configuration, and advanced usage.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP CLIENT                              │
│  (Claude Desktop, Claude Code, Cursor, Windsurf, Antigravity)│
└─────────────────────────┬───────────────────────────────────┘
                          │ MCP Protocol (stdio)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  SEARCH MCP SERVER                           │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ │
│  │create_    │ │search_code │ │search_by_ │ │get_index_   │ │
│  │index      │ │           │ │path       │ │status       │ │
│  └───────────┘ └───────────┘ └───────────┘ └─────────────┘ │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                 │
│  │reindex_   │ │reindex_   │ │delete_    │                 │
│  │project    │ │file       │ │index      │                 │
│  └───────────┘ └───────────┘ └───────────┘                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Chunking    │ │   Embedding   │ │   LanceDB     │
│   Engine      │ │   (MiniLM)    │ │   (Local)     │
└───────────────┘ └───────────────┘ └───────────────┘
```

## MCP Tools

| Tool | Description | Confirmation |
|------|-------------|--------------|
| `create_index` | Create a search index for the current project (code + docs) | Yes |
| `search_code` | Semantic search for relevant code chunks | No |
| `search_docs` | Semantic search for documentation files (.md, .txt) | No |
| `search_by_path` | Find files by name/glob pattern | No |
| `get_index_status` | Show index statistics (files, chunks, size) | No |
| `reindex_project` | Rebuild the entire index from scratch | Yes |
| `reindex_file` | Re-index a single specific file | No |
| `delete_index` | Remove the index for current project | Yes |

## How It Works

1. **Project Detection** - Finds project root by looking for `.git/`, `package.json`, `pyproject.toml`, `Cargo.toml`, or `go.mod`
2. **Indexing** - Scans files, splits into chunks (~1000 tokens for code, ~2000 tokens for docs), generates embeddings
3. **Storage** - Saves vectors to LanceDB at `~/.mcp/search/indexes/<hash>/` (separate tables for code and docs)
4. **Watching** - Monitors file changes via chokidar, updates index incrementally
5. **Searching** - Converts query to vector, finds similar chunks, returns results

### Code vs Documentation Search

| Aspect | `search_code` (Code) | `search_docs` (Docs) |
|--------|---------------------|----------------------|
| File types | All non-doc files | `.md`, `.txt` |
| Chunk size | ~1000 tokens | ~2000 tokens |
| Chunk overlap | ~200 tokens | ~500 tokens |
| Use case | Find code implementations | Find explanations, guides, specs |

## Storage Structure

```
~/.mcp/search/
├── config.json                    # Global defaults (optional)
└── indexes/
    └── <SHA256(project_path)>/
        ├── index.lancedb/         # Code vector database
        ├── docs.lancedb/          # Docs vector database
        ├── fingerprints.json      # Code file hash tracking
        ├── docs-fingerprints.json # Docs file hash tracking
        ├── config.json            # Project configuration
        ├── metadata.json          # Index metadata
        └── logs/                  # Rolling logs
```

## Configuration

Auto-generated at `~/.mcp/search/indexes/<hash>/config.json`:

```json
{
  "_comment": "Search MCP Configuration - Edit to customize indexing behavior",

  "include": ["**/*"],
  "exclude": [],

  "respectGitignore": true,
  "maxFileSize": "1MB",
  "maxFiles": 50000,

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
    "maxFiles": "Warn if project exceeds this many files."
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `include` | `string[]` | `["**/*"]` | Glob patterns for files to index |
| `exclude` | `string[]` | `[]` | Glob patterns to skip |
| `respectGitignore` | `boolean` | `true` | Honor .gitignore rules |
| `maxFileSize` | `string` | `"1MB"` | Skip files larger than this |
| `maxFiles` | `number` | `50000` | Warn if project exceeds this count |
| `docPatterns` | `string[]` | `["**/*.md", "**/*.txt"]` | Glob patterns for documentation files |
| `indexDocs` | `boolean` | `true` | Enable documentation indexing |

## Hardcoded Deny List

These patterns are **ALWAYS** excluded (cannot be overridden):

| Category | Patterns |
|----------|----------|
| Dependencies | `node_modules/`, `jspm_packages/`, `bower_components/`, `vendor/`, `.venv/`, `venv/` |
| Version Control | `.git/`, `.hg/`, `.svn/` |
| Build Artifacts | `dist/`, `build/`, `out/`, `target/`, `__pycache__/`, `.next/`, `.nuxt/` |
| Secrets | `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx` |
| Logs/Locks | `*.log`, `*.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` |
| IDE Config | `.idea/`, `.vscode/`, `.DS_Store`, `*.swp`, `*.swo` |
| Testing | `coverage/`, `.nyc_output/`, `.pytest_cache/` |

## Embedding Model

| Property | Value |
|----------|-------|
| Model | `Xenova/all-MiniLM-L6-v2` |
| Dimensions | 384 |
| Size | ~90MB (auto-downloaded on first use) |
| Runtime | ONNX via `@xenova/transformers` |
| Location | CPU (no GPU required) |
| Cache | `~/.cache/huggingface/` |

## Chunking Strategy

### Code Files
| Parameter | Value |
|-----------|-------|
| Chunk Size | ~1000 tokens (~4000 characters) |
| Chunk Overlap | ~200 tokens (~800 characters) |
| Separators | `\n\n`, `\n`, ` `, `` (in priority order) |

### Documentation Files
| Parameter | Value |
|-----------|-------|
| Chunk Size | ~2000 tokens (~8000 characters) |
| Chunk Overlap | ~500 tokens (~2000 characters) |
| Separators | `\n\n`, `\n`, `. `, ` `, `` (in priority order) |

## Performance Targets

| Operation | Target |
|-----------|--------|
| Search latency | < 200ms |
| Indexing speed | ~100 files/second |
| Memory (indexing) | < 500MB |
| Memory (idle) | < 100MB |
| Startup time | < 2s |
| Incremental update | < 1s |

## Requirements

- Node.js 18+
- ~100MB disk space for embedding model
- ~100KB per 1000 chunks for index storage

## Client Configuration Reference

### Configuration Summary

| Client | Config File Location | Transport |
|--------|---------------------|-----------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) | stdio |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` (Windows) | stdio |
| Claude Code | `~/.claude.json` or use `claude mcp add` command | stdio |
| Cursor | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project) | stdio |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | stdio |
| Antigravity | Via MCP Servers menu > View raw config | stdio |

### Claude Desktop

**Config file locations:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

### Claude Code

**Option 1: CLI command**
```bash
claude mcp add --transport stdio search -- npx -y @blakazulu/search-mcp
```

**Option 2: Config file** (`~/.claude.json`)
```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

**Useful commands:**
```bash
claude mcp list          # List configured servers
claude mcp remove search # Remove server
```

### Cursor

**Config file locations:**
- **Global:** `~/.cursor/mcp.json`
- **Project:** `.cursor/mcp.json` (in project root)

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

### Windsurf

**Config file:** `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

### Antigravity

1. Click **⋯** menu in Agent pane → **MCP Servers**
2. Click **Manage MCP Servers** → **View raw config**
3. Add:

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

### Other MCP Clients

Standard MCP configuration format (check your client's docs for file location):

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@blakazulu/search-mcp"]
    }
  }
}
```

---

# Troubleshooting

All errors include two messages:
- **User Message** - Friendly explanation
- **Developer Message** - Technical details for debugging

---

## INDEX_NOT_FOUND

**When:** You try to search before creating an index.

| | Message |
|---|---------|
| **User** | "This project hasn't been indexed yet. Would you like to index it now?" |
| **Developer** | `INDEX_NOT_FOUND: No index at ~/.mcp/search/indexes/{hash}/` |

**Solution:** Run `create_index` to index your project.

---

## MODEL_DOWNLOAD_FAILED

**When:** The embedding model fails to download on first use.

| | Message |
|---|---------|
| **User** | "Couldn't set up the search engine. Please check your internet connection and try again." |
| **Developer** | `MODEL_DOWNLOAD_FAILED: ENOTFOUND huggingface.co` |

**Solution:**
1. Check your internet connection
2. Check if huggingface.co is accessible
3. Try again - the download will resume where it left off

---

## INDEX_CORRUPT

**When:** The index database is damaged or unreadable.

| | Message |
|---|---------|
| **User** | "The search index seems corrupted. Rebuilding it now..." |
| **Developer** | `INDEX_CORRUPT: LanceDB read error - {details}` |

**Solution:** The system will automatically rebuild the index. If it persists:
1. Run `delete_index`
2. Run `create_index`

---

## FILE_LIMIT_WARNING

**When:** Your project has more than 50,000 files.

| | Message |
|---|---------|
| **User** | "This project is very large (65,000 files). Indexing may take several minutes. Continue?" |
| **Developer** | `FILE_LIMIT_WARNING: 65,000 files exceeds soft limit of 50,000` |

**Solution:** This is just a warning. You can:
1. Continue anyway (indexing will take longer)
2. Add patterns to `exclude` in config to reduce file count

---

## PERMISSION_DENIED

**When:** Search MCP can't read some files in your project.

| | Message |
|---|---------|
| **User** | "Can't access some files in this project. Check folder permissions." |
| **Developer** | `PERMISSION_DENIED: EACCES reading {path}` |

**Solution:**
1. Check file/folder permissions
2. On Mac/Linux: `chmod +r <file>` or `chmod +rx <folder>`
3. Files that can't be read are skipped (other files still indexed)

---

## DISK_FULL

**When:** Not enough disk space to create or update the index.

| | Message |
|---|---------|
| **User** | "Not enough disk space to create the search index. Free up some space and try again." |
| **Developer** | `DISK_FULL: ENOSPC - need ~{needed}MB, have {available}MB` |

**Solution:**
1. Free up disk space
2. The index typically needs ~100KB per 1000 chunks
3. The embedding model needs ~100MB (one-time)

---

## FILE_NOT_FOUND

**When:** You try to reindex a file that doesn't exist.

| | Message |
|---|---------|
| **User** | "The file '{path}' doesn't exist or isn't indexed." |
| **Developer** | `FILE_NOT_FOUND: {path} not in index` |

**Solution:**
1. Check the file path is correct
2. Make sure the file hasn't been deleted
3. Check if the file is in the exclude list or deny list

---

## INVALID_PATTERN

**When:** A glob pattern in search_by_path is malformed.

| | Message |
|---|---------|
| **User** | "The search pattern '{pattern}' is invalid. Please check the syntax." |
| **Developer** | `INVALID_PATTERN: {glob_error}` |

**Solution:** Fix the glob pattern. Valid examples:
- `**/*.ts` - All TypeScript files
- `src/**/*` - Everything in src folder
- `**/auth*` - Files with "auth" in the name

---

## PROJECT_NOT_DETECTED

**When:** Can't find a project root marker (.git, package.json, etc.).

| | Message |
|---|---------|
| **User** | "Could not detect project root. Please choose a directory." |
| **Developer** | `PROJECT_NOT_DETECTED: No markers found in path hierarchy` |

**Solution:** You'll be prompted to:
1. Use the current directory as project root, OR
2. Enter a custom path

---

## Common Issues

### Search results seem irrelevant

**Cause:** Index might be stale or corrupted.

**Solution:** Run `reindex_project` to rebuild from scratch.

---

### Indexing is very slow

**Cause:** Large project or many files.

**Solutions:**
1. Add patterns to `exclude` in config
2. Make sure `node_modules` and build folders are being skipped (they should be by default)
3. Check if binary files are being detected correctly

---

### Changes not being picked up

**Cause:** File watcher might have missed events.

**Solutions:**
1. Run `reindex_file` for the specific file
2. Run `reindex_project` to force full rebuild
3. The integrity engine runs on startup and catches drift

---

### Model keeps re-downloading

**Cause:** Cache directory permissions or corruption.

**Solution:**
1. Check `~/.cache/huggingface/` exists and is writable
2. Delete the cache folder and let it re-download fresh

---

## Getting Help

- [GitHub Issues](https://github.com/blakazulu/search-mcp/issues) - Report bugs or request features
- [Documentation](./docs/) - Full technical documentation

---

## License

MIT - See [LICENSE](./LICENSE) for details.
