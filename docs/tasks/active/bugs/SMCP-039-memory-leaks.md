---
task_id: "SMCP-039"
title: "Memory Leak Fixes"
category: "Technical"
priority: "P1"
status: "not-started"
created_date: "2024-12-09"
due_date: ""
estimated_hours: 6
actual_hours: 0
assigned_to: "Team"
tags: ["high", "memory", "performance", "leak", "oom"]
---

# Task: Memory Leak Fixes

## Overview

Fix memory leaks that can cause OOM crashes during indexing of large projects. Issues include unbounded array growth, tensor memory not being released, and unbounded query results.

## Bugs Addressed

- **Bug #9**: Memory Leak in IndexManager Batch Processing (`indexManager.ts:261-360`)
- **Bug #10**: Embedding Engine Tensor Memory Leak (`embedding.ts:254-317`)
- **Bug #11**: Unbounded Query in getIndexedFiles() (`lancedb.ts:472`)
- **Bug #14**: Embedding Engine Partial Initialization (`embedding.ts:105-126`)
- **MCP-26**: Multi-GB File Memory Explosion (`chunking.ts`)
- **MCP-22**: No Graceful Degradation on Low Memory

## Goals

- [ ] Fix tensor disposal in embedding engine
- [ ] Add pagination to unbounded queries
- [ ] Implement streaming for large file processing
- [ ] Add memory monitoring and graceful degradation

## Success Criteria

- Indexing large projects (10k+ files) doesn't OOM
- Tensor memory is properly disposed
- Query results are paginated/limited
- Memory usage stays under reasonable bounds
- Build and all tests pass

## Dependencies

**Blocked by:** None

**Blocks:** None

**Related:**
- SMCP-036: Concurrency & Mutex (both modify lancedb.ts)

## Subtasks

### Phase 1: Fix Embedding Tensor Disposal (1.5 hours)

- [ ] 1.1 Update `embedBatch()` in `src/engines/embedding.ts:254-317`
    ```typescript
    for (const text of batch) {
      try {
        const output = await this.pipeline(text, {
          pooling: 'mean',
          normalize: true,
        });
        const vector = Array.from(output.data as Float32Array);
        vectors.push(vector);

        // Dispose tensor to free memory
        if (output.dispose && typeof output.dispose === 'function') {
          output.dispose();
        }
      } catch (error) {
        // Log but continue with zero vector
        logger.warn('EmbeddingEngine', 'Failed to embed text', { error });
        vectors.push(new Array(EMBEDDING_DIMENSION).fill(0));
      }
    }
    ```

- [ ] 1.2 Fix partial initialization state (`embedding.ts:105-126`)
    - Ensure pipeline is fully reset on initialization failure
    - Clear any partial state

### Phase 2: Paginate LanceDB Queries (1 hour)

- [ ] 2.1 Update `getIndexedFiles()` in `src/storage/lancedb.ts:472`
    ```typescript
    async getIndexedFiles(limit: number = 10000): Promise<string[]> {
      if (!this.table) {
        return [];
      }

      const table = await this.getTable();
      const uniquePaths = new Set<string>();
      let offset = 0;
      const batchSize = 1000;

      while (uniquePaths.size < limit) {
        const results = await table
          .filter('true')
          .select(['path'])
          .limit(batchSize)
          .offset(offset)
          .execute<{ path: string }>();

        if (results.length === 0) break;

        for (const result of results) {
          uniquePaths.add(result.path);
          if (uniquePaths.size >= limit) break;
        }
        offset += batchSize;
      }

      return Array.from(uniquePaths).sort();
    }
    ```

- [ ] 2.2 Apply same pattern to `src/storage/docsLancedb.ts`

### Phase 3: Stream Large Files (2 hours)

- [ ] 3.1 Add file size check in `chunkFile()` (`src/engines/chunking.ts`)
    ```typescript
    const MAX_IN_MEMORY_SIZE = 10 * 1024 * 1024; // 10MB

    // Check file size first
    const stats = await fs.promises.stat(absolutePath);
    if (stats.size > MAX_IN_MEMORY_SIZE) {
      logger.warn('Chunking', 'Large file, using streaming', {
        path: relativePath,
        size: stats.size,
      });
      return await chunkLargeFile(absolutePath, relativePath, options);
    }
    ```

- [ ] 3.2 Implement `chunkLargeFile()` with streaming
    - Read file in chunks using `fs.createReadStream()`
    - Process incrementally to avoid memory spike

### Phase 4: Memory Monitoring (1.5 hours)

- [ ] 4.1 Add memory usage logging during indexing
    ```typescript
    function logMemoryUsage(phase: string): void {
      const used = process.memoryUsage();
      logger.debug('Memory', phase, {
        heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(used.rss / 1024 / 1024) + 'MB',
      });
    }
    ```

- [ ] 4.2 Add adaptive batch sizing based on available memory
- [ ] 4.3 Add early warning when heap usage is high

## Resources

- [Bug Hunt Report](../../../bug-hunt.md) - Full vulnerability details
- [Node.js Memory Management](https://nodejs.org/api/process.html#processmemoryusage)
- [@xenova/transformers Tensor Disposal](https://huggingface.co/docs/transformers.js/)

## Acceptance Checklist

Before marking this task complete:

- [ ] All subtasks completed
- [ ] All success criteria met
- [ ] Embedding tensors disposed after use
- [ ] `getIndexedFiles()` paginated
- [ ] Large files processed with streaming
- [ ] Memory monitoring added
- [ ] Tested with large project (1000+ files)
- [ ] `npm run build` passes
- [ ] `npm run test` passes

## Progress Log

### 2024-12-09 - 0 hours

- Task created from bug hunt findings

## Notes

- V8 garbage collection may not immediately free disposed tensors
- Consider manual GC hints: `global.gc()` (requires --expose-gc flag)
- Monitor memory during CI tests to catch regressions
- Large file streaming may affect chunking quality (needs testing)

## Blockers

_None currently identified_
