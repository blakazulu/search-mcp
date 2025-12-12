---
task_id: "SMCP-076"
title: "Improve Error Handling and Robustness"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2025-12-12"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "Team"
tags: ["bug-fix", "error-handling", "medium-priority", "robustness"]
---

# Task: Improve Error Handling and Robustness

## Overview

Fix MEDIUM severity bugs related to error handling, initialization state, and stream cleanup. These issues can cause confusing errors, inconsistent state, or resource leaks under specific conditions.

## Goals

- [ ] Fix background startup check error handling
- [ ] Add fallback for config load failures
- [ ] Improve stream cleanup in large file chunking
- [ ] Fix partial initialization state in embedding engine

## Success Criteria

- ✅ Background startup check catches all error types
- ✅ Corrupted config gracefully falls back to defaults
- ✅ Stream resources are cleaned up on all error paths
- ✅ Embedding engine state is consistent after failures
- ✅ All existing tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md`
- SMCP-075: High priority race conditions

## Subtasks

### Phase 1: Fix Background Startup Check (BUG #21) (0.5 hours)

- [ ] 1.1 Update `src/engines/integrity.ts` runStartupCheckBackground()
    - Wrap in try-catch for synchronous errors
    - Or use `Promise.resolve().then()` pattern

```typescript
// Option A: try-catch
export function runStartupCheckBackground(engine: IntegrityEngine): void {
  try {
    runStartupCheck(engine).catch((error) => {
      logger.error('IntegrityEngine', 'Background startup check failed', {...});
    });
  } catch (error) {
    logger.error('IntegrityEngine', 'Background startup check threw synchronously', {...});
  }
}

// Option B: Promise.resolve pattern
export function runStartupCheckBackground(engine: IntegrityEngine): void {
  Promise.resolve().then(() => runStartupCheck(engine)).catch((error) => {
    logger.error('IntegrityEngine', 'Background startup check failed', {...});
  });
}
```

### Phase 2: Fix Config Load Failure (BUG #26) (0.5 hours)

- [ ] 2.1 Update `src/server.ts` config loading
    - Wrap loadConfig in try-catch
    - Fall back to generateDefaultConfig() on failure
    - Log warning about corrupted config

```typescript
let config: ProjectConfig;
try {
  config = await loadConfig(indexPath);
} catch (error) {
  logger.warn('Server', 'Failed to load config, using defaults', { error });
  config = generateDefaultConfig(projectPath);
}
```

### Phase 3: Fix Stream Cleanup in Chunking (BUG #5) (1 hour)

- [ ] 3.1 Update `src/engines/chunking.ts` chunkLargeFile()
    - Attach error handlers immediately after stream creation
    - Use a cleanup function called from all exit points
    - Consider using try-finally pattern

```typescript
// Ensure cleanup is called on all paths
const cleanup = () => {
  if (rl) rl.close();
  if (fileStream && !fileStream.destroyed) fileStream.destroy();
};

try {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  fileStream.on('error', (err) => { /* handle */ });

  const rl = readline.createInterface({ input: fileStream });
  rl.on('error', (err) => { /* handle */ });

  // ... processing
} catch (error) {
  cleanup();
  throw error;
}
```

- [ ] 3.2 Add test for stream cleanup on error

### Phase 4: Fix Embedding Engine Initialization (BUG #9) (1 hour)

- [ ] 4.1 Update `src/engines/embedding.ts` initialize()
    - Use atomic state transitions
    - Ensure both initializationPromise and pipeline are reset together
    - Consider using a state machine pattern

```typescript
async initialize(onProgress?: DownloadProgressCallback): Promise<void> {
  if (this.pipeline) return;
  if (this.initializationPromise) return this.initializationPromise;

  this.initializationPromise = (async () => {
    try {
      await this.loadModel(onProgress);
    } catch (error) {
      // Atomic reset on any failure
      this.pipeline = null;
      throw error;
    }
  })();

  try {
    await this.initializationPromise;
  } finally {
    // Clear the promise after completion (success or failure)
    // so retries can happen
    if (!this.pipeline) {
      this.initializationPromise = null;
    }
  }
}
```

- [ ] 4.2 Add test for initialization failure recovery

## Resources

- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md` (BUG #5, #9, #21, #26)
- `src/engines/integrity.ts:952-956`
- `src/server.ts:465-466`
- `src/engines/chunking.ts:540-701`
- `src/engines/embedding.ts:182-205`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] Error handling covers all identified scenarios
- [ ] No unhandled promise rejections possible
- [ ] Streams are properly cleaned up
- [ ] All existing tests pass
- [ ] New tests added for error scenarios
- [ ] Changes committed to Git
- [ ] CHANGELOG.md updated

## Progress Log

### 2025-12-12 - 0 hours

- ⏳ Task created from bug hunt report
- 📝 Subtasks defined based on BUG #5, #9, #21, #26

## Notes

- BUG #21: Async functions can throw synchronously before returning a promise
- BUG #26: Config corruption should not prevent server from starting
- BUG #5: Stream cleanup is mostly correct but has a narrow race window
- BUG #9: State machine pattern would make initialization more robust

## Blockers

_No blockers identified_

## Related Tasks

- SMCP-075: High priority race conditions
- SMCP-077: Atomic writes and data integrity
- SMCP-078: Code quality improvements
