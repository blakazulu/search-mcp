---
task_id: "SMCP-101"
title: "Clean CLI Output"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-19"
due_date: ""
estimated_hours: 4
actual_hours: 3
assigned_to: "Team"
tags: ["cli", "ux", "developer-experience"]
---

# Task: Clean CLI Output

## Overview

The CLI setup command was outputting excessive noise including timestamped log messages, ONNX runtime warnings, and memory diagnostics mixed with progress bars. This made the CLI output hard to read and unprofessional.

## Goals

- [x] Suppress verbose log messages during CLI operations
- [x] Add --verbose flag for debugging when needed
- [x] Filter ONNX runtime warnings from console
- [x] Aggregate progress across batches for smoother display
- [x] Keep all logs in log files for debugging
- [x] Show separate progress sections for code and docs indexing
- [x] Add compute device choice (GPU vs CPU) before indexing

## Success Criteria

- [x] `npx @liraz-sbz/search-mcp setup` shows clean progress output
- [x] `npx @liraz-sbz/search-mcp setup --verbose` shows detailed logs
- [x] ONNX warnings don't appear in normal CLI output
- [x] Progress bars don't reset for each batch
- [x] All logs still written to log files

## Implementation

### Files Changed

- **src/utils/logger.ts** - Added `setSilentConsole()` method to Logger interface and FileLogger class
- **src/cli/setup.ts** - Added verbose option, silent mode, progress aggregation, device choice prompt
- **src/cli/commands.ts** - Added --verbose flag to index, reindex, and setup commands
- **src/engines/embedding.ts** - Added stderr filtering, `setPreferredDevice()` API for device selection
- **src/index.ts** - Parse --verbose flag for legacy --setup command

### Key Changes

1. **Silent Console Mode** - Logger can suppress console output while still writing to log files
2. **--verbose Flag** - All CLI commands support --verbose to re-enable detailed logging
3. **ONNX Warning Filter** - Stderr is temporarily filtered during model initialization
4. **Progress Aggregation** - Progress bars accumulate across batches for smoother display
5. **Separate Code/Docs Sections** - Clear visual separation between code and docs indexing with dedicated progress
6. **Compute Device Choice** - Users can choose GPU (faster, may stutter) or CPU (slower, responsive)

### Before

```
PS> npx @liraz-sbz/search-mcp setup
[2025-12-19T11:59:15.745Z] [INFO] [ProjectRoot] Detecting project root from: C:\project
[2025-12-19T11:59:15.747Z] [INFO] [ProjectRoot] Found project root at: C:\project
...
2025-12-19 13:59:46 [W:onnxruntime:, session_state.cc:1263] Some nodes were not assigned...
[2025-12-19T11:59:46.586Z] [INFO] [EmbeddingEngine] DirectML shaders compiled...
  Chunking  [█████░░░░░░░░░░░░░░░░░░░░░░░░░] 13% | 50/366 files
  Embedding [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 0% | 0/189 chunks
  (repeated 10+ times for each batch)
```

### After

```
PS> npx @liraz-sbz/search-mcp setup
Search MCP Setup
================

Detected project directory:
  C:\project

Is this the correct project folder? [Y/n]: y

✓ Configured Claude Code

Would you like to index this project now? [Y/n]: y

✓ Project detected: C:\project

Compute Device:

  [1] GPU (DirectML) - Faster, but may cause system stuttering
  [2] CPU - Slower, but system stays responsive

Select compute device [1]: 1
Using GPU (DirectML) for embedding generation.

Creating index for: C:\project

Code Index:
  ✓ Scanned 27,562 files → 366 indexable
  Chunking  [████████████████████████████████████████] 100% | 366/366 files
  Embedding [████████████████████████████████████████] 100% | 1,849/1,849 chunks
  ✓ Stored 1,849 chunks
  ✓ Code index complete: 366 files, 1,849 chunks

Docs Index:
  ✓ Scanned 156 files → 42 indexable
  Chunking  [████████████████████████████████████████] 100% | 42/42 files
  Embedding [████████████████████████████████████████] 100% | 722/722 chunks
  ✓ Stored 722 chunks
  ✓ Docs index complete: 42 files, 722 chunks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Index created successfully!

  Code:     366 files, 1,849 chunks
  Docs:     42 files, 722 chunks
  Duration: 7m 32s
  Device:   DirectML GPU
```

## Notes

- The download progress bar for first-time model download was not implemented (deferred)
- Error summary display was not implemented (logs to file instead)
- All verbose logs are still available via --verbose flag or in log files

## Related Tasks

- SMCP-088: Zero-Config CLI Interface (original CLI implementation)
