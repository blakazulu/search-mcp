---
task_id: "SMCP-046"
title: "Realtime Strategy"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 4
actual_hours: 0
assigned_to: "blakazulu"
tags: ["strategy", "indexing", "realtime", "filewatcher"]
---

# Task: Realtime Strategy

## Overview

Extract the current FileWatcher behavior into a RealtimeStrategy class that implements the IndexingStrategy interface. This maintains the existing "index immediately on change" behavior as the default strategy.

## Goals

- [ ] Create RealtimeStrategy implementing IndexingStrategy
- [ ] Extract core logic from existing FileWatcher
- [ ] Process file events immediately with debouncing
- [ ] Maintain all existing FileWatcher functionality

## Success Criteria

- ✅ RealtimeStrategy implements IndexingStrategy interface
- ✅ Processes file changes immediately (with 500ms debounce)
- ✅ Routes to correct index manager (code vs docs)
- ✅ Behavior is identical to current FileWatcher
- ✅ Proper cleanup on stop()

## Dependencies

**Blocked by:**

- SMCP-045: Strategy Interface

**Blocks:**

- SMCP-049: Strategy Orchestrator

**Related:**

- SMCP-015: File Watcher (source of implementation)
- SMCP-047: Lazy Strategy (shares watcher setup)

## Subtasks

### Phase 1: Create Strategy Class (2 hours)

- [ ] 1.1 Create `src/engines/strategies/` directory

- [ ] 1.2 Create `src/engines/strategies/realtimeStrategy.ts`:
    - Import IndexingStrategy interface
    - Import chokidar and WATCHER_OPTIONS from fileWatcher
    - Implement constructor with dependencies:
      - projectPath
      - indexManager
      - docsIndexManager (nullable)
      - policy
      - fingerprints
      - docsFingerprints (nullable)

- [ ] 1.3 Implement interface methods:
    - `initialize()` - Load fingerprints, policy
    - `start()` - Create chokidar watcher, bind events
    - `stop()` - Clear timers, close watcher
    - `isActive()` - Return active state
    - `onFileEvent()` - Process event immediately
    - `flush()` - No-op (events processed immediately)
    - `getStats()` - Return statistics

### Phase 2: Extract FileWatcher Logic (1.5 hours)

- [ ] 2.1 Extract debouncing logic:
    - pendingEvents Map
    - processingQueue Set
    - DEFAULT_DEBOUNCE_DELAY

- [ ] 2.2 Extract event handling:
    - handleEvent() - Convert path, check policy, debounce
    - processEvent() - Route to index manager, update fingerprints

- [ ] 2.3 Extract error handling:
    - handleError() - Log watcher errors

### Phase 3: Testing (0.5 hours)

- [ ] 3.1 Create `tests/unit/engines/strategies/realtimeStrategy.test.ts`
- [ ] 3.2 Test lifecycle (start/stop)
- [ ] 3.3 Test event processing
- [ ] 3.4 Test debouncing

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 4)
- Source: `src/engines/fileWatcher.ts`

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Code tested (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] Changes committed to Git
- [ ] No regressions introduced

## Progress Log

### 2025-12-10 - 0 hours

- ⏳ Task created
- 📝 Subtasks defined

## Notes

- Export WATCHER_OPTIONS and DEFAULT_DEBOUNCE_DELAY from fileWatcher.ts for reuse
- Consider whether to deprecate FileWatcher class or keep it as a wrapper
- flush() is a no-op since events are processed immediately
- pendingEvents.size can be used for stats.pendingFiles
