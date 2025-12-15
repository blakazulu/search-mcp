---
task_id: "SMCP-083"
title: "WebGPU: Status Reporting"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-16"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "Team"
tags: ["webgpu", "status", "user-experience", "mcp-tools"]
---

# Task: WebGPU Status Reporting

## Overview

Enhance MCP tools to report compute device information to users. This is purely informational - device selection remains automatic with no user configuration. Users should be able to see what device is being used for embeddings.

## Goals

- [ ] Show compute device in `get_index_status` tool
- [ ] Show compute device in `create_index` summary
- [ ] Display GPU name when WebGPU is active
- [ ] Show fallback reason when using CPU

## Success Criteria

- Users can see which device (GPU/CPU) is being used
- GPU name displayed when using WebGPU
- Fallback reason shown when GPU unavailable
- Information is clear and non-technical for end users

## Dependencies

**Blocked by:**

- SMCP-080: GPU Detection (provides device info)
- SMCP-081: WebGPU Integration (device must be working)

**Blocks:**

- None

**Related:**

- PLAN-webgpu-acceleration.md: Master plan document

## Subtasks

### Phase 1: Status Tool Enhancement (2 hours)

- [ ] 1.1 Update `get_index_status` response
    ```json
    {
      "indexed": true,
      "path": "/path/to/project",
      "stats": { ... },
      "compute": {
        "device": "webgpu",
        "gpuName": "NVIDIA GeForce RTX 3080"
      }
    }
    ```

- [ ] 1.2 Handle CPU fallback display
    ```json
    {
      "compute": {
        "device": "cpu",
        "fallbackReason": "No GPU adapter found"
      }
    }
    ```

- [ ] 1.3 Update status tool types and validation
    - Add compute field to response schema
    - Update Zod validation if applicable

### Phase 2: Index Creation Summary (2 hours)

- [ ] 2.1 Update `create_index` success message
    ```
    Index created successfully for /path/to/project

    Statistics:
      Files indexed: 150
      Chunks created: 2,146
      Duration: 45 seconds
      Compute device: WebGPU (NVIDIA GeForce RTX 3080)
    ```

- [ ] 2.2 Show performance comparison hint
    ```
    Compute device: WebGPU (NVIDIA GeForce RTX 3080)
    Performance: ~65 chunks/second
    ```

- [ ] 2.3 Handle CPU message
    ```
    Compute device: CPU (WASM)
    Note: GPU not available - No GPU adapter found
    ```

## Resources

- Current status tool: `src/tools/getIndexStatus.ts`
- Current create index tool: `src/tools/createIndex.ts`
- Device detection module: `src/engines/deviceDetection.ts` (from SMCP-080)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Status tool shows compute info
- [ ] Create index shows compute info
- [ ] Both GPU and CPU scenarios tested
- [ ] Changes committed to Git
- [ ] CHANGELOG.md updated

## Progress Log

### 2025-12-16 - 0 hours

- Task created
- Subtasks defined based on PLAN-webgpu-acceleration.md Phase 5

## Notes

- This is a low-risk, polish task
- Keep messages user-friendly, not too technical
- Device selection is always automatic - no config needed
- Consider adding compute info to reindex summary too

## Blockers

_Document any blockers here as they arise_

## Related Tasks

- SMCP-080: GPU Detection (provides device info)
- SMCP-081: WebGPU Integration (prerequisite)
