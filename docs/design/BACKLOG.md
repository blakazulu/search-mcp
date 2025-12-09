# Search MCP - Backlog

> Items to be implemented after MVP is complete.

---

## 1. Testing Strategy

### 1.1 Unit Tests

| Component | Test Coverage |
|-----------|---------------|
| **Project Root Detection** | Test priority chain, fallback behavior |
| **Indexing Policy** | Test deny list, include/exclude patterns, gitignore |
| **Chunking Engine** | Test splitting, overlap, line number tracking |
| **Embedding Engine** | Test batch processing, error handling |
| **Fingerprint Manager** | Test hash comparison, delta detection |
| **Config Validation** | Test schema validation, defaults |

### 1.2 Integration Tests

| Scenario | What to Test |
|----------|--------------|
| **Full Index Flow** | Create index → verify chunks in LanceDB |
| **Search Flow** | Index → search → verify relevant results |
| **File Watcher** | Save file → verify incremental update |
| **Integrity Check** | Modify files offline → verify reconciliation |

### 1.3 End-to-End Tests

| Scenario | What to Test |
|----------|--------------|
| **MCP Protocol** | Full tool invocation via MCP client |
| **Multi-Project** | Index multiple projects, verify isolation |
| **Error Recovery** | Corrupt index → verify auto-recovery |

### 1.4 Coverage Targets

| Metric | Target |
|--------|--------|
| Line coverage | > 80% |
| Branch coverage | > 70% |
| Critical paths | 100% |

### 1.5 Test Framework

- **Runner:** Vitest
- **Mocking:** Vitest built-in mocks
- **Assertions:** Vitest expect API

---

## 2. CI/CD Pipeline

### 2.1 GitHub Actions Workflows

#### `test.yml` - Run on every PR

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

#### `publish.yml` - Run on release

```yaml
name: Publish
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 2.2 Quality Gates

| Check | Requirement |
|-------|-------------|
| Tests pass | Required |
| Lint pass | Required |
| Build succeeds | Required |
| Coverage threshold | > 80% |

### 2.3 Branch Protection

- Require PR reviews before merge
- Require status checks to pass
- No direct pushes to `main`

---

## 3. Logging Details

### 3.1 Log Location

```
~/.mcp/search/indexes/<hash>/logs/
├── search-mcp.log      # Current log
├── search-mcp.1.log    # Rotated log
└── search-mcp.2.log    # Older rotated log
```

### 3.2 Log Format

```
[2024-01-15T10:30:45.123Z] [INFO] [indexing] Indexed file: src/auth/login.ts (3 chunks)
[2024-01-15T10:30:46.456Z] [WARN] [watcher] File exceeds size limit: large-file.json (2.5MB)
[2024-01-15T10:30:47.789Z] [ERROR] [embedding] Model inference failed: OutOfMemory
```

### 3.3 Log Levels

| Level | When to Use |
|-------|-------------|
| `ERROR` | Failures that affect functionality |
| `WARN` | Non-critical issues (skipped files, limits) |
| `INFO` | Normal operations (indexed files, searches) |
| `DEBUG` | Detailed debugging (hashes, timing) |

### 3.4 Rotation Policy

| Setting | Value |
|---------|-------|
| Max file size | 10MB |
| Max files | 3 |
| Compression | None (keep readable) |

### 3.5 Log Library

- **Recommended:** `pino` (fast, JSON-friendly)
- **Alternative:** `winston` (more features)

---

## 4. Future Features (from Roadmap)

### 4.1 High Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| `list_projects` | Show all indexed projects with stats | Low |
| Hybrid Search | Combine vector + keyword search (BM25) | Medium |
| PDF Doc Support | Add PDF text extraction to `search_docs` (requires pdf-parse) | Medium |

### 4.2 Medium Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| AST Chunking | Language-aware splitting via tree-sitter | High |
| Multi-Root Support | Index multiple folders as one project | Medium |
| Query Expansion | Rewrite queries for better retrieval | Medium |
| RST/AsciiDoc Support | Add .rst and .adoc to doc search | Low |
| Markdown Header Chunking | Split docs by headers for better context | Medium |

### 4.3 Low Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| Custom Models | Allow users to specify embedding model | Medium |
| Search History | Track recent searches | Low |
| Index Stats Dashboard | Visual stats via web UI | High |

---

## 5. Technical Debt

| Item | Description | Priority |
|------|-------------|----------|
| Error message consistency | Ensure all errors follow dual-message format | Medium |
| Config schema versioning | Handle config format changes across versions | Low |
| LanceDB version pinning | Test and pin compatible LanceDB version | Medium |

---

## 6. Documentation

| Item | Status |
|------|--------|
| README.md | Done |
| PRD.md | Done |
| ENGINEERING.RFC.md | Done |
| API Reference | TODO |
| Contributing Guide | TODO |
| Changelog | TODO |

---

## Priority Legend

- **P0** - Must have for launch
- **P1** - Should have soon after launch
- **P2** - Nice to have
- **P3** - Future consideration
