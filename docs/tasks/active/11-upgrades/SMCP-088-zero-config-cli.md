---
task_id: "SMCP-088"
title: "Zero-Config CLI Interface"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 12
actual_hours: 0
assigned_to: "Team"
tags: ["cli", "ux", "developer-experience", "inspired-by-mcp-vector-search"]
---

# Task: Zero-Config CLI Interface

## Overview

Implement a user-friendly CLI interface inspired by mcp-vector-search. Currently search-mcp is MCP-only with no direct CLI. Adding a CLI enables standalone usage, easier debugging, and better developer experience. The goal is "single command setup that just works."

## Goals

- [ ] Create CLI entry point with intuitive commands
- [ ] Implement `search-mcp setup` for zero-config initialization
- [ ] Add `search-mcp search <query>` for direct searching
- [ ] Add `search-mcp status` for index information
- [ ] Support rich terminal output (colors, progress bars)
- [ ] Auto-detect project settings

## Success Criteria

- `npx @liraz-sbz/search-mcp setup` creates index with smart defaults
- `npx @liraz-sbz/search-mcp search "auth function"` returns results
- Progress bars show indexing progress
- Colored output for readability
- Works without any configuration file
- Help text is comprehensive

## Dependencies

**Blocked by:**

- None

**Blocks:**

- None

**Related:**

- None

## Subtasks

### Phase 1: CLI Framework Setup (3 hours)

- [ ] 1.1 Evaluate CLI frameworks
    - Commander.js vs yargs vs oclif
    - Choose based on TypeScript support and features
- [ ] 1.2 Add CLI dependencies
    - CLI framework
    - chalk/picocolors for colors
    - ora for spinners
    - cli-progress for progress bars
- [ ] 1.3 Create `src/cli/index.ts` entry point
    - Parse arguments
    - Route to command handlers

### Phase 2: Core Commands (5 hours)

- [ ] 2.1 Implement `setup` command
    - Auto-detect project root
    - Auto-detect languages/file types
    - Create default config
    - Run initial indexing with progress
- [ ] 2.2 Implement `search` command
    - Accept query as argument
    - Support options: --top-k, --mode, --alpha
    - Format results nicely
    - Show file paths and snippets
- [ ] 2.3 Implement `status` command
    - Show index statistics
    - Show config location
    - Show compute device info
- [ ] 2.4 Implement `reindex` command
    - Full reindex with progress
    - Option for single file

### Phase 3: Rich Output (2 hours)

- [ ] 3.1 Add colored output
    - File paths in cyan
    - Scores in yellow
    - Errors in red
- [ ] 3.2 Add progress bars for indexing
- [ ] 3.3 Add spinners for operations
- [ ] 3.4 Format code snippets with syntax highlighting (optional)

### Phase 4: Polish (2 hours)

- [ ] 4.1 Add comprehensive help text
- [ ] 4.2 Add `--version` flag
- [ ] 4.3 Add `--json` output option for scripting
- [ ] 4.4 Update package.json bin entry
- [ ] 4.5 Test on Windows/macOS/Linux

## Resources

- [mcp-vector-search CLI](../../../examples/mcp-vector-search-main/src/cli/)
- [Commander.js](https://github.com/tj/commander.js)
- [chalk](https://github.com/chalk/chalk)
- [ora](https://github.com/sindresorhus/ora)
- [Examples comparison analysis](../../examples-comparison-analysis.md)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced
- [ ] Works on Windows, macOS, Linux

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on examples comparison analysis
- Inspired by mcp-vector-search's CLI experience

## Notes

- mcp-vector-search has the best CLI UX of all examples
- Keep MCP as primary interface, CLI as convenience layer
- Consider adding "Did you mean?" suggestions like mcp-vector-search
- CLI can reuse existing tool handlers internally

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- None directly, but improves overall developer experience
