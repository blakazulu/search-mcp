# WebGPU Acceleration Plan

## Overview

Add GPU acceleration support to search-mcp using WebGPU, enabling 5-20x faster indexing for users with compatible GPUs (NVIDIA, AMD, Intel Arc) while maintaining CPU fallback for universal compatibility.

## Current State

- **Package**: `@xenova/transformers` v2 (2 years old, unmaintained)
- **Execution**: CPU-only via WASM
- **Performance**: ~4 chunks/second, 9 minutes for 2,146 chunks
- **Models**:
  - Code: `Xenova/bge-small-en-v1.5` (33M params, 384 dims)
  - Docs: `Xenova/bge-base-en-v1.5` (110M params, 768 dims)

## Target State

- **Package**: `@huggingface/transformers` v3
- **Execution**: WebGPU with CPU fallback
- **Expected Performance**:
  - GPU: ~40-80 chunks/second (10-20x improvement)
  - CPU: Same as current (~4 chunks/second)
- **Models**: Same BGE models (compatible with v3)

## Why WebGPU (Not CUDA)

| Factor | CUDA | WebGPU |
|--------|------|--------|
| NVIDIA GPUs | ✅ | ✅ |
| AMD GPUs | ❌ | ✅ |
| Intel Arc | ❌ | ✅ |
| Requires toolkit install | Yes | No |
| Cross-platform | Limited | Universal |

WebGPU works via native graphics APIs (Direct3D 12, Vulkan, Metal) and requires no additional user setup.

## Implementation Steps

### Phase 1: Package Migration

**Goal**: Migrate from `@xenova/transformers` to `@huggingface/transformers` v3

1. **Update package.json**
   ```diff
   - "@xenova/transformers": "^2.17.2"
   + "@huggingface/transformers": "^3.x.x"
   ```

2. **Update imports in `src/engines/embedding.ts`**
   ```diff
   - import { pipeline, type Pipeline } from '@xenova/transformers';
   + import { pipeline, type Pipeline } from '@huggingface/transformers';
   ```

3. **Update model references**
   - Models moved from `Xenova/` to official HuggingFace namespace
   - Verify `BAAI/bge-small-en-v1.5` and `BAAI/bge-base-en-v1.5` work in v3

4. **Run tests** - Ensure all existing functionality works with v3

### Phase 2: GPU Detection

**Goal**: Detect best available compute device at runtime

1. **Create `src/engines/deviceDetection.ts`**
   ```typescript
   export type ComputeDevice = 'webgpu' | 'cpu';

   export interface DeviceInfo {
     device: ComputeDevice;
     gpuName?: string;
     fallbackReason?: string;
   }

   /**
    * Detect the best available compute device
    * Priority: WebGPU > CPU
    */
   export async function detectBestDevice(): Promise<DeviceInfo> {
     // 1. Check if WebGPU is available
     // 2. Verify GPU adapter can be obtained
     // 3. Fall back to CPU with reason if not
   }
   ```

2. **WebGPU availability check**
   ```typescript
   async function isWebGPUAvailable(): Promise<boolean> {
     try {
       // In Node.js, need native WebGPU bindings
       const adapter = await navigator.gpu?.requestAdapter();
       return adapter !== null;
     } catch {
       return false;
     }
   }
   ```

3. **Log device selection** for user awareness
   ```
   [INFO] GPU detected: NVIDIA GeForce RTX 3080, using WebGPU
   [INFO] No GPU available, using CPU (WASM)
   ```

### Phase 3: WebGPU Integration

**Goal**: Use WebGPU when available, with graceful fallback

1. **Update `EmbeddingEngine` constructor**
   ```typescript
   export interface EmbeddingEngineOptions {
     modelName: string;
     device?: ComputeDevice; // 'webgpu' | 'cpu', auto-detected if not specified
   }
   ```

2. **Modify pipeline initialization**
   ```typescript
   private async initializePipeline(): Promise<void> {
     const deviceInfo = await detectBestDevice();

     this.pipeline = await pipeline('feature-extraction', this.modelName, {
       device: deviceInfo.device,
       dtype: deviceInfo.device === 'webgpu' ? 'fp32' : 'fp32',
     });

     logger.info('embedding', `Pipeline initialized`, {
       model: this.modelName,
       device: deviceInfo.device,
       gpu: deviceInfo.gpuName,
     });
   }
   ```

3. **Handle WebGPU shader compilation**
   - First run compiles shaders (slow)
   - Subsequent runs use cached shaders (fast)
   - Log progress: "Compiling GPU shaders (first run only)..."

### Phase 4: Node.js WebGPU Support

**Goal**: Enable WebGPU in Node.js environment

**Challenge**: WebGPU is primarily a browser API. Node.js needs native bindings.

**Options to investigate**:

1. **`@aspect-dev/dawn`** - Native Dawn bindings for Node.js
   ```bash
   npm install @aspect-dev/dawn
   ```

2. **`wgpu-native`** - Rust-based WebGPU for Node.js via wasm-bindgen

3. **`onnxruntime-node` with WebGPU EP**
   - ONNX Runtime has native GPU support
   - May require switching from transformers.js to ONNX Runtime directly

**Recommended approach**: Start with `@huggingface/transformers` v3 and test if WebGPU works in Node.js out of the box. If not, evaluate native binding options.

### Phase 5: Status Reporting

**Goal**: Show users what device is being used (informational only)

1. **Show device info in `get_index_status`**
   ```json
   {
     "compute": {
       "device": "webgpu",
       "gpuName": "AMD Radeon RX 7900"
     }
   }
   ```

2. **Show in `create_index` summary**
   ```
   Index created successfully for /path/to/project

   Statistics:
     ...
     Compute device: WebGPU (AMD Radeon RX 7900)
   ```

**Note**: Device selection is always automatic. No user configuration needed - it just works.

### Phase 6: Testing & Validation

1. **Unit tests**
   - Device detection logic
   - Fallback behavior when GPU unavailable
   - Embedding output consistency (GPU vs CPU should produce same results)

2. **Integration tests**
   - Full indexing pipeline with WebGPU
   - Search quality unchanged after GPU acceleration

3. **Platform testing matrix**
   | Platform | GPU | Expected |
   |----------|-----|----------|
   | Windows + NVIDIA | RTX series | WebGPU |
   | Windows + AMD | RX series | WebGPU |
   | Windows + Intel Arc | A-series | WebGPU |
   | Windows + Intel iGPU | UHD/Iris | WebGPU (slower) |
   | Mac + Apple Silicon | M1/M2/M3 | WebGPU (Metal) |
   | Linux + NVIDIA | Any | WebGPU (Vulkan) |
   | No GPU / VM | - | CPU fallback |

4. **Performance benchmarking**
   - Measure chunks/second on different GPUs
   - Compare indexing time: GPU vs CPU
   - Memory usage comparison

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| WebGPU not working in Node.js | Test early in Phase 1; have ONNX Runtime as backup plan |
| Model incompatibility with v3 | Test models before full migration |
| GPU produces different embeddings | Verify cosine similarity between GPU/CPU outputs |
| Memory issues on GPU | Monitor VRAM usage, reduce batch size if needed |
| Shader compilation slow on first run | Cache shaders, warn users about first-run delay |

## Success Criteria

- [ ] Indexing 10-20x faster on GPU-equipped machines
- [ ] Zero regression for CPU-only machines
- [ ] Search quality unchanged (same embeddings)
- [ ] Works on NVIDIA, AMD, and Intel Arc GPUs
- [ ] Graceful fallback with clear logging
- [ ] No additional user setup required

## Timeline Considerations

This is a significant change touching core infrastructure. Recommend:

1. **Phase 1-2**: Safe to do anytime (package upgrade + detection)
2. **Phase 3-4**: Higher risk, needs thorough testing
3. **Phase 5-6**: Polish and release

Behavior is always automatic - detect GPU, use it if available, fall back to CPU if not. No user configuration required.

## References

- [Transformers.js v3 Announcement](https://huggingface.co/blog/transformersjs-v3)
- [WebGPU Spec](https://www.w3.org/TR/webgpu/)
- [Intel WebGPU AI Inference](https://www.intel.com/content/www/us/en/developer/articles/community/boost-ai-inference-performance-with-webgpu.html)
- [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/execution-providers/WebGPU-ExecutionProvider.html)
