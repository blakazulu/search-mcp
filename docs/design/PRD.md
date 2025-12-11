# Product Requirements Document (PRD): Search MCP

| Metadata | Details |
|:---------|:--------|
| **Project Name** | Search MCP |
| **Version** | 1.0.0 |
| **Status** | Approved |
| **Target Audience** | Developers using Claude CLI, Claude Code, Cursor, Windsurf, Antigravity |
| **Distribution** | npm + GitHub |

---

## 1. Problem Statement

### The Context Dilemma

Large Language Models (LLMs) like Claude have large context windows, but they are not infinite, and they are expensive.

| Problem | Impact |
|---------|--------|
| **Token Waste** | Developers dump entire file contents into the context window to answer simple questions. This is slow and expensive. |
| **Stale Context** | Users often forget to manually update the context when files change, leading to hallucinations based on old code. |
| **Privacy Concerns** | Developers are hesitant to send entire codebases to external cloud-based vector stores. |

---

## 2. Solution Vision

A **local-first Model Context Protocol (MCP) Server** that enables Claude Code (and other MCP clients) to perform semantic searches over a local codebase. It acts as a "second brain" for the AI, automatically maintaining an up-to-date vector index of the project.

### Key Value Proposition

> **"Install once. It just works. Claude always knows your code."**

### Core Principles

1. **Zero Configuration** - Works out of the box, no API keys or cloud accounts
2. **Privacy First** - 100% local execution, no data leaves the machine
3. **Always Fresh** - Auto-updating file watcher keeps index current
4. **Safe by Default** - Secrets and dependencies are never indexed
5. **Secure by Design** - Built-in protections against path traversal, symlink attacks, and resource exhaustion

---

## 3. Target Clients

| Client | Transport | Status |
|--------|-----------|--------|
| Claude CLI | stdio | Primary |
| Claude Code | stdio | Primary |
| Cursor | stdio | Primary |
| Windsurf | stdio | Primary |
| Antigravity | stdio | Primary |

---

## 4. User Stories

### Installation & Setup

- **As a Developer**, I want to install the tool via `npm` and have it work immediately without configuring API keys or cloud accounts.
- **As a Developer**, I want the tool to automatically detect my project root so I don't have to configure paths.
- **As a Developer**, I want to be prompted before any indexing begins so I know what's happening.

### Search & Retrieval

- **As a Developer**, I want to ask "How does authentication work?" and have Claude retrieve only the 3-5 relevant files, not the whole repo.
- **As a Developer**, I want to search for files by name pattern (e.g., `**/auth*`) when I know what I'm looking for.
- **As a Developer**, I want search results to include line numbers so I can navigate directly to the relevant code.

### Documentation Search

- **As a Developer**, I want to search my project's documentation files (README, guides, docs/) separately from code, so I can find relevant explanations without filling up context with entire documents.
- **As a Developer**, I want documentation search to be optimized for prose content, with larger chunks that preserve context better than code chunks.
- **As a Developer**, I want to ask questions about docs instead of dragging them into chat, so I don't fill up the AI's context window with entire files.
- **As a Developer**, I want the AI to use indexed search for follow-up questions even if I already dragged a doc into chat (hybrid approach).

### Index Management

- **As a Developer**, I want the index to update automatically in the background when I save a file, so I don't have to run a "reindex" command.
- **As a Developer**, I want to be able to re-index a single file if something seems wrong.
- **As a Developer**, I want to see the status of my index (files indexed, size, last update).
- **As a Developer**, I want to delete an index if I no longer need it.

### Indexing Strategies

- **As a Developer** working on a large project, I want to choose a "lazy" indexing strategy that batches updates during idle time, so my machine stays responsive.
- **As a Developer** who commits frequently, I want to choose a "git" indexing strategy that only updates after commits, so I don't waste resources on WIP saves.
- **As a Developer**, I want the default "realtime" strategy to index immediately, so my searches always reflect the latest code.

### Safety & Privacy

- **As a Developer**, I want to be sure that `node_modules`, `.git`, and secrets (`.env`, `*.key`) are **never** indexed.
- **As a Developer**, I want my code to stay on my machine - nothing sent to external servers.

---

## 5. Functional Requirements (MVP)

### 5.1 MCP Tools

| Tool | Purpose | Confirmation Required |
|------|---------|----------------------|
| `create_index` | Create index for current project (code + docs) | Yes |
| `search_code` | Semantic search for relevant code chunks | No |
| `search_docs` | Semantic search for documentation files (.md, .txt) | No |
| `search_by_path` | Find files by name/glob pattern | No |
| `get_index_status` | Show index statistics | No |
| `reindex_project` | Rebuild entire index from scratch | Yes |
| `reindex_file` | Re-index a single specific file | No |
| `delete_index` | Remove index for current project | Yes |

### 5.2 Core Capabilities

| Capability | Description |
|------------|-------------|
| **Indexing** | Recursive text chunking of source files |
| **Doc Indexing** | Prose-optimized chunking for documentation files (.md, .txt) |
| **Vector Store** | Embedded local database (LanceDB) |
| **Semantic Search** | Vector similarity search via `search_code` |
| **Doc Search** | Documentation-specific search via `search_docs` |
| **Path Search** | Glob pattern matching via `search_by_path` |
| **File Watching** | Real-time filesystem monitoring for incremental updates |
| **Auto-Configuration** | Generate config file with sensible defaults |

### 5.3 Hybrid Search Behavior

When users work with documentation, there are two scenarios:

**Scenario 1: User asks about a doc (Recommended)**
```
User: "What does the PRD say about authentication?"
AI: → Uses search_docs to retrieve only relevant chunks
    → Context stays clean, focused results
```

**Scenario 2: User drags a doc into chat**
```
User: *drags large-spec.md into chat*
User: "Summarize this document"
AI: → Reads the full doc from chat context (unavoidable)

User: "Now find where it mentions error handling"
AI: → Uses search_docs instead of re-reading entire doc
    → Hybrid approach kicks in for follow-up questions
```

**Why this matters:**
- Dragging docs fills the AI's context window with entire files
- Large docs degrade AI response quality
- The hybrid approach allows recovery: initial read from chat, follow-ups via search

### 5.4 Project Root Detection

Priority chain for detecting project root:

1. Search upward from current working directory for:
   - `.git/`
   - `package.json`
   - `pyproject.toml`
   - `Cargo.toml`
   - `go.mod`

2. If found → Use that directory as project root

3. If NOT found → Prompt user:
   ```
   Could not detect project root.

   Options:
   [1] Use current directory: /home/user/some-folder
   [2] Enter a custom path

   Choice:
   ```

### 5.5 Configuration

**Auto-generated on first index** at `~/.mcp/search/indexes/<hash>/config.json`:

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
    "maxFiles": "Warn if project exceeds this many files.",
    "docPatterns": "Glob patterns for documentation files. Default: ['**/*.md', '**/*.txt'].",
    "indexDocs": "If true, index documentation files separately with prose-optimized chunking.",
    "enhancedToolDescriptions": "If true, tool descriptions include hints for AI to prefer search over re-reading context. Default: false.",
    "indexingStrategy": "Indexing strategy: 'realtime' (immediate), 'lazy' (on search), 'git' (on commit). Default: 'realtime'."
  }
}
```

---

## 6. Non-Functional Requirements

### 6.1 Privacy

- **100% Local Execution** - No data leaves the machine
- **Local Embeddings** - Model runs locally via ONNX, no API calls
- **No Telemetry** - No usage data collected

### 6.2 Performance

| Metric | Target |
|--------|--------|
| Search latency | < 200ms |
| Indexing speed | ~100 files/second |
| Memory usage | < 500MB during indexing |
| Disk usage | ~100KB per 1000 chunks |

### 6.3 Platform Support

| Platform | Status |
|----------|--------|
| macOS | Supported |
| Linux | Supported |
| Windows | Supported |

### 6.4 Installation

- Single `npm` package
- No external dependencies to install
- Embedding model auto-downloads on first use (~90MB, cached)

---

## 7. User Experience

### 7.1 First-Run Experience

```
User runs Claude → Claude calls search_code → Index doesn't exist
                           ↓
    "This project hasn't been indexed yet.
     Would you like to index it now? (Y/n)"
                           ↓
    "Indexing project at /Users/dev/my-project
     Please wait - do not interrupt this process...

     Found 450 files
     Creating chunks... [████████████████████] 100%
     Generating embeddings... [████████████████████] 100%

     Done! Indexed 450 files (1,205 chunks) in 45 seconds."
```

### 7.2 Error Messages

All errors include two messages:

| Component | Purpose |
|-----------|---------|
| **User Message** | Friendly, non-technical, actionable |
| **Developer Message** | Technical details for debugging |

#### Error Examples

| Scenario | User Message | Developer Message |
|----------|--------------|-------------------|
| No index exists | "This project hasn't been indexed yet. Would you like to index it now?" | `INDEX_NOT_FOUND: No index at ~/.mcp/search/indexes/a1b2c3/` |
| Model download fails | "Couldn't set up the search engine. Please check your internet connection and try again." | `MODEL_DOWNLOAD_FAILED: ENOTFOUND huggingface.co` |
| Corrupt index | "The search index seems corrupted. Rebuilding it now..." | `INDEX_CORRUPT: LanceDB read error - invalid schema version` |
| Too many files | "This project is very large (65,000 files). Indexing may take several minutes. Continue?" | `FILE_LIMIT_WARNING: 65,000 files exceeds soft limit of 50,000` |
| Permission denied | "Can't access some files in this project. Check folder permissions." | `PERMISSION_DENIED: EACCES reading /path/to/file.ts` |
| Out of disk space | "Not enough disk space to create the search index. Free up some space and try again." | `DISK_FULL: ENOSPC - need ~50MB, have 12MB` |
| Symlink detected | "Symbolic links are not allowed for security reasons." | `SYMLINK_NOT_ALLOWED: Symlink detected at path: /path/to/symlink` |

### 7.3 Search Results Format

```typescript
interface SearchResult {
  path: string;       // "src/auth/login.ts"
  text: string;       // The matching chunk content
  score: number;      // 0.0 - 1.0 similarity score
  startLine: number;  // 45
  endLine: number;    // 78
}
```

Example output to Claude:
```
Found 3 relevant results:

1. src/auth/login.ts (lines 45-78) - Score: 0.92
   [chunk content...]

2. src/auth/middleware.ts (lines 12-34) - Score: 0.87
   [chunk content...]

3. src/utils/token.ts (lines 1-25) - Score: 0.81
   [chunk content...]
```

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Installation success rate | > 95% |
| Time to first search | < 2 minutes (including index creation) |
| Search relevance (user satisfaction) | > 80% find what they need in top 5 results |
| Index freshness | < 1 second lag after file save |

---

## 9. Future Roadmap (v2.0+)

| Feature | Description |
|---------|-------------|
| **AST-Based Chunking** | Code-aware splitting by function/class instead of text splitting |
| **Hybrid Search** | Combine vector search with keyword search (BM25) for better accuracy |
| **Multi-Repo Search** | Search across multiple linked projects |
| **Query Expansion** | Rewrite user queries for better retrieval accuracy |
| **`list_projects`** | Show all indexed projects with stats |

---

## 10. Out of Scope (MVP)

- Cloud/remote hosting
- Team collaboration features
- Custom embedding models
- IDE plugins (rely on MCP client support)
- Web UI / dashboard

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **MCP** | Model Context Protocol - standard for AI tool integration |
| **Embedding** | Vector representation of text that captures semantic meaning |
| **Chunk** | A segment of code/text (typically ~1000 tokens) |
| **LanceDB** | Local vector database for storing and searching embeddings |
| **stdio** | Standard input/output transport for local MCP servers |
