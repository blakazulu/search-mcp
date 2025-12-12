---
task_id: "SMCP-075"
title: "Fix HIGH Priority Race Conditions and Resource Issues"
category: "Technical"
priority: "P1"
status: "completed"
created_date: "2025-12-12"
due_date: ""
estimated_hours: 4
actual_hours: 2
assigned_to: "Team"
tags: ["bug-fix", "race-condition", "high-priority", "security"]
---

# Task: Fix HIGH Priority Race Conditions and Resource Issues

## Overview

Fix the two HIGH severity bugs identified in the bug hunt: uncancelled glob timeout leading to resource exhaustion, and AsyncMutex timeout/grant race condition causing potential deadlocks.

## Goals

- [x] Fix glob timeout to properly cancel underlying operation
- [x] Fix AsyncMutex race condition between timeout and grant
- [x] Add tests for both fixes
- [x] Verify no regressions

## Success Criteria

- [x] Glob operations are properly cancelled when timeout fires
- [x] AsyncMutex cannot deadlock under high contention
- [x] All existing tests pass
- [x] New tests cover the fixed scenarios

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md`

## Subtasks

### Phase 1: Fix Glob Timeout (BUG #4) (2 hours)

- [x] 1.1 Update `src/engines/integrity.ts` glob timeout handling
    - Replace `Promise.race` pattern with `AbortController`
    - Use glob's `signal` option for proper cancellation
    - Clean up timeout in finally block

```typescript
// Implemented:
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), GLOB_TIMEOUT_MS);
try {
  const files = await glob(globPattern, {
    cwd: normalizedProjectPath,
    nodir: true,
    dot: true,
    absolute: false,
    maxDepth: maxDepth,
    signal: controller.signal,
  });
  // ... process files
} catch (error) {
  // Handle abort error (timeout)
  if (error instanceof Error && error.name === 'AbortError') {
    logger.error('IntegrityEngine', 'Glob operation timed out', {...});
    return currentState;
  }
  // ... handle other errors
} finally {
  clearTimeout(timeoutId);
}
```

- [x] 1.2 Search for other `Promise.race` timeout patterns in codebase
    - Found in `src/utils/cleanup.ts` - acceptable pattern for cleanup handlers (different use case)
    - No other glob timeout patterns found

- [x] 1.3 Add test for glob timeout cancellation
    - Added tests in `tests/unit/engines/integrity.test.ts`
    - Tests verify normal completion works with AbortController
    - Tests verify timeout is properly cleared

### Phase 2: Fix AsyncMutex Race Condition (BUG #6) (2 hours)

- [x] 2.1 Update `src/utils/asyncMutex.ts` acquire() method
    - Added atomic `satisfied` flag per waiter
    - Check flag in both timeout handler and resolve wrapper
    - resolveWrapper returns boolean to indicate if lock was accepted

```typescript
// Implemented:
let satisfied = false;
const resolveWrapper = (): boolean => {
  if (satisfied) return false;  // Already timed out
  satisfied = true;
  clearTimeout(timeoutHandle);
  resolve();
  return true;  // Lock accepted
};
```

- [x] 2.2 Review release() method for edge cases
    - Updated to loop through queue and skip timed-out waiters
    - Properly unlocks mutex if all waiters had timed out

```typescript
// Implemented:
while (this.queue.length > 0) {
  const next = this.queue.shift();
  if (next) {
    const accepted = next();
    if (accepted) return;  // Lock transferred
    // Waiter timed out, try next one
  }
}
this.locked = false;  // No valid waiters, unlock
```

- [x] 2.3 Add stress test for high contention
    - Added 6 new tests in `tests/unit/utils/asyncMutex.test.ts`
    - Tests verify no deadlocks with many concurrent acquires
    - Tests verify interleaved timeouts handled correctly
    - Tests verify FIFO order maintained for non-timed-out waiters

## Resources

- Bug Hunt Report: `docs/tasks/active/09-bug-hunt/BUG-HUNT-REPORT.md` (BUG #4, #6)
- `src/engines/integrity.ts:155-220`
- `src/utils/asyncMutex.ts:97-185`
- [glob npm package - AbortController support](https://www.npmjs.com/package/glob)

## Acceptance Checklist

Before marking this task complete:

- [x] All subtasks completed
- [x] Glob timeout properly cancels underlying operation
- [x] AsyncMutex cannot deadlock under race conditions
- [x] All existing tests pass (114/114 for modified files)
- [x] New tests added for both fixes
- [x] Code reviewed for edge cases
- [ ] Changes committed to Git (pending user approval)
- [x] CHANGELOG.md updated

## Progress Log

### 2025-12-12 - 0 hours

- Task created from bug hunt report
- Subtasks defined based on BUG #4 and BUG #6

### 2025-12-12 - 2 hours

- COMPLETED: BUG #4 fix - Implemented AbortController for glob timeout
  - Replaced Promise.race with AbortController.signal
  - Added proper timeout cleanup in finally block
  - Handles AbortError specifically for timeout case
- COMPLETED: BUG #6 fix - Implemented atomic satisfied flag
  - Added boolean return to resolveWrapper to indicate lock acceptance
  - Updated release() to skip timed-out waiters
  - Prevents deadlock when timeout and release race
- COMPLETED: Added 3 tests for glob timeout (integrity.test.ts)
- COMPLETED: Added 6 tests for mutex race condition (asyncMutex.test.ts)
- COMPLETED: All 114 tests pass for modified files
- COMPLETED: Updated CHANGELOG.md
- COMPLETED: Updated BUG-HUNT-REPORT.md

## Notes

- BUG #4: The glob library supports AbortController via the `signal` option
- BUG #6: JavaScript is single-threaded but the race exists because timeout callbacks and promise resolution can interleave between event loop ticks
- Both bugs are confirmed HIGH severity and fixed before next release
- The cleanup.ts Promise.race pattern is acceptable since cleanup handlers are designed to be short-lived and resources are freed during shutdown anyway

## Blockers

_No blockers identified_

## Related Tasks

- SMCP-076: Error handling improvements
- SMCP-077: Atomic writes and data integrity
- SMCP-078: Code quality improvements
