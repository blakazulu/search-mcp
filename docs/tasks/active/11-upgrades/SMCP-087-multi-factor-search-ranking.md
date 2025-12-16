---
task_id: "SMCP-087"
title: "Multi-Factor Search Ranking"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 16
actual_hours: 0
assigned_to: "Team"
tags: ["search", "ranking", "quality", "inspired-by-claude-context-local"]
---

# Task: Multi-Factor Search Ranking

## Overview

Implement a sophisticated multi-factor ranking algorithm inspired by claude-context-local. Currently search-mcp uses simple RRF (Reciprocal Rank Fusion) with 2 signals (vector + FTS). The claude-context-local example uses 7+ ranking signals for significantly better result quality.

## Goals

- [ ] Implement query intent detection integration
- [ ] Add chunk type boosting based on query intent
- [ ] Implement name matching with CamelCase-aware tokenization
- [ ] Add path/filename relevance scoring
- [ ] Implement docstring/comment presence bonus
- [ ] Add complexity penalty for oversized chunks

## Success Criteria

- Search results show measurably better relevance for common query types
- Function searches rank function chunks higher
- Error handling queries surface error-related code
- Name matches boost results appropriately
- Benchmark shows improvement over current RRF-only approach

## Dependencies

**Blocked by:**

- SMCP-085: Query Intent Detection (provides intent data for boosting)

**Blocks:**

- None

**Related:**

- SMCP-085: Query Intent Detection (core component of this task)
- SMCP-086: AST-Based Chunking (provides richer metadata for ranking)

## Subtasks

### Phase 1: Research & Design (3 hours)

- [ ] 1.1 Study claude-context-local's `searcher.py` ranking implementation
    - Document all ranking factors used
    - Understand weight calculations
- [ ] 1.2 Design ranking algorithm for search-mcp
    - Define factor weights
    - Plan integration with existing hybrid search
- [ ] 1.3 Create test cases for ranking quality

### Phase 2: Core Ranking Implementation (6 hours)

- [ ] 2.1 Create `src/engines/advancedRanking.ts`
    - Define RankingFactors interface
    - Implement base scoring function
- [ ] 2.2 Implement chunk type boosting
    - Boost functions for function queries
    - Boost classes for class queries
    - Boost error handling for error queries
- [ ] 2.3 Implement name matching
    - CamelCase tokenization
    - snake_case tokenization
    - Partial name matching with scoring
- [ ] 2.4 Add path relevance scoring
    - Filename match bonus
    - Directory relevance

### Phase 3: Integration & Testing (5 hours)

- [ ] 3.1 Integrate with hybridSearch.ts
    - Replace or extend RRF scoring
    - Make advanced ranking configurable
- [ ] 3.2 Add configuration options
    - Enable/disable in config.json
    - Factor weight customization
- [ ] 3.3 Write comprehensive tests
    - Unit tests for each ranking factor
    - Integration tests for combined ranking
- [ ] 3.4 Benchmark against current implementation

### Phase 4: Documentation (2 hours)

- [ ] 4.1 Update CLAUDE.md with ranking details
- [ ] 4.2 Add JSDoc comments
- [ ] 4.3 Update CHANGELOG.md

## Resources

- [claude-context-local searcher.py](../../../examples/claude-context-local-main/searcher.py)
- [Current hybridSearch.ts](../../../src/engines/hybridSearch.ts)
- [Examples comparison analysis](../../examples-comparison-analysis.md)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced
- [ ] Benchmark shows improvement

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on examples comparison analysis
- Inspired by claude-context-local's multi-factor ranking

## Notes

- claude-context-local uses 7+ ranking signals vs our 2 (vector + FTS)
- Key insight: Query intent detection enables dynamic factor boosting
- Consider making this opt-in initially to avoid breaking changes
- May need AST metadata (SMCP-086) for full effectiveness

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-085: Query Intent Detection - provides intent data
- SMCP-086: AST-Based Chunking - provides richer metadata
