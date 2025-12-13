/**
 * Configuration Combination Generator
 *
 * Generates ~22 meaningful configuration combinations for config matrix testing.
 * Instead of testing all 360 possible combinations (3x2x2x3x5x2), we use a
 * pairwise/orthogonal approach to test the most impactful combinations.
 *
 * @module tests/configs/configCombinations
 */

import type { Config, HybridSearchConfig, FTSEnginePreference } from '../../src/storage/config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A named configuration combination for testing
 */
export interface ConfigCombination {
  /** Unique identifier for the configuration */
  name: string;

  /** Human-readable description of what this config tests */
  description: string;

  /** Category for grouping related configurations */
  category: 'baseline' | 'alpha' | 'fts' | 'strategy' | 'chunking' | 'edge-case';

  /** The configuration values to test */
  config: Partial<Config>;
}

/**
 * Indexing strategy type
 */
export type IndexingStrategy = 'realtime' | 'lazy' | 'git';

/**
 * Chunking strategy type
 */
export type ChunkingStrategy = 'character' | 'code-aware';

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default configuration values (mirrors DEFAULT_CONFIG from src/storage/config.ts)
 */
export const BASE_CONFIG: Partial<Config> = {
  include: ['**/*'],
  exclude: [],
  respectGitignore: true,
  maxFileSize: '1MB',
  maxFiles: 50000,
  docPatterns: ['**/*.md', '**/*.txt'],
  indexDocs: true,
  enhancedToolDescriptions: false,
  indexingStrategy: 'realtime',
  chunkingStrategy: 'code-aware',
  hybridSearch: {
    enabled: true,
    ftsEngine: 'auto',
    defaultAlpha: 0.5,
  },
};

/**
 * Create a config with overrides
 */
function createConfig(overrides: Partial<Config>): Partial<Config> {
  const hybridOverrides = overrides.hybridSearch
    ? { ...BASE_CONFIG.hybridSearch, ...overrides.hybridSearch }
    : BASE_CONFIG.hybridSearch;

  return {
    ...BASE_CONFIG,
    ...overrides,
    hybridSearch: hybridOverrides as HybridSearchConfig,
  };
}

// ============================================================================
// Configuration Combinations
// ============================================================================

/**
 * Baseline configurations - standard reference points
 */
export const BASELINE_CONFIGS: ConfigCombination[] = [
  {
    name: 'default',
    description: 'Default configuration with all standard settings',
    category: 'baseline',
    config: createConfig({}),
  },
  {
    name: 'all-features',
    description: 'All features enabled with optimal settings',
    category: 'baseline',
    config: createConfig({
      chunkingStrategy: 'code-aware',
      enhancedToolDescriptions: true,
      hybridSearch: {
        enabled: true,
        ftsEngine: 'native',
        defaultAlpha: 0.5,
      },
    }),
  },
  {
    name: 'minimal',
    description: 'Minimal configuration with hybrid search disabled',
    category: 'baseline',
    config: createConfig({
      indexingStrategy: 'lazy',
      hybridSearch: {
        enabled: false,
        ftsEngine: 'auto',
        defaultAlpha: 0.7,
      },
    }),
  },
];

/**
 * Alpha variations - testing different semantic/keyword balance
 */
export const ALPHA_CONFIGS: ConfigCombination[] = [
  {
    name: 'alpha-0.0',
    description: 'Pure keyword/FTS search (alpha=0.0)',
    category: 'alpha',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'auto',
        defaultAlpha: 0.0,
      },
    }),
  },
  {
    name: 'alpha-0.3',
    description: 'FTS-heavy hybrid search (alpha=0.3, 30% semantic)',
    category: 'alpha',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'auto',
        defaultAlpha: 0.3,
      },
    }),
  },
  {
    name: 'alpha-0.5',
    description: 'Balanced hybrid search (alpha=0.5, default)',
    category: 'alpha',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'auto',
        defaultAlpha: 0.5,
      },
    }),
  },
  {
    name: 'alpha-0.7',
    description: 'Semantic-heavy hybrid search (alpha=0.7)',
    category: 'alpha',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'auto',
        defaultAlpha: 0.7,
      },
    }),
  },
  {
    name: 'alpha-1.0',
    description: 'Pure semantic/vector search (alpha=1.0)',
    category: 'alpha',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'auto',
        defaultAlpha: 1.0,
      },
    }),
  },
];

/**
 * FTS engine variations - testing different full-text search backends
 */
export const FTS_ENGINE_CONFIGS: ConfigCombination[] = [
  {
    name: 'fts-auto',
    description: 'Auto-select FTS engine based on codebase and availability',
    category: 'fts',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'auto',
        defaultAlpha: 0.5,
      },
    }),
  },
  {
    name: 'fts-js',
    description: 'Force JavaScript BM25 engine (NaturalBM25Engine)',
    category: 'fts',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'js',
        defaultAlpha: 0.5,
      },
    }),
  },
  {
    name: 'fts-native',
    description: 'Force native SQLite FTS5 engine',
    category: 'fts',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'native',
        defaultAlpha: 0.5,
      },
    }),
  },
];

/**
 * Indexing strategy variations - testing different update strategies
 */
export const STRATEGY_CONFIGS: ConfigCombination[] = [
  {
    name: 'strategy-realtime',
    description: 'Real-time indexing (immediate updates)',
    category: 'strategy',
    config: createConfig({
      indexingStrategy: 'realtime',
    }),
  },
  {
    name: 'strategy-lazy',
    description: 'Lazy indexing (update on search)',
    category: 'strategy',
    config: createConfig({
      indexingStrategy: 'lazy',
    }),
  },
  {
    name: 'strategy-git',
    description: 'Git-based indexing (update on commit)',
    category: 'strategy',
    config: createConfig({
      indexingStrategy: 'git',
    }),
  },
];

/**
 * Chunking strategy variations - testing different text splitting approaches
 */
export const CHUNKING_CONFIGS: ConfigCombination[] = [
  {
    name: 'chunking-character',
    description: 'Character-based chunking (fixed size)',
    category: 'chunking',
    config: createConfig({
      chunkingStrategy: 'character',
    }),
  },
  {
    name: 'chunking-code-aware',
    description: 'Code-aware chunking (semantic boundaries, default)',
    category: 'chunking',
    config: createConfig({
      chunkingStrategy: 'code-aware',
    }),
  },
];

/**
 * Edge case combinations - testing unusual but valid configurations
 */
export const EDGE_CASE_CONFIGS: ConfigCombination[] = [
  {
    name: 'lazy-code-aware',
    description: 'Lazy indexing with code-aware chunking',
    category: 'edge-case',
    config: createConfig({
      indexingStrategy: 'lazy',
      chunkingStrategy: 'code-aware',
    }),
  },
  {
    name: 'git-native',
    description: 'Git-based indexing with native FTS engine',
    category: 'edge-case',
    config: createConfig({
      indexingStrategy: 'git',
      hybridSearch: {
        enabled: true,
        ftsEngine: 'native',
        defaultAlpha: 0.5,
      },
    }),
  },
  {
    name: 'vector-only',
    description: 'Pure vector search with hybrid disabled',
    category: 'edge-case',
    config: createConfig({
      hybridSearch: {
        enabled: false,
        ftsEngine: 'auto',
        defaultAlpha: 0.5,
      },
    }),
  },
  {
    name: 'fts-only-native',
    description: 'FTS-only with native engine (alpha=0.0)',
    category: 'edge-case',
    config: createConfig({
      hybridSearch: {
        enabled: true,
        ftsEngine: 'native',
        defaultAlpha: 0.0,
      },
    }),
  },
  {
    name: 'code-aware-balanced',
    description: 'Code-aware chunking with balanced alpha',
    category: 'edge-case',
    config: createConfig({
      chunkingStrategy: 'code-aware',
      hybridSearch: {
        enabled: true,
        ftsEngine: 'auto',
        defaultAlpha: 0.5,
      },
    }),
  },
];

// ============================================================================
// Generator Functions
// ============================================================================

/**
 * Generate all configuration combinations (~22 total)
 *
 * Returns a curated list of meaningful configurations instead of
 * the full cartesian product of all options.
 *
 * @returns Array of configuration combinations
 *
 * @example
 * ```typescript
 * const configs = generateConfigurations();
 * for (const combo of configs) {
 *   console.log(`Testing config: ${combo.name}`);
 *   await runTestWithConfig(combo.config);
 * }
 * ```
 */
export function generateConfigurations(): ConfigCombination[] {
  return [
    ...BASELINE_CONFIGS,
    ...ALPHA_CONFIGS,
    ...FTS_ENGINE_CONFIGS,
    ...STRATEGY_CONFIGS,
    ...CHUNKING_CONFIGS,
    ...EDGE_CASE_CONFIGS,
  ];
}

/**
 * Get configurations by category
 *
 * @param category - The category to filter by
 * @returns Array of configurations in that category
 */
export function getConfigurationsByCategory(
  category: ConfigCombination['category']
): ConfigCombination[] {
  return generateConfigurations().filter((c) => c.category === category);
}

/**
 * Get a specific configuration by name
 *
 * @param name - The configuration name
 * @returns The configuration or undefined if not found
 */
export function getConfigurationByName(name: string): ConfigCombination | undefined {
  return generateConfigurations().find((c) => c.name === name);
}

/**
 * Get configuration names grouped by category
 *
 * @returns Object mapping categories to config names
 */
export function getConfigurationGroups(): Record<string, string[]> {
  const configs = generateConfigurations();
  const groups: Record<string, string[]> = {};

  for (const config of configs) {
    if (!groups[config.category]) {
      groups[config.category] = [];
    }
    groups[config.category].push(config.name);
  }

  return groups;
}

/**
 * Get a summary of all configurations
 *
 * @returns Summary object with counts and names
 */
export function getConfigurationSummary(): {
  totalCount: number;
  byCategory: Record<string, number>;
  names: string[];
} {
  const configs = generateConfigurations();
  const byCategory: Record<string, number> = {};

  for (const config of configs) {
    byCategory[config.category] = (byCategory[config.category] || 0) + 1;
  }

  return {
    totalCount: configs.length,
    byCategory,
    names: configs.map((c) => c.name),
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Re-export types for convenience
  type Config,
  type HybridSearchConfig,
  type FTSEnginePreference,
};
