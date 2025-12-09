---
task_id: "SMCP-041"
title: "Windows & Platform-Specific Fixes"
category: "Technical"
priority: "P2"
status: "not-started"
created_date: "2024-12-09"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "Team"
tags: ["medium", "windows", "platform", "performance", "filewatcher"]
---

# Task: Windows & Platform-Specific Fixes

## Overview

Fix platform-specific issues, particularly for Windows where file watching uses polling and synchronous file operations block the event loop.

## Bugs Addressed

- **Bug #18**: Windows Polling Without Throttle (`fileWatcher.ts:114`)
- **Bug #19**: Synchronous File Ops Block Event Loop (`lancedb.ts:121-140`)
- **Bug #20**: Fingerprints Reload After Every Update (`fileWatcher.ts:550-553`)
- **MCP-28**: NFS Timestamp Aliasing
- **MCP-31**: Clock Drift/Adjustment Not Handled

## Goals

- [ ] Add polling interval for Windows file watching
- [ ] Convert sync file ops to async
- [ ] Batch fingerprint updates instead of reloading each time
- [ ] Add timestamp handling for edge cases

## Success Criteria

- Windows file watching doesn't cause high CPU usage
- No blocking operations in event loop
- Fingerprints are updated efficiently
- Build and all tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- SMCP-038: Resource Cleanup & Signal Handling

## Subtasks

### Phase 1: Windows Polling Configuration (0.5 hours)

- [ ] 1.1 Update `WATCHER_OPTIONS` in `src/engines/fileWatcher.ts:104-117`
    ```typescript
    export const WATCHER_OPTIONS: chokidar.WatchOptions = {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      // Windows-specific polling configuration
      usePolling: process.platform === 'win32',
      interval: process.platform === 'win32' ? 300 : undefined,
      binaryInterval: process.platform === 'win32' ? 500 : undefined,
    };
    ```

### Phase 2: Convert Sync Ops to Async (1 hour)

- [ ] 2.1 Update lockfile cleanup in `src/storage/lancedb.ts:121-140`
    - Replace `fs.statSync()` with `fs.promises.stat()`
    - Replace `fs.unlinkSync()` with `fs.promises.unlink()`
    - Replace `fs.existsSync()` with `fs.promises.access()`

- [ ] 2.2 Search for other sync operations and convert
    ```bash
    grep -r "Sync(" src/
    ```

### Phase 3: Batch Fingerprint Updates (1 hour)

- [ ] 3.1 Update FileWatcher to batch fingerprint changes
    ```typescript
    // Instead of reloading fingerprints after every update:
    // await this.fingerprints.load();

    // Update in-memory directly:
    async onFileChange(relativePath: string, newHash: string): Promise<void> {
      this.fingerprints.set(relativePath, newHash);
      this.markFingerprintsDirty();
    }

    // Save periodically or on shutdown
    private fingerprintsDirty = false;
    private fingerprintsSaveTimer: NodeJS.Timeout | null = null;

    private markFingerprintsDirty(): void {
      this.fingerprintsDirty = true;
      if (!this.fingerprintsSaveTimer) {
        this.fingerprintsSaveTimer = setTimeout(async () => {
          if (this.fingerprintsDirty) {
            await this.fingerprints.save();
            this.fingerprintsDirty = false;
          }
          this.fingerprintsSaveTimer = null;
        }, 5000); // Save every 5 seconds if dirty
      }
    }
    ```

### Phase 4: Timestamp Edge Cases (0.5 hours)

- [ ] 4.1 Add timestamp validation
    ```typescript
    function isValidTimestamp(timestamp: number): boolean {
      const now = Date.now();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;

      // Reject timestamps too far in the past or future
      if (timestamp < 0 || timestamp > now + oneYearMs) {
        return false;
      }
      return true;
    }
    ```

- [ ] 4.2 Use `performance.now()` for duration calculations instead of `Date.now()`
    - Already used in some places, verify consistency

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Chokidar Documentation](https://github.com/paulmillr/chokidar#performance)
- [Node.js Event Loop](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Windows polling configured properly
- [ ] No more sync file operations in hot paths
- [ ] Fingerprints batched, not reloaded each time
- [ ] Timestamp edge cases handled
- [ ] Tested on Windows
- [ ] `npm run build` passes
- [ ] `npm run test` passes

## Progress Log

### 2024-12-09 - 0 hours

- Task created from bug hunt findings

## Notes

- Chokidar's usePolling is needed on Windows for network drives
- interval=300ms is a good balance between responsiveness and CPU usage
- binaryInterval can be higher since binary files change less frequently
- Consider adding configuration options for polling intervals

## Blockers

_None currently identified_
