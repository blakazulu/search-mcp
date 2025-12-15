---
task_id: "SMCP-082"
title: "WebGPU: Node.js WebGPU Support"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 12
actual_hours: 0
assigned_to: "Team"
tags: ["webgpu", "nodejs", "native-bindings", "research"]
---

# Task: Node.js WebGPU Support

## Overview

Enable WebGPU in the Node.js environment. WebGPU is primarily a browser API, so Node.js requires native bindings to access GPU acceleration. This task involves researching, selecting, and integrating the best solution for Node.js WebGPU support.

## Goals

- [ ] Research available Node.js WebGPU solutions
- [ ] Select the best approach for search-mcp
- [ ] Integrate chosen solution with minimal dependencies
- [ ] Verify WebGPU works in Node.js environment
- [ ] Document setup requirements (if any)

## Success Criteria

- WebGPU API available in Node.js context
- GPU acceleration works via transformers.js v3
- Works on Windows, macOS, and Linux
- No manual user setup required (auto-downloads if needed)
- Fallback to CPU if native bindings fail

## Dependencies

**Blocked by:**

- SMCP-079: Package Migration (needs v3 baseline first)

**Blocks:**

- SMCP-081: WebGPU Integration (needs WebGPU in Node)
- SMCP-084: Testing & Validation

**Related:**

- SMCP-080: GPU Detection (coordinates detection logic)
- PLAN-webgpu-acceleration.md: Master plan document

## Subtasks

### Phase 1: Research (4 hours)

- [ ] 1.1 Test transformers.js v3 WebGPU out of the box
    - Check if WebGPU works in Node.js without additional setup
    - Document any errors or limitations
    - This may "just work" with recent Node.js versions

- [ ] 1.2 Research `@aspect-dev/dawn`
    - Native Dawn bindings for Node.js
    - Evaluate installation size and complexity
    - Check platform support (Win/Mac/Linux)
    - Test basic WebGPU operations

- [ ] 1.3 Research `wgpu-native` options
    - Rust-based WebGPU for Node.js
    - Check npm packages using wgpu
    - Evaluate maturity and maintenance

- [ ] 1.4 Research ONNX Runtime alternative
    - `onnxruntime-node` with GPU execution provider
    - May bypass transformers.js entirely
    - Evaluate as backup plan

### Phase 2: Solution Selection (2 hours)

- [ ] 2.1 Create comparison matrix
    | Solution | Install Size | Platforms | Maintenance | Complexity |
    |----------|-------------|-----------|-------------|------------|
    | Dawn | ? | ? | ? | ? |
    | wgpu | ? | ? | ? | ? |
    | ONNX | ? | ? | ? | ? |

- [ ] 2.2 Select recommended approach
    - Prioritize: simplicity > compatibility > performance
    - Document decision rationale

- [ ] 2.3 Create fallback strategy
    - Primary: [selected solution]
    - Fallback: CPU via WASM
    - Document when each is used

### Phase 3: Integration (4 hours)

- [ ] 3.1 Add selected package to dependencies
    - Add to `package.json`
    - Verify install works cross-platform
    - Check for native build requirements

- [ ] 3.2 Create WebGPU initialization module
    - Handle native binding loading
    - Polyfill `navigator.gpu` if needed
    - Export initialization function

- [ ] 3.3 Integrate with device detection
    - Coordinate with SMCP-080 module
    - Ensure detection works with native bindings
    - Handle binding load failures gracefully

### Phase 4: Platform Testing (2 hours)

- [ ] 4.1 Test on Windows
    - NVIDIA GPU
    - AMD GPU
    - Intel GPU
    - CPU-only fallback

- [ ] 4.2 Test on macOS (if available)
    - Apple Silicon (Metal backend)
    - Intel Mac (if available)

- [ ] 4.3 Test on Linux (if available)
    - NVIDIA GPU (Vulkan)
    - AMD GPU (Vulkan)
    - CPU-only fallback

## Resources

- [@aspect-dev/dawn npm](https://www.npmjs.com/package/@aspect-dev/dawn)
- [Dawn WebGPU](https://dawn.googlesource.com/dawn)
- [ONNX Runtime Node.js](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)
- [wgpu-native](https://github.com/gfx-rs/wgpu-native)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Solution documented in code comments
- [ ] Works on at least Windows + one other platform
- [ ] Fallback to CPU works when bindings fail
- [ ] Changes committed to Git
- [ ] CHANGELOG.md updated

## Progress Log

### 2025-12-16 - 0 hours

- Task created
- Subtasks defined based on PLAN-webgpu-acceleration.md Phase 4

## Notes

- This is a research-heavy task - findings may change the approach
- Start by testing if transformers.js v3 "just works" in Node.js
- Dawn is Google's WebGPU implementation - likely most compatible
- ONNX Runtime is a valid alternative if transformers.js doesn't work
- Consider optional dependency pattern for native bindings

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-079: Package Migration (prerequisite)
- SMCP-080: GPU Detection (coordinates with this)
- SMCP-081: WebGPU Integration (depends on this)
