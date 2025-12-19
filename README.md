# Search MCP 🔍

**Make your AI 58x smarter about your code.**

```bash
# Navigate to your project, then run:
npx @liraz-sbz/search-mcp setup
```

Your AI assistant searches your entire codebase semantically. No API keys. No cloud. 100% local.

[![npm version](https://img.shields.io/npm/v/@liraz-sbz/search-mcp.svg)](https://www.npmjs.com/package/@liraz-sbz/search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@liraz-sbz/search-mcp.svg)](https://www.npmjs.com/package/@liraz-sbz/search-mcp)
[![GitHub stars](https://img.shields.io/github/stars/blakazulu/search-mcp.svg)](https://github.com/blakazulu/search-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Works with:** Claude Desktop • Claude Code • Cursor • Windsurf • Antigravity

---

## Why Search MCP?

| Without Search MCP | With Search MCP |
|--------------------|-----------------|
| Copy-paste files manually | AI finds code automatically |
| ~488,000 tokens per query | ~8,400 tokens per query |
| "Context limit exceeded" | Always fits |
| Multiple tool calls | Single semantic search |

---

## Table of Contents

- [What Does This Do?](#what-does-this-do)
- [Features](#features)
- [Quick Start](#quick-start)
- [Standalone CLI](#standalone-cli)
- [What Can You Ask?](#what-can-you-ask)
- [Performance](#performance)
- [Configuration](#configuration)
- [FAQ](#faq)
- [Documentation](#documentation)
- [For Developers](#for-developers)
- [Updating & Uninstalling](#updating--uninstalling)
- [Troubleshooting](#troubleshooting)
- [Privacy & License](#privacy--license)

---

<a id="what-does-this-do"></a>

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

<a id="features"></a>

## Features

- **Just Works** - No setup, no API keys, no accounts
- **Private** - Your code never leaves your computer
- **Always Current** - Automatically updates when you save files
- **Safe** - Never indexes passwords, secrets, or junk files
- **Secure** - Built-in protections against path traversal, symlink attacks, and resource exhaustion

---

<a id="quick-start"></a>

## Quick Start

**Prerequisites:** [Node.js 18+](https://nodejs.org/)

### Option 1: Interactive Setup (Recommended)

Navigate to your project folder and run:

```bash
npx @liraz-sbz/search-mcp setup
```

This interactive wizard will:
- Confirm you're in the correct project folder
- Auto-detect and configure your AI assistants (Claude Desktop, Claude Code, Cursor, Windsurf)
- Offer to index your project immediately with progress bars

**See all CLI commands:** [CLI Reference](docs/readme-files/cli.md)

### Option 2: Quick Setup (One-liner)

```bash
npx --yes @liraz-sbz/search-mcp@latest --setup
```

Configures your AI assistants automatically. You'll need to index separately via your AI assistant.

### Option 3: Manual Configuration

Add to your MCP config file:

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@liraz-sbz/search-mcp"]
    }
  }
}
```

**Config file locations:**
- **Claude Desktop (Mac):** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows):** `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Code:** `claude mcp add search -- npx @liraz-sbz/search-mcp`

**See full guide:** [Getting Started](docs/readme-files/getting-started.md)

### After Setup

1. **Restart your AI assistant**
2. **Verify connection:** Type `/mcp` and check that "search" is listed
3. **Start searching:** Ask `"How does login work?"`

That's it!

---

<a id="standalone-cli"></a>

## Standalone CLI

Search MCP also works as a standalone CLI tool - no MCP client required:

```bash
# Index your project
npx @liraz-sbz/search-mcp index

# Search directly from terminal
npx @liraz-sbz/search-mcp search "authentication logic"

# Check index status
npx @liraz-sbz/search-mcp status
```

**Features:**
- Progress bars and colored output
- `--json` flag for scripting
- Works independently of AI assistants

Perfect for quick searches, debugging, or CI/CD integration.

[Full CLI Reference →](docs/readme-files/cli.md)

---

<a id="what-can-you-ask"></a>

## What Can You Ask?

Once set up, just talk naturally:

- "How does user registration work?"
- "Find all files related to payments"
- "What's the database schema?"
- "Show me where errors are handled"
- "What files import the Logger class?"
- "Search the docs for API rate limits"

See more [examples and use cases](docs/readme-files/examples.md).

---

<a id="performance"></a>

## Performance

| Metric | Value |
|--------|-------|
| **Efficiency vs Grep** | **58x fewer tokens** |
| **Search speed** | ~400ms (with GPU acceleration) |
| **Tokens per query** | ~8,400 |
| **Codebase tested** | 306 files, 4,231 chunks |

Semantic search returns focused code chunks instead of entire files. Your AI stays under context limits even on large codebases.

[Full benchmark details →](docs/readme-files/search-comparison-test.md)

---

<a id="configuration"></a>

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

For full configuration options, see the [Configuration Reference](docs/readme-files/configuration.md).

---

<a id="faq"></a>

## FAQ

**Does my code leave my computer?**
Never. All processing happens locally. No cloud, no API calls, no tracking.

**How big can my codebase be?**
Tested on projects with 1000+ files. Indexing takes ~1 minute for most projects.

**What languages are supported?**
Any text-based code or documentation. The semantic search understands concepts across all languages.

**How do I update the index?**
File changes are detected automatically. Use `reindex_project` for a full rebuild.

---

<a id="documentation"></a>

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/readme-files/getting-started.md) | Detailed installation for all clients |
| [CLI Reference](docs/readme-files/cli.md) | Standalone command-line interface |
| [Configuration](docs/readme-files/configuration.md) | Full config reference + indexing strategies |
| [API Reference](docs/readme-files/api-reference.md) | Complete tool documentation |
| [Examples](docs/readme-files/examples.md) | Use cases & best practices |
| [Troubleshooting](docs/readme-files/troubleshooting.md) | Common issues & solutions |
| [Roadmap](ROADMAP.md) | Planned features |
| [Changelog](CHANGELOG.md) | Version history |
| [Contributing](CONTRIBUTING.md) | How to contribute |

---

<a id="for-developers"></a>

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
│   Engine      │ │   (BGE)       │ │   (Local)     │
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
| `get_file_summary` | Extract symbols and complexity metrics from a file | No |
| `reindex_project` | Rebuild the entire index | Yes |
| `reindex_file` | Re-index a single file | No |
| `delete_index` | Remove the project index | Yes |

### Technical Details

| Property | Value |
|----------|-------|
| Embedding Models | Code: `Xenova/bge-small-en-v1.5` (384d), Docs: `Xenova/bge-base-en-v1.5` (768d) |
| Code Chunk Size | ~1000 tokens |
| Doc Chunk Size | ~2000 tokens |
| Search Latency | < 200ms |
| Storage | `~/.mcp/search/indexes/` (macOS/Linux) or `%USERPROFILE%\.mcp\search\indexes\` (Windows) |

### GPU Acceleration

Search MCP automatically uses GPU acceleration when available for faster indexing:

| Platform | GPU Support | Notes |
|----------|-------------|-------|
| **Windows** | DirectML | Automatic GPU acceleration on all modern GPUs (NVIDIA, AMD, Intel) |
| **macOS** | CPU only | CoreML not available in Node.js bindings |
| **Linux** | CPU only | CUDA requires separate package (not included) |

**GPU Compatibility (Windows):**
- NVIDIA: GeForce GTX 1000+, RTX series, Quadro
- AMD: RX 400+, Radeon Pro
- Intel: Arc, UHD/Iris integrated graphics

GPU acceleration is automatic - no configuration needed. The system detects available hardware and selects the best option. Check `get_index_status` to see which compute device is being used.

For full technical documentation, see [ENGINEERING.RFC.md](docs/design/ENGINEERING.RFC.md).

---

<a id="updating--uninstalling"></a>

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

<a id="troubleshooting"></a>

## Troubleshooting

**Common issues:**

| Issue | Solution |
|-------|----------|
| "Index not found" | Say "Index this project" to create the index |
| MCP connection issues | Run `npx --yes @liraz-sbz/search-mcp@latest --setup` to reconfigure |
| Search results seem wrong | Run `reindex_project` to rebuild |
| Changes not detected | Run `reindex_file` for specific file |

**CLI commands:**
```bash
npx @liraz-sbz/search-mcp index                # Create/update index
npx @liraz-sbz/search-mcp search "query"       # Search code
npx @liraz-sbz/search-mcp status               # Show index info
npx @liraz-sbz/search-mcp --setup              # Configure MCP clients
```

See the [CLI Reference](docs/readme-files/cli.md) for all commands and options.

**Debug mode:** Set `DEBUG=1` or `SEARCH_MCP_DEBUG=1` environment variable for verbose logging.

For all error codes and solutions, see the [Troubleshooting Guide](docs/readme-files/troubleshooting.md).

---

<a id="privacy--license"></a>

## Privacy & License

**Your code stays on your computer.** Nothing is uploaded anywhere. No accounts, no API keys, no tracking.

MIT License - See [LICENSE](./LICENSE) for details.

---

## Getting Help

- [GitHub Issues](https://github.com/blakazulu/search-mcp/issues) - Report bugs or request features
- [Documentation](./docs/) - Full guides and references
