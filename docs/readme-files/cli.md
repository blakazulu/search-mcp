# CLI Reference

Search MCP includes a standalone command-line interface for direct terminal usage without requiring an MCP client.

## Installation

**Option 1: Run directly with npx (recommended)**
```bash
npx @liraz-sbz/search-mcp <command>
```

**Option 2: Install globally**
```bash
npm install -g @liraz-sbz/search-mcp
search-mcp <command>
```

---

## Commands Overview

| Command | Description |
|---------|-------------|
| [`setup`](#setup---configure-mcp-clients) | Configure MCP clients and create initial index |
| [`index`](#index---create-search-index) | Create or update search index |
| [`search`](#search---search-code) | Search code with natural language |
| [`status`](#status---show-index-status) | Show index statistics |
| [`reindex`](#reindex---rebuild-index) | Rebuild entire index |
| [`delete`](#delete---remove-index) | Delete index for current project |
| [`logs`](#logs---show-log-locations) | Show log file locations |

---

## Quick Reference

All commands and their options at a glance:

```bash
# Setup and configuration
search-mcp setup [--verbose]

# Index management
search-mcp index [--verbose] [--json]
search-mcp reindex [--verbose] [--json]
search-mcp delete [--force] [--json]
search-mcp status [--json]

# Searching
search-mcp search <query> [-k <n>] [-m <mode>] [-a <alpha>] [-d] [--json]

# Utilities
search-mcp logs
search-mcp --help
search-mcp --version
```

### All Options

| Option | Commands | Description |
|--------|----------|-------------|
| `--verbose` | setup, index, reindex | Show detailed logging output |
| `--json` | index, search, status, reindex, delete | Output results as JSON |
| `-k, --top-k <n>` | search | Number of results (default: 10) |
| `-m, --mode <mode>` | search | Search mode: hybrid, vector, fts |
| `-a, --alpha <n>` | search | Hybrid search balance (0-1) |
| `-d, --docs` | search | Search documentation instead of code |
| `-f, --force` | delete | Skip confirmation prompt |
| `-h, --help` | all | Show help for command |
| `-v, --version` | global | Show version number |

---

## `setup` - Configure MCP Clients

The recommended way to get started. Auto-detects MCP clients and creates an index.

```bash
search-mcp setup

# With verbose logging for debugging
search-mcp setup --verbose
```

**Options:**
| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed logging output |

**What it does:**
1. Detects your project directory
2. Finds installed MCP clients (Claude Desktop, Claude Code, Cursor, Windsurf)
3. Configures selected clients to use search-mcp
4. Offers to create an index for the current project
5. Lets you choose compute device (GPU vs CPU) on Windows

**Example output:**
```
Search MCP Setup
================

Detected project directory:
  C:\Users\dev\my-project

Is this the correct project folder? [Y/n]: y

Available MCP clients to configure:

  [1] Claude Code (via CLI) - Recommended
  [2] Claude Desktop
  [a] Configure all
  [q] Quit

Select an option: 1

✓ Configured via Claude Code CLI

Would you like to index this project now? [Y/n]: y

✓ Project detected: C:\Users\dev\my-project

Compute Device:

  [1] GPU (DirectML) - Faster, but may cause system stuttering
  [2] CPU - Slower, but system stays responsive

Select compute device [1]: 1
Using GPU (DirectML) for embedding generation.

Creating index for: C:\Users\dev\my-project

Code Index:
  ✓ Scanned 5,234 files → 234 indexable
  Chunking  [████████████████████████████████████████] 100% | 234/234 files
  Embedding [████████████████████████████████████████] 100% | 892/892 chunks
  ✓ Stored 892 chunks
  ✓ Code index complete: 234 files, 892 chunks

Docs Index:
  ✓ Scanned 156 files → 45 indexable
  Chunking  [████████████████████████████████████████] 100% | 45/45 files
  Embedding [████████████████████████████████████████] 100% | 156/156 chunks
  ✓ Stored 156 chunks
  ✓ Docs index complete: 45 files, 156 chunks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Index created successfully!

  Code:     234 files, 892 chunks
  Docs:     45 files, 156 chunks
  Duration: 2m 15s
  Device:   DirectML GPU

Setup complete! Next steps:
  1. Restart your AI assistant
  2. Type /mcp to verify "search" is connected
  3. Ask: "Search for authentication code"
```

---

## `index` - Create Search Index

Creates or updates the search index for the current project.

```bash
# Index current directory
search-mcp index

# With verbose logging
search-mcp index --verbose

# JSON output for scripting
search-mcp index --json
```

**Options:**
| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed logging output |
| `--json` | Output results as JSON |

**What it does:**
- Auto-detects project root
- Creates index for both code and documentation files
- Shows progress bar during indexing
- Displays GPU/CPU compute device being used

**Example output:**
```
Search MCP - Index Project
==========================

✓ Project detected: /Users/dev/my-project

  Existing index found. Will rebuild.

  Scanning files... (234/234)
  Chunking  [████████████████████████████████████████] 100% | 234/234 files
  Embedding [████████████████████████████████████████] 100% | 892/892 chunks
  Storing chunks...

  ✓ Index created successfully!

  Project: /Users/dev/my-project
  Files indexed: 279
  Chunks created: 1048
  Duration: 45.2s
  Compute device: DirectML GPU

  Next: Run search-mcp search "your query" to search
```

---

## `search` - Search Code

Search your indexed codebase using natural language queries.

```bash
# Basic search
search-mcp search "authentication logic"

# Search with options
search-mcp search "database connection" --top-k 5 --mode hybrid

# Search documentation instead of code
search-mcp search "API rate limits" --docs

# JSON output for scripting
search-mcp search "error handling" --json
```

**Options:**
| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--top-k <n>` | `-k` | `10` | Number of results to return |
| `--mode <mode>` | `-m` | `hybrid` | Search mode: `hybrid`, `vector`, or `fts` |
| `--alpha <n>` | `-a` | `0.5` | Balance between semantic (1.0) and keyword (0.0) search |
| `--docs` | `-d` | `false` | Search documentation files instead of code |
| `--json` | | `false` | Output results as JSON |

**Search Modes:**
| Mode | Best For |
|------|----------|
| `hybrid` | General queries - combines semantic + keyword matching |
| `vector` | Conceptual queries like "how does auth work?" |
| `fts` | Exact matches like function names or error messages |

**Example output:**
```
Search Results for "authentication logic"
==========================================

  Found 10 results in 42ms
  Search mode: hybrid

[1] src/auth/login.ts (lines 45-89)
    Score: 84.7%
    ---
    async function authenticateUser(credentials: Credentials) {
      const user = await findUserByEmail(credentials.email);
      if (!user) throw new AuthError('User not found');
      ...

[2] src/middleware/auth.ts (lines 12-34)
    Score: 82.3%
    ---
    export function requireAuth(req: Request, res: Response, next: NextFunction) {
      const token = req.headers.authorization?.split(' ')[1];
      ...
```

---

## `status` - Show Index Status

Display information about the current project's index.

```bash
search-mcp status

# JSON output
search-mcp status --json
```

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |

**Example output:**
```
Index Status
============

  Status: READY

  Project: /Users/dev/my-project
  Index path: ~/.mcp/search/indexes/a1b2c3d4/

  Statistics:
    Total files: 279
    Total chunks: 1048
    Storage size: 12.4 MB
    Last updated: 2025-12-19 14:32:00

  Hybrid Search:
    Enabled: Yes
    FTS engine: tantivy
    FTS chunks: 1048
    Default alpha: 0.5

  Compute:
    Device: dml
    GPU: NVIDIA GeForce RTX 3080
```

---

## `reindex` - Rebuild Index

Completely rebuilds the search index from scratch.

```bash
search-mcp reindex

# With verbose logging
search-mcp reindex --verbose

# JSON output
search-mcp reindex --json
```

**Options:**
| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed logging output |
| `--json` | Output results as JSON |

**When to use:**
- After major code changes
- If search results seem stale
- After changing configuration
- When troubleshooting index issues

---

## `delete` - Remove Index

Delete the search index for the current project.

```bash
# Interactive (with confirmation)
search-mcp delete

# Force delete without confirmation
search-mcp delete --force

# JSON output (skips confirmation)
search-mcp delete --json
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |
| `--json` | Output results as JSON (skips confirmation) |

**Example output:**
```
Search MCP - Delete Index
=========================

✓ Project: /Users/dev/my-project

  Index found:
    Path: ~/.mcp/search/indexes/a1b2c3d4/

  Warning: This will permanently delete the index.
  You will need to re-run "search-mcp index" to rebuild it.

  Delete index? [y/N]: y

✓ Index deleted successfully

  Run search-mcp index to create a new index.
```

**When to use:**
- Free up disk space
- Start fresh with a new index
- Before switching to a different project configuration
- Troubleshooting index corruption

---

## `logs` - Show Log Locations

Display the paths to log files for debugging.

```bash
search-mcp logs
```

**Example output:**
```
Search MCP Log Files
====================

Global Server Log:
  ~/.mcp/search/logs/server.log (128 KB)
  Contains: server start/stop, errors, connection issues

Project Indexes:

  Project: /Users/dev/my-project
  Index:   a1b2c3d4
  Log:     ~/.mcp/search/indexes/a1b2c3d4/logs/search-mcp.log (45 KB)

  Project: /Users/dev/another-project
  Index:   e5f6g7h8
  Log:     ~/.mcp/search/indexes/e5f6g7h8/logs/search-mcp.log (12 KB)

To share logs for debugging:
  1. Find the log file for your project above
  2. Copy the contents and share with the developer
```

---

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help for a command |
| `--version`, `-v` | Show version number |

```bash
# Show general help
search-mcp --help

# Show help for specific command
search-mcp search --help
search-mcp index --help

# Show version
search-mcp --version
```

**Example: `search-mcp --help`**
```
Usage: search-mcp [options] [command]

Semantic code search for AI assistants - local-first, zero-config

Options:
  -v, --version             Show version number
  -h, --help                display help for command

Commands:
  index [options]           Create or update search index for current project
  search [options] <query>  Search code with natural language query
  status [options]          Show index statistics and configuration
  reindex [options]         Rebuild entire index from scratch
  setup [options]           Configure MCP clients to use search-mcp
  logs                      Show log file locations for debugging
  help [command]            display help for command
```

**Example: `search-mcp search --help`**
```
Usage: search-mcp search [options] <query>

Search code with natural language query

Options:
  -k, --top-k <number>  Number of results to return (default: 10)
  -m, --mode <mode>     Search mode: hybrid, vector, or fts
  -a, --alpha <number>  Alpha weight for hybrid search (0-1)
  -d, --docs            Search documentation files instead of code
  --json                Output results as JSON
  -h, --help            display help for command
```

---

## JSON Output

All commands support `--json` for machine-readable output, useful for scripting:

```bash
# Get search results as JSON
search-mcp search "auth" --json | jq '.results[0]'

# Get status as JSON
search-mcp status --json | jq '.stats.codeChunks'

# Use in scripts
CHUNKS=$(search-mcp status --json | jq -r '.totalChunks')
echo "Index contains $CHUNKS chunks"

# Check if index exists
if search-mcp status --json | jq -e '.status == "ready"' > /dev/null; then
  echo "Index is ready"
fi
```

---

## Examples

### Quick Workflow

```bash
# 1. Navigate to your project
cd /path/to/my-project

# 2. Run setup (configures clients + creates index)
npx @liraz-sbz/search-mcp setup

# 3. Search your code
npx @liraz-sbz/search-mcp search "database connection"
npx @liraz-sbz/search-mcp search "error handling" -k 5
npx @liraz-sbz/search-mcp search "API documentation" --docs

# 4. Check index status
npx @liraz-sbz/search-mcp status
```

### CI/CD Integration

```bash
#!/bin/bash
# Example: Verify code patterns exist in codebase

RESULTS=$(npx @liraz-sbz/search-mcp search "security validation" --json)
COUNT=$(echo $RESULTS | jq '.results | length')

if [ "$COUNT" -lt 1 ]; then
  echo "Warning: No security validation found in codebase"
  exit 1
fi
```

### IDE-less Code Review

```bash
# Search for potential issues
search-mcp search "TODO" -k 20
search-mcp search "FIXME" -k 20
search-mcp search "console.log" -k 20
search-mcp search "password" -k 10

# Search for deprecated patterns
search-mcp search "deprecated" --docs
```

### Debug with Verbose Mode

```bash
# If something isn't working, enable verbose logging
search-mcp index --verbose
search-mcp setup --verbose
search-mcp reindex --verbose

# Or use environment variables
DEBUG=1 search-mcp index
SEARCH_MCP_DEBUG=1 search-mcp reindex
```

---

## Comparison: CLI vs MCP

| Feature | CLI | MCP |
|---------|-----|-----|
| **Use case** | Direct terminal access, scripting | AI assistant integration |
| **Setup** | None - just run | Configure MCP client |
| **Output** | Human-readable or JSON | Structured for AI |
| **Best for** | Quick searches, debugging, automation | Natural language queries via AI |

Both interfaces use the same underlying index and search engine.

---

## Troubleshooting

### "Index not found" error
```bash
# Create the index first
search-mcp index

# Or use setup for guided experience
search-mcp setup
```

### Slow indexing
- Check if GPU acceleration is active with `search-mcp status`
- On Windows, DirectML should auto-detect your GPU
- If GPU causes stuttering, use CPU: choose option 2 during `setup`

### No results found
- Ensure the project was indexed: `search-mcp status`
- Try broader search terms
- Use `--mode vector` for conceptual queries
- Rebuild index: `search-mcp reindex`

### Permission errors
```bash
# If using global install, may need sudo on macOS/Linux
sudo npm install -g @liraz-sbz/search-mcp
```

### Verbose output cluttering console
- By default, verbose logs are suppressed
- Use `--verbose` flag only when debugging
- All logs are saved to log files regardless: `search-mcp logs`

### GPU causing system stuttering
- During `setup`, choose option 2 (CPU) instead of GPU
- CPU is slower but keeps system responsive
- This only affects Windows with DirectML

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEBUG=1` | Enable debug output |
| `SEARCH_MCP_DEBUG=1` | Enable search-mcp specific debug output |
| `NO_COLOR=1` | Disable colored output |
