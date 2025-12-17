# CLI Reference

Search MCP includes a standalone command-line interface for direct terminal usage without requiring an MCP client.

## Installation

**Option 1: Run directly with npx (recommended)**
```bash
npx @liraz-sbz/search-mcp <command>
```

**Option 2: Install globally**
```bash
npm install -g @liraz-sbz/search-mcp
search-mcp <command>
```

## Commands

### `index` - Create Search Index

Creates or updates the search index for the current project.

```bash
# Index current directory
search-mcp index

# Index specific directory
search-mcp index /path/to/project

# With npx
npx @liraz-sbz/search-mcp index
```

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |

**What it does:**
- Auto-detects project root
- Creates index for both code and documentation files
- Shows progress bar during indexing
- Displays GPU/CPU compute device being used

**Example output:**
```
Indexing project: /Users/dev/my-project

Indexing... ████████████████████████████████████████ 100% | 234/234 files

✓ Index created successfully!

  Files indexed: 234
  Code chunks:   892
  Doc chunks:    156
  Compute:       DirectML (GPU)
```

---

### `search` - Search Code

Search your indexed codebase using natural language queries.

```bash
# Basic search
search-mcp search "authentication logic"

# Search with options
search-mcp search "database connection" --top-k 5 --mode hybrid

# Search documentation instead of code
search-mcp search "API rate limits" --docs

# JSON output for scripting
search-mcp search "error handling" --json
```

**Options:**
| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--top-k <n>` | `-k` | `10` | Number of results to return |
| `--mode <mode>` | `-m` | `hybrid` | Search mode: `hybrid`, `vector`, or `fts` |
| `--alpha <n>` | `-a` | `0.5` | Balance between semantic (1.0) and keyword (0.0) search |
| `--docs` | `-d` | `false` | Search documentation files instead of code |
| `--json` | | `false` | Output results as JSON |

**Search Modes:**
| Mode | Best For |
|------|----------|
| `hybrid` | General queries - combines semantic + keyword matching |
| `vector` | Conceptual queries like "how does auth work?" |
| `fts` | Exact matches like function names or error messages |

**Example output:**
```
Search results for: "authentication logic"

  1. src/auth/login.ts:45-89 (score: 0.847)
     async function authenticateUser(credentials: Credentials) {
       const user = await findUserByEmail(credentials.email);
       if (!user) throw new AuthError('User not found');
       ...

  2. src/middleware/auth.ts:12-34 (score: 0.823)
     export function requireAuth(req: Request, res: Response, next: NextFunction) {
       const token = req.headers.authorization?.split(' ')[1];
       ...

Found 10 results in 42ms
```

---

### `status` - Show Index Status

Display information about the current project's index.

```bash
search-mcp status

# JSON output
search-mcp status --json
```

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |

**Example output:**
```
Index Status

  Project:       /Users/dev/my-project
  Index path:    ~/.mcp/search/indexes/a1b2c3d4/
  Config path:   ~/.mcp/search/indexes/a1b2c3d4/config.json

  Code files:    234
  Code chunks:   892
  Doc files:     45
  Doc chunks:    156

  Last indexed:  2025-12-17 14:32:00
  Compute:       DirectML (GPU)
```

---

### `reindex` - Rebuild Index

Completely rebuilds the search index from scratch.

```bash
search-mcp reindex

# JSON output
search-mcp reindex --json
```

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |

**When to use:**
- After major code changes
- If search results seem stale
- After changing configuration

---

### `setup` - Configure MCP Clients

Auto-detect and configure your AI assistants to use Search MCP.

```bash
search-mcp setup

# Or using the flag syntax
search-mcp --setup
```

This detects installed clients (Claude Desktop, Claude Code, Cursor, etc.) and offers to configure them automatically.

---

### `logs` - Show Log Locations

Display the paths to log files for debugging.

```bash
search-mcp logs

# Or using the flag syntax
search-mcp --logs
```

---

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help for a command |
| `--version`, `-V` | Show version number |

```bash
search-mcp --help
search-mcp search --help
search-mcp --version
```

---

## JSON Output

All commands support `--json` for machine-readable output, useful for scripting:

```bash
# Get search results as JSON
search-mcp search "auth" --json | jq '.results[0]'

# Get status as JSON
search-mcp status --json | jq '.stats.codeChunks'

# Use in scripts
CHUNKS=$(search-mcp status --json | jq -r '.stats.codeChunks')
echo "Index contains $CHUNKS code chunks"
```

---

## Examples

### Quick Workflow

```bash
# 1. Navigate to your project
cd /path/to/my-project

# 2. Create the index
npx @liraz-sbz/search-mcp index

# 3. Search your code
npx @liraz-sbz/search-mcp search "database connection"
npx @liraz-sbz/search-mcp search "error handling" -k 5
npx @liraz-sbz/search-mcp search "API documentation" --docs

# 4. Check index status
npx @liraz-sbz/search-mcp status
```

### CI/CD Integration

```bash
#!/bin/bash
# Example: Verify code patterns exist in codebase

RESULTS=$(npx @liraz-sbz/search-mcp search "security validation" --json)
COUNT=$(echo $RESULTS | jq '.results | length')

if [ "$COUNT" -lt 1 ]; then
  echo "Warning: No security validation found in codebase"
  exit 1
fi
```

### IDE-less Code Review

```bash
# Search for potential issues
search-mcp search "TODO" -k 20
search-mcp search "FIXME" -k 20
search-mcp search "console.log" -k 20
search-mcp search "password" -k 10
```

---

## Comparison: CLI vs MCP

| Feature | CLI | MCP |
|---------|-----|-----|
| **Use case** | Direct terminal access, scripting | AI assistant integration |
| **Setup** | None - just run | Configure MCP client |
| **Output** | Human-readable or JSON | Structured for AI |
| **Best for** | Quick searches, debugging, automation | Natural language queries via AI |

Both interfaces use the same underlying index and search engine.

---

## Troubleshooting

**"Index not found" error**
```bash
# Create the index first
search-mcp index
```

**Slow indexing**
- Check if GPU acceleration is active with `search-mcp status`
- On Windows, DirectML should auto-detect your GPU

**No results found**
- Ensure the project was indexed: `search-mcp status`
- Try broader search terms
- Use `--mode vector` for conceptual queries
- Rebuild index: `search-mcp reindex`

**Permission errors**
```bash
# If using global install, may need sudo on macOS/Linux
sudo npm install -g @liraz-sbz/search-mcp
```
