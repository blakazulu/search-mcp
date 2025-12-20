# Engineering RFC: Search MCP System Architecture

| Metadata | Details |
|:---------|:--------|
| **Document Type** | Technical Specification & RFC |
| **Version** | 2.0.0 |
| **Status** | Approved |
| **Engineering Owner** | Search MCP Team |
| **Target System** | Node.js / TypeScript / MCP / LanceDB |
| **Last Updated** | 2025-12-20 |

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
│  │create_    │ │search_code │ │search_    │ │search_by_   │ │
│  │index      │ │           │ │docs       │ │path         │ │
│  └───────────┘ └───────────┘ └───────────┘ └─────────────┘ │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ │
│  │get_index_ │ │get_file_  │ │get_       │ │reindex_     │ │
│  │status     │ │summary    │ │config     │ │project      │ │
│  └───────────┘ └───────────┘ └───────────┘ └─────────────┘ │
│  ┌───────────┐ ┌───────────┐                               │
│  │reindex_   │ │delete_    │                               │
│  │file       │ │index      │                               │
│  └───────────┘ └───────────┘                               │
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
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Query       │ │   Hybrid      │ │   Advanced    │
│   Expansion   │ │   Search/FTS  │ │   Ranking     │
└───────────────┘ └───────────────┘ └───────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **MCP Server** | Handles JSON-RPC messages, routes to tool handlers |
| **Index Manager** | Orchestrates indexing operations (create, update, delete) |
| **File Watcher** | Monitors filesystem for changes, triggers incremental updates |
| **Integrity Engine** | Periodic reconciliation to fix drift from missed events |
| **Chunking Engine** | Splits files into indexable chunks (character, code-aware, AST, markdown) |
| **Embedding Engine** | Converts text chunks to vectors (GPU-accelerated on Windows) |
| **LanceDB Store** | Persists vectors and enables similarity search (with IVF-PQ indexing) |
| **FTS Engine** | Full-text search for keyword matching (BM25-based) |
| **Hybrid Search** | Combines vector + FTS results via Reciprocal Rank Fusion |
| **Query Expansion** | Expands queries with synonyms (60+ mappings) |
| **Advanced Ranking** | Multi-factor ranking with intent detection and name matching |
| **Auto-Reindexer** | Search-triggered automatic reindexing for stale files |
| **Symbol Extractor** | On-demand extraction of functions, classes, complexity metrics |

---

## 3. Storage Design

### 3.1 Global Storage Strategy

Indices are stored in a global user directory to:
- Support multiple projects
- Avoid polluting user source trees
- Enable easy cleanup

**Root Path:** `~/.mcp/search/`

**Project Isolation:** Each project gets a unique directory based on SHA256 hash of its absolute path (128-bit / 32 hex chars for collision resistance). Legacy indexes may use 64-bit / 16 hex chars; both formats are supported.

```
~/.mcp/search/
├── config.json                    # Global defaults (optional)
└── indexes/
    ├── <SHA256(project_path_1)>/
    │   ├── index.lancedb/         # Code vector database
    │   ├── docs.lancedb/          # Docs vector database (prose-optimized)
    │   ├── fingerprints.json      # Code file hash tracking
    │   ├── docs-fingerprints.json # Docs file hash tracking
    │   ├── config.json            # Project configuration
    │   ├── metadata.json          # Index metadata (includes docsStats)
    │   └── logs/                  # Rolling logs
    └── <SHA256(project_path_2)>/
        └── ...
```

### 3.2 Database Schema (Code)

**Database:** `index.lancedb/`
**Table Name:** `project_docs`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique UUIDv4 for the chunk |
| `path` | String | Relative file path (e.g., `src/main.ts`) |
| `text` | String | The actual text content of the chunk |
| `vector` | Float32[384] | Embedding vector (384 dimensions for BGE-small) |
| `start_line` | Int | Start line number in source file |
| `end_line` | Int | End line number in source file |
| `content_hash` | String | SHA256 hash of source file (for versioning) |
| `chunk_hash` | String | Position-independent hash of chunk text (for incremental reindex) |
| `chunk_type` | String | (Optional) Semantic type: function, class, method, etc. |
| `chunk_name` | String | (Optional) Symbol name if AST-parsed |
| `chunk_signature` | String | (Optional) Full signature if available |
| `chunk_docstring` | String | (Optional) Extracted docstring/comment |
| `chunk_parent` | String | (Optional) Parent class/struct name |
| `chunk_tags` | String[] | (Optional) Semantic tags: async, export, static, etc. |
| `chunk_language` | String | (Optional) Programming language |

### 3.2.1 Database Schema (Docs)

**Database:** `docs.lancedb/`
**Table Name:** `project_docs_prose`

Same schema as code chunks, but with prose-optimized chunking and larger embedding model.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique UUIDv4 for the chunk |
| `path` | String | Relative file path (e.g., `docs/README.md`) or `[code-comment]src/file.ts` |
| `text` | String | The actual text content of the chunk |
| `vector` | Float32[768] | Embedding vector (768 dimensions for BGE-base) |
| `start_line` | Int | Start line number in source file |
| `end_line` | Int | End line number in source file |
| `content_hash` | String | SHA256 hash of source file (for versioning) |
| `header_path` | String[] | (Optional) Markdown header hierarchy for .md files |
| `header_level` | Int | (Optional) Header level (1-6) for markdown sections |

**Embedding model differences:**
| Parameter | Code | Docs |
|-----------|------|------|
| Model | `Xenova/bge-small-en-v1.5` | `Xenova/bge-base-en-v1.5` |
| Dimensions | 384 | 768 |
| Optimized for | Code search | Prose/documentation |

**Chunking differences:**
| Parameter | Code | Docs |
|-----------|------|------|
| Chunk Size | 4000 chars (~1000 tokens) | 8000 chars (~2000 tokens) |
| Chunk Overlap | 800 chars (~200 tokens) | 2000 chars (~500 tokens) |
| Separators | `\n\n`, `\n`, ` `, `` | `\n\n`, `\n`, `. `, ` `, `` |
| Markdown Strategy | N/A | Header-aware chunking for .md files |

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
  "version": "2.0.0",
  "projectPath": "/Users/dev/my-project",
  "createdAt": "2024-01-15T10:00:00Z",
  "lastFullIndex": "2024-01-15T10:00:00Z",
  "lastIncrementalUpdate": "2024-01-15T14:30:00Z",
  "stats": {
    "totalFiles": 450,
    "totalChunks": 1205,
    "storageSizeBytes": 47185920
  },
  "docsStats": {
    "totalDocs": 12,
    "totalDocChunks": 45,
    "docsStorageSizeBytes": 1048576
  },
  "lastDocsIndex": "2024-01-15T10:00:00Z",
  "embeddingModels": {
    "codeModel": "Xenova/bge-small-en-v1.5",
    "codeDimension": 384,
    "docsModel": "Xenova/bge-base-en-v1.5",
    "docsDimension": 768
  },
  "vectorIndex": {
    "hasIndex": true,
    "indexType": "ivf_pq",
    "numPartitions": 32,
    "numSubVectors": 24,
    "distanceType": "l2",
    "indexCreationTimeMs": 1250,
    "chunkCount": 1205,
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "computeDevice": "directml"
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

### 4.2 `search_code`

Performs hybrid semantic + keyword search on code files.

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
    },
    "mode": {
      "type": "string",
      "enum": ["hybrid", "vector", "fts"],
      "default": "hybrid",
      "description": "Search mode: hybrid (vector+keyword), vector (semantic only), fts (keyword only)"
    },
    "alpha": {
      "type": "number",
      "default": 0.5,
      "description": "Weight for hybrid search (0=keyword only, 1=semantic only)"
    },
    "compact": {
      "type": "boolean",
      "default": false,
      "description": "Return compact format with shorter field names (~5% token savings)"
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
      "endLine": 78,
      "metadata": {
        "type": "function",
        "name": "login",
        "signature": "async function login(email: string, password: string): Promise<User>"
      }
    }
  ],
  "totalResults": 3,
  "searchTimeMs": 45
}
```

**Behavior:**
1. Expand query with synonyms (e.g., "auth" → "authentication authorize login...")
2. Generate query embedding with instruction prefix
3. Perform hybrid search (vector + FTS) based on mode
4. Apply advanced ranking (intent detection, name matching, path relevance)
5. Deduplicate and optimize results
6. Auto-reindex stale files if needed (small changes only)

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

### 4.8 `search_docs`

Performs hybrid semantic + keyword search on documentation files (.md, .txt) and extracted code comments.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The question or topic to search for in documentation"
    },
    "top_k": {
      "type": "number",
      "default": 10,
      "description": "Number of results to return (1-50)"
    },
    "mode": {
      "type": "string",
      "enum": ["hybrid", "vector", "fts"],
      "default": "hybrid",
      "description": "Search mode: hybrid (vector+keyword), vector (semantic only), fts (keyword only)"
    },
    "alpha": {
      "type": "number",
      "default": 0.5,
      "description": "Weight for hybrid search (0=keyword only, 1=semantic only)"
    },
    "compact": {
      "type": "boolean",
      "default": false,
      "description": "Return compact format with shorter field names (~5% token savings)"
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
      "path": "docs/authentication.md",
      "text": "[Guide > Authentication]\n\n## JWT Tokens\n\nThe authentication system uses JWT tokens...",
      "score": 0.89,
      "startLine": 15,
      "endLine": 45,
      "metadata": {
        "headerPath": ["Guide", "Authentication"],
        "headerLevel": 2,
        "sectionTitle": "JWT Tokens"
      }
    }
  ],
  "totalResults": 3,
  "searchTimeMs": 38
}
```

**Behavior:**
1. Expand query with synonyms
2. Generate query embedding with instruction prefix (768-dim BGE-base model)
3. Perform hybrid search (vector + FTS) based on mode
4. Apply advanced ranking
5. Return results with markdown section context

**Key Differences from `search_code`:**
- Searches documentation files (.md, .txt) AND extracted code comments (JSDoc, docstrings, etc.)
- Uses prose-optimized embedding model (BGE-base, 768 dims vs BGE-small, 384 dims)
- Uses larger chunks (8000 chars) with more overlap (2000 chars)
- Markdown files use header-aware chunking (sections align with h1-h6 headers)
- Stored in separate LanceDB table (`docs.lancedb/`)
- Includes breadcrumb context in chunks (e.g., `[Guide > Installation]`)

**Hybrid Search Behavior:**

When a user drags a document into the chat, the AI reads the entire file into its context window. This is unavoidable for the initial interaction. However, for **follow-up questions** about that document, the AI should use `search_docs` instead of re-reading the full doc from context:

```
Scenario: User drags large-spec.md into chat

1. User: "Summarize this document"
   AI: Reads full doc from chat context (necessary for summary)

2. User: "Find the section about error handling"
   AI: Uses search_docs("error handling") instead of re-reading
   → Returns only relevant chunks
   → Avoids context bloat on follow-ups
```

**Why hybrid matters:**
- Initial read from chat is unavoidable when user drags file
- Follow-up queries benefit from indexed search (precision + speed)
- Prevents context window from filling with repeated full-doc reads
- Better response quality as context stays focused

**AI Guidance (for MCP clients):**
- If a doc is in chat AND indexed, prefer `search_docs` for follow-up questions
- Use full context read only when user needs to see entire doc (e.g., "summarize this")
- For specific lookups ("find X", "where does it mention Y"), use search

**Enhanced Tool Descriptions (`enhancedToolDescriptions: true`):**

When enabled, tool descriptions include hints that guide AI behavior:

| Tool | Standard Description | Enhanced Description |
|------|---------------------|---------------------|
| `search_docs` | "Search documentation files (.md, .txt)" | "Search documentation files (.md, .txt). **TIP:** For follow-up questions about a doc already in context, use this tool instead of re-reading the entire file - more precise results, less context usage." |
| `search_code` | "Search your codebase for relevant code" | "Search your codebase for relevant code using natural language. **TIP:** Prefer this over reading full files when looking for specific functions, patterns, or implementations." |

**Implementation:**
```typescript
function getToolDescription(tool: string, enhanced: boolean): string {
  const base = TOOL_DESCRIPTIONS[tool];
  if (!enhanced) return base;
  return base + ENHANCED_HINTS[tool];
}
```

**Confirmation Required:** No

---

### 4.9 `get_file_summary`

Returns a structured summary of a file including functions, classes, imports, exports, and complexity metrics without reading the entire file content.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Path to the file (relative to project root or absolute)"
    },
    "includeComplexity": {
      "type": "boolean",
      "default": true,
      "description": "Include cyclomatic complexity metrics"
    },
    "includeDocstrings": {
      "type": "boolean",
      "default": true,
      "description": "Include extracted docstrings/comments"
    }
  },
  "required": ["path"]
}
```

**Output:**
```json
{
  "path": "src/auth/login.ts",
  "language": "typescript",
  "lines": {
    "total": 250,
    "code": 180,
    "blank": 45,
    "comments": 25
  },
  "functions": [
    {
      "name": "login",
      "type": "function",
      "startLine": 45,
      "endLine": 78,
      "signature": "async function login(email: string, password: string): Promise<User>",
      "docstring": "Authenticates a user with email and password",
      "isAsync": true,
      "isExported": true,
      "paramCount": 2,
      "complexity": 5,
      "nestingDepth": 2
    }
  ],
  "classes": [],
  "imports": [
    { "source": "./types", "specifiers": ["User", "AuthResponse"] }
  ],
  "exports": [
    { "name": "login", "type": "function" }
  ],
  "complexity": {
    "cyclomatic": 12,
    "maxNesting": 3,
    "avgFunctionComplexity": 4.0,
    "decisionPoints": 8,
    "score": 75
  },
  "size": 8192,
  "extractionTimeMs": 45,
  "fullSupport": true
}
```

**Supported Languages:** JavaScript, TypeScript, TSX, Python, Go, Java, Rust, C, C++, C#

**Confirmation Required:** No

---

### 4.10 `get_config`

Returns the configuration file path and contents for the current project.

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
  "configPath": "~/.mcp/search/indexes/<hash>/config.json",
  "config": {
    "include": ["**/*"],
    "exclude": [],
    "respectGitignore": true,
    "chunkingStrategy": "code-aware",
    "hybridSearch": {
      "enabled": true,
      "defaultAlpha": 0.5
    }
  }
}
```

**Confirmation Required:** No

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

#### Security Protections

| Protection | Description |
|------------|-------------|
| **Symlink Detection** | All file operations use `lstat()` to detect symlinks. Symlinks are skipped during indexing (with warning) to prevent reading files outside the project. |
| **Path Traversal Prevention** | All file paths validated with `safeJoin()` to prevent `../` attacks. Paths must remain within project directory. |
| **Unicode Normalization** | Paths normalized to NFC form; zero-width characters and RTL overrides removed to prevent bypass attempts. |
| **Content-Based Binary Detection** | Files with unknown extensions checked for null bytes in first 8KB to detect renamed binaries. |
| **Case-Insensitive Matching (Windows)** | Deny list patterns matched case-insensitively on Windows to prevent `.ENV` bypass. |
| **Resource Limits** | Per-file chunk limits (1000), directory depth limits (20), glob result limits (100K), JSON size limits (10MB) to prevent DoS. |

### 5.3 Chunking Engine

**Purpose:** Split files into indexable chunks using language-aware strategies.

**Available Strategies:**

| Strategy | Description | Languages | Use Case |
|----------|-------------|-----------|----------|
| `character` | Recursive character splitter | All | Fallback, simple text |
| `code-aware` | Heuristic-based code boundaries | 22+ languages | Default for code |
| `ast` | Tree-sitter AST parsing | 10 languages | Best accuracy |
| `markdown` | Header-aware section splitting | .md files | Documentation |

**Strategy Selection (Automatic):**
```
1. If .md file → markdown strategy
2. If AST-supported language → ast strategy
3. If code-aware language → code-aware strategy
4. Fallback → character strategy
```

**Base Parameters:**
| Parameter | Code | Docs |
|-----------|------|------|
| Chunk Size | ~1000 tokens (~4000 chars) | ~2000 tokens (~8000 chars) |
| Chunk Overlap | ~200 tokens (~800 chars) | ~500 tokens (~2000 chars) |
| Separators | `\n\n`, `\n`, ` `, `` | `\n\n`, `\n`, `. `, ` `, `` |

#### 5.3.1 Code-Aware Chunking (22+ Languages)

Heuristic-based chunking that splits at semantic boundaries using regex patterns.

**Tier 1 - High Priority:**
- TypeScript, JavaScript, Python, Java, Go, Rust, C#, C, C++, Kotlin, Swift

**Tier 2 - Medium Priority:**
- Ruby, PHP, Scala, Shell/Bash

**Tier 3 - Markup/Config:**
- CSS, SCSS, LESS, HTML, Vue, Svelte, SQL, YAML, JSON, XML, GraphQL

**Tier 4 - Infrastructure:**
- Terraform, HCL, Dockerfile

#### 5.3.2 AST-Based Chunking (Tree-sitter)

True AST parsing via Tree-sitter WASM for the highest accuracy.

**Supported Languages:** JavaScript, TypeScript, TSX, Python, Go, Java, Rust, C, C++, C#

**Rich Metadata Extraction:**
```typescript
interface ChunkMetadata {
  type: 'function' | 'class' | 'method' | 'interface' | 'struct' | 'trait' | 'impl' | 'enum' | 'module' | 'other';
  name?: string;           // Symbol name
  signature?: string;      // Full signature
  docstring?: string;      // Extracted documentation
  decorators?: string[];   // @annotations
  parentName?: string;     // Parent class/struct
  parentType?: ChunkType;
  tags?: string[];         // async, export, static, etc.
  language: string;
  isAsync?: boolean;
  isExport?: boolean;
  isStatic?: boolean;
  visibility?: 'public' | 'private' | 'protected';
  paramCount?: number;
  returnType?: string;
  genericParams?: string[];
}
```

#### 5.3.3 Markdown Chunking

Header-aware chunking for .md files that aligns with section boundaries.

**Features:**
- Parses ATX headers (`#` through `######`) and setext headers (`===`, `---`)
- Strips YAML frontmatter
- Preserves code blocks as atomic units
- Includes breadcrumb context: `[Parent > Grandparent]`
- Sub-chunks large sections with "(continued)" markers

**Chunk Metadata:**
```typescript
interface MarkdownChunkMetadata {
  headerPath: string[];    // ["Guide", "Installation"]
  headerLevel: number;     // 1-6
  sectionTitle: string;    // Current section title
  part?: number;           // For sub-chunked sections
  totalParts?: number;
}
```

**Legacy Chunk Interface:**
```typescript
interface Chunk {
  id: string;          // UUIDv4
  text: string;        // Chunk content
  path: string;        // Source file path
  startLine: number;   // Starting line in source
  endLine: number;     // Ending line in source
  contentHash: string; // SHA256 of source file
  chunkHash?: string;  // Position-independent hash (for incremental reindex)
  metadata?: ChunkMetadata; // Rich metadata (AST/markdown)
}
```

### 5.4 Embedding Engine

**Purpose:** Convert text chunks to vector embeddings using dual models optimized for code and prose.

**Models:**

| Purpose | Model | Dimensions | Size |
|---------|-------|------------|------|
| **Code** | `Xenova/bge-small-en-v1.5` | 384 | ~90MB |
| **Docs** | `Xenova/bge-base-en-v1.5` | 768 | ~180MB |

**Runtime:** ONNX via `@huggingface/transformers` (v3)

**GPU Acceleration:**

| Platform | GPU Support | Notes |
|----------|-------------|-------|
| **Windows** | DirectML | Automatic on NVIDIA, AMD, Intel GPUs |
| **macOS** | CPU only | CoreML not available in Node.js |
| **Linux** | CPU only | CUDA requires separate package |

**Batch Processing:**
| Device | Batch Size | Notes |
|--------|------------|-------|
| CPU | 32 | Reliable, works on all systems |
| GPU (DirectML) | 64 | Faster for large codebases (>5000 chunks) |

**Domain-Specific Prompts (BGE Best Practice):**
- **Document embedding:** No prefix (optimized for passages)
- **Query embedding:** Prefix with "Represent this sentence for searching relevant passages: "

**First-Run Behavior:**
```
1. Check if model cached at ~/.cache/huggingface/
2. If not cached:
   - Display: "Downloading embedding model... (one-time, ~90MB)"
   - Download model
   - Display: "Done! Model cached for future use."
3. Detect best compute device (DirectML > CPU)
4. Load model with device selection
5. Ready for inference
```

**API:**
```typescript
// Get singleton instances
const codeEngine = getCodeEmbeddingEngine();
const docsEngine = getDocsEmbeddingEngine();

// Embed with prompt type
await codeEngine.embed(text, 'query');    // For search queries
await codeEngine.embed(text, 'document'); // For indexing

// Device info
codeEngine.getDeviceInfo();  // { device: 'directml', isGPU: true, ... }
codeEngine.isUsingGPU();     // true/false
```

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

### 5.7 Indexing Strategies

**Purpose:** Allow users to choose between different indexing behaviors based on their workflow.

**Available Strategies:**

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `realtime` | Index immediately on file change | Default, always up-to-date |
| `lazy` | Queue changes, index only on search (true lazy loading) | Large projects, battery savings |
| `git` | Index only on git commit | Projects with frequent saves |

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                  Strategy Orchestrator                   │
│  - Manages strategy lifecycle                           │
│  - Routes file events to active strategy                │
│  - Handles strategy switching                           │
└─────────────────────────┬───────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Realtime    │ │     Lazy      │ │      Git      │
│   Strategy    │ │   Strategy    │ │   Strategy    │
│               │ │               │ │               │
│ - Immediate   │ │ - Queue only  │ │ - Post-commit │
│   indexing    │ │ - Index on    │ │   hook        │
│ - File watcher│ │   search      │ │ - Dirty track │
└───────────────┘ └───────────────┘ └───────────────┘
                          │
                          ▼
                ┌───────────────────┐
                │ Dirty Files Mgr   │
                │ - Tracks pending  │
                │ - Persists state  │
                └───────────────────┘
```

**Strategy Interface:**
```typescript
interface IndexingStrategy {
  readonly name: 'realtime' | 'lazy' | 'git';
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
  onFileEvent(event: StrategyFileEvent): Promise<void>;
  flush(): Promise<void>;  // Force process pending
  getStats(): StrategyStats;
}
```

**Dirty Files Manager:**
- Tracks files pending indexing across restarts
- Persists to `dirty-files.json` in index directory
- Shared by lazy and git strategies

### 5.8 Concurrency Control

**Purpose:** Prevent race conditions and data corruption from concurrent operations.

**Components:**

| Component | Purpose |
|-----------|---------|
| `AsyncMutex` | Simple async mutex with `withLock()`, `tryAcquire()`, timeout support |
| `ReadWriteLock` | Allows concurrent reads, exclusive writes |
| `IndexingLock` | Singleton preventing concurrent indexing operations |

**Protected Operations:**
- LanceDB insert/delete/search (per-store mutex)
- Full indexing and reindexing (IndexingLock singleton)
- File watcher debouncing (atomic queue operations)

**Atomic Writes:**
- All JSON files written atomically (write to temp, rename)
- Prevents corruption from crashes or concurrent writes

### 5.9 Hybrid Search Engine

**Purpose:** Combine vector similarity search with keyword (BM25) search for better retrieval.

**Algorithm: Reciprocal Rank Fusion (RRF)**
```
score(d) = Σ 1 / (k + rank_i(d))

Where:
- k = 60 (constant)
- rank_i(d) = rank of document d in result list i
```

**FTS Engines:**

| Engine | Implementation | Best For |
|--------|---------------|----------|
| `js` | `natural` npm package (TF-IDF/BM25) | Small-medium projects |
| `native` | SQLite FTS5 (if available) | Large projects (>5000 files) |
| `auto` | Auto-select based on size | Default |

**Parameters:**
- `mode`: `'hybrid'` (default), `'vector'`, `'fts'`
- `alpha`: 0-1 weight (0=keyword only, 1=semantic only, 0.5=balanced)

**Index Storage:**
- FTS index persisted to `fts-index.json` in index directory
- Updated during indexing and incremental reindex

### 5.10 Query Expansion Engine

**Purpose:** Improve search recall by expanding abbreviations and synonyms.

**Expansion Mappings (60+):**

| Category | Examples |
|----------|----------|
| Authentication | auth → authentication authorize login session token |
| Database | db → database sql mongo postgres redis cache |
| API | api → endpoint route http rest graphql request |
| Async | async → await promise callback concurrent thread |
| Errors | err → error exception catch throw fail handle |
| Config | config → env settings options param |
| Testing | test → mock spec stub spy assert expect |
| Common Abbrevs | fn → function, util → utility, msg → message |

**Configuration:**
```typescript
interface QueryExpansionConfig {
  enabled: boolean;           // Default: true
  maxExpansionTerms: number;  // Default: 10
  customExpansions?: Record<string, string>;
}
```

**Performance:** < 1ms per query expansion

### 5.11 Advanced Ranking Engine

**Purpose:** Multi-factor ranking for significantly better search result quality.

**Ranking Factors:**

| Factor | Weight | Description |
|--------|--------|-------------|
| Base Score | 1.0 | From vector/hybrid search |
| Chunk Type | 1.0-1.3 | Boost based on query intent |
| Name Match | 1.0-1.4 | CamelCase/snake_case aware matching |
| Path Relevance | 1.0-1.2 | Query tokens in file path |
| Docstring Bonus | 1.05 | Documented code preferred |
| Complexity Penalty | 0.95-0.98 | Penalize oversized chunks |

**Query Intent Detection (8 Categories):**
- FUNCTION, CLASS, ERROR, DATABASE, API, AUTH, TEST, CONFIG

**Name Matching Boosts:**
- Exact match: 1.4x
- 80%+ token overlap: 1.3x
- 50%+ token overlap: 1.2x
- 30%+ token overlap: 1.1x
- Any overlap: 1.05x

**Performance:** < 50ms for 100 results

### 5.12 Auto-Reindexer Engine

**Purpose:** Search-triggered automatic reindexing for stale files.

**Behavior:**
- Checks for stale files every N searches (default: 10)
- Silently reindexes small changes (≤5 files)
- Skips large changes to avoid search delays
- No daemon process needed

**Configuration:**
```typescript
interface AutoReindexConfig {
  enabled: boolean;              // Default: true
  checkEveryNSearches: number;   // Default: 10
  maxAutoReindexFiles: number;   // Default: 5
  stalenessThresholdMs: number;  // Default: 300000 (5 min)
  logActivity: boolean;          // Default: true
}
```

### 5.13 Incremental Reindex Engine

**Purpose:** Surgical chunk-level updates for faster reindexing.

**Algorithm:**
```
1. Compute position-independent hash for each new chunk
2. Load existing chunks for the file
3. Diff chunks by hash:
   - Unchanged (same hash, same position): Keep as-is
   - Moved (same hash, different position): Update metadata only
   - Added (new hash): Embed and insert
   - Removed (hash no longer present): Delete
4. Only re-embed added chunks
```

**Performance:**
- Edit 1 line in 5000-line file: ~100ms (vs ~2.5s for full reindex)
- 25x faster for small edits in large files

**Decision Logic:**
- Use incremental for files with 3+ existing chunks
- Require ≥25% savings to be "worthwhile"

### 5.14 Symbol Extraction Engine

**Purpose:** On-demand extraction of functions, classes, and complexity metrics.

**Uses Tree-sitter infrastructure from AST chunking.**

**Extracted Symbols:**
- Functions and methods (with parameters, return types)
- Classes, interfaces, structs, traits, enums
- Imports and exports
- Decorators and annotations

**Complexity Metrics:**
- Cyclomatic complexity per function
- Maximum nesting depth
- Decision points (if, while, for, &&, ||)
- Overall score (0-100, higher = better)

**Supported Languages:** JavaScript, TypeScript, TSX, Python, Go, Java, Rust, C, C++, C#

**Performance:** < 100ms per typical file

### 5.15 Vector Index Engine (IVF-PQ)

**Purpose:** Accelerate similarity search for large codebases.

**Index Type:** IVF-PQ (Inverted File with Product Quantization)

**Auto-Creation Threshold:** ≥10,000 chunks

**Parameters (Auto-Calculated):**
- `numPartitions`: sqrt(numRows), clamped to 1-256
- `numSubVectors`: dimension/16 or dimension/8
- `distanceType`: 'l2' (default), 'cosine', 'dot'

**Metadata Tracking:**
```json
{
  "vectorIndex": {
    "hasIndex": true,
    "indexType": "ivf_pq",
    "numPartitions": 32,
    "numSubVectors": 24,
    "indexCreationTimeMs": 1250,
    "chunkCount": 10500
  }
}
```

**Note:** GPU acceleration for index building is NOT available in LanceDB Node.js SDK. Index building runs on CPU only.

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
| `DOCS_INDEX_NOT_FOUND` | "No documentation has been indexed yet. Run create_index to index your project." | `DOCS_INDEX_NOT_FOUND: No docs index at ~/.mcp/search/indexes/{hash}/docs.lancedb/` |
| `SYMLINK_NOT_ALLOWED` | "Symbolic links are not allowed for security reasons." | `SYMLINK_NOT_ALLOWED: Symlink detected at path: {path}` |

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

  "docPatterns": ["**/*.md", "**/*.txt"],
  "indexDocs": true,
  "extractComments": true,

  "chunkingStrategy": "code-aware",

  "hybridSearch": {
    "enabled": true,
    "ftsEngine": "auto",
    "defaultAlpha": 0.5
  },

  "queryExpansion": {
    "enabled": true,
    "maxExpansionTerms": 10
  },

  "autoReindex": {
    "enabled": true,
    "checkEveryNSearches": 10,
    "maxAutoReindexFiles": 5
  },

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
    "// - coverage/, .angular/, .next/, .nuxt/  (framework caches)",
    "// - Binary files (images, videos, etc.) are auto-detected and skipped"
  ],

  "_availableOptions": {
    "include": "Glob patterns for files to index. Default: all files.",
    "exclude": "Glob patterns to skip (in addition to hardcoded excludes).",
    "respectGitignore": "If true, also excludes files matching .gitignore.",
    "maxFileSize": "Skip files larger than this. Supports: '500KB', '1MB', '2MB'.",
    "maxFiles": "Warn if project exceeds this many files.",
    "docPatterns": "Glob patterns for documentation files. Default: ['**/*.md', '**/*.txt'].",
    "indexDocs": "If true, index documentation files with prose-optimized chunking. Default: true.",
    "extractComments": "If true, extract JSDoc/docstrings from code files into docs index. Default: true.",
    "chunkingStrategy": "Chunking strategy: 'character', 'code-aware', 'ast'. Default: 'code-aware'.",
    "hybridSearch.enabled": "Enable hybrid vector+keyword search. Default: true.",
    "hybridSearch.ftsEngine": "FTS engine: 'auto', 'js', 'native'. Default: 'auto'.",
    "hybridSearch.defaultAlpha": "Default alpha for hybrid search (0-1). Default: 0.5.",
    "queryExpansion.enabled": "Enable query expansion with synonyms. Default: true.",
    "autoReindex.enabled": "Enable search-triggered auto-reindexing. Default: true.",
    "enhancedToolDescriptions": "If true, tool descriptions include AI hints. Default: false.",
    "indexingStrategy": "Indexing strategy: 'realtime' (immediate), 'lazy' (on search), 'git' (on commit). Default: 'realtime'."
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
- `docPatterns` is array of strings (glob patterns)
- `indexDocs` is boolean
- `enhancedToolDescriptions` is boolean
- `indexingStrategy` is one of: 'realtime', 'lazy', 'git'

Invalid config → Use defaults + log warning

---

## 8. Dependencies

### 8.1 Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.5.0 | MCP server framework |
| `@huggingface/transformers` | ^3.0.0 | Local embedding models (BGE) |
| `@lancedb/lancedb` | ^0.4.0 | Vector database |
| `chokidar` | ^3.5.0 | File watching |
| `glob` | ^10.0.0 | Glob pattern matching |
| `ignore` | ^5.3.0 | Gitignore parsing |
| `is-binary-path` | ^2.1.0 | Binary file detection |
| `uuid` | ^9.0.0 | UUID generation |
| `zod` | ^3.22.0 | Schema validation |
| `web-tree-sitter` | ^0.26.3 | WASM-based AST parsing |
| `tree-sitter-wasms` | ^0.1.13 | Pre-built WASM grammars |
| `natural` | ^6.0.0 | BM25/TF-IDF for FTS |
| `commander` | ^12.0.0 | CLI framework |
| `chalk` | ^5.0.0 | Terminal colors |
| `ora` | ^8.0.0 | Terminal spinners |
| `cli-progress` | ^3.0.0 | Progress bars |

### 8.2 Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.3.0 | Type checking |
| `vitest` | ^1.0.0 | Testing |
| `@types/node` | ^20.0.0 | Node.js types |
| `cross-env` | ^7.0.0 | Cross-platform env vars |

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

- Changing `search_code` input/output schema
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

## 12. Completed Features (v1.2.0 - v1.6.x)

| Feature | Version | Description |
|---------|---------|-------------|
| ✅ **Hybrid Search** | v1.2.0 | Vector + BM25 keyword search with RRF |
| ✅ **AST Chunking** | v1.5.0 | Tree-sitter WASM for 10 languages |
| ✅ **Query Expansion** | v1.5.0 | 60+ synonym mappings |
| ✅ **Advanced Ranking** | v1.5.0 | Multi-factor ranking with intent detection |
| ✅ **Code-Aware Chunking** | v1.5.0 | 22+ languages with semantic boundaries |
| ✅ **Markdown Chunking** | v1.5.0 | Header-aware sections for .md files |
| ✅ **Comment Extraction** | v1.5.0 | JSDoc, docstrings indexed in docs search |
| ✅ **Incremental Reindex** | v1.5.0 | Chunk-level surgical updates |
| ✅ **Auto-Reindexer** | v1.5.0 | Search-triggered staleness checks |
| ✅ **Symbol Extraction** | v1.5.0 | `get_file_summary` tool |
| ✅ **Vector Index (IVF-PQ)** | v1.5.0 | Accelerated search for large codebases |
| ✅ **GPU Acceleration** | v1.4.0 | DirectML on Windows |
| ✅ **CLI Commands** | v1.5.0 | `index`, `search`, `status`, `reindex`, `setup`, `delete` |
| ✅ **Dual Embedding Models** | v1.3.0 | BGE-small for code, BGE-base for docs |

## 13. Future Roadmap (v2.0+)

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Multi-Root Support** | Index multiple folders into one logical index (monorepo) | Medium |
| **`list_projects`** | Show all indexed projects with stats | Low |
| **Remote/Cloud Index** | Optional cloud backup of indexes | High |
| **Streaming Embeddings** | Process files as they're discovered | Medium |
| **Cross-Project Search** | Search across multiple indexed projects | Medium |
| **GPU Index Building** | LanceDB GPU support when SDK adds it | Blocked |
| **Real-time Collaboration** | Multiple users sharing index | High |

---

## Appendix A: Directory Structure

```
search-mcp/
├── src/
│   ├── index.ts              # Entry point (CLI + MCP)
│   ├── server.ts             # MCP server setup
│   ├── cli/
│   │   ├── commands.ts       # CLI command handlers
│   │   └── setup.ts          # Setup wizard
│   ├── tools/
│   │   ├── createIndex.ts
│   │   ├── searchCode.ts
│   │   ├── searchDocs.ts
│   │   ├── searchByPath.ts
│   │   ├── getIndexStatus.ts
│   │   ├── getFileSummary.ts # Symbol extraction tool
│   │   ├── getConfig.ts
│   │   ├── reindexProject.ts
│   │   ├── reindexFile.ts
│   │   ├── deleteIndex.ts
│   │   └── toolDescriptions.ts
│   ├── engines/
│   │   ├── projectRoot.ts    # Project detection
│   │   ├── indexPolicy.ts    # File filtering
│   │   ├── indexManager.ts   # Index orchestration
│   │   ├── chunking.ts       # Text splitting
│   │   ├── codeAwareChunking.ts # 22+ language support
│   │   ├── astChunking.ts    # Tree-sitter chunking
│   │   ├── treeSitterParser.ts # WASM parser
│   │   ├── markdownChunking.ts # Header-aware docs
│   │   ├── docsChunking.ts   # Docs chunking entry
│   │   ├── commentExtractor.ts # JSDoc/docstring extraction
│   │   ├── embedding.ts      # Vector generation (GPU)
│   │   ├── deviceDetection.ts # GPU detection
│   │   ├── hybridSearch.ts   # Vector + FTS fusion
│   │   ├── ftsEngine.ts      # FTS interface
│   │   ├── naturalBM25.ts    # JS FTS implementation
│   │   ├── ftsEngineFactory.ts
│   │   ├── queryExpansion.ts # Synonym expansion
│   │   ├── queryIntent.ts    # Intent detection
│   │   ├── advancedRanking.ts # Multi-factor ranking
│   │   ├── incrementalReindex.ts # Chunk-level updates
│   │   ├── autoReindexer.ts  # Search-triggered reindex
│   │   ├── symbolExtractor.ts # File summary extraction
│   │   ├── merkleTree.ts     # Change detection
│   │   ├── fileWatcher.ts    # Change detection
│   │   ├── integrity.ts      # Drift reconciliation
│   │   └── indexingStrategy.ts
│   ├── storage/
│   │   ├── lancedb.ts        # Code vector store
│   │   ├── docsLancedb.ts    # Docs vector store
│   │   ├── fingerprints.ts   # Code hash tracking
│   │   ├── docsFingerprints.ts
│   │   ├── config.ts         # Configuration
│   │   └── metadata.ts       # Index metadata
│   ├── errors/
│   │   └── index.ts          # Error definitions
│   └── utils/
│       ├── hash.ts           # SHA256 utilities
│       ├── paths.ts          # Path manipulation
│       ├── logger.ts         # Logging
│       ├── asyncMutex.ts     # Concurrency control
│       ├── atomicWrite.ts    # Safe file writes
│       └── modelCompatibility.ts
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   ├── configs/              # Config matrix tests
│   └── reports/              # Generated reports
├── docs/
│   └── design/
│       └── ENGINEERING.RFC.md
├── package.json
├── tsconfig.json
├── CHANGELOG.md
└── README.md
```

---

## Appendix B: Installation & Usage

### Installation

```bash
npm install -g @liraz-sbz/search-mcp
```

### Quick Setup (Recommended)

```bash
npx @liraz-sbz/search-mcp setup
```

The setup wizard will:
1. Auto-detect installed MCP clients (Claude Desktop, Claude Code, Cursor, Windsurf)
2. Configure selected clients automatically
3. Offer to index the current project

### CLI Commands

```bash
# Create index for current project
npx @liraz-sbz/search-mcp index

# Search code
npx @liraz-sbz/search-mcp search "authentication function"

# Search with options
npx @liraz-sbz/search-mcp search "error handling" --top-k 5 --mode hybrid

# Search documentation
npx @liraz-sbz/search-mcp search "setup instructions" --docs

# Get index status
npx @liraz-sbz/search-mcp status

# Rebuild index
npx @liraz-sbz/search-mcp reindex

# Delete index
npx @liraz-sbz/search-mcp delete

# Show log file locations
npx @liraz-sbz/search-mcp logs

# JSON output for scripting
npx @liraz-sbz/search-mcp status --json | jq '.totalFiles'
```

### Claude Desktop Configuration

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

### Claude Code CLI Configuration

```bash
claude mcp add search -- npx @liraz-sbz/search-mcp
```

### Cursor Configuration

File > Preferences > Cursor Settings > MCP > Add new global MCP server

```json
{
  "search": {
    "command": "npx",
    "args": ["@liraz-sbz/search-mcp"]
  }
}
```
