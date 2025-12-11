# API Reference

Complete reference for all Search MCP tools.

---

## Tools Overview

| Tool | Description | Confirmation |
|------|-------------|--------------|
| `create_index` | Create search index for current project | Yes |
| `search_code` | Semantic search for code | No |
| `search_docs` | Semantic search for documentation | No |
| `search_by_path` | Find files by glob pattern | No |
| `get_index_status` | Show index statistics and paths | No |
| `get_config` | Get config file path and contents | No |
| `reindex_project` | Rebuild entire index | Yes |
| `reindex_file` | Re-index a single file | No |
| `delete_index` | Remove project index | Yes |

---

## create_index

Creates a search index for the current project. Scans files, generates embeddings, and stores them in LanceDB.

### Parameters

None required. Project path is auto-detected.

### Returns

```typescript
{
  status: "created" | "cancelled";
  projectPath: string;
  indexPath: string;
  stats: {
    filesIndexed: number;
    chunksCreated: number;
    durationMs: number;
    errorCount: number;
  };
  docsStats?: {
    filesIndexed: number;
    chunksCreated: number;
  };
}
```

### Errors

| Code | User Message | Cause |
|------|--------------|-------|
| `INDEX_EXISTS` | "This project already has an index." | Index already exists |
| `INDEXING_IN_PROGRESS` | "Indexing is already in progress." | Concurrent indexing |

---

## search_code

Performs semantic search over indexed code files. Supports three search modes: vector (semantic), keyword (FTS), or hybrid combining both.

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `query` | string | Yes | - | Natural language search query |
| `top_k` | number | No | 10 | Number of results to return (1-50) |
| `compact` | boolean | No | false | Return results in compact format with shorter field names |
| `mode` | string | No | `"hybrid"` | Search mode: `"hybrid"`, `"vector"`, or `"fts"` |
| `alpha` | number | No | 0.5 | Hybrid search weight (0-1). Higher = more semantic, lower = more keyword |

### Search Modes

| Mode | Description | Best For |
|------|-------------|----------|
| `hybrid` | Combines vector + keyword search using RRF fusion | General use (default) |
| `vector` | Semantic search only (traditional) | Conceptual queries |
| `fts` | Keyword search only (BM25) | Exact term matches |

### Alpha Parameter

The `alpha` parameter controls the balance between semantic and keyword search in hybrid mode:
- `alpha=1.0`: 100% semantic search (same as `mode="vector"`)
- `alpha=0.7`: 70% semantic, 30% keyword (good for code)
- `alpha=0.5`: Balanced (default)
- `alpha=0.3`: 30% semantic, 70% keyword (good for exact matches)
- `alpha=0.0`: 100% keyword search (same as `mode="fts"`)

### Returns

```typescript
{
  results: Array<{
    path: string;      // Relative file path
    content: string;   // Matching code chunk
    score: number;     // Similarity score (0-1)
    startLine: number; // Starting line number
    endLine: number;   // Ending line number
  }>;
  query: string;
  totalResults: number;
  searchTimeMs: number;
  searchMode?: string; // Actual search mode used
}
```

### Errors

| Code | User Message | Cause |
|------|--------------|-------|
| `INDEX_NOT_FOUND` | "This project hasn't been indexed yet." | No index exists |
| `INVALID_QUERY` | "Search query is required." | Empty query |

---

## search_docs

Performs semantic search over indexed documentation files (.md, .txt). Supports the same search modes as `search_code`.

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `query` | string | Yes | - | Natural language search query |
| `top_k` | number | No | 10 | Number of results to return (1-50) |
| `compact` | boolean | No | false | Return results in compact format with shorter field names |
| `mode` | string | No | `"vector"` | Search mode: `"hybrid"`, `"vector"`, or `"fts"` (currently defaults to vector for docs) |
| `alpha` | number | No | 0.5 | Hybrid search weight (0-1). Higher = more semantic, lower = more keyword |

> **Note:** Documentation search currently defaults to vector-only mode as it typically benefits more from semantic understanding. Hybrid mode is available but may fall back to vector-only.

### Returns

```typescript
{
  results: Array<{
    path: string;      // Relative file path
    content: string;   // Matching doc chunk
    score: number;     // Similarity score (0-1)
    startLine: number; // Starting line number
    endLine: number;   // Ending line number
  }>;
  query: string;
  totalResults: number;
  searchTimeMs: number;
  searchMode?: string; // Actual search mode used
}
```

### Errors

| Code | User Message | Cause |
|------|--------------|-------|
| `DOCS_INDEX_NOT_FOUND` | "No documentation has been indexed yet." | No docs index |
| `INVALID_QUERY` | "Search query is required." | Empty query |

---

## search_by_path

Finds files by glob pattern matching against indexed file paths.

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `pattern` | string | Yes | - | Glob pattern (e.g., `**/*.ts`, `src/*.js`) |
| `limit` | number | No | 20 | Maximum results to return (1-100) |

### Returns

```typescript
{
  matches: string[];  // Array of matching file paths
  pattern: string;
  totalMatches: number;
}
```

### Errors

| Code | User Message | Cause |
|------|--------------|-------|
| `INDEX_NOT_FOUND` | "This project hasn't been indexed yet." | No index exists |
| `INVALID_PATTERN` | "Invalid glob pattern." | Malformed pattern |

---

## get_index_status

Returns statistics about the current project's index, including paths to the index and config files, and hybrid search information.

### Parameters

None required.

### Returns

```typescript
{
  status: "ready" | "indexing" | "not_found" | "incomplete" | "failed";
  projectPath?: string;     // Absolute path to project root
  indexPath?: string;       // Absolute path to index directory
  configPath?: string;      // Absolute path to config file
  totalFiles?: number;
  totalChunks?: number;
  lastUpdated?: string;     // ISO timestamp
  storageSize?: string;     // e.g., "45MB"
  watcherActive?: boolean;
  indexingStrategy?: "realtime" | "lazy" | "git";
  pendingFiles?: number;    // For lazy strategy
  hybridSearch?: {          // Hybrid search info (if enabled)
    enabled: boolean;       // Whether hybrid search is enabled
    ftsEngine: "js" | "native";  // FTS engine type
    ftsChunks: number;      // Number of chunks in FTS index
    defaultAlpha: number;   // Default alpha for this project
  };
}
```

---

## get_config

Returns the configuration file path and contents for the current project. Use this to find and view your project config.

### Parameters

None required.

### Returns

```typescript
{
  exists: boolean;          // Whether config file exists
  configPath: string;       // Absolute path to config file
  indexPath: string;        // Absolute path to index directory
  config?: {                // Config contents (if exists)
    include: string[];
    exclude: string[];
    respectGitignore: boolean;
    maxFileSize: string;
    maxFiles: number;
    indexingStrategy: "realtime" | "lazy" | "git";
    docPatterns: string[];
    indexDocs: boolean;
  };
  message: string;          // User-friendly message
}
```

### Example Usage

Ask your AI assistant:
- "Where is my config file?"
- "Show me my search config"
- "What's my indexing configuration?"

---

## reindex_project

Completely rebuilds the index from scratch. Useful when search results seem stale or incorrect.

### Parameters

None required.

### Returns

```typescript
{
  status: "reindexed" | "cancelled";
  projectPath: string;
  stats: {
    filesIndexed: number;
    chunksCreated: number;
    durationMs: number;
    errorCount: number;
  };
  docsStats?: {
    filesIndexed: number;
    chunksCreated: number;
  };
}
```

### Errors

| Code | User Message | Cause |
|------|--------------|-------|
| `INDEX_NOT_FOUND` | "This project hasn't been indexed yet." | No index to rebuild |

---

## reindex_file

Re-indexes a single file. Useful after manual file changes or to refresh a specific file.

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `file_path` | string | Yes | - | Relative path to file |

### Returns

```typescript
{
  status: "reindexed" | "removed";
  filePath: string;
  chunksCreated: number;
}
```

### Errors

| Code | User Message | Cause |
|------|--------------|-------|
| `INDEX_NOT_FOUND` | "This project hasn't been indexed yet." | No index exists |
| `FILE_NOT_FOUND` | "File not found." | File doesn't exist |
| `FILE_EXCLUDED` | "File is excluded by configuration." | File matches exclude pattern |

---

## delete_index

Permanently removes the project's index and all associated data.

### Parameters

None required.

### Returns

```typescript
{
  status: "deleted" | "cancelled";
  projectPath: string;
  indexPath: string;
}
```

### Errors

| Code | User Message | Cause |
|------|--------------|-------|
| `INDEX_NOT_FOUND` | "This project hasn't been indexed yet." | No index to delete |

---

## Error Codes Reference

| Code | Description |
|------|-------------|
| `INDEX_NOT_FOUND` | No index exists for the project |
| `DOCS_INDEX_NOT_FOUND` | No documentation index exists |
| `INDEX_EXISTS` | Index already exists (for create_index) |
| `INDEX_CORRUPT` | Index is corrupted or invalid |
| `INDEXING_IN_PROGRESS` | Another indexing operation is running |
| `INVALID_QUERY` | Search query is invalid or empty |
| `INVALID_PATTERN` | Glob pattern is malformed |
| `FILE_NOT_FOUND` | Specified file doesn't exist |
| `FILE_EXCLUDED` | File is excluded by config or deny list |
| `PATH_TRAVERSAL` | Path attempts to escape project directory |
| `MODEL_LOAD_FAILED` | Embedding model failed to load |

---

## Configuration

See [Configuration Reference](configuration.md) for details on customizing indexing behavior.
