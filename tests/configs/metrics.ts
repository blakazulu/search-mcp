/**
 * Metrics Collector for Config Matrix Testing
 *
 * Provides utilities for collecting quality, performance, and efficiency metrics
 * during configuration matrix tests. Tracks search latency, token counts,
 * precision, memory usage, and more.
 *
 * @module tests/configs/metrics
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Query type classification for analysis
 */
export type QueryType =
  | 'Conceptual'
  | 'Pattern'
  | 'Technical'
  | 'Broad'
  | 'Documentation'
  | 'Exact'
  | 'How-to'
  | 'Implementation'
  | 'API'
  | 'Conceptual-Broad';

/**
 * Relevance rating for search results
 */
export type RelevanceRating = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Metrics collected for a single search operation
 */
export interface TestMetrics {
  /** Configuration name being tested */
  configName: string;

  /** Query identifier */
  queryId: string | number;

  /** Query type classification */
  queryType: QueryType;

  /** The actual query string */
  query: string;

  /** Number of results returned */
  resultCount: number;

  /** Number of raw results before deduplication */
  rawResultCount?: number;

  /** Path of the top result */
  topResultPath: string | null;

  /** Score of the top result */
  topResultScore: number | null;

  /** Number of relevant files found in top results */
  relevanceHits: number;

  /** Precision at K=5 (relevant results in top 5 / 5) */
  precisionAt5: number;

  /** Search latency in milliseconds */
  searchLatencyMs: number;

  /** Indexing time in milliseconds (if applicable) */
  indexingTimeMs?: number;

  /** Memory usage in megabytes */
  memoryUsageMB: number;

  /** Total characters in results */
  totalChars: number;

  /** Estimated token count (chars / 4) */
  estimatedTokens: number;

  /** Average chunk size in characters */
  avgChunkSize: number;

  /** Timestamp when metric was collected */
  timestamp: number;

  /** Optional relevance rating */
  relevance?: RelevanceRating;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated metrics summary
 */
export interface MetricsSummary {
  /** Configuration name */
  configName: string;

  /** Total number of queries tested */
  queryCount: number;

  /** Average search latency in milliseconds */
  avgLatencyMs: number;

  /** Minimum search latency */
  minLatencyMs: number;

  /** Maximum search latency */
  maxLatencyMs: number;

  /** Average result count */
  avgResultCount: number;

  /** Average precision at 5 */
  avgPrecisionAt5: number;

  /** Average estimated tokens per search */
  avgTokens: number;

  /** Total tokens across all searches */
  totalTokens: number;

  /** Average memory usage */
  avgMemoryMB: number;

  /** Peak memory usage */
  peakMemoryMB: number;

  /** Average chunk size */
  avgChunkSize: number;

  /** Breakdown by query type */
  byQueryType: Record<QueryType, QueryTypeSummary>;
}

/**
 * Summary for a specific query type
 */
export interface QueryTypeSummary {
  /** Number of queries of this type */
  count: number;

  /** Average precision for this query type */
  avgPrecision: number;

  /** Average latency for this query type */
  avgLatencyMs: number;

  /** Average tokens for this query type */
  avgTokens: number;
}

/**
 * Search result for metrics collection
 */
export interface SearchResult {
  /** File path or chunk identifier */
  path: string;

  /** Result score (0-1) */
  score: number;

  /** Result text content */
  text: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate token count from character count
 * Standard approximation: 1 token ≈ 4 characters
 *
 * @param chars - Number of characters
 * @returns Estimated token count
 */
export function estimateTokens(chars: number): number {
  return Math.round(chars / 4);
}

/**
 * Get current memory usage in megabytes
 *
 * @returns Memory usage in MB
 */
export function getMemoryUsageMB(): number {
  const usage = process.memoryUsage();
  return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100;
}

/**
 * Calculate precision at K
 *
 * @param results - Array of result paths
 * @param expectedFiles - Array of expected file paths/patterns
 * @param k - Number of top results to consider
 * @returns Precision value (0-1)
 */
export function calculatePrecisionAtK(
  results: string[],
  expectedFiles: string[],
  k: number
): number {
  if (k === 0 || expectedFiles.length === 0) return 0;

  const topK = results.slice(0, k);
  let relevantCount = 0;

  for (const result of topK) {
    const normalizedResult = result.replace(/\\/g, '/').toLowerCase();
    for (const expected of expectedFiles) {
      const normalizedExpected = expected.replace(/\\/g, '/').toLowerCase();
      if (normalizedResult.includes(normalizedExpected)) {
        relevantCount++;
        break;
      }
    }
  }

  return relevantCount / k;
}

/**
 * Calculate relevance hits (how many expected files appear in results)
 *
 * @param results - Array of result paths
 * @param expectedFiles - Array of expected file paths/patterns
 * @returns Number of relevant files found
 */
export function calculateRelevanceHits(
  results: string[],
  expectedFiles: string[]
): number {
  const foundExpected = new Set<string>();

  for (const result of results) {
    const normalizedResult = result.replace(/\\/g, '/').toLowerCase();
    for (const expected of expectedFiles) {
      const normalizedExpected = expected.replace(/\\/g, '/').toLowerCase();
      if (normalizedResult.includes(normalizedExpected)) {
        foundExpected.add(expected);
      }
    }
  }

  return foundExpected.size;
}

/**
 * Determine relevance rating based on precision
 *
 * @param precisionAt5 - Precision at K=5
 * @returns Relevance rating
 */
export function getRelevanceRating(precisionAt5: number): RelevanceRating {
  if (precisionAt5 >= 0.6) return 'HIGH';
  if (precisionAt5 >= 0.3) return 'MEDIUM';
  return 'LOW';
}

// ============================================================================
// MetricsCollector Class
// ============================================================================

/**
 * Collects and aggregates metrics during config matrix testing
 *
 * @example
 * ```typescript
 * const collector = new MetricsCollector();
 *
 * // Collect metrics for a search
 * const startTime = performance.now();
 * const results = await searchCode({ query: 'authentication' });
 * const latencyMs = performance.now() - startTime;
 *
 * collector.collectSearchMetrics({
 *   configName: 'alpha-0.5',
 *   queryId: 'auth-login',
 *   queryType: 'Conceptual',
 *   query: 'authentication',
 *   results: results.results.map(r => ({ path: r.file_path, score: r.score, text: r.text })),
 *   expectedFiles: ['src/auth/login.ts'],
 *   latencyMs,
 * });
 *
 * // Get summary
 * const summary = collector.getSummary('alpha-0.5');
 * console.log(`Avg latency: ${summary.avgLatencyMs}ms`);
 * ```
 */
export class MetricsCollector {
  private metrics: TestMetrics[] = [];

  /**
   * Collect metrics for a search operation
   *
   * @param params - Search parameters and results
   */
  collectSearchMetrics(params: {
    configName: string;
    queryId: string | number;
    queryType: QueryType;
    query: string;
    results: SearchResult[];
    expectedFiles: string[];
    latencyMs: number;
    indexingTimeMs?: number;
    rawResultCount?: number;
    metadata?: Record<string, unknown>;
  }): TestMetrics {
    const {
      configName,
      queryId,
      queryType,
      query,
      results,
      expectedFiles,
      latencyMs,
      indexingTimeMs,
      rawResultCount,
      metadata,
    } = params;

    const resultPaths = results.map((r) => r.path);
    const totalChars = results.reduce((sum, r) => sum + r.text.length, 0);
    const avgChunkSize =
      results.length > 0 ? Math.round(totalChars / results.length) : 0;

    const precisionAt5 = calculatePrecisionAtK(resultPaths, expectedFiles, 5);
    const relevanceHits = calculateRelevanceHits(resultPaths, expectedFiles);

    const metric: TestMetrics = {
      configName,
      queryId,
      queryType,
      query,
      resultCount: results.length,
      rawResultCount,
      topResultPath: results[0]?.path ?? null,
      topResultScore: results[0]?.score ?? null,
      relevanceHits,
      precisionAt5,
      searchLatencyMs: Math.round(latencyMs * 100) / 100,
      indexingTimeMs,
      memoryUsageMB: getMemoryUsageMB(),
      totalChars,
      estimatedTokens: estimateTokens(totalChars),
      avgChunkSize,
      timestamp: Date.now(),
      relevance: getRelevanceRating(precisionAt5),
      metadata,
    };

    this.metrics.push(metric);
    return metric;
  }

  /**
   * Get all collected metrics
   *
   * @returns Array of all metrics
   */
  getAllMetrics(): TestMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics for a specific configuration
   *
   * @param configName - Configuration name to filter by
   * @returns Array of metrics for that config
   */
  getMetricsForConfig(configName: string): TestMetrics[] {
    return this.metrics.filter((m) => m.configName === configName);
  }

  /**
   * Get metrics for a specific query
   *
   * @param queryId - Query ID to filter by
   * @returns Array of metrics for that query
   */
  getMetricsForQuery(queryId: string | number): TestMetrics[] {
    return this.metrics.filter((m) => m.queryId === queryId);
  }

  /**
   * Get aggregated summary for a configuration
   *
   * @param configName - Configuration name
   * @returns Summary object with aggregated metrics
   */
  getSummary(configName: string): MetricsSummary {
    const configMetrics = this.getMetricsForConfig(configName);

    if (configMetrics.length === 0) {
      return {
        configName,
        queryCount: 0,
        avgLatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        avgResultCount: 0,
        avgPrecisionAt5: 0,
        avgTokens: 0,
        totalTokens: 0,
        avgMemoryMB: 0,
        peakMemoryMB: 0,
        avgChunkSize: 0,
        byQueryType: {} as Record<QueryType, QueryTypeSummary>,
      };
    }

    const latencies = configMetrics.map((m) => m.searchLatencyMs);
    const tokens = configMetrics.map((m) => m.estimatedTokens);
    const memories = configMetrics.map((m) => m.memoryUsageMB);

    // Group by query type
    const byQueryType: Record<QueryType, QueryTypeSummary> = {} as Record<
      QueryType,
      QueryTypeSummary
    >;
    const queryTypeGroups = new Map<QueryType, TestMetrics[]>();

    for (const metric of configMetrics) {
      const group = queryTypeGroups.get(metric.queryType) || [];
      group.push(metric);
      queryTypeGroups.set(metric.queryType, group);
    }

    for (const [queryType, group] of queryTypeGroups) {
      byQueryType[queryType] = {
        count: group.length,
        avgPrecision:
          group.reduce((sum, m) => sum + m.precisionAt5, 0) / group.length,
        avgLatencyMs:
          group.reduce((sum, m) => sum + m.searchLatencyMs, 0) / group.length,
        avgTokens:
          group.reduce((sum, m) => sum + m.estimatedTokens, 0) / group.length,
      };
    }

    return {
      configName,
      queryCount: configMetrics.length,
      avgLatencyMs:
        latencies.reduce((a, b) => a + b, 0) / configMetrics.length,
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      avgResultCount:
        configMetrics.reduce((sum, m) => sum + m.resultCount, 0) /
        configMetrics.length,
      avgPrecisionAt5:
        configMetrics.reduce((sum, m) => sum + m.precisionAt5, 0) /
        configMetrics.length,
      avgTokens: tokens.reduce((a, b) => a + b, 0) / configMetrics.length,
      totalTokens: tokens.reduce((a, b) => a + b, 0),
      avgMemoryMB: memories.reduce((a, b) => a + b, 0) / configMetrics.length,
      peakMemoryMB: Math.max(...memories),
      avgChunkSize:
        configMetrics.reduce((sum, m) => sum + m.avgChunkSize, 0) /
        configMetrics.length,
      byQueryType,
    };
  }

  /**
   * Get summary for all configurations
   *
   * @returns Array of summaries, one per config
   */
  getAllSummaries(): MetricsSummary[] {
    const configNames = [...new Set(this.metrics.map((m) => m.configName))];
    return configNames.map((name) => this.getSummary(name));
  }

  /**
   * Compare two configurations
   *
   * @param configA - First config name
   * @param configB - Second config name
   * @returns Comparison object
   */
  compareConfigs(
    configA: string,
    configB: string
  ): {
    configA: MetricsSummary;
    configB: MetricsSummary;
    latencyRatio: number;
    tokenRatio: number;
    precisionDiff: number;
    winner: {
      latency: string;
      tokens: string;
      precision: string;
    };
  } {
    const summaryA = this.getSummary(configA);
    const summaryB = this.getSummary(configB);

    return {
      configA: summaryA,
      configB: summaryB,
      latencyRatio: summaryA.avgLatencyMs / summaryB.avgLatencyMs,
      tokenRatio: summaryA.avgTokens / summaryB.avgTokens,
      precisionDiff: summaryA.avgPrecisionAt5 - summaryB.avgPrecisionAt5,
      winner: {
        latency:
          summaryA.avgLatencyMs < summaryB.avgLatencyMs ? configA : configB,
        tokens: summaryA.avgTokens < summaryB.avgTokens ? configA : configB,
        precision:
          summaryA.avgPrecisionAt5 > summaryB.avgPrecisionAt5
            ? configA
            : configB,
      },
    };
  }

  /**
   * Find the best configuration for a specific metric
   *
   * @param metric - Metric to optimize
   * @returns Best config name and value
   */
  findBestConfig(
    metric: 'latency' | 'tokens' | 'precision' | 'memory'
  ): { configName: string; value: number } | null {
    const summaries = this.getAllSummaries();
    if (summaries.length === 0) return null;

    let best: MetricsSummary = summaries[0];

    for (const summary of summaries) {
      switch (metric) {
        case 'latency':
          if (summary.avgLatencyMs < best.avgLatencyMs) best = summary;
          break;
        case 'tokens':
          if (summary.avgTokens < best.avgTokens) best = summary;
          break;
        case 'precision':
          if (summary.avgPrecisionAt5 > best.avgPrecisionAt5) best = summary;
          break;
        case 'memory':
          if (summary.avgMemoryMB < best.avgMemoryMB) best = summary;
          break;
      }
    }

    const valueMap = {
      latency: best.avgLatencyMs,
      tokens: best.avgTokens,
      precision: best.avgPrecisionAt5,
      memory: best.avgMemoryMB,
    };

    return {
      configName: best.configName,
      value: valueMap[metric],
    };
  }

  /**
   * Clear all collected metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Export metrics to JSON format
   *
   * @returns JSON-serializable object
   */
  toJSON(): {
    metrics: TestMetrics[];
    summaries: MetricsSummary[];
    timestamp: string;
  } {
    return {
      metrics: this.metrics,
      summaries: this.getAllSummaries(),
      timestamp: new Date().toISOString(),
    };
  }
}
