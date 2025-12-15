---
task_id: "SMCP-080"
title: "WebGPU: GPU Detection Module"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 6
actual_hours: 0
assigned_to: "Team"
tags: ["webgpu", "performance", "gpu", "detection"]
---

# Task: WebGPU GPU Detection Module

## Overview

Create a GPU detection module that identifies the best available compute device at runtime. This module will determine whether to use WebGPU acceleration or fall back to CPU, enabling automatic performance optimization without user configuration.

## Goals

- [ ] Create `src/engines/deviceDetection.ts` module
- [ ] Implement WebGPU availability detection
- [ ] Extract GPU name and capabilities when available
- [ ] Provide clear fallback reasons when GPU is unavailable
- [ ] Add informative logging for user awareness

## Success Criteria

- Correctly detects WebGPU on Windows (NVIDIA, AMD, Intel Arc)
- Correctly detects WebGPU on macOS (Apple Silicon via Metal)
- Correctly detects WebGPU on Linux (Vulkan)
- Falls back gracefully with clear reason on systems without GPU
- Detection completes in < 100ms

## Dependencies

**Blocked by:**

- SMCP-079: Package Migration (needs v3 for WebGPU support)

**Blocks:**

- SMCP-081: WebGPU Integration
- SMCP-083: Status Reporting

**Related:**

- PLAN-webgpu-acceleration.md: Master plan document

## Subtasks

### Phase 1: Module Structure (2 hours)

- [ ] 1.1 Create `src/engines/deviceDetection.ts`
    - Define `ComputeDevice` type: `'webgpu' | 'cpu'`
    - Define `DeviceInfo` interface with device, gpuName, fallbackReason
    - Export `detectBestDevice()` async function

- [ ] 1.2 Implement basic device detection flow
    ```typescript
    export async function detectBestDevice(): Promise<DeviceInfo> {
      // 1. Check if WebGPU is available
      // 2. Try to get GPU adapter
      // 3. Extract GPU info if successful
      // 4. Return CPU fallback with reason if not
    }
    ```

- [ ] 1.3 Add device info caching
    - Cache result after first detection
    - Avoid repeated GPU queries during session

### Phase 2: WebGPU Detection (2 hours)

- [ ] 2.1 Implement WebGPU availability check
    - Check for `navigator.gpu` in Node.js context
    - Handle native WebGPU bindings if needed
    - Return false gracefully if API unavailable

- [ ] 2.2 Get GPU adapter and device info
    - Request adapter with `requestAdapter()`
    - Extract adapter info (name, vendor)
    - Handle adapter request failures

- [ ] 2.3 Implement fallback reason tracking
    - "WebGPU API not available"
    - "No GPU adapter found"
    - "GPU adapter request failed: [error]"

### Phase 3: Logging & Integration (2 hours)

- [ ] 3.1 Add informative logging
    ```
    [INFO] GPU detected: NVIDIA GeForce RTX 3080, using WebGPU
    [INFO] No GPU available, using CPU (WASM): WebGPU API not available
    ```

- [ ] 3.2 Create unit tests
    - Test WebGPU detection on supported system
    - Test fallback behavior when GPU unavailable
    - Test caching behavior

- [ ] 3.3 Export module from engines index
    - Add to `src/engines/index.ts` if exists
    - Document usage in module JSDoc

## Resources

- [WebGPU Spec](https://www.w3.org/TR/webgpu/)
- [GPU Adapter Info](https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapterInfo)
- Current embedding engine: `src/engines/embedding.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Unit tests written and passing
- [ ] Detection works on at least one GPU system
- [ ] Fallback works on CPU-only system
- [ ] Changes committed to Git
- [ ] CHANGELOG.md updated

## Progress Log

### 2025-12-16 - 0 hours

- Task created
- Subtasks defined based on PLAN-webgpu-acceleration.md Phase 2

## Notes

- Detection should be non-blocking and fast
- Consider that Node.js may need native bindings for WebGPU
- The module should work independently of embedding engine
- May need to coordinate with SMCP-082 for Node.js WebGPU support

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-079: Package Migration (prerequisite)
- SMCP-081: WebGPU Integration (uses this module)
- SMCP-082: Node.js WebGPU Support (may affect detection)
