---
task_id: "SMCP-072"
title: "Update Embedding Engine for Dual Model Support"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-12"
due_date: "2025-12-15"
estimated_hours: 4
actual_hours: 2
assigned_to: "Team"
tags: ["embedding", "model", "bge", "search-quality"]
---

# Task: Update Embedding Engine for Dual Model Support

## Overview

Refactor the embedding engine to support two separate models: one optimized for code search (BGE-small, 384 dims) and another for documentation search (BGE-base, 768 dims). This improves search quality by 10-13% over the current MiniLM model.

## Goals

- [x] Replace single model architecture with dual model support
- [x] Implement separate singleton getters for code and docs engines
- [x] Maintain backward compatibility with existing API

## Success Criteria

- [x] `getCodeEmbeddingEngine()` returns engine configured for `Xenova/bge-small-en-v1.5` (384 dims)
- [x] `getDocsEmbeddingEngine()` returns engine configured for `Xenova/bge-base-en-v1.5` (768 dims)
- [x] `getEmbeddingEngine()` (deprecated) still works for backward compatibility
- [x] All existing tests pass
- [x] New tests cover dual model functionality

## Dependencies

**Blocked by:**

- None

**Blocks:**

- SMCP-073: Storage layer needs to know dimensions from embedding engine
- SMCP-074: Tools need to use correct embedding engines

**Related:**

- Parent: dual-embedding-models feature

## Subtasks

### Phase 1: Define New Constants (0.5 hours)

- [x] 1.1 Add `CODE_MODEL_NAME` = `'Xenova/bge-small-en-v1.5'`
- [x] 1.2 Add `CODE_EMBEDDING_DIMENSION` = 384
- [x] 1.3 Add `DOCS_MODEL_NAME` = `'Xenova/bge-base-en-v1.5'`
- [x] 1.4 Add `DOCS_EMBEDDING_DIMENSION` = 768
- [x] 1.5 Deprecate `MODEL_NAME` and `EMBEDDING_DIMENSION` (keep for backward compat)

### Phase 2: Refactor EmbeddingEngine Class (1.5 hours)

- [x] 2.1 Add `EmbeddingEngineConfig` interface with `modelName`, `dimension`, `displayName`
- [x] 2.2 Update constructor to accept config parameter
- [x] 2.3 Add `getModelName()` method
- [x] 2.4 Update `getDimension()` to return config dimension
- [x] 2.5 Update `loadModel()` to use config model name
- [x] 2.6 Update logging to include model display name

### Phase 3: Implement Dual Singletons (1 hour)

- [x] 3.1 Add `codeEngineInstance` and `docsEngineInstance` variables
- [x] 3.2 Implement `getCodeEmbeddingEngine()` function
- [x] 3.3 Implement `getDocsEmbeddingEngine()` function
- [x] 3.4 Update `getEmbeddingEngine()` to return code engine (backward compat)
- [x] 3.5 Add `resetCodeEmbeddingEngine()` and `resetDocsEmbeddingEngine()` for testing
- [x] 3.6 Update `resetEmbeddingEngine()` to reset all instances

### Phase 4: Update Tests (1 hour)

- [x] 4.1 Update existing embedding tests to work with new API
- [x] 4.2 Add tests for `getCodeEmbeddingEngine()`
- [x] 4.3 Add tests for `getDocsEmbeddingEngine()`
- [x] 4.4 Add tests for dimension validation
- [x] 4.5 Add tests for model name getter

## Resources

- [Xenova/bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5)
- [Xenova/bge-base-en-v1.5](https://huggingface.co/Xenova/bge-base-en-v1.5)
- Internal reference: `src/engines/embedding.ts`

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] All success criteria met
- [x] Code tested (unit tests pass)
- [x] TypeScript compiles without errors
- [x] Exports updated in `src/engines/index.ts`
- [x] No regressions introduced

## Progress Log

### 2025-12-12 - 0 hours

- Task created
- Subtasks defined

### 2025-12-12 - 2 hours

- Implemented all 4 phases
- Added new constants: CODE_MODEL_NAME, CODE_EMBEDDING_DIMENSION, DOCS_MODEL_NAME, DOCS_EMBEDDING_DIMENSION
- Added EmbeddingEngineConfig interface with modelName, dimension, displayName
- Refactored EmbeddingEngine class to accept config parameter (defaults to CODE_ENGINE_CONFIG)
- Added getModelName(), getDisplayName() methods
- Updated getDimension() and loadModel() to use config
- Implemented dual singletons: codeEngineInstance, docsEngineInstance
- Added getCodeEmbeddingEngine() and getDocsEmbeddingEngine() functions
- Added resetCodeEmbeddingEngine() and resetDocsEmbeddingEngine() functions
- Updated resetEmbeddingEngine() to reset all instances
- Updated exports in src/engines/index.ts
- Updated tests with 55 passing tests covering new functionality
- Build passes, no TypeScript errors
- Backward compatible: getEmbeddingEngine(), MODEL_NAME, EMBEDDING_DIMENSION still work

## Notes

- Memory usage increases from ~90MB to ~570MB (both models loaded)
- Models are loaded lazily on first use
- BGE models use same ONNX/Transformers.js pipeline as MiniLM

## Blockers

_None identified_

## Related Tasks

- SMCP-073: Storage layer updates (depends on this)
- SMCP-074: Tools and migration (depends on this)
