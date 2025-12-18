---
task_id: "SMCP-092"
title: "CUDA/MPS Embedding Support (Linux & macOS GPU)"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 16
actual_hours: 0
assigned_to: "Team"
tags: ["gpu", "embedding", "cuda", "mps", "linux", "macos", "apple-silicon"]
---

# Task: CUDA/MPS Embedding Support (Linux & macOS GPU)

## Overview

Add GPU acceleration for embedding generation on Linux (CUDA) and macOS (MPS/CoreML). Currently:
- **Windows**: DirectML works for all GPU vendors
- **Linux**: CPU only (no CUDA support)
- **macOS**: CPU only (no MPS/CoreML support)

This task extends our GPU embedding support to cover all major platforms.

## Current State

```typescript
// deviceDetection.ts - current logic
if (isWindows()) {
    return { device: 'dml' };  // DirectML - works!
}
if (isMacOS()) {
    return { device: 'cpu', fallbackReason: 'CoreML not available' };  // No GPU!
}
if (isLinux()) {
    return { device: 'cpu', fallbackReason: 'CUDA not available' };  // No GPU!
}
```

## Target State

```typescript
// After this task
if (isWindows()) {
    return { device: 'dml' };  // DirectML
}
if (isMacOS() && isAppleSilicon()) {
    return { device: 'coreml' };  // CoreML/MPS for Apple Silicon
}
if (isLinux() && isCUDAAvailable()) {
    return { device: 'cuda' };  // CUDA for NVIDIA GPUs
}
return { device: 'cpu' };  // Fallback
```

## Goals

- [ ] Enable CUDA for embedding generation on Linux with NVIDIA GPUs
- [ ] Enable CoreML/MPS for embedding generation on macOS with Apple Silicon
- [ ] Auto-detect GPU availability on each platform
- [ ] **Auto-select discrete GPU over integrated GPU** on multi-GPU systems
- [ ] **GPU memory limiting** (configurable %, default 50%) to prevent system freeze
- [ ] Graceful fallback to CPU when GPU unavailable
- [ ] Maintain DirectML support on Windows (no regression)

## What This Enables

After completing this task + SMCP-091:

| Platform | Embedding GPU | Index Building GPU | Search |
|----------|---------------|-------------------|--------|
| Windows + NVIDIA | DirectML | CUDA | CPU |
| Windows + AMD | DirectML | CPU | CPU |
| Windows + Intel | DirectML | CPU | CPU |
| macOS + Apple Silicon | **CoreML/MPS** | MPS | CPU |
| macOS + Intel | CPU | CPU | CPU |
| Linux + NVIDIA | **CUDA** | CUDA | CPU |
| Linux + Other | CPU | CPU | CPU |

## Success Criteria

- Embedding generation uses GPU on Linux with NVIDIA (CUDA)
- Embedding generation uses GPU on macOS with Apple Silicon (CoreML/MPS)
- Auto-detection works without user configuration
- Fallback to CPU works when GPU unavailable
- No regression on Windows DirectML support
- Performance improvement measured and documented

## Dependencies

**Blocked by:**

- None (can be developed in parallel with SMCP-091)

**Blocks:**

- None

**Related:**

- SMCP-091: LanceDB GPU Acceleration (index building)
- Current DirectML implementation in `src/engines/deviceDetection.ts`
- Current embedding engine in `src/engines/embedding.ts`

## Subtasks

### Phase 1: Research (2 hours)

- [ ] 1.1 Research Transformers.js CUDA support
    - Does @huggingface/transformers support CUDA in Node.js?
    - What package/runtime is needed? (onnxruntime-node-cuda?)
    - Installation requirements
- [ ] 1.2 Research Transformers.js CoreML/MPS support
    - Does @huggingface/transformers support CoreML in Node.js?
    - What package is needed? (onnxruntime-node with CoreML?)
    - Apple Silicon detection
- [ ] 1.3 Document dependencies and requirements
    - CUDA toolkit version requirements
    - macOS version requirements
    - Optional vs required dependencies

### Phase 2: CUDA Support - Linux (5 hours)

- [ ] 2.1 Implement CUDA detection
    ```typescript
    async function isCUDAAvailableForEmbedding(): Promise<{
        available: boolean;
        version?: string;
        gpuName?: string;
        vramMB?: number;
        reason?: string;
    }>
    ```
    - Check for nvidia-smi
    - Check for CUDA runtime
    - Get GPU name and VRAM size
- [ ] 2.2 Implement GPU enumeration for CUDA
    ```typescript
    // Parse nvidia-smi output to list all NVIDIA GPUs
    async function enumerateNvidiaGPUs(): Promise<GPUDevice[]>
    ```
    - List all NVIDIA GPUs
    - Get VRAM for each
    - Identify discrete vs integrated (rare for NVIDIA but possible)
- [ ] 2.3 Add CUDA device option to embedding engine
    - Update ComputeDevice type: `'webgpu' | 'dml' | 'cuda' | 'cpu'`
    - Update pipeline initialization for CUDA
    - Pass `device_id` for GPU selection
    - Pass `gpu_mem_limit` for memory limiting
- [ ] 2.4 Update device detection for Linux
    ```typescript
    if (isLinux() && await isCUDAAvailable()) {
        const gpu = await selectBestGPU('discrete');
        const memLimit = calculateMemoryLimit(gpu.vramMB, config.gpu.memoryLimitPercent);
        return {
            device: 'cuda',
            gpuName: gpu.name,
            deviceId: gpu.id,
            memoryLimitMB: memLimit / (1024 * 1024)
        };
    }
    ```
- [ ] 2.5 Handle CUDA fallback
    - Catch initialization errors
    - Fall back to CPU with reason

### Phase 3: CoreML/MPS Support - macOS (5 hours)

- [ ] 3.1 Implement Apple Silicon detection
    ```typescript
    function isAppleSilicon(): boolean {
        return process.platform === 'darwin' && process.arch === 'arm64';
    }

    async function getAppleSiliconInfo(): Promise<{
        chipName: string;      // e.g., "Apple M1 Pro"
        unifiedMemoryGB: number; // e.g., 16
    }>
    ```
- [ ] 3.2 Implement CoreML availability check
    ```typescript
    async function isCoreMLAvailable(): Promise<{
        available: boolean;
        chipName?: string;
        unifiedMemoryGB?: number;
        reason?: string;
    }>
    ```
- [ ] 3.3 Add CoreML device option to embedding engine
    - Update ComputeDevice type: `'webgpu' | 'dml' | 'cuda' | 'coreml' | 'cpu'`
    - Update pipeline initialization for CoreML
    - Note: Apple Silicon has unified memory, so memory limiting works differently
- [ ] 3.4 Implement memory limiting for Apple Silicon
    ```typescript
    // Apple Silicon uses unified memory - limit based on system RAM
    function calculateAppleSiliconMemoryLimit(
        unifiedMemoryGB: number,
        limitPercent: number
    ): number
    ```
    - Use percentage of unified memory
    - Default 50% to leave room for system
- [ ] 3.5 Update device detection for macOS
    ```typescript
    if (isMacOS() && isAppleSilicon() && await isCoreMLAvailable()) {
        const chipInfo = await getAppleSiliconInfo();
        const memLimit = calculateAppleSiliconMemoryLimit(chipInfo.unifiedMemoryGB, 50);
        return {
            device: 'coreml',
            gpuName: chipInfo.chipName,
            memoryLimitMB: memLimit
        };
    }
    ```
- [ ] 3.6 Handle CoreML fallback
    - Catch initialization errors
    - Fall back to CPU with reason

### Phase 4: Update Existing DirectML (2 hours)

- [ ] 4.1 Add GPU enumeration for DirectML
    - List all DirectX 12 capable GPUs
    - Identify discrete vs integrated
    - Get VRAM for each
- [ ] 4.2 Add discrete GPU preference to DirectML
    - Use `device_id` parameter
    - Default to discrete GPU
- [ ] 4.3 Add memory limiting to DirectML
    - Use `gpu_mem_limit` parameter
    - Default to 50% of VRAM
- [ ] 4.4 Update deviceDetection.ts
    - Share GPU enumeration logic across all backends
    - Unified config handling

### Phase 5: Testing & Documentation (2 hours)

- [ ] 5.1 Test on Linux with NVIDIA GPU
    - Verify CUDA detection
    - Verify discrete GPU selection (if multi-GPU)
    - Verify memory limiting prevents freeze
    - Test fallback to CPU
- [ ] 5.2 Test on macOS with Apple Silicon
    - Verify CoreML detection
    - Verify memory limiting
    - Test fallback to CPU
- [ ] 5.3 Test on Windows with multi-GPU laptop
    - Verify discrete GPU selected over integrated
    - Verify memory limiting prevents freeze
    - DirectML still works
- [ ] 5.4 Update documentation
    - CLAUDE.md - document full GPU support
    - README.md - platform support table
    - Document config options for GPU
- [ ] 5.5 Update CHANGELOG.md

## Resources

- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [ONNX Runtime Execution Providers](https://onnxruntime.ai/docs/execution-providers/)
- [ONNX Runtime CUDA](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html)
- [ONNX Runtime CoreML](https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html)
- [Current deviceDetection.ts](../../../src/engines/deviceDetection.ts)
- [Current embedding.ts](../../../src/engines/embedding.ts)

## Technical Notes

### CUDA on Linux
- Requires NVIDIA GPU with CUDA support
- May need `onnxruntime-node-gpu` instead of `onnxruntime-node`
- CUDA toolkit installation may be required
- Consider making CUDA an optional dependency

### CoreML on macOS
- Only works on Apple Silicon (M1/M2/M3/M4)
- CoreML is built into macOS, no extra install
- ONNX Runtime should support CoreML EP on arm64 darwin
- May need specific onnxruntime build
- Uses unified memory (shared CPU/GPU RAM)

### GPU Selection (Multi-GPU Systems)
```typescript
// DirectML/CUDA device selection
const options = {
    executionProviders: [{
        name: 'DmlExecutionProvider',  // or 'CUDAExecutionProvider'
        device_id: 0,                   // Select specific GPU
        gpu_mem_limit: 4 * 1024 * 1024 * 1024  // 4GB limit
    }]
};
```

### Memory Limiting
```typescript
// Calculate memory limit based on VRAM and config
function getMemoryLimit(vramMB: number, limitPercent: number): number {
    return Math.floor(vramMB * (limitPercent / 100) * 1024 * 1024);
}

// Example: 8GB VRAM with 50% limit = 4GB
const limit = getMemoryLimit(8192, 50);  // 4294967296 bytes
```

### Package Strategy
```json
{
  "dependencies": {
    "@huggingface/transformers": "^3.0.0"
  },
  "optionalDependencies": {
    "onnxruntime-node-cuda": "^1.x.x"  // For Linux CUDA
  }
}
```

### Config Options
```typescript
// User-configurable GPU settings
interface GPUConfig {
    // Memory limit as percentage of VRAM (default: 50)
    memoryLimitPercent?: number;

    // GPU selection strategy (default: 'auto')
    deviceSelection?: 'auto' | 'discrete' | 'integrated' | number;

    // Prefer discrete over integrated (default: true)
    preferDiscreteGPU?: boolean;
}
```

## Performance Expectations

### Embedding Generation
| Platform | Current | After |
|----------|---------|-------|
| Windows (DirectML) | GPU | GPU (no change) |
| macOS Apple Silicon | CPU | **GPU (CoreML)** ~3-5x faster |
| Linux NVIDIA | CPU | **GPU (CUDA)** ~5-10x faster |

## Acceptance Checklist

Before marking this task complete:

- [ ] CUDA works on Linux with NVIDIA GPU
- [ ] CoreML works on macOS with Apple Silicon
- [ ] DirectML still works on Windows (no regression)
- [ ] **Discrete GPU auto-selected over integrated on multi-GPU systems**
- [ ] **GPU memory limited to configured % (default 50%)**
- [ ] **System remains responsive during embedding (no freeze)**
- [ ] Auto-detection works on all platforms
- [ ] CPU fallback works when GPU unavailable
- [ ] Performance improvement documented
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Tests pass on all platforms

## Progress Log

### 2025-12-16 - 0 hours

- Task created as P1 priority
- Complements SMCP-091 (LanceDB GPU) for full platform coverage
- Will give macOS and Linux users GPU-accelerated embeddings

## Notes

- This is about **embedding generation** GPU, not index building (that's SMCP-091)
- CUDA may require optional dependency to avoid bloating install for non-NVIDIA users
- CoreML should work without extra dependencies on Apple Silicon
- Consider testing on CI with GPU runners if available

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-091: LanceDB GPU Acceleration (index building GPU)
- Together, SMCP-091 + SMCP-092 provide full GPU coverage
