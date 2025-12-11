# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Search MCP is a local-first Model Context Protocol (MCP) server that provides semantic search capabilities for codebases. It enables AI assistants (Claude Desktop, Claude Code, Cursor, Windsurf, Antigravity) to search local code without sending data to external servers.

**Key Value Proposition:** "Install once. It just works. Claude always knows your code."

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm run test

# Run a single test file
npx vitest run <test-file>

# Lint code
npm run lint

# Run the MCP server locally
npx @liraz-sbz/search-mcp
```

## Architecture

### High-Level Data Flow

```
MCP Client (Claude/Cursor/etc)
    │ MCP Protocol (stdio)
    ▼
MCP Server (routes JSON-RPC to tool handlers)
    │
    ├── Index Manager (orchestrates create/update/delete)
    ├── File Watcher (chokidar - triggers incremental updates)
    └── Integrity Engine (periodic reconciliation)
            │
            ├── Chunking Engine (splits files into ~1000 token chunks)
            ├── Embedding Engine (@xenova/transformers - MiniLM model)
            └── LanceDB Store (local vector database)
```

### Directory Structure (Planned)

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server setup
├── tools/                # MCP tool handlers
│   ├── createIndex.ts
│   ├── searchNow.ts
│   ├── searchByPath.ts
│   ├── getIndexStatus.ts
│   ├── reindexProject.ts
│   ├── reindexFile.ts
│   └── deleteIndex.ts
├── engines/              # Core processing logic
│   ├── projectRoot.ts    # Project detection
│   ├── indexPolicy.ts    # File filtering (deny list, gitignore)
│   ├── chunking.ts       # Text splitting
│   ├── embedding.ts      # Vector generation
│   ├── fileWatcher.ts    # Change detection
│   └── integrity.ts      # Drift reconciliation
├── storage/              # Persistence layer
│   ├── lancedb.ts        # Vector store
│   ├── fingerprints.ts   # File hash tracking
│   ├── config.ts         # Configuration
│   └── metadata.ts       # Index metadata
├── errors/
│   └── index.ts          # Error definitions
└── utils/
    ├── hash.ts           # SHA256 utilities
    ├── paths.ts          # Path manipulation
    └── logger.ts         # Logging
```

### Storage Location

Indexes stored at `~/.mcp/search/indexes/<SHA256(project_path)>/` containing:
- `index.lancedb/` - Code vector database
- `docs.lancedb/` - Docs vector database (prose-optimized)
- `fingerprints.json` - Code file hash tracking
- `docs-fingerprints.json` - Doc file hash tracking
- `config.json` - Project configuration
- `metadata.json` - Index metadata (includes docsStats)

## MCP Tools

| Tool | Purpose | Confirmation Required |
|------|---------|----------------------|
| `create_index` | Create index for current project (code + docs) | Yes |
| `search_code` | Semantic search for code (query + top_k) | No |
| `search_docs` | Semantic search for docs (.md, .txt) | No |
| `search_by_path` | Find files by glob pattern | No |
| `get_index_status` | Show index statistics and paths | No |
| `get_config` | Get config file path and contents | No |
| `reindex_project` | Rebuild entire index | Yes |
| `reindex_file` | Re-index single file | No |
| `delete_index` | Remove project index | Yes |

## Key Technical Details

### Embedding Model
- Model: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- Runtime: ONNX via `@xenova/transformers`
- Size: ~90MB (auto-downloaded to `~/.cache/huggingface/`)

### Chunking

**Code files:**
- Chunk size: ~1000 tokens (~4000 chars)
- Overlap: ~200 tokens (~800 chars)
- Separators: `\n\n`, `\n`, ` `, ``

**Doc files (.md, .txt):**
- Chunk size: ~2000 tokens (~8000 chars)
- Overlap: ~500 tokens (~2000 chars)
- Separators: `\n\n`, `\n`, `. `, ` `, ``

### Hardcoded Deny List (Cannot Override)
Always excluded: `node_modules/`, `.git/`, `dist/`, `build/`, `.env`, `*.pem`, `*.key`, `*.log`, `*.lock`, `.idea/`, `.vscode/`, `coverage/`

### Performance Targets
- Search latency: < 200ms
- Indexing: ~100 files/sec
- Memory (indexing): < 500MB
- Memory (idle): < 100MB

## Error Handling Pattern

All errors include dual messages:
```typescript
interface MCPError {
  code: string;            // e.g., INDEX_NOT_FOUND
  userMessage: string;     // Friendly message for users
  developerMessage: string; // Technical details for debugging
}
```

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP server framework
- `@xenova/transformers` - Local embedding model
- `vectordb` (LanceDB) - Vector database
- `chokidar` - File watching
- `glob` - Pattern matching
- `ignore` - Gitignore parsing
- `zod` - Schema validation
- `vitest` - Testing
- we have a file CHANGELOG.md in the root. every bug fix/chaange/feature we add/remove/do in our code and should be documented there - should be added there.