# CPU vs GPU (DirectML) Embedding Benchmark Report

**Date:** 2024-12-20
**System:** Windows (DirectML GPU)
**Model:** Xenova/bge-small-en-v1.5 (384 dimensions)

## Executive Summary

~~CPU embedding is **4x faster** than DirectML GPU across all tested chunk sizes (100-5000).~~

**UPDATE (SMCP-103):** After fixing the batch processing bug, **GPU is now 10-25% faster than CPU** at all tested chunk sizes. The issue was that embeddings were being processed one text at a time instead of true batch processing.

---

## SMCP-103: True Batch Processing Fix

### The Bug

The original `embedBatchWithStats()` processed texts **one at a time** in a loop:

```typescript
// BEFORE: One pipeline call per text (64 GPU transfers per "batch")
for (let j = 0; j < batch.length; j++) {
  output = await this.pipeline(batch[j], { pooling: 'mean', normalize: true });
}
```

### The Fix

Pass the entire batch array to the pipeline in a single call:

```typescript
// AFTER: One pipeline call for entire batch (1 GPU transfer per batch)
batchOutput = await this.pipeline(textsWithPrefix, { pooling: 'mean', normalize: true });
```

### Impact

| Metric | Before Fix | After Fix | Improvement |
|--------|------------|-----------|-------------|
| GPU throughput | 8 c/s | 22-26 c/s | **3x faster** |
| GPU vs CPU | 4x slower | 10-25% faster | **GPU now wins** |
| GPU transfers/batch | 64 | 1 | **64x fewer** |

---

## Benchmark Results (After Fix)

| Chunks | CPU Time | CPU c/s | GPU Time | GPU c/s | Winner | Difference |
|--------|----------|---------|----------|---------|--------|------------|
| 100    | 5.6s     | 17.8    | 4.5s     | 22.4    | **GPU** | 21% faster |
| 500    | 25.7s    | 19.5    | 21.8s    | 22.9    | **GPU** | 15% faster |
| 1000   | 51.0s    | 19.6    | 45.8s    | 21.8    | **GPU** | 10% faster |
| 2000   | 1.7m     | 20.2    | 1.3m     | 25.6    | **GPU** | 21% faster |
| 5000   | 4.2m     | 19.9    | 3.3m     | 24.9    | **GPU** | 20% faster |

## Benchmark Results (Before Fix - Historical)

| Chunks | CPU Time | CPU c/s | GPU Time | GPU c/s | Winner | Difference |
|--------|----------|---------|----------|---------|--------|------------|
| 100    | 3.7s     | 27.2    | 14.3s    | 7.0     | CPU    | 74% faster |
| 500    | 16.6s    | 30.1    | 1.1m     | 7.9     | CPU    | 74% faster |
| 1000   | 34.2s    | 29.2    | 2.1m     | 7.9     | CPU    | 73% faster |
| 2000   | 1.1m     | 31.5    | 4.2m     | 7.9     | CPU    | 75% faster |
| 5000   | 2.6m     | 32.5    | 9.9m     | 8.4     | CPU    | 74% faster |

### Throughput Comparison (After Fix)

- **CPU:** 18-20 chunks/second (consistent across all sizes)
- **GPU:** 22-26 chunks/second (consistent across all sizes)
- **Ratio:** GPU is 10-25% faster than CPU

### Throughput Comparison (Before Fix - Historical)

- **CPU:** 30-33 chunks/second (consistent across all sizes)
- **GPU:** 7-8 chunks/second (consistent across all sizes)
- **Ratio:** CPU was ~4x faster than GPU

### Batch Sizes

- CPU batch size: 32 texts
- GPU batch size: 64 texts (larger batches don't help)

## Real-World Impact

User's actual indexing test (366 files, ~2,749 chunks):
- **CPU:** 6m 57s (417 seconds)
- **GPU:** 9m 4s (544 seconds)
- **Result:** GPU was 30% slower

This matches our benchmark findings.

## Key Findings

1. **No crossover point exists** - GPU never beats CPU, even at 5000 chunks
2. **GPU throughput is abnormally low** - 8 c/s suggests possible inefficiency
3. **CPU scales linearly** - Performance stays consistent as chunk count grows
4. **GPU overhead dominates** - Transfer overhead never gets amortized

## ONNX Runtime Warnings

During GPU runs, this warning appears:
```
Some nodes were not assigned to the preferred execution providers which may
or may not have an negative impact on performance. e.g. ORT explicitly
assigns shape related ops to CPU to improve perf.
```

This suggests some operations fall back to CPU, causing hybrid execution overhead.

## Possible Causes of GPU Slowness

1. **Small model size** - BGE-small (90MB) may not benefit from GPU parallelization
2. **Hybrid execution** - Some ops on CPU, some on GPU = transfer overhead
3. **DirectML overhead** - Generic API may not be optimized for this workload
4. **Batch processing inefficiency** - Per-batch GPU transfer may dominate compute
5. **Missing optimizations** - ONNX model may not be optimized for DirectML

## Options

### Option 1: Remove GPU Option Entirely
- **Pros:** Simplest solution, no user confusion
- **Cons:** Loses future potential if GPU perf improves

### Option 2: Keep GPU but Default to CPU (Recommended)
- **Pros:** Preserves choice, clear documentation
- **Cons:** Users may still choose slower option

### Option 3: Auto-select CPU Always
- **Pros:** Best performance guaranteed
- **Cons:** GPU code becomes dead code

### Option 4: Investigate GPU Slowness
- **Pros:** Could unlock 4x performance gain if fixable
- **Cons:** May be fundamental limitation, time investment

## Recommendations (Updated After Fix)

### GPU is Now Recommended

After fixing the batch processing bug (SMCP-103), **GPU is the recommended default** on Windows:

1. **GPU (DirectML):** 10-25% faster than CPU at all tested sizes
2. **Consistent performance:** 22-26 chunks/sec on GPU vs 18-20 on CPU
3. **No crossover point needed:** GPU wins immediately

### Documentation Changes

**Before:**
> DirectML GPU acceleration may be slower than CPU for small-to-medium codebases (<5000 chunks)

**After:**
> GPU (DirectML) is recommended on Windows. True batch processing provides 10-25% faster indexing than CPU.

### Key Learnings

1. **True batch processing is critical** - Passing array to pipeline vs looping one-by-one
2. **GPU transfer overhead is per-call** - Minimize pipeline calls, maximize batch sizes
3. **64x fewer GPU transfers** - From 64 calls per batch to 1 call per batch

## Benchmark Script

Location: `scripts/benchmark-cpu-vs-gpu.ts`

```bash
# Quick benchmark (5 sizes, ~20 min)
npx tsx scripts/benchmark-cpu-vs-gpu.ts --quick

# Standard benchmark (9 sizes, ~40 min)
npx tsx scripts/benchmark-cpu-vs-gpu.ts

# Full benchmark (13 sizes, ~2 hours)
npx tsx scripts/benchmark-cpu-vs-gpu.ts --full
```

## Conclusion

~~**CPU should be the default and recommended option.** The current DirectML GPU implementation provides no performance benefit and is significantly slower.~~

**UPDATE:** After fixing the batch processing bug (SMCP-103), **GPU (DirectML) is now the recommended option** on Windows. The fix improved GPU throughput from 8 c/s to 22-26 c/s, making it 10-25% faster than CPU across all tested chunk sizes.

The root cause was simple: the code was calling the pipeline once per text instead of passing the entire batch as an array. This caused 64x more GPU transfers than necessary per batch.
