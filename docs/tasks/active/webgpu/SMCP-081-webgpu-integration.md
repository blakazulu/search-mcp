---
task_id: "SMCP-081"
title: "WebGPU: Embedding Engine Integration"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 10
actual_hours: 0
assigned_to: "Team"
tags: ["webgpu", "performance", "embedding", "gpu-acceleration"]
---

# Task: WebGPU Embedding Engine Integration

## Overview

Integrate WebGPU acceleration into the EmbeddingEngine class, enabling GPU-accelerated embedding generation when available while maintaining seamless CPU fallback. This is the core task that delivers the 10-20x performance improvement.

## Goals

- [ ] Modify EmbeddingEngine to use detected compute device
- [ ] Initialize pipeline with WebGPU when available
- [ ] Handle shader compilation on first run
- [ ] Maintain identical embedding output quality
- [ ] Provide graceful degradation to CPU

## Success Criteria

- 10-20x faster indexing on GPU-equipped machines (~40-80 chunks/sec)
- Zero regression for CPU-only machines (~4 chunks/sec)
- Embeddings are numerically identical regardless of device
- First-run shader compilation handled gracefully
- Memory usage within acceptable limits (< 2GB VRAM)

## Dependencies

**Blocked by:**

- SMCP-079: Package Migration (needs v3)
- SMCP-080: GPU Detection (needs device detection)
- SMCP-082: Node.js WebGPU Support (needs WebGPU in Node.js)

**Blocks:**

- SMCP-083: Status Reporting
- SMCP-084: Testing & Validation

**Related:**

- PLAN-webgpu-acceleration.md: Master plan document

## Subtasks

### Phase 1: Engine Options (2 hours)

- [ ] 1.1 Update EmbeddingEngineOptions interface
    ```typescript
    export interface EmbeddingEngineOptions {
      modelName: string;
      device?: ComputeDevice; // 'webgpu' | 'cpu', auto-detected if not specified
    }
    ```

- [ ] 1.2 Add device property to EmbeddingEngine
    - Store detected/specified device
    - Make available for status reporting

- [ ] 1.3 Update constructor to accept device option
    - Default to auto-detection
    - Allow override for testing

### Phase 2: Pipeline Initialization (4 hours)

- [ ] 2.1 Modify initializePipeline() method
    ```typescript
    private async initializePipeline(): Promise<void> {
      const deviceInfo = this.device
        ? { device: this.device }
        : await detectBestDevice();

      this.pipeline = await pipeline('feature-extraction', this.modelName, {
        device: deviceInfo.device,
        dtype: 'fp32',
      });
    }
    ```

- [ ] 2.2 Handle first-run shader compilation
    - Detect when shaders are being compiled
    - Log progress message: "Compiling GPU shaders (first run only)..."
    - Subsequent runs should be fast

- [ ] 2.3 Implement pipeline initialization error handling
    - Catch WebGPU initialization failures
    - Fall back to CPU with warning
    - Log reason for fallback

### Phase 3: Embedding Generation (2 hours)

- [ ] 3.1 Verify embed() method works with WebGPU
    - Test with GPU pipeline
    - Verify tensor operations work
    - Check memory cleanup

- [ ] 3.2 Implement batch size optimization for GPU
    - GPU can handle larger batches efficiently
    - Consider dynamic batch sizing based on device

- [ ] 3.3 Add performance logging
    - Log chunks/second during indexing
    - Log device being used
    - Log VRAM usage if available

### Phase 4: Graceful Degradation (2 hours)

- [ ] 4.1 Implement automatic fallback
    - If GPU fails mid-operation, fall back to CPU
    - Preserve partial progress
    - Log fallback reason

- [ ] 4.2 Handle VRAM exhaustion
    - Monitor memory during batch processing
    - Reduce batch size if VRAM low
    - Fall back to CPU if necessary

- [ ] 4.3 Test fallback scenarios
    - GPU unavailable at start
    - GPU fails during operation
    - VRAM exhaustion

## Resources

- [Transformers.js GPU Support](https://huggingface.co/docs/transformers.js/guides/webgpu)
- [WebGPU Best Practices](https://developer.chrome.com/docs/capabilities/webgpu)
- Current embedding engine: `src/engines/embedding.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Performance benchmarks meet targets
- [ ] Fallback scenarios tested
- [ ] Integration tests passing
- [ ] Changes committed to Git
- [ ] CHANGELOG.md updated

## Progress Log

### 2025-12-16 - 0 hours

- Task created
- Subtasks defined based on PLAN-webgpu-acceleration.md Phase 3

## Notes

- This is the highest-risk task - test thoroughly
- GPU/CPU embeddings MUST be identical for search quality
- Consider adding a --cpu flag for debugging
- Monitor VRAM usage during large indexing operations
- Shader compilation can take 10-30 seconds on first run

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-079: Package Migration (prerequisite)
- SMCP-080: GPU Detection (provides device info)
- SMCP-082: Node.js WebGPU Support (enables WebGPU in Node)
- SMCP-084: Testing & Validation (validates this work)
