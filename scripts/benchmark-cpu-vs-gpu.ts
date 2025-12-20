#!/usr/bin/env npx tsx
/**
 * CPU vs GPU (DirectML) Embedding Benchmark
 *
 * This script benchmarks embedding generation performance on CPU vs GPU
 * at various chunk counts to find the crossover point where GPU becomes faster.
 *
 * Usage:
 *   npx tsx scripts/benchmark-cpu-vs-gpu.ts
 *   npx tsx scripts/benchmark-cpu-vs-gpu.ts --quick     # Fewer tests, faster
 *   npx tsx scripts/benchmark-cpu-vs-gpu.ts --full      # More data points
 *
 * Requirements:
 *   - Windows (for DirectML GPU support)
 *   - Will gracefully skip GPU tests on other platforms
 */

import {
  EmbeddingEngine,
  CODE_ENGINE_CONFIG,
  BATCH_SIZE,
  GPU_BATCH_SIZE,
  type EmbeddingEngineConfig,
} from '../src/engines/embedding.js';
import { isWindows } from '../src/engines/deviceDetection.js';

// ============================================================================
// Configuration
// ============================================================================

interface BenchmarkConfig {
  chunkSizes: number[];
  warmupChunks: number;
  runsPerSize: number;
}

const QUICK_CONFIG: BenchmarkConfig = {
  chunkSizes: [100, 500, 1000, 2000, 5000],
  warmupChunks: 50,
  runsPerSize: 1,
};

const STANDARD_CONFIG: BenchmarkConfig = {
  chunkSizes: [100, 250, 500, 1000, 2000, 3000, 5000, 7500, 10000],
  warmupChunks: 100,
  runsPerSize: 1,
};

const FULL_CONFIG: BenchmarkConfig = {
  chunkSizes: [100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000],
  warmupChunks: 100,
  runsPerSize: 2,
};

// Sample code chunks for realistic embedding tests
const SAMPLE_CHUNKS = [
  `export async function createIndex(projectPath: string): Promise<IndexResult> {
  const files = await scanProjectFiles(projectPath);
  const chunks = await chunkFiles(files);
  const embeddings = await generateEmbeddings(chunks);
  return await storeInLanceDB(embeddings);
}`,
  `interface SearchResult {
  path: string;
  content: string;
  score: number;
  lineStart: number;
  lineEnd: number;
  metadata?: ChunkMetadata;
}`,
  `The embedding engine uses BGE models for semantic search.
Code search uses bge-small-en-v1.5 with 384 dimensions.
Docs search uses bge-base-en-v1.5 with 768 dimensions.
Both models are loaded via @xenova/transformers.`,
  `async function processFileBatch(
  files: string[],
  embeddingEngine: EmbeddingEngine,
  progressCallback?: (current: number, total: number) => void
): Promise<ProcessedChunk[]> {
  const results: ProcessedChunk[] = [];
  for (let i = 0; i < files.length; i++) {
    const chunks = await chunkFile(files[i]);
    const embedded = await embeddingEngine.embedBatch(chunks.map(c => c.text));
    results.push(...chunks.map((c, idx) => ({ ...c, vector: embedded.vectors[idx] })));
    progressCallback?.(i + 1, files.length);
  }
  return results;
}`,
  `// LanceDB vector search with hybrid ranking
const results = await table
  .search(queryVector)
  .limit(topK * 2)  // Over-fetch for reranking
  .execute();

// Apply RRF fusion with keyword scores
const reranked = applyRRFFusion(results, keywordScores, { vectorWeight: 0.7 });
return reranked.slice(0, topK);`,
  `/**
 * File watcher using chokidar for real-time index updates.
 * Debounces rapid changes and batches updates for efficiency.
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private pendingChanges: Map<string, ChangeType> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;

  async start(projectPath: string, onChange: (changes: FileChange[]) => void): Promise<void> {
    this.watcher = chokidar.watch(projectPath, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });
  }
}`,
];

// ============================================================================
// Benchmark Runner
// ============================================================================

interface BenchmarkResult {
  device: 'cpu' | 'gpu';
  chunkCount: number;
  totalTimeMs: number;
  chunksPerSecond: number;
  batchSize: number;
  initTimeMs?: number;
}

/**
 * Generate synthetic chunks for benchmarking
 */
function generateChunks(count: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    // Rotate through sample chunks and add variation
    const base = SAMPLE_CHUNKS[i % SAMPLE_CHUNKS.length];
    chunks.push(`// Chunk ${i + 1}\n${base}\n// End chunk ${i + 1}`);
  }
  return chunks;
}

/**
 * Run benchmark for a specific device and chunk count
 */
async function runBenchmark(
  device: 'cpu' | 'gpu',
  chunkCount: number
): Promise<BenchmarkResult> {
  // Create config with explicit device setting
  const config: EmbeddingEngineConfig = {
    ...CODE_ENGINE_CONFIG,
    device: device === 'gpu' ? 'dml' : 'cpu',
  };

  const engine = new EmbeddingEngine(config);
  const chunks = generateChunks(chunkCount);

  // Measure initialization
  const initStart = Date.now();
  await engine.initialize();
  const initTimeMs = Date.now() - initStart;

  // Measure embedding time
  const embedStart = Date.now();
  await engine.embedBatch(chunks);
  const embedTimeMs = Date.now() - embedStart;

  const totalTimeMs = initTimeMs + embedTimeMs;
  const chunksPerSecond = chunkCount / (totalTimeMs / 1000);

  return {
    device,
    chunkCount,
    totalTimeMs,
    chunksPerSecond,
    batchSize: device === 'gpu' ? GPU_BATCH_SIZE : BATCH_SIZE,
    initTimeMs,
  };
}

/**
 * Run warmup to ensure models are downloaded and cached
 */
async function runWarmup(warmupChunks: number): Promise<void> {
  console.log('\n🔥 Warming up (downloading models if needed)...\n');

  // Warmup CPU
  console.log('   CPU warmup...');
  const cpuConfig: EmbeddingEngineConfig = { ...CODE_ENGINE_CONFIG, device: 'cpu' };
  const cpuEngine = new EmbeddingEngine(cpuConfig);
  await cpuEngine.initialize();
  await cpuEngine.embedBatch(generateChunks(warmupChunks));
  console.log('   ✓ CPU ready');

  // Warmup GPU (if available)
  if (isWindows()) {
    console.log('   GPU warmup (DirectML shader compilation)...');
    const gpuConfig: EmbeddingEngineConfig = { ...CODE_ENGINE_CONFIG, device: 'dml' };
    const gpuEngine = new EmbeddingEngine(gpuConfig);
    await gpuEngine.initialize();
    await gpuEngine.embedBatch(generateChunks(warmupChunks));
    console.log('   ✓ GPU ready');
  }

  console.log('');
}

/**
 * Format time in human-readable format
 */
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Print results table
 */
function printResults(results: BenchmarkResult[]): void {
  console.log('\n' + '═'.repeat(85));
  console.log(' CPU vs GPU Benchmark Results');
  console.log('═'.repeat(85));

  // Group by chunk count
  const byChunkCount = new Map<number, { cpu?: BenchmarkResult; gpu?: BenchmarkResult }>();
  for (const r of results) {
    const existing = byChunkCount.get(r.chunkCount) || {};
    if (r.device === 'cpu') existing.cpu = r;
    else existing.gpu = r;
    byChunkCount.set(r.chunkCount, existing);
  }

  // Header
  console.log(
    '\n' +
      'Chunks'.padStart(8) +
      ' │ ' +
      'CPU Time'.padStart(10) +
      ' │ ' +
      'CPU c/s'.padStart(8) +
      ' │ ' +
      'GPU Time'.padStart(10) +
      ' │ ' +
      'GPU c/s'.padStart(8) +
      ' │ ' +
      'Winner'.padStart(8) +
      ' │ ' +
      'Diff'.padStart(8)
  );
  console.log('─'.repeat(85));

  let crossoverPoint: number | null = null;
  let prevWinner: 'cpu' | 'gpu' | null = null;

  // Sort by chunk count
  const sortedCounts = Array.from(byChunkCount.keys()).sort((a, b) => a - b);

  for (const count of sortedCounts) {
    const { cpu, gpu } = byChunkCount.get(count)!;

    const cpuTime = cpu ? formatTime(cpu.totalTimeMs) : 'N/A';
    const cpuCps = cpu ? cpu.chunksPerSecond.toFixed(1) : 'N/A';
    const gpuTime = gpu ? formatTime(gpu.totalTimeMs) : 'N/A';
    const gpuCps = gpu ? gpu.chunksPerSecond.toFixed(1) : 'N/A';

    let winner = 'N/A';
    let diff = 'N/A';

    if (cpu && gpu) {
      if (cpu.totalTimeMs < gpu.totalTimeMs) {
        winner = 'CPU';
        const pct = ((gpu.totalTimeMs - cpu.totalTimeMs) / gpu.totalTimeMs) * 100;
        diff = `${pct.toFixed(0)}% faster`;
      } else {
        winner = 'GPU';
        const pct = ((cpu.totalTimeMs - gpu.totalTimeMs) / cpu.totalTimeMs) * 100;
        diff = `${pct.toFixed(0)}% faster`;
      }

      // Detect crossover
      const currentWinner = cpu.totalTimeMs < gpu.totalTimeMs ? 'cpu' : 'gpu';
      if (prevWinner && prevWinner !== currentWinner && !crossoverPoint) {
        crossoverPoint = count;
      }
      prevWinner = currentWinner;
    }

    console.log(
      count.toString().padStart(8) +
        ' │ ' +
        cpuTime.padStart(10) +
        ' │ ' +
        cpuCps.padStart(8) +
        ' │ ' +
        gpuTime.padStart(10) +
        ' │ ' +
        gpuCps.padStart(8) +
        ' │ ' +
        winner.padStart(8) +
        ' │ ' +
        diff.padStart(8)
  );
  }

  console.log('─'.repeat(85));

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   CPU batch size: ${BATCH_SIZE}`);
  console.log(`   GPU batch size: ${GPU_BATCH_SIZE}`);

  if (crossoverPoint) {
    console.log(`\n   🎯 Crossover point detected: ~${crossoverPoint} chunks`);
    console.log(`      GPU becomes faster than CPU at approximately ${crossoverPoint} chunks`);
  } else {
    // Check if GPU was always faster or always slower
    const firstResult = byChunkCount.get(sortedCounts[0]);
    if (firstResult?.cpu && firstResult?.gpu) {
      if (firstResult.cpu.totalTimeMs < firstResult.gpu.totalTimeMs) {
        console.log('\n   ⚠️  CPU was faster at all tested chunk counts');
        console.log('      Consider testing with larger chunk counts to find crossover');
      } else {
        console.log('\n   ✓ GPU was faster at all tested chunk counts');
      }
    }
  }

  console.log('\n' + '═'.repeat(85) + '\n');
}

/**
 * Main benchmark runner
 */
async function main(): Promise<void> {
  console.log('\n🔬 CPU vs GPU Embedding Benchmark');
  console.log('═'.repeat(50));

  // Parse args
  const args = process.argv.slice(2);
  let config: BenchmarkConfig;
  if (args.includes('--quick')) {
    config = QUICK_CONFIG;
    console.log('   Mode: Quick (fewer data points)');
  } else if (args.includes('--full')) {
    config = FULL_CONFIG;
    console.log('   Mode: Full (comprehensive)');
  } else {
    config = STANDARD_CONFIG;
    console.log('   Mode: Standard');
  }

  console.log(`   Chunk sizes: ${config.chunkSizes.join(', ')}`);
  console.log(`   Runs per size: ${config.runsPerSize}`);

  // Check GPU availability
  const hasGPU = isWindows();
  if (!hasGPU) {
    console.log('\n⚠️  Not running on Windows - GPU (DirectML) tests will be skipped');
    console.log('   Only CPU benchmarks will be run');
  }

  // Run warmup
  await runWarmup(config.warmupChunks);

  // Run benchmarks
  const results: BenchmarkResult[] = [];
  const totalTests = config.chunkSizes.length * config.runsPerSize * (hasGPU ? 2 : 1);
  let testNum = 0;

  for (const chunkCount of config.chunkSizes) {
    for (let run = 0; run < config.runsPerSize; run++) {
      // CPU test
      testNum++;
      process.stdout.write(`\r   [${testNum}/${totalTests}] Testing CPU with ${chunkCount} chunks...`);
      const cpuResult = await runBenchmark('cpu', chunkCount);
      results.push(cpuResult);

      // GPU test (if available)
      if (hasGPU) {
        testNum++;
        process.stdout.write(`\r   [${testNum}/${totalTests}] Testing GPU with ${chunkCount} chunks...`);
        const gpuResult = await runBenchmark('gpu', chunkCount);
        results.push(gpuResult);
      }
    }
  }

  console.log('\r   ' + ' '.repeat(60)); // Clear progress line

  // Print results
  printResults(results);

  // Recommendations
  console.log('💡 Recommendations:');

  // Find where CPU is faster
  const cpuFasterAt = results
    .filter((r) => r.device === 'cpu')
    .filter((cpuR) => {
      const gpuR = results.find((r) => r.device === 'gpu' && r.chunkCount === cpuR.chunkCount);
      return gpuR && cpuR.totalTimeMs < gpuR.totalTimeMs;
    })
    .map((r) => r.chunkCount);

  if (cpuFasterAt.length > 0) {
    const maxCpuFaster = Math.max(...cpuFasterAt);
    console.log(`   • Use CPU for codebases with <${maxCpuFaster} chunks (faster)`);
    console.log(`   • Consider GPU for codebases with >${maxCpuFaster} chunks`);
  } else if (hasGPU) {
    console.log('   • GPU was faster at all tested sizes - use GPU');
  } else {
    console.log('   • GPU not available on this platform - using CPU');
  }

  console.log('\n');
}

// Run
main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
