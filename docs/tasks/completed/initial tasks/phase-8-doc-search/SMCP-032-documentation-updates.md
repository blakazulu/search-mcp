---
task_id: "SMCP-032"
title: "Documentation Updates"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 1
actual_hours: 1
assigned_to: "blakazulu"
tags: ["docs", "documentation"]
---

# Task: Documentation Updates

## Overview

Update all project documentation to reflect the new search_docs feature, including PRD, Engineering RFC, README, CLAUDE.md, and Backlog.

## Goals

- [x] Update PRD.md with search_docs tool
- [x] Update ENGINEERING.RFC.md with technical spec
- [x] Update README.md with user documentation
- [x] Update BACKLOG.md with future PDF support

## Success Criteria

- All docs reflect the new feature
- User stories added for doc search
- Technical spec complete
- Config options documented
- Future PDF support in backlog

## Dependencies

**Blocked by:**

- None (documentation only)

**Blocks:**

- None

**Related:**

- All SMCP-025 to SMCP-031 tasks

## Subtasks

### Phase 1: PRD Updates (Completed)

- [x] 1.1 Add Documentation Search user stories
- [x] 1.2 Add search_docs to MCP Tools table
- [x] 1.3 Add Doc Indexing to Core Capabilities
- [x] 1.4 Add docPatterns and indexDocs to config

### Phase 2: Engineering RFC Updates (Completed)

- [x] 2.1 Add Section 4.8: search_docs tool spec
- [x] 2.2 Update storage structure diagram
- [x] 2.3 Add docs.lancedb schema (Section 3.2.1)
- [x] 2.4 Update metadata schema with docsStats
- [x] 2.5 Add DOCS_INDEX_NOT_FOUND error
- [x] 2.6 Update config schema and validation

### Phase 3: README Updates (Completed)

- [x] 3.1 Add search_docs to MCP Tools table
- [x] 3.2 Add Code vs Docs comparison table
- [x] 3.3 Update storage structure
- [x] 3.4 Add docPatterns and indexDocs config options
- [x] 3.5 Add docs chunking strategy section

### Phase 4: Backlog Updates (Completed)

- [x] 4.1 Add PDF Doc Support to high priority
- [x] 4.2 Add RST/AsciiDoc to medium priority
- [x] 4.3 Add Markdown Header Chunking to medium priority

## Resources

- `docs/design/PRD.md`
- `docs/design/ENGINEERING.RFC.md`
- `README.md`
- `docs/design/BACKLOG.md`
- `CLAUDE.md`

## Acceptance Checklist

All completed:

- [x] All subtasks completed
- [x] PRD updated
- [x] Engineering RFC updated
- [x] README updated
- [x] Backlog updated
- [x] All docs consistent

## Progress Log

### 2025-12-09 - 1 hour

- Task created
- All documentation updates completed
- PRD: Added user stories, tools table, capabilities
- RFC: Added search_docs spec, storage schema, error codes
- README: Added tools table, comparison, config options
- Backlog: Added PDF support and related features

## Notes

- Documentation was completed as part of feature planning
- All changes align with ENGINEERING.RFC.md spec

## Blockers

_None - completed_

## Related Tasks

- All Phase 8 tasks reference this documentation
