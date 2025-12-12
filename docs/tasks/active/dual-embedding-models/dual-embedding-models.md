# Dual Embedding Models for Code vs Docs Search

## Overview

Search MCP uses separate embedding models optimized for code and documentation search to improve search quality.

## Models

| Search Type | Model | Dimensions | Size | MTEB Score |
|-------------|-------|------------|------|------------|
| **Code** | `Xenova/bge-small-en-v1.5` | 384 | ~130MB | ~74% |
| **Docs** | `Xenova/bge-base-en-v1.5` | 768 | ~440MB | ~76% |

**Previous model:** `Xenova/all-MiniLM-L6-v2` (384 dims, ~90MB, ~63% MTEB)

## Why Two Models?

1. **Code search** benefits from a model that handles identifiers, syntax patterns, and technical terminology
2. **Documentation search** benefits from longer context windows and prose-optimized embeddings
3. BGE models outperform MiniLM by 10-13% on standard benchmarks

## Memory Usage

- **Code model:** ~130MB
- **Docs model:** ~440MB
- **Total:** ~570MB (vs ~90MB with single MiniLM model)

Both models are loaded lazily on first use.

## Migration

When upgrading from a previous version:

1. Existing indexes will be detected as incompatible (model mismatch)
2. You'll see an error suggesting to run `reindex_project`
3. After reindexing, the new models will be used

The model names are stored in index metadata to detect changes.

## Technical Details

### Embedding Engine

```typescript
// Code search uses:
export const CODE_MODEL_NAME = 'Xenova/bge-small-en-v1.5';
export const CODE_EMBEDDING_DIMENSION = 384;

// Docs search uses:
export const DOCS_MODEL_NAME = 'Xenova/bge-base-en-v1.5';
export const DOCS_EMBEDDING_DIMENSION = 768;
```

### Storage

- Code embeddings stored in `index.lancedb/` with 384-dimension vectors
- Docs embeddings stored in `docs.lancedb/` with 768-dimension vectors

### Model Download

Models are downloaded on first use from HuggingFace Hub to `~/.cache/huggingface/`.

## Implementation Status

All tasks completed:

- [x] **SMCP-072**: Embedding Engine - Dual model support with `getCodeEmbeddingEngine()` and `getDocsEmbeddingEngine()`
- [x] **SMCP-073**: Storage Layer - Configurable vector dimensions and model metadata in `MetadataManager`
- [x] **SMCP-074**: Tools & Migration - Search tools use correct engines, migration detection with user-friendly errors

## References

- [Xenova/bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5)
- [Xenova/bge-base-en-v1.5](https://huggingface.co/Xenova/bge-base-en-v1.5)
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
- [Transformers.js](https://huggingface.co/docs/transformers.js)
