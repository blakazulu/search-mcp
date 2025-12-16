---
task_id: "SMCP-089"
title: "Merkle DAG Change Detection"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 14
actual_hours: 0
assigned_to: "Team"
tags: ["indexing", "performance", "incremental", "merkle", "inspired-by-claude-context-local"]
---

# Task: Merkle DAG Change Detection

## Overview

Implement Merkle DAG-based change detection for more efficient incremental indexing. Currently search-mcp uses SHA256 fingerprints per file. claude-context-local uses a content-hash DAG that enables more granular change detection and efficient state management, especially beneficial for large codebases with frequent small changes.

## Goals

- [ ] Implement Merkle tree structure for file/chunk tracking
- [ ] Enable chunk-level change detection (not just file-level)
- [ ] Implement efficient snapshot persistence
- [ ] Support partial reindexing of modified chunks only
- [ ] Reduce reindex time for large codebases with small changes

## Success Criteria

- Changing one function in a large file only reindexes affected chunks
- State snapshots enable fast startup
- Reindex time reduced by 50%+ for small changes
- No correctness regressions (all changes detected)
- Memory usage stays within limits

## Dependencies

**Blocked by:**

- SMCP-086: AST-Based Chunking (chunk boundaries needed for granular tracking)

**Blocks:**

- None

**Related:**

- SMCP-086: AST-Based Chunking

## Subtasks

### Phase 1: Research & Design (3 hours)

- [ ] 1.1 Study claude-context-local's Merkle DAG implementation
    - Understand node structure
    - Understand diff algorithm
- [ ] 1.2 Design Merkle tree structure for search-mcp
    - Root node (project)
    - File nodes
    - Chunk nodes
- [ ] 1.3 Design persistence format
    - JSON vs binary
    - Incremental updates

### Phase 2: Core Implementation (6 hours)

- [ ] 2.1 Create `src/engines/merkleTree.ts`
    - Define MerkleNode interface
    - Implement hash computation
    - Implement tree construction
- [ ] 2.2 Implement file-level Merkle tree
    - Hash each file
    - Build directory tree
    - Compute root hash
- [ ] 2.3 Implement chunk-level tracking
    - Hash each chunk within files
    - Track chunk boundaries
    - Detect moved/renamed chunks
- [ ] 2.4 Implement diff algorithm
    - Compare two tree states
    - Return changed nodes only

### Phase 3: Integration (3 hours)

- [ ] 3.1 Integrate with indexing pipeline
    - Replace fingerprints.json with Merkle state
    - Update only changed chunks
- [ ] 3.2 Implement snapshot persistence
    - Save state to disk
    - Load state on startup
    - Handle corruption gracefully
- [ ] 3.3 Update file watcher integration
    - Use Merkle diff for change detection

### Phase 4: Testing & Benchmarking (2 hours)

- [ ] 4.1 Unit tests for Merkle operations
- [ ] 4.2 Integration tests for incremental updates
- [ ] 4.3 Benchmark: measure reindex time reduction
- [ ] 4.4 Test edge cases (file moves, renames, large changes)

## Resources

- [claude-context-local Merkle implementation](../../../examples/claude-context-local-main/)
- [Current fingerprints implementation](../../../src/storage/)
- [Examples comparison analysis](../../examples-comparison-analysis.md)
- [Merkle tree concepts](https://en.wikipedia.org/wiki/Merkle_tree)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced
- [ ] 50%+ reindex time improvement measured

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on examples comparison analysis
- Inspired by claude-context-local's Merkle DAG

## Notes

- Merkle DAG allows chunk-level change detection vs current file-level
- Most beneficial for large files with small changes
- Consider migration path from current fingerprints.json
- May need AST chunking (SMCP-086) for meaningful chunk boundaries
- Alternative: could implement simpler chunk-hash tracking without full DAG

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-086: AST-Based Chunking - provides stable chunk boundaries
