---
task_id: "SMCP-096"
title: "Domain-Specific Embedding Prompts"
category: "Technical"
priority: "P2"
status: "completed"
created_date: "2025-12-16"
completed_date: "2025-12-18"
due_date: ""
estimated_hours: 4
actual_hours: 3
assigned_to: "Team"
tags: ["embedding", "prompts", "quality"]
---

# Task: Domain-Specific Embedding Prompts

## Overview

Use different prompts for document embedding vs query embedding. This aligns with sentence-transformer best practices and improves retrieval quality.

## Current Problem

```typescript
// Current: Same embedding for both
const docEmbedding = await embed(chunkText);
const queryEmbedding = await embed(userQuery);
// Both use identical processing
```

## Target Solution

```typescript
// After: Different prompts for different purposes
const docEmbedding = await embed(chunkText, {
    promptName: "passage"  // Optimized for documents
});

const queryEmbedding = await embed(userQuery, {
    promptName: "query"    // Optimized for questions
});
```

## Goals

- [x] Use document-specific prompt for indexing
- [x] Use query-specific prompt for searching
- [x] Improve retrieval relevance
- [x] Follow embedding model best practices

## Success Criteria

- Different prompts used for indexing vs searching
- Measurable improvement in retrieval quality
- Compatible with current BGE models
- No significant performance impact

## Implementation Details

### BGE Model Prompts

BGE models support instruction prefixes:

```typescript
// For documents (indexing)
const docPrefix = "passage: ";

// For queries (searching)
const queryPrefix = "query: ";

// Some models use longer instructions
const queryInstruction = "Represent this sentence for searching relevant passages: ";
```

### API Change

```typescript
interface EmbedOptions {
    promptType?: 'document' | 'query';
}

async embed(text: string, options?: EmbedOptions): Promise<number[]> {
    const prefix = options?.promptType === 'query'
        ? this.queryPrefix
        : this.docPrefix;

    return await this.pipeline(prefix + text, {
        pooling: 'mean',
        normalize: true,
    });
}
```

### Model-Specific Prompts

```typescript
const MODEL_PROMPTS: Record<string, { doc: string; query: string }> = {
    'Xenova/bge-small-en-v1.5': {
        doc: '',  // BGE-small doesn't use prefix
        query: 'Represent this sentence for searching relevant passages: ',
    },
    'Xenova/bge-base-en-v1.5': {
        doc: '',
        query: 'Represent this sentence for searching relevant passages: ',
    },
};
```

## Subtasks

### Phase 1: Research (1 hour)

- [x] 1.1 Check BGE model documentation for recommended prompts
- [x] 1.2 Test prompt impact on embedding quality
- [x] 1.3 Verify Transformers.js supports prompts

### Phase 2: Implementation (2 hours)

- [x] 2.1 Update EmbeddingEngine to accept prompt type
- [x] 2.2 Update indexing to use document prompt
- [x] 2.3 Update search to use query prompt
- [x] 2.4 Add model-specific prompt mappings

### Phase 3: Testing (1 hour)

- [x] 3.1 Compare retrieval quality with/without prompts
- [x] 3.2 Verify no performance regression
- [x] 3.3 Test with both BGE-small and BGE-base

## Resources

- [BGE Model Card](https://huggingface.co/BAAI/bge-small-en-v1.5)
- [Current embedding.ts](../../../src/engines/embedding.ts)

## Acceptance Checklist

- [x] Document/query prompts implemented
- [x] BGE model prompts correct
- [x] Retrieval quality improved
- [x] No performance regression
- [x] Tests pass

## Progress Log

### 2025-12-18 - 3 hours

- Researched BGE model prompt requirements from HuggingFace documentation
- Confirmed BGE v1.5 models use asymmetric prompts: no prefix for documents, instruction prefix for queries
- Implemented `PromptType` ('document' | 'query') and `MODEL_PROMPTS` configuration
- Added `getPromptPrefix(modelName, promptType)` helper function
- Updated `EmbeddingEngine.embed()` method to accept optional `promptType` parameter
- Updated `embedBatch()`, `embedBatchWithStats()`, and `embedWithResults()` with prompt type support
- Updated convenience functions `embedText()` and `embedBatch()` with prompt type support
- Modified `searchCode.ts` to use `'query'` prompt type for search embeddings
- Modified `searchDocs.ts` to use `'query'` prompt type for search embeddings
- Indexing code uses `'document'` prompt type by default (backward compatible)
- Added 14 new unit tests for domain-specific prompts
- All 86 embedding tests pass
- Updated CHANGELOG.md with feature documentation
- Task completed
