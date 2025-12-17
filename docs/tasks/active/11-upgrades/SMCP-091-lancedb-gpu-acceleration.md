---
task_id: "SMCP-091"
title: "Enable LanceDB Vector Index (IVF-PQ) Acceleration"
category: "Technical"
priority: "P0"
status: "complete"
created_date: "2025-12-16"
completed_date: "2025-12-17"
due_date: ""
estimated_hours: 20
actual_hours: 4
assigned_to: "Team"
tags: ["performance", "lancedb", "indexing", "ivf-pq", "vector-index"]
---

# Task: Enable LanceDB Vector Index (IVF-PQ) Acceleration

## Status: COMPLETE

**Important Discovery:** GPU acceleration (CUDA/MPS) is NOT available in the LanceDB Node.js SDK as of version 0.23.0. The `accelerator` parameter is only supported in the Python SDK. This implementation provides IVF-PQ vector indexing for faster search, but index building runs on CPU only.

## Overview

This task implemented proper IVF-PQ vector index creation for LanceDB. Previously, we did NOT create any vector indexes - relying on brute-force search. Now:

1. **IVF-PQ vector indexes are created** for datasets >= 10,000 chunks
2. **Adaptive parameters** based on dataset size (numPartitions = sqrt(numRows))
3. **Configurable** via `VectorIndexConfig` interface
4. **Tracked in metadata** for status reporting

## What Was Implemented

### 1. LanceDBStore Enhancements (`src/storage/lancedb.ts`)

```typescript
// New types
export type VectorIndexType = 'ivf_pq' | 'none';
export type DistanceMetric = 'l2' | 'cosine' | 'dot';

export interface VectorIndexConfig {
  indexType?: VectorIndexType;
  numPartitions?: number;
  numSubVectors?: number;
  distanceType?: DistanceMetric;
  maxIterations?: number;
  sampleRate?: number;
}

export interface VectorIndexInfo {
  hasIndex: boolean;
  indexType?: VectorIndexType;
  numPartitions?: number;
  numSubVectors?: number;
  distanceType?: DistanceMetric;
  indexCreationTimeMs?: number;
  chunkCount?: number;
}

// New methods
async createVectorIndex(config?: VectorIndexConfig): Promise<VectorIndexInfo>
async getVectorIndexInfo(): Promise<VectorIndexInfo | null>
```

### 2. Metadata Schema Updates (`src/storage/metadata.ts`)

```typescript
// New schema for vector index info
export const VectorIndexInfoSchema = z.object({
  hasIndex: z.boolean(),
  indexType: z.enum(['ivf_pq', 'none']).optional(),
  numPartitions: z.number().int().positive().optional(),
  numSubVectors: z.number().int().positive().optional(),
  distanceType: z.enum(['l2', 'cosine', 'dot']).optional(),
  indexCreationTimeMs: z.number().int().nonnegative().optional(),
  chunkCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime().optional(),
});

// New MetadataManager methods
updateVectorIndexInfo(info: VectorIndexInfoMeta): void
getVectorIndexInfo(): VectorIndexInfoMeta | null
hasVectorIndex(): boolean
```

### 3. Index Manager Integration (`src/engines/indexManager.ts`)

- Vector index automatically created after chunking for datasets >= 10,000 chunks
- Graceful fallback if index creation fails (search continues with brute-force)
- Vector index info saved to metadata

### 4. Status Reporting (`src/tools/getIndexStatus.ts`)

- New `vectorIndex` field in status output
- Shows: hasIndex, indexType, numPartitions, numSubVectors, distanceType, indexCreationTimeMs, chunkCount, createdAt

## What Was NOT Implemented (Due to SDK Limitation)

- **GPU acceleration (CUDA/MPS)** - Not available in Node.js SDK
- **GPU memory limiting** - Not applicable without GPU support
- **GPU enumeration/selection** - Not applicable without GPU support

## Adaptive Parameters

```typescript
// numPartitions = sqrt(numRows), clamped to [1, 256]
const numPartitions = Math.max(1, Math.min(256, Math.round(Math.sqrt(numRows))));

// numSubVectors = dimension/16 (or dimension/8 if not divisible by 16)
const numSubVectors = dimension % 16 === 0 ? dimension / 16 :
                      dimension % 8 === 0 ? dimension / 8 : 1;
```

## Constants

```typescript
export const MIN_CHUNKS_FOR_INDEX = 10000;
export const MAX_IVF_PARTITIONS = 256;
export const DEFAULT_SAMPLE_RATE = 256;
export const DEFAULT_MAX_ITERATIONS = 50;
```

## Success Criteria - Met

- [x] Vector indexes are created (IVF-PQ) for datasets >= 10K chunks
- [x] Adaptive parameter calculation based on dataset size
- [x] Configurable index parameters
- [x] Index info tracked in metadata
- [x] Status reporting shows index type and parameters
- [x] CPU fallback works when index creation fails
- [x] Documentation updated (CHANGELOG.md)
- [x] Tests pass

## Files Changed

1. `src/storage/lancedb.ts` - Added vector index types and methods
2. `src/storage/metadata.ts` - Added VectorIndexInfoSchema and manager methods
3. `src/engines/indexManager.ts` - Integrated index creation into pipeline
4. `src/tools/getIndexStatus.ts` - Added vectorIndex to status output
5. `tests/unit/storage/lancedb.test.ts` - Added vector index tests
6. `CHANGELOG.md` - Documented the feature

## Future Work

### Option A: Wait for LanceDB Node.js SDK GPU Support

When LanceDB adds GPU support to the Node.js SDK:

1. Add `accelerator` parameter to `createVectorIndex()`
2. Implement GPU detection (CUDA/MPS)
3. Add GPU memory limiting configuration
4. Update status reporting to show GPU usage

Monitor LanceDB Node.js SDK releases for GPU acceleration support.

### Option B: Python Hybrid Approach (BACKLOG)

**Status:** Backlog - to be tested later

Auto-detect existing Python + lancedb installation and use it opportunistically for GPU-accelerated index building:

```typescript
// Detect existing Python with lancedb
const hasPythonGPU = await detectPythonLanceDB();
if (hasPythonGPU) {
  // Use Python subprocess for index building (GPU)
} else {
  // Use Node.js CPU (current behavior - fallback)
}
```

**Benefits:**
- Zero install for users - only uses Python if already present
- GPU acceleration for users who have Python + lancedb + CUDA/MPS
- Graceful fallback to current CPU implementation

**Note:** Embedding generation (70% of indexing time) already has GPU via DirectML (v1.4.0). LanceDB index building is only ~20% of total time, so this is lower priority.

## Progress Log

### 2025-12-17 - 4 hours

- **Research Phase:**
  - Discovered Node.js SDK lacks `accelerator` parameter
  - GPU acceleration only in Python SDK
  - Confirmed IVF-PQ index creation works in Node.js

- **Implementation:**
  - Added `VectorIndexConfig` and `VectorIndexInfo` types
  - Implemented `createVectorIndex()` with adaptive parameters
  - Implemented `getVectorIndexInfo()` for status reporting
  - Added `VectorIndexInfoSchema` to metadata
  - Integrated into `createFullIndex()` pipeline
  - Updated `get_index_status` tool

- **Testing:**
  - Added 10 unit tests for vector index operations
  - All tests pass

### 2025-12-16 - 0 hours

- Task created as P0 priority
- Discovered we don't create vector indexes at all (brute-force only)

## Related Tasks

- Complements existing DirectML embedding work (v1.4.0)
- All SMCP-085 through SMCP-090 benefit from faster search with proper indexing

