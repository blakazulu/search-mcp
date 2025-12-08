---
task_id: "SMCP-013"
title: "Embedding Engine"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-09"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "blakazulu"
tags: ["engines", "embeddings", "ml", "transformers"]
---

# Task: Embedding Engine

## Overview

Implement the embedding engine using Xenova/transformers for local vector generation. Converts text chunks into 384-dimensional vectors for semantic search. Handles model download on first use and batch processing for efficiency.

## Goals

- [ ] Load and cache embedding model locally
- [ ] Generate 384-dim vectors from text
- [ ] Batch process for efficiency
- [ ] Handle model download with progress

## Success Criteria

- Model auto-downloads on first use (~90MB)
- Embeddings are 384 dimensions (MiniLM)
- Batch processing handles 32+ chunks efficiently
- Model is cached for future use

## Dependencies

**Blocked by:**

- SMCP-002: Logger Module
- SMCP-003: Error Handling System

**Blocks:**

- SMCP-014: Index Manager
- SMCP-017: search_now Tool

**Related:**

- SMCP-009: LanceDB Store (stores vectors)
- SMCP-012: Chunking Engine (provides text chunks)

## Subtasks

### Phase 1: Model Configuration (0.5 hours)

- [ ] 1.1 Define model constants
    ```typescript
    const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
    const EMBEDDING_DIMENSION = 384;
    const BATCH_SIZE = 32;
    ```

- [ ] 1.2 Define embedding interface
    ```typescript
    interface EmbeddingResult {
      text: string;
      vector: number[];  // Float32[384]
    }
    ```

### Phase 2: Model Loading (1.5 hours)

- [ ] 2.1 Implement model initialization
    ```typescript
    import { pipeline } from '@xenova/transformers';

    let embeddingPipeline: Pipeline | null = null;

    async function initializeModel(): Promise<void>
    // Loads model, downloading if needed
    // Shows progress during download
    // Caches pipeline for reuse
    ```

- [ ] 2.2 Handle first-run download
    ```typescript
    // Log: "Downloading embedding model... (one-time, ~90MB)"
    // Show progress updates
    // Log: "Done! Model cached for future use."
    ```

- [ ] 2.3 Handle download failures
    - Catch network errors
    - Throw MODEL_DOWNLOAD_FAILED error
    - Include helpful error message

### Phase 3: Embedding Generation (1 hour)

- [ ] 3.1 Implement single text embedding
    ```typescript
    async function embedText(text: string): Promise<number[]>
    // Returns 384-dim vector for single text
    // Ensures model is initialized
    ```

- [ ] 3.2 Implement batch embedding
    ```typescript
    async function embedBatch(
      texts: string[],
      onProgress?: (completed: number, total: number) => void
    ): Promise<number[][]>
    // Processes texts in batches of BATCH_SIZE
    // Reports progress via callback
    // Returns array of vectors
    ```

- [ ] 3.3 Optimize batch processing
    - Process in batches of 32
    - Avoid memory issues on large batches
    - Provide progress updates

### Phase 4: Engine Class (0.5 hours)

- [ ] 4.1 Create EmbeddingEngine class
    ```typescript
    class EmbeddingEngine {
      private pipeline: Pipeline | null = null;

      async initialize(): Promise<void>
      async embed(text: string): Promise<number[]>
      async embedBatch(
        texts: string[],
        onProgress?: (completed: number, total: number) => void
      ): Promise<number[][]>

      isInitialized(): boolean
      getDimension(): number  // Returns 384
    }
    ```

- [ ] 4.2 Implement singleton pattern
    ```typescript
    let engineInstance: EmbeddingEngine | null = null;

    function getEmbeddingEngine(): EmbeddingEngine
    ```

### Phase 5: Export & Tests (0.5 hours)

- [ ] 5.1 Export from `src/engines/embedding.ts`

- [ ] 5.2 Write unit tests
    - Test model initialization
    - Test embedding dimension (384)
    - Test batch processing
    - Test progress callback
    - Test error handling
    - Note: Tests may need to mock model for CI

## Resources

- `docs/ENGINEERING.RFC.md` Section 5.4: Embedding Engine
- [@xenova/transformers documentation](https://huggingface.co/docs/transformers.js)
- [Xenova/all-MiniLM-L6-v2 model card](https://huggingface.co/Xenova/all-MiniLM-L6-v2)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Model downloads automatically on first use
- [ ] Embeddings are exactly 384 dimensions
- [ ] Batch processing works efficiently
- [ ] Progress callback reports correctly
- [ ] Error handling covers network failures
- [ ] Unit tests pass
- [ ] Changes committed to Git

## Progress Log

### 2025-12-09 - 0 hours

- Task created
- Subtasks defined

## Notes

- Model cached at `~/.cache/huggingface/` (cross-platform)
- First run requires internet for model download
- ONNX runtime enables CPU inference (no GPU needed)
- Consider adding timeout for model download
- Batch size of 32 balances speed vs memory

## Blockers

_None yet_

## Related Tasks

- SMCP-014: Index Manager uses embeddings for indexing
- SMCP-017: search_now Tool uses embeddings for query
