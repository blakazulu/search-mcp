# Search MCP

> **"Install once. It just works. Claude always knows your code."**

A local-first Model Context Protocol (MCP) server that provides semantic search capabilities for your codebase.

**Supported Clients:** Claude Desktop, Claude Code, Cursor, Windsurf, Antigravity, and any MCP-compatible client

---

## Table of Contents

- [What Does This Do?](#what-does-this-do)
- [Features](#features)
- [Quick Start](#quick-start)
- [What Can You Ask?](#what-can-you-ask)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [For Developers](#for-developers)
- [Troubleshooting](#troubleshooting)
- [Privacy & License](#privacy--license)

---

## What Does This Do?

Search MCP makes your AI assistant **smarter about your code**. Instead of you copying and pasting files into the chat, the AI can automatically search your project and find exactly what it needs.

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

---

## Features

- **Just Works** - No setup, no API keys, no accounts
- **Private** - Your code never leaves your computer
- **Always Current** - Automatically updates when you save files
- **Safe** - Never indexes passwords, secrets, or junk files
- **Secure** - Built-in protections against path traversal, symlink attacks, and resource exhaustion

---

## Quick Start

### Step 1: Install Node.js

If you don't have Node.js, download it from [nodejs.org](https://nodejs.org/) (version 18 or higher).

### Step 2: Install Search MCP

```bash
npm install -g @blakazulu/search-mcp
```

### Step 3: Configure Your AI Assistant

**Claude Desktop** (full example below) | [Claude Code](docs/getting-started.md#claude-code-cli) | [Cursor](docs/getting-started.md#cursor) | [Windsurf](docs/getting-started.md#windsurf) | [Antigravity](docs/getting-started.md#antigravity)

#### Claude Desktop Setup

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

For other clients, see the [Getting Started Guide](docs/getting-started.md).

### Step 4: Start Using It

1. Open your project folder in your AI assistant
2. Ask a question about your code:
   ```
   "How does the authentication work?"
   ```
3. On first use, confirm the indexing prompt (type "yes")
4. Wait for indexing to complete (~1 minute for most projects)
5. Get your answer!

From now on, just ask questions naturally. The AI will automatically search your code.

---

## What Can You Ask?

Once set up, just talk naturally:

- "How does user registration work?"
- "Find all files related to payments"
- "What's the database schema?"
- "Show me where errors are handled"
- "What files import the Logger class?"
- "Search the docs for API rate limits"

See more [examples and use cases](docs/examples.md).

---

## Configuration

Config is auto-generated at `~/.mcp/search/indexes/<project-hash>/config.json`.

**Key options:**

| Option | Default | Description |
|--------|---------|-------------|
| `indexingStrategy` | `"realtime"` | `"realtime"`, `"lazy"`, or `"git"` |
| `include` | `["**/*"]` | Files to index |
| `exclude` | `[]` | Files to skip |
| `indexDocs` | `true` | Index .md and .txt files separately |

**Indexing Strategies:**

| Strategy | Best For |
|----------|----------|
| `realtime` | Small projects, instant freshness |
| `lazy` | Large projects, reduce CPU |
| `git` | Only search committed code |

For full configuration options, see the [Configuration Reference](docs/configuration.md).

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Detailed installation for all clients |
| [Configuration](docs/configuration.md) | Full config reference + indexing strategies |
| [Examples](docs/examples.md) | Use cases & best practices |
| [Troubleshooting](docs/troubleshooting.md) | Common issues & solutions |

---

## For Developers

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP CLIENT                             │
│  (Claude Desktop, Claude Code, Cursor, Windsurf, etc.)      │
└─────────────────────────┬───────────────────────────────────┘
                          │ MCP Protocol (stdio)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  SEARCH MCP SERVER                          │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ │
│  │create_    │ │search_code│ │search_by_ │ │get_index_   │ │
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

### MCP Tools

| Tool | Description | Confirmation |
|------|-------------|--------------|
| `create_index` | Create a search index for the current project | Yes |
| `search_code` | Semantic search for relevant code chunks | No |
| `search_docs` | Semantic search for documentation files | No |
| `search_by_path` | Find files by name/glob pattern | No |
| `get_index_status` | Show index statistics | No |
| `reindex_project` | Rebuild the entire index | Yes |
| `reindex_file` | Re-index a single file | No |
| `delete_index` | Remove the project index | Yes |

### Technical Details

| Property | Value |
|----------|-------|
| Embedding Model | `Xenova/all-MiniLM-L6-v2` (384 dimensions) |
| Code Chunk Size | ~1000 tokens |
| Doc Chunk Size | ~2000 tokens |
| Search Latency | < 200ms |
| Storage | `~/.mcp/search/indexes/` |

For full technical documentation, see [ENGINEERING.RFC.md](docs/design/ENGINEERING.RFC.md).

---

## Troubleshooting

**Common issues:**

| Issue | Solution |
|-------|----------|
| "Index not found" | Say "Index this project" to create the index |
| Search results seem wrong | Run `reindex_project` to rebuild |
| Changes not detected | Run `reindex_file` for specific file |

For all error codes and solutions, see the [Troubleshooting Guide](docs/troubleshooting.md).

---

## Privacy & License

**Your code stays on your computer.** Nothing is uploaded anywhere. No accounts, no API keys, no tracking.

MIT License - See [LICENSE](./LICENSE) for details.

---

## Getting Help

- [GitHub Issues](https://github.com/blakazulu/search-mcp/issues) - Report bugs or request features
- [Documentation](./docs/) - Full guides and references
