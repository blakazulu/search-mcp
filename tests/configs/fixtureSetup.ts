/**
 * Fixture Setup Utilities
 *
 * Provides utilities for setting up and cleaning up test fixtures
 * for config matrix testing. Handles temporary directories, index creation,
 * and configuration management.
 *
 * @module tests/configs/fixtureSetup
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Config } from '../../src/storage/config.js';
import type { ConfigCombination } from './configCombinations.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Context returned from fixture setup
 */
export interface FixtureContext {
  /** Path to the project being tested */
  projectPath: string;

  /** Path to the index directory */
  indexPath: string;

  /** Whether using a temporary directory */
  isTemp: boolean;

  /** Temporary directory path (if created) */
  tempDir?: string;

  /** Indexing time in milliseconds */
  indexingTimeMs?: number;

  /** Number of files indexed */
  filesIndexed?: number;

  /** Number of chunks created */
  chunksCreated?: number;

  /** Configuration used */
  config?: Partial<Config>;

  /** Cleanup function */
  cleanup: () => Promise<void>;
}

/**
 * Options for fixture setup
 */
export interface SetupOptions {
  /** Use a temporary copy of the fixture */
  useTemp?: boolean;

  /** Configuration to apply */
  config?: Partial<Config>;

  /** Skip creating the index */
  skipIndex?: boolean;

  /** Custom index path */
  customIndexPath?: string;
}

// ============================================================================
// Constants
// ============================================================================

const FIXTURES_BASE = path.join(__dirname, '..', 'fixtures', 'synthetic');
const TEMP_BASE = path.join(os.tmpdir(), 'search-mcp-test');

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a unique temporary directory
 */
function createTempDir(): string {
  if (!fs.existsSync(TEMP_BASE)) {
    fs.mkdirSync(TEMP_BASE, { recursive: true });
  }
  const tempDir = path.join(TEMP_BASE, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Copy directory recursively
 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Remove directory recursively
 */
function removeDirSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Set up a test fixture for config matrix testing
 *
 * @param fixtureName - Name of the fixture (e.g., 'small-project')
 * @param options - Setup options
 * @returns Fixture context with cleanup function
 *
 * @example
 * ```typescript
 * const context = await setupFixture('small-project');
 * try {
 *   // Run tests against context.projectPath
 *   const results = await searchCode({ query: 'auth' }, { projectPath: context.projectPath });
 * } finally {
 *   await context.cleanup();
 * }
 * ```
 */
export async function setupFixture(
  fixtureName: string,
  options: SetupOptions = {}
): Promise<FixtureContext> {
  const { useTemp = false, config, skipIndex = false, customIndexPath } = options;

  const fixturePath = path.join(FIXTURES_BASE, fixtureName);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixtureName} at ${fixturePath}`);
  }

  let projectPath: string;
  let tempDir: string | undefined;

  if (useTemp) {
    // Create a temporary copy
    tempDir = createTempDir();
    projectPath = path.join(tempDir, fixtureName);
    copyDirSync(fixturePath, projectPath);
  } else {
    // Use fixture directly
    projectPath = fixturePath;
  }

  // Determine index path
  const { getIndexPath } = await import('../../src/utils/paths.js');
  const indexPath = customIndexPath || getIndexPath(projectPath);

  const context: FixtureContext = {
    projectPath,
    indexPath,
    isTemp: useTemp,
    tempDir,
    config,
    cleanup: async () => {
      // Clean up index
      removeDirSync(indexPath);

      // Clean up temp directory if created
      if (tempDir) {
        removeDirSync(tempDir);
      }
    },
  };

  // Create index if not skipped
  if (!skipIndex) {
    const indexResult = await createIndexWithConfig(projectPath, config);
    context.indexingTimeMs = indexResult.indexingTimeMs;
    context.filesIndexed = indexResult.filesIndexed;
    context.chunksCreated = indexResult.chunksCreated;
  }

  return context;
}

/**
 * Clean up a fixture context
 *
 * @param context - Fixture context to clean up
 */
export async function cleanupFixture(context: FixtureContext): Promise<void> {
  await context.cleanup();
}

/**
 * Create an index with a specific configuration
 *
 * @param projectPath - Path to the project
 * @param config - Configuration to use (optional, uses defaults if not provided)
 * @returns Index creation result
 *
 * @example
 * ```typescript
 * const result = await createIndexWithConfig('/path/to/project', {
 *   hybridSearch: { enabled: true, ftsEngine: 'js', defaultAlpha: 0.5 }
 * });
 * console.log(`Indexed ${result.filesIndexed} files in ${result.indexingTimeMs}ms`);
 * ```
 */
export async function createIndexWithConfig(
  projectPath: string,
  config?: Partial<Config>
): Promise<{
  indexPath: string;
  filesIndexed: number;
  chunksCreated: number;
  indexingTimeMs: number;
}> {
  const { IndexManager } = await import('../../src/engines/indexManager.js');
  const { getIndexPath } = await import('../../src/utils/paths.js');
  const { saveConfig, DEFAULT_CONFIG } = await import('../../src/storage/config.js');

  const indexPath = getIndexPath(projectPath);

  // Clean up existing index
  removeDirSync(indexPath);
  fs.mkdirSync(indexPath, { recursive: true });

  // Save configuration if provided
  if (config) {
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      hybridSearch: {
        ...DEFAULT_CONFIG.hybridSearch,
        ...(config.hybridSearch || {}),
      },
    };
    await saveConfig(indexPath, mergedConfig as Config);
  }

  // Create the index
  const startTime = performance.now();
  const indexManager = new IndexManager(projectPath, indexPath);

  const result = await indexManager.createIndex();
  const indexingTimeMs = Math.round(performance.now() - startTime);

  return {
    indexPath,
    filesIndexed: result.filesIndexed,
    chunksCreated: result.chunksCreated,
    indexingTimeMs,
  };
}

/**
 * Create index using a ConfigCombination object
 *
 * @param projectPath - Path to the project
 * @param combination - Configuration combination
 * @returns Index creation result
 */
export async function createIndexWithCombination(
  projectPath: string,
  combination: ConfigCombination
): Promise<{
  indexPath: string;
  filesIndexed: number;
  chunksCreated: number;
  indexingTimeMs: number;
  configName: string;
}> {
  const result = await createIndexWithConfig(projectPath, combination.config);
  return {
    ...result,
    configName: combination.name,
  };
}

/**
 * Delete index for a project
 *
 * @param projectPath - Path to the project
 */
export async function deleteIndex(projectPath: string): Promise<void> {
  const { getIndexPath } = await import('../../src/utils/paths.js');
  const indexPath = getIndexPath(projectPath);
  removeDirSync(indexPath);
}

/**
 * Check if an index exists for a project
 *
 * @param projectPath - Path to the project
 * @returns True if index exists
 */
export async function indexExists(projectPath: string): Promise<boolean> {
  const { getIndexPath } = await import('../../src/utils/paths.js');
  const indexPath = getIndexPath(projectPath);
  const metadataPath = path.join(indexPath, 'metadata.json');
  return fs.existsSync(metadataPath);
}

/**
 * Get path to a fixture
 *
 * @param fixtureName - Name of the fixture
 * @returns Full path to the fixture
 */
export function getFixturePath(fixtureName: string): string {
  return path.join(FIXTURES_BASE, fixtureName);
}

/**
 * List available fixtures
 *
 * @returns Array of fixture names
 */
export function listFixtures(): string[] {
  if (!fs.existsSync(FIXTURES_BASE)) {
    return [];
  }

  return fs.readdirSync(FIXTURES_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Load query definitions from the fixtures
 *
 * @param queryFile - Query file name (e.g., 'code-queries.json')
 * @returns Parsed query definitions
 */
export function loadQueries<T>(queryFile: string): T {
  const queriesPath = path.join(__dirname, '..', 'fixtures', 'queries', queryFile);
  if (!fs.existsSync(queriesPath)) {
    throw new Error(`Query file not found: ${queryFile}`);
  }
  const content = fs.readFileSync(queriesPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Clean up all temporary test directories
 */
export function cleanupAllTemp(): void {
  if (fs.existsSync(TEMP_BASE)) {
    removeDirSync(TEMP_BASE);
  }
}
