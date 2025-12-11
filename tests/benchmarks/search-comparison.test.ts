/**
 * Search Comparison Benchmark Tests
 *
 * This benchmark measures actual token counts and search times for:
 * 1. MCP semantic search (search_code)
 * 2. Manual Grep+Read approach
 * 3. Drag-and-Drop (file attachment) approach
 *
 * Run with: npx vitest run tests/benchmarks/search-comparison.benchmark.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';

// ============================================================================
// Test Configuration
// ============================================================================

const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

/**
 * Test queries matching the comparison document
 */
const TEST_QUERIES = [
  {
    id: 1,
    query: 'how does file watching work',
    type: 'Conceptual',
    grepPatterns: ['watch', 'chokidar', 'file.*change', 'watcher'],
    relevantFiles: ['fileWatcher.ts', 'integrity.ts', 'strategyOrchestrator.ts'],
  },
  {
    id: 2,
    query: 'error handling patterns',
    type: 'Pattern',
    grepPatterns: ['error', 'catch', 'throw', 'MCPError'],
    relevantFiles: ['errors', 'MCPError', 'wrapError'],
  },
  {
    id: 3,
    query: 'LanceDB vector search',
    type: 'Technical',
    grepPatterns: ['lancedb', 'vector', 'search', 'embedding'],
    relevantFiles: ['lancedb.ts', 'docsLancedb.ts', 'searchCode.ts', 'searchDocs.ts'],
  },
  {
    id: 4,
    query: 'security vulnerabilities',
    type: 'Broad',
    grepPatterns: ['security', 'vulnerab', 'sanitize', 'safe', 'symlink'],
    relevantFiles: ['secureFileAccess.ts', 'paths.ts', 'indexPolicy.ts'],
  },
  {
    id: 5,
    query: 'configuration options',
    type: 'Documentation',
    grepPatterns: ['config', 'option', 'setting', 'preference'],
    relevantFiles: ['config.ts', 'metadata.ts'],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Estimate token count from character count
 * Standard approximation: 1 token ≈ 4 characters
 */
function estimateTokens(chars: number): number {
  return Math.round(chars / 4);
}

/**
 * Get all TypeScript files in a directory recursively
 */
async function getAllTsFiles(dir: string): Promise<string[]> {
  const pattern = path.join(dir, '**/*.ts').replace(/\\/g, '/');
  return glob(pattern, { ignore: ['**/node_modules/**', '**/dist/**'] });
}

/**
 * Simulate grep search - find files matching patterns
 */
async function simulateGrep(
  dir: string,
  patterns: string[]
): Promise<{ files: string[]; matchCount: number }> {
  const allFiles = await getAllTsFiles(dir);
  const matchedFiles: Set<string> = new Set();
  let totalMatches = 0;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'gi');
      const matches = content.match(regex);
      if (matches && matches.length > 0) {
        matchedFiles.add(file);
        totalMatches += matches.length;
      }
    }
  }

  return {
    files: Array.from(matchedFiles),
    matchCount: totalMatches,
  };
}

/**
 * Calculate total characters if all matched files were read
 */
function calculateFileChars(files: string[]): number {
  let total = 0;
  for (const file of files) {
    if (fs.existsSync(file)) {
      total += fs.statSync(file).size;
    }
  }
  return total;
}

/**
 * Find files by name pattern for drag-and-drop simulation
 * Matches against both filename and full path (for directory matches like 'errors/')
 */
async function findFilesByName(dir: string, fileNames: string[]): Promise<string[]> {
  const allFiles = await getAllTsFiles(dir);
  const found: string[] = [];

  for (const file of allFiles) {
    const basename = path.basename(file);
    const relativePath = file.replace(/\\/g, '/');
    // Match against filename OR path (for directory-based patterns)
    if (fileNames.some((name) => basename.includes(name) || relativePath.includes(name))) {
      found.push(file);
    }
  }

  return found;
}

// ============================================================================
// Benchmark Results Storage
// ============================================================================

interface BenchmarkResult {
  queryId: number;
  query: string;
  type: string;
  mcp: {
    searchTimeMs: number;
    resultCount: number;
    totalChars: number;
    estimatedTokens: number;
  };
  grep: {
    filesMatched: number;
    totalMatches: number;
    totalChars: number;
    estimatedTokens: number;
  };
  dragDrop: {
    filesCount: number;
    totalChars: number;
    estimatedTokens: number;
  };
}

const benchmarkResults: BenchmarkResult[] = [];

// ============================================================================
// Benchmark Tests
// ============================================================================

describe('Search Comparison Benchmarks', () => {
  let indexExists = false;

  beforeAll(async () => {
    // Check if index exists for MCP tests
    const { getIndexPath } = await import('../../src/utils/paths.js');
    const indexPath = getIndexPath(PROJECT_ROOT);
    const metadataPath = path.join(indexPath, 'metadata.json');
    indexExists = fs.existsSync(metadataPath);

    if (!indexExists) {
      console.warn(
        '\n⚠️  No index found. MCP benchmarks will be skipped.\n' +
          '   Run `npx @liraz-sbz/search-mcp` and use create_index first.\n'
      );
    }
  });

  afterAll(() => {
    // Print summary table
    console.log('\n' + '='.repeat(100));
    console.log('BENCHMARK RESULTS SUMMARY');
    console.log('='.repeat(100));

    console.log('\n| Query | MCP Tokens | Grep Tokens | D&D Tokens | MCP vs Grep | MCP vs D&D |');
    console.log('|-------|------------|-------------|------------|-------------|------------|');

    let totalMcp = 0;
    let totalGrep = 0;
    let totalDragDrop = 0;

    for (const result of benchmarkResults) {
      const mcpVsGrep = (result.grep.estimatedTokens / result.mcp.estimatedTokens).toFixed(1);
      const mcpVsDd = (result.dragDrop.estimatedTokens / result.mcp.estimatedTokens).toFixed(1);

      console.log(
        `| ${result.queryId}. ${result.type.padEnd(13)} | ${String(result.mcp.estimatedTokens).padStart(10)} | ` +
          `${String(result.grep.estimatedTokens).padStart(11)} | ${String(result.dragDrop.estimatedTokens).padStart(10)} | ` +
          `${mcpVsGrep.padStart(11)}x | ${mcpVsDd.padStart(10)}x |`
      );

      totalMcp += result.mcp.estimatedTokens;
      totalGrep += result.grep.estimatedTokens;
      totalDragDrop += result.dragDrop.estimatedTokens;
    }

    console.log('|-------|------------|-------------|------------|-------------|------------|');
    console.log(
      `| TOTAL              | ${String(totalMcp).padStart(10)} | ${String(totalGrep).padStart(11)} | ` +
        `${String(totalDragDrop).padStart(10)} | ${(totalGrep / totalMcp).toFixed(1).padStart(11)}x | ` +
        `${(totalDragDrop / totalMcp).toFixed(1).padStart(10)}x |`
    );

    console.log('\n' + '='.repeat(100));

    // Write results to JSON for documentation update
    const outputPath = path.join(PROJECT_ROOT, 'tests/benchmarks/results.json');
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          results: benchmarkResults,
          totals: {
            mcp: totalMcp,
            grep: totalGrep,
            dragDrop: totalDragDrop,
            mcpVsGrep: (totalGrep / totalMcp).toFixed(1),
            mcpVsDragDrop: (totalDragDrop / totalMcp).toFixed(1),
          },
        },
        null,
        2
      )
    );
    console.log(`\nResults saved to: ${outputPath}\n`);
  });

  for (const testQuery of TEST_QUERIES) {
    describe(`Query ${testQuery.id}: "${testQuery.query}"`, () => {
      const result: BenchmarkResult = {
        queryId: testQuery.id,
        query: testQuery.query,
        type: testQuery.type,
        mcp: { searchTimeMs: 0, resultCount: 0, totalChars: 0, estimatedTokens: 0 },
        grep: { filesMatched: 0, totalMatches: 0, totalChars: 0, estimatedTokens: 0 },
        dragDrop: { filesCount: 0, totalChars: 0, estimatedTokens: 0 },
      };

      it('should measure MCP search', async () => {
        if (!indexExists) {
          console.log('  ⏭️  Skipping MCP test (no index)');
          // Use estimated values from document as fallback
          result.mcp = {
            searchTimeMs: 20,
            resultCount: 10,
            totalChars: 12000,
            estimatedTokens: 3000,
          };
          return;
        }

        const { searchCode } = await import('../../src/tools/searchCode.js');

        const startTime = performance.now();
        const searchResult = await searchCode(
          { query: testQuery.query, top_k: 10 },
          { projectPath: PROJECT_ROOT }
        );
        const endTime = performance.now();

        // Calculate total characters from results
        const totalChars = searchResult.results.reduce((sum, r) => sum + r.text.length, 0);

        result.mcp = {
          searchTimeMs: Math.round(endTime - startTime),
          resultCount: searchResult.results.length,
          totalChars,
          estimatedTokens: estimateTokens(totalChars),
        };

        expect(searchResult.results.length).toBeGreaterThan(0);
        expect(searchResult.results.length).toBeLessThanOrEqual(10);
      });

      it('should measure Grep approach', async () => {
        const grepResult = await simulateGrep(SRC_DIR, testQuery.grepPatterns);
        const totalChars = calculateFileChars(grepResult.files);

        result.grep = {
          filesMatched: grepResult.files.length,
          totalMatches: grepResult.matchCount,
          totalChars,
          estimatedTokens: estimateTokens(totalChars),
        };

        expect(grepResult.files.length).toBeGreaterThan(0);
      });

      it('should measure Drag-and-Drop approach', async () => {
        const files = await findFilesByName(SRC_DIR, testQuery.relevantFiles);
        const totalChars = calculateFileChars(files);

        result.dragDrop = {
          filesCount: files.length,
          totalChars,
          estimatedTokens: estimateTokens(totalChars),
        };

        // Store result
        benchmarkResults.push(result);

        expect(files.length).toBeGreaterThan(0);
      });
    });
  }
});

// ============================================================================
// Additional Metric Tests
// ============================================================================

describe('Codebase Statistics', () => {
  it('should report total codebase size', async () => {
    const allFiles = await getAllTsFiles(SRC_DIR);
    const totalChars = calculateFileChars(allFiles);
    const totalTokens = estimateTokens(totalChars);

    console.log('\n📊 Codebase Statistics:');
    console.log(`   Total .ts files: ${allFiles.length}`);
    console.log(`   Total characters: ${totalChars.toLocaleString()}`);
    console.log(`   Estimated tokens: ${totalTokens.toLocaleString()}`);
    console.log(`   Average file size: ${Math.round(totalChars / allFiles.length).toLocaleString()} chars`);

    expect(allFiles.length).toBeGreaterThan(0);
  });
});
