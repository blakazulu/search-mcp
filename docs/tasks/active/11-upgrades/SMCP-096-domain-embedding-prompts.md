---
task_id: "SMCP-096"
title: "Domain-Specific Embedding Prompts"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "Team"
tags: ["embedding", "prompts", "quality", "inspired-by-claude-context-local"]
---

# Task: Domain-Specific Embedding Prompts

## Overview

Use different prompts for document embedding vs query embedding, inspired by claude-context-local. This aligns with sentence-transformer best practices and improves retrieval quality.

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

- [ ] Use document-specific prompt for indexing
- [ ] Use query-specific prompt for searching
- [ ] Improve retrieval relevance
- [ ] Follow embedding model best practices

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

- [ ] 1.1 Check BGE model documentation for recommended prompts
- [ ] 1.2 Test prompt impact on embedding quality
- [ ] 1.3 Verify Transformers.js supports prompts

### Phase 2: Implementation (2 hours)

- [ ] 2.1 Update EmbeddingEngine to accept prompt type
- [ ] 2.2 Update indexing to use document prompt
- [ ] 2.3 Update search to use query prompt
- [ ] 2.4 Add model-specific prompt mappings

### Phase 3: Testing (1 hour)

- [ ] 3.1 Compare retrieval quality with/without prompts
- [ ] 3.2 Verify no performance regression
- [ ] 3.3 Test with both BGE-small and BGE-base

## Resources

- [BGE Model Card](https://huggingface.co/BAAI/bge-small-en-v1.5)
- [claude-context-local prompts](../../../examples/claude-context-local-main/)
- [Current embedding.ts](../../../src/engines/embedding.ts)

## Acceptance Checklist

- [ ] Document/query prompts implemented
- [ ] BGE model prompts correct
- [ ] Retrieval quality improved
- [ ] No performance regression
- [ ] Tests pass

## Progress Log

### 2025-12-16 - 0 hours

- Task created based on deep dive analysis
- claude-context-local uses "Retrieval-document" vs "InstructionRetrieval"
