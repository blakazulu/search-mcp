---
task_id: "SMCP-091"
title: "Enable LanceDB GPU Acceleration (CUDA/MPS)"
category: "Technical"
priority: "P0"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 20
actual_hours: 0
assigned_to: "Team"
tags: ["gpu", "performance", "lancedb", "cuda", "mps", "apple-silicon", "indexing"]
---

# Task: Enable LanceDB GPU Acceleration (CUDA/MPS)

## Overview

Enable LanceDB's GPU acceleration for vector index building. Currently we do NOT create explicit vector indexes - we just add data and rely on brute-force search. This task will:

1. **Create proper IVF-PQ vector indexes** (currently missing!)
2. **Enable GPU acceleration** via CUDA (NVIDIA) and MPS (Apple Silicon)
3. **Auto-detect best accelerator** based on platform/hardware

LanceDB v0.3.3+ supports 20-26x faster index building with GPU.

## Current Problem

```typescript
// Current code - NO index created, NO GPU used
this.table = await this.db.createTable(TABLE_NAME, initialData);
// Search is brute-force O(n) - slow for large indexes
```

## Target Solution

```typescript
// After this task - proper index with GPU acceleration
this.table = await this.db.createTable(TABLE_NAME, initialData);
await this.table.createIndex({
    type: 'IVF_PQ',
    numPartitions: 256,
    numSubVectors: 96,
    accelerator: 'cuda'  // or 'mps' or undefined (CPU)
});
// Search is O(log n) - fast even for large indexes
```

## Goals

- [ ] Create proper IVF-PQ vector indexes (currently missing)
- [ ] Enable CUDA acceleration for NVIDIA GPUs (Windows/Linux)
- [ ] Enable MPS acceleration for Apple Silicon (macOS)
- [ ] Auto-detect best accelerator based on platform/hardware
- [ ] **Auto-select discrete GPU over integrated GPU** on multi-GPU systems
- [ ] **GPU memory limiting** (configurable %, default 50%) to prevent system freeze
- [ ] Graceful fallback to CPU when GPU unavailable
- [ ] Unified GPU status reporting across embedding + indexing

## What This Enables

After completing this task:

| Platform | Embedding GPU | Index Building GPU | Search |
|----------|---------------|-------------------|--------|
| Windows + NVIDIA | DirectML | **CUDA** | CPU* |
| Windows + AMD | DirectML | CPU | CPU* |
| Windows + Intel | DirectML | CPU | CPU* |
| macOS + Apple Silicon | CPU | **MPS** | CPU* |
| macOS + Intel | CPU | CPU | CPU* |
| Linux + NVIDIA | CPU | **CUDA** | CPU* |
| Linux + Other | CPU | CPU | CPU* |

*GPU-accelerated search is on LanceDB roadmap but not yet available.

## Success Criteria

- Vector indexes are created (IVF-PQ) instead of brute-force
- Index creation uses GPU when available (CUDA/MPS)
- 10-20x faster index building on supported hardware
- Search performance improved due to proper indexing
- Graceful fallback to CPU if GPU unavailable
- Clear status reporting of GPU usage
- Works on Windows, macOS (Apple Silicon), and Linux

## Dependencies

**Blocked by:**

- None

**Blocks:**

- Future GPU search acceleration (when LanceDB adds it)

**Related:**

- Current DirectML implementation in `src/engines/deviceDetection.ts`
- LanceDB storage in `src/storage/lancedb.ts`

## Subtasks

### Phase 1: Research & Verification (3 hours)

- [ ] 1.1 Verify LanceDB Node.js API supports accelerator
    - Check `@lancedb/lancedb` npm package docs
    - Test createIndex with accelerator parameter
    - Confirm CUDA/MPS work in Node.js bindings
- [ ] 1.2 Research index configuration
    - Optimal numPartitions for various dataset sizes
    - Optimal numSubVectors for 384-dim and 768-dim vectors
    - Memory requirements for GPU indexing
- [ ] 1.3 Test on target platforms
    - Windows with NVIDIA GPU
    - macOS with Apple Silicon
    - Linux with NVIDIA GPU

### Phase 2: GPU Detection & Selection (4 hours)

- [ ] 2.1 Implement CUDA detection for LanceDB
    ```typescript
    // Detect NVIDIA GPU / CUDA availability for indexing
    async function isCUDAAvailableForIndexing(): Promise<boolean>
    ```
    - Check for nvidia-smi or CUDA runtime
    - Verify CUDA version compatibility
    - Windows and Linux support
- [ ] 2.2 Implement MPS detection
    ```typescript
    // Detect Apple Silicon / MPS availability
    async function isMPSAvailable(): Promise<boolean>
    ```
    - Check for Apple Silicon chip (arm64 + darwin)
    - macOS only
- [ ] 2.3 Create unified accelerator detection
    ```typescript
    export type LanceDBAccelerator = 'cuda' | 'mps' | undefined;

    export async function detectLanceDBAccelerator(): Promise<{
        accelerator: LanceDBAccelerator;
        gpuName?: string;
        reason?: string;
    }>
    ```
- [ ] 2.4 Implement GPU enumeration
    ```typescript
    export interface GPUDevice {
        id: number;
        name: string;
        vendor: string;
        vramMB: number;
        isDiscrete: boolean;
        isIntegrated: boolean;
    }

    async function enumerateGPUs(): Promise<GPUDevice[]>
    ```
    - List all available GPUs
    - Identify discrete vs integrated
    - Get VRAM size for memory limiting
- [ ] 2.5 Implement discrete GPU auto-selection
    ```typescript
    async function selectBestGPU(preference: 'auto' | 'discrete' | 'integrated'): Promise<GPUDevice | null>
    ```
    - Prefer discrete GPU by default
    - Fall back to integrated if no discrete available
    - Allow user override via config
- [ ] 2.6 Extend DeviceInfo interface
    ```typescript
    export interface DeviceInfo {
        // Existing (embedding)
        device: ComputeDevice;
        gpuName?: string;
        // New (indexing)
        indexAccelerator?: LanceDBAccelerator;
        indexGpuName?: string;
        // New (GPU selection)
        deviceId?: number;
        isDiscrete?: boolean;
        vramMB?: number;
        memoryLimitMB?: number;
    }
    ```

### Phase 3: Vector Index Creation (5 hours)

- [ ] 3.1 Add createIndex method to LanceDBStore
    ```typescript
    async createVectorIndex(options?: {
        accelerator?: LanceDBAccelerator;
        numPartitions?: number;
        numSubVectors?: number;
    }): Promise<void>
    ```
- [ ] 3.2 Implement adaptive index parameters
    - Small datasets (<10K): Skip index (brute force OK)
    - Medium datasets (10K-100K): IVF with moderate partitions
    - Large datasets (>100K): IVF-PQ with more partitions
- [ ] 3.3 Integrate index creation into indexing pipeline
    - Create index after all chunks inserted
    - Pass detected accelerator
- [ ] 3.4 Implement GPU memory limiting
    ```typescript
    function calculateMemoryLimit(vramMB: number, limitPercent: number): number {
        return Math.floor(vramMB * (limitPercent / 100) * 1024 * 1024);
    }
    ```
    - Get total VRAM from GPU enumeration
    - Apply configured percentage (default 50%)
    - Pass to LanceDB/ONNX Runtime as `gpu_mem_limit`
- [ ] 3.5 Handle GPU memory constraints
    - Catch OOM errors
    - Fall back to CPU on GPU failure
    - Log fallback reason
- [ ] 3.6 Add configuration options
    ```typescript
    interface Config {
        // Existing
        hybridSearch?: { ... };
        // New
        gpu?: {
            // Memory limit as percentage of VRAM (default: 50)
            memoryLimitPercent?: number;
            // GPU selection: 'auto' | 'discrete' | 'integrated' | device_id
            deviceSelection?: 'auto' | 'discrete' | 'integrated' | number;
            // Prefer discrete over integrated (default: true)
            preferDiscreteGPU?: boolean;
        };
        indexing?: {
            accelerator?: 'cuda' | 'mps' | 'auto' | 'cpu';
            createIndex?: boolean;  // default: true for >10K chunks
        };
    }
    ```

### Phase 4: Integration & Status Reporting (3 hours)

- [ ] 4.1 Update `create_index` tool
    - Call createVectorIndex after chunking
    - Report accelerator used in summary
    - Show index creation time
- [ ] 4.2 Update `reindex_project` tool
    - Recreate vector index with GPU
- [ ] 4.3 Update `get_index_status` tool
    - Report if vector index exists
    - Report accelerator used for indexing
    - Show index type (IVF-PQ vs brute-force)
- [ ] 4.4 Update logging
    - Log GPU detection results
    - Log index creation performance
    - Log any fallbacks

### Phase 5: Testing & Documentation (2 hours)

- [ ] 5.1 Add unit tests
    - GPU detection logic
    - Index creation with/without GPU
    - Fallback scenarios
- [ ] 5.2 Test on all platforms
    - Windows + NVIDIA
    - macOS + Apple Silicon
    - Linux + NVIDIA
    - CPU-only systems
- [ ] 5.3 Update documentation
    - CLAUDE.md - document GPU support
    - README.md - mention GPU acceleration
- [ ] 5.4 Update CHANGELOG.md

## Resources

- [LanceDB GPU Indexing Documentation](https://lancedb.com/documentation/guides/indexing/gpu-indexing/)
- [LanceDB GPU Blog Post](https://blog.lancedb.com/gpu-accelerated-indexing-in-lancedb-27558fa7eee5/)
- [LanceDB Node.js SDK](https://lancedb.github.io/lancedb/js/)
- [LanceDB Index Types](https://lancedb.github.io/lancedb/concepts/index_types/)
- [Current deviceDetection.ts](../../../src/engines/deviceDetection.ts)
- [Current lancedb.ts](../../../src/storage/lancedb.ts)

## API Reference

### Python (for reference)
```python
import lancedb

db = lancedb.connect("./my_db")
table = db.create_table("my_table", data)

# GPU-accelerated index creation
table.create_index(
    metric="L2",
    num_partitions=256,
    num_sub_vectors=96,
    accelerator="cuda"  # or "mps" for Apple Silicon
)
```

### Node.js (to implement)
```typescript
import * as lancedb from '@lancedb/lancedb';

const db = await lancedb.connect('./my_db');
const table = await db.createTable('my_table', data);

// GPU-accelerated index creation
await table.createIndex({
    type: 'IVF_PQ',
    column: 'vector',
    metric: 'L2',
    numPartitions: 256,
    numSubVectors: 96,
    accelerator: 'cuda'  // or 'mps'
});
```

## Performance Expectations

### Index Building (with GPU)
- **CPU**: ~100 files/sec (current)
- **CUDA**: ~2000 files/sec (20x faster)
- **MPS**: ~1500 files/sec (15x faster)

### Search (with proper index)
- **Brute-force (current)**: O(n) - slow for large indexes
- **IVF-PQ index**: O(log n) - fast even for 100K+ chunks

## Acceptance Checklist

Before marking this task complete:

- [ ] Vector indexes created (IVF-PQ) for datasets >10K chunks
- [ ] CUDA acceleration works on Windows/Linux with NVIDIA
- [ ] MPS acceleration works on macOS with Apple Silicon
- [ ] **Discrete GPU auto-selected over integrated on multi-GPU laptops**
- [ ] **GPU memory limited to configured % (default 50%)**
- [ ] **System remains responsive during indexing (no freeze)**
- [ ] CPU fallback works on all platforms
- [ ] Status reporting shows index type and GPU usage
- [ ] Search performance improved with proper indexing
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Tests pass on all platforms

## Progress Log

### 2025-12-16 - 0 hours

- Task created as P0 priority
- Discovered we don't create vector indexes at all (brute-force only)
- Updated scope to include index creation + GPU acceleration
- This is bigger than originally thought but critical for performance

## Notes

### Current State (Before)
- No vector index created
- Brute-force search O(n)
- No GPU acceleration for indexing
- Slow for large codebases

### Target State (After)
- IVF-PQ vector index created
- Fast search O(log n)
- GPU acceleration (CUDA/MPS) for index building
- 20x faster indexing on supported hardware

### Future Work (When LanceDB Adds It)
- GPU-accelerated search queries
- Monitor LanceDB changelog for updates

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- Complements existing DirectML embedding work (v1.4.0)
- All SMCP-085 through SMCP-090 benefit from faster indexing
