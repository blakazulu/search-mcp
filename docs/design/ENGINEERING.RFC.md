# Engineering RFC: Search MCP System Architecture

| Metadata | Details |
|:---------|:--------|
| **Document Type** | Technical Specification & RFC |
| **Version** | 1.0.0 |
| **Status** | Approved |
| **Engineering Owner** | Search MCP Team |
| **Target System** | Node.js / TypeScript / MCP / LanceDB |

---

## 1. Executive Summary

Search MCP is a local-first MCP server that provides semantic search capabilities to AI coding assistants (Claude Code, Cursor, Windsurf, etc.). It solves the "context window bottleneck" by indexing a user's local project into a vector database (LanceDB) and allowing the AI to retrieve only relevant code chunks on demand.

The system operates autonomously using file watchers and incremental updates to ensure the index never goes stale.

**Key Design Principles:**
- Zero configuration required
- 100% local execution (privacy-first)
- Automatic index maintenance
- Safe by default (secrets never indexed)

---

## 2. System Architecture

### 2.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP CLIENT                                │
│    (Claude Code, Cursor, Windsurf, Antigravity)             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                    (MCP Protocol - stdio)
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP SERVER                                │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ │
│  │create_    │ │search_now │ │search_by_ │ │get_index_   │ │
│  │index      │ │           │ │path       │ │status       │ │
│  └───────────┘ └───────────┘ └───────────┘ └─────────────┘ │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                 │
│  │reindex_   │ │reindex_   │ │delete_    │                 │
│  │project    │ │file       │ │index      │                 │
│  └───────────┘ └───────────┘ └───────────┘                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Index       │ │   File        │ │   Integrity   │
│   Manager     │ │   Watcher     │ │   Engine      │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Chunking    │ │   Embedding   │ │   LanceDB     │
│   Engine      │ │   Engine      │ │   Store       │
└───────────────┘ └───────────────┘ └───────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **MCP Server** | Handles JSON-RPC messages, routes to tool handlers |
| **Index Manager** | Orchestrates indexing operations (create, update, delete) |
| **File Watcher** | Monitors filesystem for changes, triggers incremental updates |
| **Integrity Engine** | Periodic reconciliation to fix drift from missed events |
| **Chunking Engine** | Splits files into indexable chunks |
| **Embedding Engine** | Converts text chunks to vectors |
| **LanceDB Store** | Persists vectors and enables similarity search |

---

## 3. Storage Design

### 3.1 Global Storage Strategy

Indices are stored in a global user directory to:
- Support multiple projects
- Avoid polluting user source trees
- Enable easy cleanup

**Root Path:** `~/.mcp/search/`

**Project Isolation:** Each project gets a unique directory based on SHA256 hash of its absolute path.

```
~/.mcp/search/
├── config.json                    # Global defaults (optional)
└── indexes/
    ├── <SHA256(project_path_1)>/
    │   ├── index.lancedb/         # Vector database
    │   ├── fingerprints.json      # File hash tracking
    │   ├── config.json            # Project configuration
    │   ├── metadata.json          # Index metadata
    │   └── logs/                  # Rolling logs
    └── <SHA256(project_path_2)>/
        └── ...
```

### 3.2 Database Schema

**Table Name:** `project_docs`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique UUIDv4 for the chunk |
| `path` | String | Relative file path (e.g., `src/main.ts`) |
| `text` | String | The actual text content of the chunk |
| `vector` | Float32[384] | Embedding vector (384 dimensions for MiniLM) |
| `start_line` | Int | Start line number in source file |
| `end_line` | Int | End line number in source file |
| `content_hash` | String | SHA256 hash of source file (for versioning) |

### 3.3 Fingerprints Schema

**File:** `fingerprints.json`

```json
{
  "src/index.ts": "a1b2c3d4e5f6...",
  "src/utils/helper.ts": "f6e5d4c3b2a1...",
  "README.md": "1a2b3c4d5e6f..."
}
```

Key-value store mapping relative file paths to SHA256 content hashes. Used for delta detection during incremental indexing.

### 3.4 Metadata Schema

**File:** `metadata.json`

```json
{
  "version": "1.0.0",
  "projectPath": "/Users/dev/my-project",
  "createdAt": "2024-01-15T10:00:00Z",
  "lastFullIndex": "2024-01-15T10:00:00Z",
  "lastIncrementalUpdate": "2024-01-15T14:30:00Z",
  "stats": {
    "totalFiles": 450,
    "totalChunks": 1205,
    "storageSizeBytes": 47185920
  }
}
```

---

## 4. MCP Tools API

### 4.1 `create_index`

Creates a new index for the current project.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Behavior:**
1. Detect project root (see Section 5.1)
2. Prompt user for confirmation
3. Display progress during indexing
4. Create config.json with defaults
5. Return success with stats

**Output:**
```json
{
  "status": "success",
  "projectPath": "/Users/dev/my-project",
  "filesIndexed": 450,
  "chunksCreated": 1205,
  "duration": "45s"
}
```

**Confirmation Required:** Yes

---

### 4.2 `search_now`

Performs semantic similarity search.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The question or code concept to search for"
    },
    "top_k": {
      "type": "number",
      "default": 10,
      "description": "Number of results to return (1-50)"
    }
  },
  "required": ["query"]
}
```

**Output:**
```json
{
  "results": [
    {
      "path": "src/auth/login.ts",
      "text": "export async function login(email: string, password: string) {...}",
      "score": 0.92,
      "startLine": 45,
      "endLine": 78
    }
  ],
  "totalResults": 3,
  "searchTimeMs": 45
}
```

**Confirmation Required:** No

---

### 4.3 `search_by_path`

Finds files matching a glob pattern.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match (e.g., '**/auth*.ts', 'src/**/*.md')"
    },
    "limit": {
      "type": "number",
      "default": 20,
      "description": "Maximum results to return"
    }
  },
  "required": ["pattern"]
}
```

**Output:**
```json
{
  "matches": [
    "src/auth/login.ts",
    "src/auth/logout.ts",
    "src/auth/middleware.ts"
  ],
  "totalMatches": 3
}
```

**Confirmation Required:** No

---

### 4.4 `get_index_status`

Returns diagnostic information about the current index.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Output:**
```json
{
  "status": "ready",
  "projectPath": "/Users/dev/my-project",
  "totalFiles": 450,
  "totalChunks": 1205,
  "lastUpdated": "2024-01-15T14:30:00Z",
  "storageSize": "45MB",
  "watcherActive": true
}
```

**Confirmation Required:** No

---

### 4.5 `reindex_project`

Rebuilds the entire index from scratch.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Behavior:**
1. Prompt user for confirmation
2. Delete existing index data
3. Perform full re-index
4. Return success with stats

**Output:**
```json
{
  "status": "success",
  "filesIndexed": 455,
  "chunksCreated": 1220,
  "duration": "48s",
  "message": "Index rebuilt successfully"
}
```

**Confirmation Required:** Yes - "This will rebuild the entire index. Continue?"

---

### 4.6 `reindex_file`

Re-indexes a single specific file.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Relative path to the file (e.g., 'src/auth/login.ts')"
    }
  },
  "required": ["path"]
}
```

**Behavior:**
1. Validate file exists and is indexable
2. Delete existing chunks for this file
3. Re-chunk and re-embed
4. Update fingerprint

**Output:**
```json
{
  "status": "success",
  "path": "src/auth/login.ts",
  "chunksCreated": 3,
  "message": "File re-indexed successfully"
}
```

**Confirmation Required:** No

---

### 4.7 `delete_index`

Removes the index for the current project.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Behavior:**
1. Prompt user for confirmation
2. Stop file watcher
3. Delete index directory
4. Return success

**Output:**
```json
{
  "status": "success",
  "projectPath": "/Users/dev/my-project",
  "message": "Index deleted successfully"
}
```

**Confirmation Required:** Yes - "Delete the index for this project? This cannot be undone."

---

## 5. Core Engines

### 5.1 Project Root Detection Engine

**Purpose:** Automatically detect the project root directory.

**Algorithm:**
```
1. Start from current working directory (CWD)
2. Search upward for markers (in order):
   - .git/
   - package.json
   - pyproject.toml
   - Cargo.toml
   - go.mod
3. If marker found → Return that directory
4. If reached filesystem root → Prompt user:
   "Could not detect project root.
    [1] Use current directory: {CWD}
    [2] Enter a custom path
    Choice: "
```

### 5.2 Indexing Policy Engine

**Purpose:** Determine which files should be indexed.

#### Hardcoded Deny List (Cannot Override)

These patterns are **ALWAYS** excluded to prevent security risks and performance issues:

| Category | Patterns |
|----------|----------|
| **Dependencies** | `node_modules/`, `jspm_packages/`, `bower_components/`, `vendor/`, `.venv/`, `venv/` |
| **Version Control** | `.git/`, `.hg/`, `.svn/` |
| **Build Artifacts** | `dist/`, `build/`, `out/`, `target/`, `__pycache__/`, `.next/`, `.nuxt/` |
| **Secrets** | `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx` |
| **Logs/Locks** | `*.log`, `*.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, `poetry.lock` |
| **IDE Config** | `.idea/`, `.vscode/`, `.DS_Store`, `*.swp`, `*.swo` |
| **Testing** | `coverage/`, `.nyc_output/`, `.pytest_cache/` |

#### Inclusion Logic (Priority Order)

```
For each file:
1. Hard Deny List     → If matches → SKIP (always)
2. User Exclude       → If matches config.exclude → SKIP
3. Gitignore          → If config.respectGitignore && matches .gitignore → SKIP
4. Binary Detection   → If is binary file → SKIP
5. Size Check         → If > config.maxFileSize → SKIP
6. User Include       → If matches config.include → INDEX
7. Default            → INDEX
```

#### Safety Thresholds

| Threshold | Value | Behavior |
|-----------|-------|----------|
| Max Files | 50,000 | Warn user, require confirmation to proceed |
| Max File Size | 1MB | Skip file silently |
| Binary Detection | Automatic | Skip binary files (images, videos, etc.) |

### 5.3 Chunking Engine

**Purpose:** Split files into indexable chunks.

**Strategy:** Recursive Character Text Splitter

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Chunk Size | ~1000 tokens (~4000 chars) | Fits well in context, captures meaningful code blocks |
| Chunk Overlap | ~200 tokens (~800 chars) | Preserves context across chunk boundaries |
| Separators | `\n\n`, `\n`, ` `, `` | Prioritize natural breaks (paragraphs, lines) |

**Chunk Metadata:**
```typescript
interface Chunk {
  id: string;          // UUIDv4
  text: string;        // Chunk content
  path: string;        // Source file path
  startLine: number;   // Starting line in source
  endLine: number;     // Ending line in source
  contentHash: string; // SHA256 of source file
}
```

### 5.4 Embedding Engine

**Purpose:** Convert text chunks to vector embeddings.

**Model:** `Xenova/all-MiniLM-L6-v2`

| Property | Value |
|----------|-------|
| Dimensions | 384 |
| Model Size | ~90MB |
| Runtime | ONNX (via @xenova/transformers) |
| Location | CPU (no GPU required) |

**First-Run Behavior:**
```
1. Check if model cached at ~/.cache/huggingface/
2. If not cached:
   - Display: "Downloading embedding model... (one-time, ~90MB)"
   - Download model
   - Display: "Done! Model cached for future use."
3. Load model
4. Ready for inference
```

**Batch Processing:**
- Process chunks in batches of 32
- Provides progress updates during indexing

### 5.5 File Watcher Engine

**Purpose:** Monitor filesystem for changes and trigger incremental updates.

**Library:** `chokidar`

**Configuration:**
```typescript
{
  ignored: [/* hardcoded deny list */],
  persistent: true,
  ignoreInitial: true,  // Don't trigger on startup
  awaitWriteFinish: {
    stabilityThreshold: 500,  // Debounce: 500ms
    pollInterval: 100
  }
}
```

**Event Handling:**
```
On 'add' or 'change':
  1. Check if file matches deny list → Ignore
  2. Calculate SHA256 hash
  3. Compare with fingerprints.json
  4. If hash differs:
     - Delete old chunks for this file
     - Re-chunk file
     - Generate embeddings
     - Insert new chunks
     - Update fingerprint
  5. If hash same → Ignore (file unchanged)

On 'unlink' (delete):
  1. Delete all chunks for this file
  2. Remove from fingerprints.json
```

### 5.6 Integrity Engine

**Purpose:** Fix drift caused by missed watcher events.

**Triggers:**
- On MCP server startup
- Periodic (configurable, default: every 24 hours)

**Algorithm:**
```
1. Load fingerprints.json
2. Scan filesystem for all indexable files
3. For each file:
   - Calculate current hash
   - Compare with stored fingerprint
   - If different → Queue for re-index
   - If missing from fingerprints → Queue for index
4. For each fingerprint entry:
   - If file no longer exists → Queue for deletion
5. Process queued operations
6. Update fingerprints.json
```

---

## 6. Error Handling

### 6.1 Error Response Format

All errors include dual messages:

```typescript
interface MCPError {
  code: string;            // Machine-readable error code
  userMessage: string;     // Friendly, non-technical message
  developerMessage: string; // Technical details for debugging
}
```

### 6.2 Error Catalog

| Code | User Message | Developer Message |
|------|--------------|-------------------|
| `INDEX_NOT_FOUND` | "This project hasn't been indexed yet. Would you like to index it now?" | `INDEX_NOT_FOUND: No index at ~/.mcp/search/indexes/{hash}/` |
| `MODEL_DOWNLOAD_FAILED` | "Couldn't set up the search engine. Please check your internet connection and try again." | `MODEL_DOWNLOAD_FAILED: {network_error}` |
| `INDEX_CORRUPT` | "The search index seems corrupted. Rebuilding it now..." | `INDEX_CORRUPT: LanceDB read error - {details}` |
| `FILE_LIMIT_WARNING` | "This project is very large ({count} files). Indexing may take several minutes. Continue?" | `FILE_LIMIT_WARNING: {count} files exceeds soft limit of 50,000` |
| `PERMISSION_DENIED` | "Can't access some files in this project. Check folder permissions." | `PERMISSION_DENIED: EACCES reading {path}` |
| `DISK_FULL` | "Not enough disk space to create the search index. Free up some space and try again." | `DISK_FULL: ENOSPC - need ~{needed}MB, have {available}MB` |
| `FILE_NOT_FOUND` | "The file '{path}' doesn't exist or isn't indexed." | `FILE_NOT_FOUND: {path} not in index` |
| `INVALID_PATTERN` | "The search pattern '{pattern}' is invalid. Please check the syntax." | `INVALID_PATTERN: {glob_error}` |
| `PROJECT_NOT_DETECTED` | "Could not detect project root. Please choose a directory." | `PROJECT_NOT_DETECTED: No markers found in path hierarchy` |

---

## 7. Configuration

### 7.1 Auto-Generated Config

Created at `~/.mcp/search/indexes/<hash>/config.json` on first index:

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

### 7.2 Config Validation

On load, validate:
- `include` is array of strings (glob patterns)
- `exclude` is array of strings (glob patterns)
- `respectGitignore` is boolean
- `maxFileSize` matches pattern `^\d+(KB|MB)$`
- `maxFiles` is positive integer

Invalid config → Use defaults + log warning

---

## 8. Dependencies

### 8.1 Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.5.0 | MCP server framework |
| `@xenova/transformers` | ^2.17.0 | Local embedding model |
| `vectordb` (LanceDB) | ^0.4.0 | Vector database |
| `chokidar` | ^3.5.0 | File watching |
| `glob` | ^10.0.0 | Glob pattern matching |
| `ignore` | ^5.3.0 | Gitignore parsing |
| `is-binary-path` | ^2.1.0 | Binary file detection |
| `uuid` | ^9.0.0 | UUID generation |
| `zod` | ^3.22.0 | Schema validation |

### 8.2 Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.3.0 | Type checking |
| `vitest` | ^1.0.0 | Testing |
| `@types/node` | ^20.0.0 | Node.js types |

---

## 9. Versioning Strategy

This project follows **Semantic Versioning (SemVer)**.

### Version Format: `MAJOR.MINOR.PATCH`

| Bump | When to Use | Examples |
|------|-------------|----------|
| **MAJOR** | Breaking changes | Tool schema changes, storage format changes, removed tools |
| **MINOR** | New features (backwards-compatible) | New tools, new config options, new engines |
| **PATCH** | Bug fixes & improvements | Performance fixes, bug fixes, documentation |

### Breaking Change Examples (MAJOR)

- Changing `search_now` input/output schema
- Changing LanceDB table structure
- Changing storage path format (`~/.mcp/search/`)
- Removing or renaming a tool

### Non-Breaking Examples (MINOR)

- Adding `list_projects` tool
- Adding new config option
- Adding new file type detection

### Migration Policy

- **MAJOR versions** must include migration guide in release notes
- **Storage format changes** should auto-migrate when possible
- **Tool changes** should deprecate before removing

---

## 10. Failure Modes & Recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| **LanceDB Lockfile** | Check for stale .lock on startup | Delete stale lock, retry |
| **Embedding Model Failure** | Model load throws | Re-download model |
| **Index Corruption** | LanceDB read error | Backup to .bak, trigger full reindex |
| **Watcher Crash** | Process error handler | Restart watcher, run integrity check |
| **Out of Memory** | Process OOM | Reduce batch size, retry |

---

## 11. Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Search latency | < 200ms | Time from query to results |
| Indexing throughput | ~100 files/sec | Files processed per second |
| Memory (indexing) | < 500MB | Peak memory during full index |
| Memory (idle) | < 100MB | Memory when watching only |
| Startup time | < 2s | Time to MCP ready state |
| Incremental update | < 1s | Time from file save to index update |

---

## 12. Future Roadmap (v2.0+)

| Feature | Description | Complexity |
|---------|-------------|------------|
| **AST Chunking** | Use tree-sitter for language-aware splitting (functions/classes) | High |
| **Hybrid Search** | Combine vector search with BM25 keyword search | Medium |
| **Multi-Root Support** | Index multiple folders into one logical index (monorepo) | Medium |
| **Query Expansion** | Rewrite queries for better retrieval | Medium |
| **`list_projects`** | Show all indexed projects with stats | Low |

---

## Appendix A: Directory Structure

```
search-mcp/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server setup
│   ├── tools/
│   │   ├── createIndex.ts
│   │   ├── searchNow.ts
│   │   ├── searchByPath.ts
│   │   ├── getIndexStatus.ts
│   │   ├── reindexProject.ts
│   │   ├── reindexFile.ts
│   │   └── deleteIndex.ts
│   ├── engines/
│   │   ├── projectRoot.ts    # Project detection
│   │   ├── indexPolicy.ts    # File filtering
│   │   ├── chunking.ts       # Text splitting
│   │   ├── embedding.ts      # Vector generation
│   │   ├── fileWatcher.ts    # Change detection
│   │   └── integrity.ts      # Drift reconciliation
│   ├── storage/
│   │   ├── lancedb.ts        # Vector store
│   │   ├── fingerprints.ts   # Hash tracking
│   │   ├── config.ts         # Configuration
│   │   └── metadata.ts       # Index metadata
│   ├── errors/
│   │   └── index.ts          # Error definitions
│   └── utils/
│       ├── hash.ts           # SHA256 utilities
│       ├── paths.ts          # Path manipulation
│       └── logger.ts         # Logging
├── tests/
│   └── ...
├── package.json
├── tsconfig.json
└── README.md
```

---

## Appendix B: Installation & Usage

### Installation

```bash
npm install -g @blakazulu/search-mcp
```

### Claude Desktop Configuration

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["@blakazulu/search-mcp"]
    }
  }
}
```

### Cursor Configuration

File > Preferences > Cursor Settings > MCP > Add new global MCP server

```json
{
  "search": {
    "command": "npx",
    "args": ["@blakazulu/search-mcp"]
  }
}
```
