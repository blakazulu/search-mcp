# Search MCP

[![npm version](https://img.shields.io/npm/v/@liraz-sbz/search-mcp.svg)](https://www.npmjs.com/package/@liraz-sbz/search-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

> **"Install once. It just works. Claude always knows your code."**

A local-first Model Context Protocol (MCP) server that provides semantic search capabilities for your codebase.

**Supported Clients:** Claude Desktop, Claude Code, Cursor, Windsurf, Antigravity, and any MCP-compatible client

---

## Table of Contents

- [What Does This Do?](#what-does-this-do)
- [Features](#features)
- [Quick Start](#quick-start)
- [What Can You Ask?](#what-can-you-ask)
- [MCP Search in Action](#mcp-search-in-action)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [For Developers](#for-developers)
- [Updating & Uninstalling](#updating--uninstalling)
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
npm install -g @liraz-sbz/search-mcp
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
      "args": ["@liraz-sbz/search-mcp"]
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

## MCP Search in Action

We tested MCP semantic search against traditional Grep+Read approaches on a real codebase (238 files, 970 chunks). Here are the results:

### Efficiency Comparison

| Query Type | MCP Tokens | Grep Tokens | Efficiency Gain |
|------------|------------|-------------|-----------------|
| Conceptual ("how does file watching work") | 9,224 | 108,015 | **11.7x** |
| Pattern ("error handling patterns") | 7,628 | 192,191 | **25.2x** |
| Technical ("LanceDB vector search") | 9,506 | 174,552 | **18.4x** |
| Broad ("security vulnerabilities") | 5,104 | 143,376 | **28.1x** |
| Documentation ("configuration options") | 7,591 | 177,003 | **23.3x** |
| **TOTAL** | **39,053** | **795,137** | **~20.4x** |

### Key Findings

| Metric | MCP Search | Manual (Grep+Read) |
|--------|------------|-------------------|
| **Token Efficiency** | ~7,800 tokens/query | ~159,000 tokens/query |
| **Relevance** | HIGH (semantic understanding) | MEDIUM (keyword noise) |
| **Search Speed** | 14-17ms | Multiple tool calls |
| **Scalability** | Constant (10 chunks) | Linear with codebase |

### Configuration Testing

We also tested 21 different configuration combinations to find optimal settings:

| Best In Category | Configuration | Value |
|-----------------|---------------|-------|
| Lowest Latency | all-features | 18.8ms |
| Highest Precision@5 | default | 22% |
| Best Token Efficiency | alpha-0.5 | 2.5x vs Grep |

### Why MCP Wins

1. **Chunked Retrieval** - Returns only relevant code portions, not entire files
2. **Semantic Understanding** - Finds conceptually related content without exact keywords
3. **Pre-filtered Results** - No manual file selection needed
4. **Consistent Size** - Always ~10 chunks regardless of codebase size
5. **Automatic Deduplication** - 15-17% reduction from overlapping chunks

> For the full test methodology and raw data, see [docs/search-comparison-test.md](docs/search-comparison-test.md)

---

## Configuration

Config is auto-generated when you first index a project:
- **macOS/Linux:** `~/.mcp/search/indexes/<project-hash>/config.json`
- **Windows:** `%USERPROFILE%\.mcp\search\indexes\<project-hash>\config.json`

**Finding your config file:** Ask your AI assistant "Where is my config file?" or "Show me my search config" - it will use the `get_config` tool to return the exact path.

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
| `lazy` | Large projects, index only when searching |
| `git` | Only search committed code |

For full configuration options, see the [Configuration Reference](docs/configuration.md).

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Detailed installation for all clients |
| [Configuration](docs/configuration.md) | Full config reference + indexing strategies |
| [API Reference](docs/api-reference.md) | Complete tool documentation |
| [Examples](docs/examples.md) | Use cases & best practices |
| [Troubleshooting](docs/troubleshooting.md) | Common issues & solutions |
| [Roadmap](ROADMAP.md) | Planned features |
| [Changelog](CHANGELOG.md) | Version history |
| [Contributing](CONTRIBUTING.md) | How to contribute |

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
| `get_index_status` | Show index statistics and paths | No |
| `get_config` | Get config file path and contents | No |
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
| Storage | `~/.mcp/search/indexes/` (macOS/Linux) or `%USERPROFILE%\.mcp\search\indexes\` (Windows) |

For full technical documentation, see [ENGINEERING.RFC.md](docs/design/ENGINEERING.RFC.md).

---

## Updating & Uninstalling

### Updating

**If using `npx` in your config (recommended):** Updates are automatic - you always get the latest version.

**If installed globally:**
```bash
npm install -g @liraz-sbz/search-mcp
```

### Uninstalling

**1. Remove from your AI assistant:**

- **Claude Code:** `claude mcp remove search`
- **Other clients:** Delete the `search` entry from your MCP config file

**2. Uninstall the package (if installed globally):**
```bash
npm uninstall -g @liraz-sbz/search-mcp
```

**3. (Optional) Remove index data:**
- **macOS/Linux:** `rm -rf ~/.mcp/search`
- **Windows:** `rmdir /s /q %USERPROFILE%\.mcp\search`

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
