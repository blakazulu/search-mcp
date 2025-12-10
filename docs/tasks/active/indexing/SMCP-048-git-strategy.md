---
task_id: "SMCP-048"
title: "Git Strategy"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "blakazulu"
tags: ["strategy", "indexing", "git", "commits"]
---

# Task: Git Strategy

## Overview

Create a GitStrategy that only reindexes after git commits. Instead of watching all project files, it watches `.git/logs/HEAD` which is appended on every commit. Uses IntegrityEngine for drift detection.

## Goals

- [ ] Create GitStrategy implementing IndexingStrategy
- [ ] Watch .git/logs/HEAD for commit detection
- [ ] Use IntegrityEngine to detect and reconcile drift
- [ ] Minimal file watcher overhead

## Success Criteria

- ✅ GitStrategy implements IndexingStrategy interface
- ✅ Only watches `.git/logs/HEAD` (not project files)
- ✅ Detects commits via file change events
- ✅ Uses IntegrityEngine.detectDrift() and reconcile()
- ✅ Handles rapid git operations with debounce (2s)
- ✅ Fails gracefully for non-git projects

## Dependencies

**Blocked by:**

- SMCP-045: Strategy Interface

**Blocks:**

- SMCP-049: Strategy Orchestrator

**Related:**

- SMCP-016: Integrity Engine (used for drift detection)

## Subtasks

### Phase 1: Create Strategy Class (1.5 hours)

- [ ] 1.1 Create `src/engines/strategies/gitStrategy.ts`:
    - Import IndexingStrategy interface
    - Import IntegrityEngine
    - Import chokidar

- [ ] 1.2 Implement constructor:
    - projectPath
    - integrityEngine

- [ ] 1.3 Implement state tracking:
    - gitWatcher: chokidar.FSWatcher
    - active: boolean
    - debounceTimer: timeout handle
    - debounceDelay: 2000ms
    - processedCount: number
    - lastActivity: Date

### Phase 2: Implement Interface Methods (1 hour)

- [ ] 2.1 `initialize()`:
    - Verify .git directory exists
    - Throw error if not a git repository

- [ ] 2.2 `start()`:
    - Build path: `{projectPath}/.git/logs/HEAD`
    - Create logs dir if missing (fresh repos)
    - Watch with chokidar (minimal options)
    - Bind change event to onGitChange()

- [ ] 2.3 `stop()`:
    - Clear debounce timer
    - Close git watcher

- [ ] 2.4 `onFileEvent()`:
    - No-op (git strategy ignores individual file events)

- [ ] 2.5 `flush()`:
    - Call integrityEngine.detectDrift()
    - If drift found, call integrityEngine.reconcile()
    - Update stats

- [ ] 2.6 `getStats()`:
    - pendingFiles: 0 (git strategy doesn't track pending)

### Phase 3: Git Change Detection (0.5 hours)

- [ ] 3.1 Implement `onGitChange()`:
    - Debounce rapid operations (2s)
    - On timeout: call flush()

- [ ] 3.2 Handle watcher errors gracefully

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 6)
- Integrity Engine: `src/engines/integrity.ts`

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

- `.git/logs/HEAD` is appended on every commit, checkout, merge, rebase
- 2 second debounce handles rapid git operations (interactive rebase, etc.)
- No need to track individual file changes - IntegrityEngine does the diff
- onFileEvent() is a no-op - this strategy only responds to commits
- Fails loudly if .git doesn't exist (user chose wrong strategy)
