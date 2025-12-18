---
task_id: "SMCP-088"
title: "Zero-Config CLI Interface"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 12
actual_hours: 10
assigned_to: "Team"
tags: ["cli", "ux", "developer-experience"]
---

# Task: Zero-Config CLI Interface

## Overview

Implement a user-friendly CLI interface. Currently search-mcp is MCP-only with no direct CLI. Adding a CLI enables standalone usage, easier debugging, and better developer experience. The goal is "single command setup that just works."

## Goals

- [x] Create CLI entry point with intuitive commands
- [x] Implement `search-mcp setup` for zero-config initialization
- [x] Add `search-mcp search <query>` for direct searching
- [x] Add `search-mcp status` for index information
- [x] Support rich terminal output (colors, progress bars)
- [x] Auto-detect project settings

## Success Criteria

- [x] `npx @liraz-sbz/search-mcp setup` creates index with smart defaults
- [x] `npx @liraz-sbz/search-mcp search "auth function"` returns results
- [x] Progress bars show indexing progress
- [x] Colored output for readability
- [x] Works without any configuration file
- [x] Help text is comprehensive

## Dependencies

**Blocked by:**

- None

**Blocks:**

- None

**Related:**

- None

## Subtasks

### Phase 1: CLI Framework Setup (3 hours)

- [x] 1.1 Evaluate CLI frameworks
    - Commander.js vs yargs vs oclif
    - Chose Commander.js based on TypeScript support and features
- [x] 1.2 Add CLI dependencies
    - commander (CLI framework)
    - chalk (colors)
    - ora (spinners)
    - cli-progress (progress bars)
- [x] 1.3 Create `src/cli/commands.ts` entry point
    - Parse arguments via Commander
    - Route to command handlers

### Phase 2: Core Commands (5 hours)

- [x] 2.1 Implement `index` command
    - Auto-detect project root
    - Auto-detect languages/file types
    - Create default config
    - Run initial indexing with progress
- [x] 2.2 Implement `search` command
    - Accept query as argument
    - Support options: --top-k, --mode, --alpha, --docs
    - Format results nicely
    - Show file paths and snippets
- [x] 2.3 Implement `status` command
    - Show index statistics
    - Show config location
    - Show compute device info
- [x] 2.4 Implement `reindex` command
    - Full reindex with progress

### Phase 3: Rich Output (2 hours)

- [x] 3.1 Add colored output
    - File paths in cyan
    - Scores in yellow
    - Errors in red
- [x] 3.2 Add progress bars for indexing
- [x] 3.3 Add spinners for operations
- [ ] 3.4 Format code snippets with syntax highlighting (optional - deferred)

### Phase 4: Polish (2 hours)

- [x] 4.1 Add comprehensive help text
- [x] 4.2 Add `--version` flag
- [x] 4.3 Add `--json` output option for scripting
- [x] 4.4 Update package.json bin entry (already configured)
- [x] 4.5 Test on Windows (tested and working)

### Phase 5: Enhanced Setup Flow (2 hours)

- [x] 5.1 Add project directory confirmation at start
- [x] 5.2 Add indexing prompt after client configuration
- [x] 5.3 Check for existing index and show stats
- [x] 5.4 Offer to delete and recreate existing index
- [x] 5.5 Run indexing with progress bars and spinners
- [x] 5.6 Show success summary with files/chunks/duration

## Resources

- [Commander.js](https://github.com/tj/commander.js)
- [chalk](https://github.com/chalk/chalk)
- [ora](https://github.com/sindresorhus/ora)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed (except optional syntax highlighting - deferred)
- [x] All success criteria met
- [x] Code tested (if applicable)
- [x] Documentation updated (if applicable)
- [ ] Changes committed to Git (pending user approval)
- [x] No regressions introduced
- [x] Works on Windows, macOS, Linux (tested on Windows)

## Progress Log

### 2025-12-17 - 8 hours

- Added CLI dependencies: commander, chalk, ora, cli-progress
- Created `src/cli/commands.ts` with full CLI implementation
- Implemented all four core commands: index, search, status, reindex
- Added rich terminal output with colors, progress bars, and spinners
- Implemented --json output mode for all commands
- Updated `src/index.ts` to route CLI commands
- Updated CHANGELOG.md with new features
- All tests passing
- Tested on Windows with DirectML GPU acceleration

### 2025-12-18 - 2 hours

- Enhanced `setup` command with integrated indexing flow
- Added project directory confirmation at start of setup (prevents wrong directory indexing)
- After configuring MCP clients, prompts user to index current project
- If existing index found, shows stats (files, chunks, size, last updated)
- Offers to delete and recreate existing index
- Progress bars and spinners show indexing progress
- Updated CHANGELOG.md with enhanced setup flow documentation

## Implementation Details

### Files Changed
- **src/cli/commands.ts** (new) - CLI command implementations
- **src/index.ts** - Updated entry point to route CLI commands
- **CHANGELOG.md** - Added CLI documentation
- **package.json** - Added CLI dependencies

### CLI Commands
```bash
search-mcp index              # Create index
search-mcp search <query>     # Search code
search-mcp status             # Show status
search-mcp reindex            # Rebuild index
search-mcp setup              # Configure clients
search-mcp logs               # Show log locations
search-mcp --help             # Show help
search-mcp --version          # Show version
```

### Search Options
- `-k, --top-k <n>` - Number of results
- `-m, --mode <mode>` - Search mode (hybrid/vector/fts)
- `-a, --alpha <n>` - Alpha weight (0-1)
- `-d, --docs` - Search docs instead of code
- `--json` - JSON output for scripting

## Notes

- Keep MCP as primary interface, CLI as convenience layer
- Consider adding "Did you mean?" suggestions (future enhancement)
- CLI reuses existing tool handlers internally

## Blockers

_None - task completed successfully_

## Related Tasks

- None directly, but improves overall developer experience
