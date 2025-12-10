# Search MCP - Backlog

> Items to be implemented after MVP is complete.

---

## 1. CI/CD Pipeline

### 1.1 GitHub Actions Workflows

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

### 1.2 Quality Gates

| Check | Requirement |
|-------|-------------|
| Tests pass | Required |
| Lint pass | Required |
| Build succeeds | Required |
| Coverage threshold | > 80% |

### 1.3 Branch Protection

- Require PR reviews before merge
- Require status checks to pass
- No direct pushes to `main`

---

## 2. Logging Improvements

### 2.1 Log Location

```
~/.mcp/search/indexes/<hash>/logs/
├── search-mcp.log      # Current log
├── search-mcp.1.log    # Rotated log
└── search-mcp.2.log    # Older rotated log
```

### 2.2 Log Format

```
[2024-01-15T10:30:45.123Z] [INFO] [indexing] Indexed file: src/auth/login.ts (3 chunks)
[2024-01-15T10:30:46.456Z] [WARN] [watcher] File exceeds size limit: large-file.json (2.5MB)
[2024-01-15T10:30:47.789Z] [ERROR] [embedding] Model inference failed: OutOfMemory
```

### 2.3 Rotation Policy

| Setting | Value |
|---------|-------|
| Max file size | 10MB |
| Max files | 3 |
| Compression | None (keep readable) |

### 2.4 Log Library

- **Recommended:** `pino` (fast, JSON-friendly)
- **Alternative:** `winston` (more features)

---

## 3. Future Features

### 3.1 High Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| `list_projects` | Show all indexed projects with stats | Low |
| Hybrid Search | Combine vector + keyword search (BM25) | Medium |
| PDF Doc Support | Add PDF text extraction to `search_docs` | Medium |

### 3.2 Medium Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| AST Chunking | Language-aware splitting via tree-sitter | High |
| Multi-Root Support | Index multiple folders as one project | Medium |
| Query Expansion | Rewrite queries for better retrieval | Medium |
| RST/AsciiDoc Support | Add .rst and .adoc to doc search | Low |
| Markdown Header Chunking | Split docs by headers for better context | Medium |

### 3.3 Low Priority

| Feature | Description | Complexity |
|---------|-------------|------------|
| Custom Models | Allow users to specify embedding model | Medium |
| Search History | Track recent searches | Low |
| Index Stats Dashboard | Visual stats via web UI | High |

---

## 4. Technical Debt

| Item | Description | Priority |
|------|-------------|----------|
| Config schema versioning | Handle config format changes across versions | Low |
| LanceDB version pinning | Test and pin compatible LanceDB version | Medium |

---

## 5. Documentation

| Item | Status |
|------|--------|
| README.md | ✅ Done |
| PRD.md | ✅ Done |
| ENGINEERING.RFC.md | ✅ Done |
| API Reference | TODO |
| Contributing Guide | TODO |
| Changelog | TODO |

---

## Priority Legend

- **P0** - Must have for launch
- **P1** - Should have soon after launch
- **P2** - Nice to have
- **P3** - Future consideration
