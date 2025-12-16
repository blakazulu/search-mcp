---
task_id: "SMCP-085"
title: "Query Intent Detection"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 10
actual_hours: 0
assigned_to: "Team"
tags: ["search", "intent", "nlp", "ranking", "inspired-by-claude-context-local"]
---

# Task: Query Intent Detection

## Overview

Implement query intent detection to classify search queries into categories (function search, error handling, database, API, auth, testing, etc.). This enables dynamic chunk type boosting and query optimization for better search results. Inspired by claude-context-local's intent detection system.

## Goals

- [ ] Classify queries into intent categories
- [ ] Enable dynamic chunk type boosting based on intent
- [ ] Implement minimal query expansion (preserve code specificity)
- [ ] Support 6+ intent categories
- [ ] Keep detection fast (< 10ms overhead)

## Success Criteria

- Queries like "function that handles auth" detect "function" + "auth" intent
- "error handling" queries boost error-related chunks
- "database queries" surface DB-related code
- Intent detection adds < 10ms latency
- False positive rate < 15%
- Integrates with SMCP-087 ranking

## Dependencies

**Blocked by:**

- None (can be developed independently)

**Blocks:**

- None

**Related:**

- SMCP-087: Multi-Factor Ranking (uses intent for boosting)

## Subtasks

### Phase 1: Research & Design (2 hours)

- [ ] 1.1 Study claude-context-local's intent detection
    - Document patterns and keywords used
    - Understand category definitions
- [ ] 1.2 Design intent categories for search-mcp
    - Define category list
    - Define keyword patterns per category
- [ ] 1.3 Create test dataset of queries with expected intents

### Phase 2: Implementation (5 hours)

- [ ] 2.1 Create `src/engines/queryIntent.ts`
    - Define IntentCategory enum
    - Define QueryIntent interface
- [ ] 2.2 Implement keyword-based detection
    ```typescript
    Intent Categories:
    - FUNCTION: "function", "method", "def", "fn"
    - CLASS: "class", "struct", "type", "interface"
    - ERROR: "error", "exception", "catch", "throw", "handle"
    - DATABASE: "database", "db", "query", "sql", "mongo"
    - API: "api", "endpoint", "route", "request", "response"
    - AUTH: "auth", "login", "password", "token", "session"
    - TEST: "test", "spec", "mock", "assert", "expect"
    - CONFIG: "config", "settings", "env", "options"
    ```
- [ ] 2.3 Implement multi-intent detection
    - Queries can match multiple intents
    - Return confidence scores per intent
- [ ] 2.4 Implement query optimization
    - Minimal expansion to preserve specificity
    - Don't over-expand code-specific terms

### Phase 3: Integration (2 hours)

- [ ] 3.1 Integrate with search pipeline
    - Call intent detection before search
    - Pass intents to ranking system
- [ ] 3.2 Add configuration options
    - Enable/disable intent detection
    - Custom keyword patterns

### Phase 4: Testing (1 hour)

- [ ] 4.1 Unit tests for intent detection
- [ ] 4.2 Test multi-intent scenarios
- [ ] 4.3 Benchmark latency overhead

## Resources

- [claude-context-local searcher.py](../../../examples/claude-context-local-main/searcher.py)
- [Examples comparison analysis](../../examples-comparison-analysis.md)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced
- [ ] Latency overhead < 10ms

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on examples comparison analysis
- Inspired by claude-context-local's query intent detection

## Notes

- claude-context-local detects 6 categories: function, error handling, database, API, auth, testing
- Keep detection simple - keyword matching is fast and effective
- Consider adding code-specific patterns (camelCase, snake_case detection)
- This is a key enabler for SMCP-087 Multi-Factor Ranking

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-087: Multi-Factor Ranking - primary consumer of intent data
