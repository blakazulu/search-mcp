---
task_id: "SMCP-062"
title: "Testing & Documentation"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-11"
due_date: ""
estimated_hours: 8
actual_hours: 0
assigned_to: "Team"
tags: ["hybrid-search", "testing", "documentation", "release"]
---

# Task: Testing & Documentation

## Overview

Comprehensive testing of the hybrid search feature across all engines and modes, plus documentation updates for users and the changelog/roadmap updates for release.

## Goals

- [ ] Full integration test coverage for hybrid search
- [ ] Performance benchmarks comparing engines and modes
- [ ] Cross-platform testing (Windows, macOS, Linux)
- [ ] Update all user-facing documentation
- [ ] Prepare release notes and changelog

## Success Criteria

- ✅ All integration tests pass
- ✅ Performance benchmarks documented
- ✅ Works on Windows, macOS, and Linux
- ✅ API reference updated with new parameters
- ✅ Configuration docs updated
- ✅ CHANGELOG.md updated
- ✅ ROADMAP.md updated (hybrid search moved to completed)

## Dependencies

**Blocked by:**

- SMCP-058: FTS Engine Interface & JS Implementation
- SMCP-059: SQLite FTS5 Native Engine
- SMCP-060: Engine Factory & Auto-Detection
- SMCP-061: Integration & Search Tools Update

**Blocks:**

- None (final task)

**Related:**

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md`

## Subtasks

### Phase 1: Integration Testing (3 hours)

- [ ] 1.1 Create `tests/integration/hybridSearch.test.ts`
    - Test create_index builds both vector and FTS indexes
    - Test search_code with mode="vector"
    - Test search_code with mode="keyword"
    - Test search_code with mode="hybrid"
    - Test alpha parameter affects ranking
    - Test search_docs with all modes

- [ ] 1.2 Test engine selection
    - Test auto-detection with small project
    - Test auto-detection with large project (mock file count)
    - Test user preference override
    - Test fallback when native unavailable

- [ ] 1.3 Test backward compatibility
    - Load existing v2 index (no FTS)
    - Verify search falls back to vector-only
    - Verify get_index_status shows hybridSearch.enabled = false

- [ ] 1.4 Test incremental updates
    - reindex_file updates both indexes
    - Delete file removes from both indexes
    - New file adds to both indexes

### Phase 2: Performance Benchmarks (2 hours)

- [ ] 2.1 Create benchmark suite
    - Index 1,000 files with JS engine
    - Index 1,000 files with native engine (if available)
    - Measure indexing time difference

- [ ] 2.2 Search latency benchmarks
    - Vector-only search latency
    - Keyword-only search latency
    - Hybrid search latency
    - Compare JS vs native engine

- [ ] 2.3 Memory benchmarks
    - Idle memory with JS FTS
    - Idle memory with native FTS
    - Peak memory during indexing

- [ ] 2.4 Document results
    - Add benchmark results to RFC or separate doc
    - Include hardware/environment info

### Phase 3: Documentation (2 hours)

- [ ] 3.1 Update `docs/api-reference.md`
    - Document search_code new parameters (mode, alpha)
    - Document search_docs new parameters
    - Document get_index_status new output fields

- [ ] 3.2 Update `docs/configuration.md`
    - Document hybridSearch config section
    - Document ftsEngine options (auto, js, native)
    - Document defaultAlpha setting

- [ ] 3.3 Update `docs/examples.md`
    - Add hybrid search examples
    - Show mode switching use cases
    - Show alpha tuning examples

- [ ] 3.4 Add troubleshooting
    - Native module installation issues
    - When to use each mode
    - Performance tuning tips

### Phase 4: Release Preparation (1 hour)

- [ ] 4.1 Update CHANGELOG.md
    - Add hybrid search feature entry
    - List new parameters
    - Note backward compatibility

- [ ] 4.2 Update ROADMAP.md
    - Move "Hybrid Search" from backlog to completed
    - Add any new backlog items discovered during implementation

- [ ] 4.3 Version bump
    - Update package.json version to 1.2.0
    - This is a minor version (new feature, backward compatible)

- [ ] 4.4 Final review
    - Run full test suite
    - Build and verify package
    - Test npm publish (dry run)

## Resources

- RFC: `/docs/design/HYBRID-SEARCH-RFC.md`
- Current docs: `docs/api-reference.md`, `docs/configuration.md`
- CHANGELOG: `CHANGELOG.md`
- ROADMAP: `ROADMAP.md`

## Acceptance Checklist

Before marking this task complete:

- [ ] All integration tests passing
- [ ] Performance benchmarks documented
- [ ] Cross-platform testing complete
- [ ] All documentation updated
- [ ] CHANGELOG.md updated
- [ ] ROADMAP.md updated
- [ ] Version bumped to 1.2.0
- [ ] Ready for npm publish

## Progress Log

### 2025-12-11 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined based on RFC

## Notes

- Version 1.2.0 chosen as this is a new feature (minor version)
- Ensure benchmarks are run on consistent hardware
- Consider adding a "hybrid search" badge to README

## Blockers

_None currently_

## Related Tasks

- SMCP-058: FTS Engine Interface & JS Implementation
- SMCP-059: SQLite FTS5 Native Engine
- SMCP-060: Engine Factory & Auto-Detection
- SMCP-061: Integration & Search Tools Update
