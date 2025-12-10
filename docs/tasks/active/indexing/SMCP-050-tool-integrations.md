---
task_id: "SMCP-050"
title: "Tool Integrations"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2025-12-10"
due_date: ""
estimated_hours: 3
actual_hours: 0
assigned_to: "blakazulu"
tags: ["tools", "indexing", "integration"]
---

# Task: Tool Integrations

## Overview

Update MCP tools to integrate with the strategy orchestrator. Search tools need to flush before returning results, status tool reports strategy info, and index management tools manage strategy lifecycle.

## Goals

- [ ] Search tools flush lazy strategy before search
- [ ] Status tool reports current strategy and pending files
- [ ] Create index starts the configured strategy
- [ ] Delete index stops strategy and cleans up

## Success Criteria

- ✅ search_code flushes pending files before search (lazy mode)
- ✅ search_docs flushes pending files before search (lazy mode)
- ✅ get_index_status shows indexingStrategy and pendingFiles
- ✅ create_index starts strategy after indexing completes
- ✅ delete_index stops strategy and removes dirty-files.json

## Dependencies

**Blocked by:**

- SMCP-049: Strategy Orchestrator

**Blocks:**

- SMCP-051: Server Integration

**Related:**

- SMCP-017: Search Code Tool
- SMCP-029: Search Docs Tool
- SMCP-019: Get Index Status Tool
- SMCP-020: Create Index Tool
- SMCP-023: Delete Index Tool

## Subtasks

### Phase 1: Search Tools (1 hour)

- [ ] 1.1 Modify `src/tools/searchCode.ts`:
    ```typescript
    // Before executing search
    const orchestrator = getOrchestrator();
    if (orchestrator?.getCurrentStrategy()?.name === 'lazy') {
      await orchestrator.flush();
    }
    ```

- [ ] 1.2 Modify `src/tools/searchDocs.ts`:
    - Same flush logic as searchCode

### Phase 2: Status Tool (0.5 hours)

- [ ] 2.1 Modify `src/tools/getIndexStatus.ts`:
    ```typescript
    // Add to result object
    const strategyStats = orchestrator?.getStats();
    if (strategyStats) {
      result.indexingStrategy = strategyStats.name;
      result.pendingFiles = strategyStats.pendingFiles;
    }
    ```

- [ ] 2.2 Update result type to include new fields

### Phase 3: Index Management Tools (1.5 hours)

- [ ] 3.1 Modify `src/tools/createIndex.ts`:
    ```typescript
    // After indexing completes
    const config = await configManager.load();
    await orchestrator.setStrategy(config);
    ```

- [ ] 3.2 Modify `src/tools/deleteIndex.ts`:
    ```typescript
    // Before deleting index
    await orchestrator?.stop();

    // Delete dirty-files.json
    const dirtyFilesPath = getDirtyFilesPath(indexPath);
    if (fs.existsSync(dirtyFilesPath)) {
      await fs.promises.unlink(dirtyFilesPath);
    }
    ```

- [ ] 3.3 Import getDirtyFilesPath in deleteIndex

## Resources

- Plan: `/docs/indexing-strategies.md` (Phase 8)
- Tools: `src/tools/`

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

- getOrchestrator() function needs to be created/exported from server context
- Only flush for lazy strategy (realtime doesn't need it, git uses integrity)
- Could also flush for git strategy before search (optional enhancement)
- Consider adding a small delay after flush to ensure index is updated
