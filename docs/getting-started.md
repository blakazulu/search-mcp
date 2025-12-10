# Getting Started

[← Back to README](../README.md)

A complete guide to installing and configuring Search MCP for your AI assistant.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Client Setup](#client-setup)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code (CLI)](#claude-code-cli)
  - [Cursor](#cursor)
  - [Windsurf](#windsurf)
  - [Antigravity](#antigravity)
  - [Other MCP Clients](#other-mcp-clients)
- [First-Time Indexing](#first-time-indexing)
- [Verification](#verification)

---

## Prerequisites

**Node.js 18 or higher** is required.

Check if you have Node.js installed:

```bash
node --version
```

If not installed, download from [nodejs.org](https://nodejs.org/) (LTS version recommended).

---

## Installation

Install Search MCP globally:

```bash
npm install -g @blakazulu/search-mcp
```

Or run directly with npx (no installation needed):

```bash
npx -y @blakazulu/search-mcp
```

---

## Client Setup

Choose your AI assistant and follow the configuration steps.

### Claude Desktop

**Config file locations:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Steps:**

1. Open the config file in any text editor
2. Add or merge this configuration:

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

3. Save the file
4. Restart Claude Desktop

---

### Claude Code (CLI)

**Option A: CLI command (recommended)**

```bash
claude mcp add --transport stdio search -- npx -y @blakazulu/search-mcp
```

**Option B: Edit config file**

Edit `~/.claude.json`:

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

**Verify installation:**

```bash
claude mcp list
```

---

### Cursor

**Config file locations:**
- **Global (all projects):** `~/.cursor/mcp.json`
- **Project-specific:** `.cursor/mcp.json` in your project folder

**Steps:**

1. Create or edit the config file
2. Add:

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

**Alternative:** File → Preferences → Cursor Settings → MCP → Add new MCP server

---

### Windsurf

**Config file:** `~/.codeium/windsurf/mcp_config.json`

**Steps:**

1. Create or edit the config file
2. Add:

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

**Alternative:** Click Windsurf Settings (bottom right) → Cascade → MCP → Add Server

---

### Antigravity

1. In Antigravity, click the **⋯** menu in the Agent pane
2. Select **MCP Servers**
3. Click **Manage MCP Servers** → **View raw config**
4. Add:

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

### Other MCP Clients

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

---

## First-Time Indexing

When you first ask a question about your code, you'll be prompted to create an index.

**Step 1:** Open your project folder in your AI assistant

**Step 2:** Ask a question about your code:

```
"How does the authentication work?"
```

**Step 3:** Confirm the indexing prompt:

```
This project hasn't been indexed yet.
Would you like to index it now? (Y/n)
```

Type **"yes"** or **"y"** to continue.

**Step 4:** Wait for indexing to complete:

```
Indexing project at /Users/you/my-project
Please wait - do not interrupt this process...

Found 450 files
Creating chunks... [████████████████████] 100%
Generating embeddings... [████████████████████] 100%

Done! Indexed 450 files (1,205 chunks) in 45 seconds.
```

This usually takes **under 1 minute** for most projects.

**Step 5:** Get your answer!

From now on, just ask questions naturally. The AI will automatically search your code.

---

### Manual Indexing

You can also explicitly request indexing:

```
"Index this project"
```

or

```
"Create a search index for this codebase"
```

---

## Verification

To verify everything is working:

1. Ask: "What's the status of the search index?"
2. You should see statistics about indexed files and chunks

If you encounter issues, see the [Troubleshooting Guide](./troubleshooting.md).

---

## Next Steps

- [Configuration Reference](./configuration.md) - Customize indexing behavior
- [Examples](./examples.md) - See common use cases
- [Troubleshooting](./troubleshooting.md) - Solve common issues
