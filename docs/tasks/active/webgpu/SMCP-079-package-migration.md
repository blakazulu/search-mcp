---
task_id: "SMCP-079"
title: "WebGPU: Package Migration to @huggingface/transformers v3"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 8
actual_hours: 0
assigned_to: "Team"
tags: ["webgpu", "performance", "embedding", "transformers"]
---

# Task: WebGPU Package Migration to @huggingface/transformers v3

## Overview

Migrate from the unmaintained `@xenova/transformers` v2 to `@huggingface/transformers` v3 to enable WebGPU support and unlock GPU acceleration capabilities. This is the foundation task for the WebGPU acceleration initiative.

## Goals

- [ ] Replace `@xenova/transformers` with `@huggingface/transformers` v3
- [ ] Update all import statements throughout the codebase
- [ ] Verify BGE embedding models work with the new package
- [ ] Ensure all existing tests pass with the new package

## Success Criteria

- All tests pass with `@huggingface/transformers` v3
- Embedding output remains consistent (cosine similarity > 0.99 with old outputs)
- No breaking changes to the MCP tool interface
- Index creation and search work identically to before

## Dependencies

**Blocked by:**

- None (this is the first task in the WebGPU initiative)

**Blocks:**

- SMCP-080: GPU Detection
- SMCP-081: WebGPU Integration
- SMCP-082: Node.js WebGPU Support

**Related:**

- PLAN-webgpu-acceleration.md: Master plan document

## Subtasks

### Phase 1: Package Update (2 hours)

- [ ] 1.1 Update `package.json`
    - Remove `@xenova/transformers` dependency
    - Add `@huggingface/transformers` v3.x.x
    - Run `npm install` to update lock file

- [ ] 1.2 Update imports in `src/engines/embedding.ts`
    - Change from `@xenova/transformers` to `@huggingface/transformers`
    - Verify Pipeline type is compatible

- [ ] 1.3 Search for other files using the old package
    - Check for any other imports or references
    - Update all occurrences

### Phase 2: Model Compatibility (3 hours)

- [ ] 2.1 Verify model namespace changes
    - Check if models moved from `Xenova/` to `BAAI/` namespace
    - Test `BAAI/bge-small-en-v1.5` for code embeddings
    - Test `BAAI/bge-base-en-v1.5` for docs embeddings

- [ ] 2.2 Update model references in code
    - Update CODE_EMBEDDING_MODEL constant
    - Update DOCS_EMBEDDING_MODEL constant
    - Ensure backward compatibility for existing indexes

- [ ] 2.3 Test embedding output consistency
    - Generate embeddings with old and new package
    - Calculate cosine similarity to verify consistency
    - Document any differences

### Phase 3: Testing & Validation (3 hours)

- [ ] 3.1 Run existing test suite
    - `npm run test`
    - Fix any failing tests

- [ ] 3.2 Test full indexing workflow
    - Create index on test project
    - Verify search results quality
    - Compare with pre-migration baseline

- [ ] 3.3 Test incremental reindexing
    - Modify files and trigger reindex
    - Verify fingerprint tracking still works

## Resources

- [Transformers.js v3 Announcement](https://huggingface.co/blog/transformersjs-v3)
- [HuggingFace Transformers.js GitHub](https://github.com/huggingface/transformers.js)
- Current embedding implementation: `src/engines/embedding.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] All existing tests pass
- [ ] Manual testing of create_index and search_code
- [ ] Changes committed to Git
- [ ] CHANGELOG.md updated
- [ ] No regressions in search quality

## Progress Log

### 2025-12-16 - 0 hours

- Task created
- Subtasks defined based on PLAN-webgpu-acceleration.md Phase 1

## Notes

- The old package (`@xenova/transformers`) is 2 years old and unmaintained
- This migration is low risk since v3 is backward compatible for basic usage
- GPU acceleration is not enabled in this task - just package migration
- Model download location may change; verify cache path behavior

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-080: GPU Detection (depends on this)
- SMCP-081: WebGPU Integration (depends on this)
