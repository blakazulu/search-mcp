---
task_id: "SMCP-054"
title: "Embedding Engine Security Fixes"
category: "Security"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
estimated_hours: 4
assigned_to: "Team"
tags: ["security", "high", "embedding", "vectors"]
---

# Task: Embedding Engine Security Fixes

## Overview

Fix issues in the embedding engine where failed embeddings insert zero vectors (polluting search results) and dimension mismatches are only warned, not enforced.

## Related Vulnerabilities

| # | Issue | Severity | File |
|---|-------|----------|------|
| 5 | Zero vector insertion on embedding failure | CRITICAL | embedding.ts:294-302 |
| 22 | Vector dimension mismatch not enforced | MEDIUM | embedding.ts:243-248 |

## Goals

- [ ] Stop inserting zero vectors for failed embeddings
- [ ] Enforce vector dimension strictly
- [ ] Track and report embedding failures properly

## Success Criteria

- Zero vectors never inserted into index
- Dimension mismatches cause errors, not warnings
- Embedding failures tracked in metadata/logs
- Search quality not polluted by failed embeddings
- All tests pass

## Subtasks

### Phase 1: Fix Zero Vector Insertion (2 hours)

- [ ] 1.1 Analyze current behavior in `src/engines/embedding.ts`
    - Line 294-302: Understand why zero vectors are inserted
    - Determine impact on downstream code (LanceDB insert)

- [ ] 1.2 Update `embedBatch` to skip failed embeddings
    - Return only successful embeddings with their indices
    - Let caller decide how to handle failures
    - Update type signatures if needed

- [ ] 1.3 Update callers of `embedBatch`
    - `indexManager.ts`: Handle partial embedding results
    - Only insert chunks that have valid embeddings
    - Log skipped chunks

- [ ] 1.4 Add embedding failure tracking
    - Add failed chunk count to metadata
    - Log files with embedding failures

### Phase 2: Enforce Dimension Validation (1 hour)

- [ ] 2.1 Update `src/engines/embedding.ts`
    - Line 243-248: Change warning to error
    ```typescript
    if (vector.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${vector.length}`);
    }
    ```

- [ ] 2.2 Add dimension check constant
    - Make EMBEDDING_DIMENSION a strict contract

### Phase 3: Testing (1 hour)

- [ ] 3.1 Add tests for embedding failures
    - Test with adversarial text that might fail
    - Verify zero vectors not inserted
    - Verify dimension enforcement

- [ ] 3.2 Add integration test
    - Create file with problematic content
    - Verify it's skipped with warning, not inserted with zero vector

## Resources

- Current embedding implementation: `src/engines/embedding.ts`
- Xenova transformers docs: https://huggingface.co/docs/transformers.js

## Acceptance Checklist

- [ ] Zero vectors never inserted
- [ ] Dimension mismatches throw errors
- [ ] Embedding failures logged and tracked
- [ ] Partial indexing works (some files can fail)
- [ ] Tests added
- [ ] All existing tests pass

## Notes

- Need to ensure that partial failures don't block entire index creation
- Consider retry logic for transient embedding failures
- Monitor memory usage with new error handling

## Progress Log

### 2025-12-10

- Task created from security audit
