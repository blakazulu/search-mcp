/**
 * FTS Engine Factory - Auto-Detection and Selection
 *
 * This module provides automatic selection of the best FTS engine based on:
 * - User preference (auto, js, native)
 * - Codebase size (file count)
 * - Native module availability
 *
 * The factory implements the dual-engine architecture from the Hybrid Search RFC,
 * ensuring zero-configuration for most users while providing power user control.
 *
 * Selection Logic:
 * - 'js' preference: Always use NaturalBM25Engine
 * - 'native' preference: Use SQLiteFTS5Engine if available, fallback to JS
 * - 'auto' preference:
 *   - If fileCount > 5000 AND native available: Use native
 *   - Otherwise: Use JS
 */

import { getLogger } from '../utils/logger.js';
import { FTSEngine, FTSEngineType } from './ftsEngine.js';
import { NaturalBM25Engine, createNaturalBM25Engine } from './naturalBM25.js';
import { isNativeAvailable } from './sqliteFTS5.js';

// Re-export FTSEnginePreference from config for convenience
export type { FTSEnginePreference } from '../storage/config.js';
import type { FTSEnginePreference } from '../storage/config.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * File count threshold for auto-detection.
 *
 * When using 'auto' preference:
 * - Projects with > FILE_COUNT_THRESHOLD files will prefer native engine
 * - Projects with <= FILE_COUNT_THRESHOLD files will use JS engine
 *
 * Rationale: The JS engine performs well for small-medium codebases (<5000 files)
 * but memory usage and search latency become problematic for larger projects.
 * The native SQLite FTS5 engine uses disk-backed storage and handles large
 * codebases more efficiently.
 */
export const FILE_COUNT_THRESHOLD = 5000;

// ============================================================================
// Types
// ============================================================================

/**
 * Result of engine selection including the engine instance, type, and reason.
 */
export interface EngineSelectionResult {
  /** The created FTS engine instance */
  engine: FTSEngine;

  /** The type of engine that was selected */
  type: FTSEngineType;

  /** Human-readable reason for the selection */
  reason: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create the appropriate FTS engine based on preference and environment.
 *
 * This is the main entry point for creating FTS engines. It handles:
 * - User preference override (js/native)
 * - Auto-detection based on file count and native availability
 * - Graceful fallback from native to JS when native is unavailable
 *
 * @param dbPath - Path to the database directory (used for native engine)
 * @param preference - User's engine preference: 'auto', 'js', or 'native'
 * @param fileCount - Number of files in the codebase (for auto-detection)
 * @returns Promise resolving to engine instance, type, and selection reason
 *
 * @example
 * ```typescript
 * // Auto-detect based on project size
 * const { engine, type, reason } = await createFTSEngine(
 *   indexPath,
 *   'auto',
 *   1500
 * );
 * console.log(`Using ${type} engine: ${reason}`);
 *
 * // Force JS engine
 * const { engine } = await createFTSEngine(indexPath, 'js', 10000);
 *
 * // Force native engine (with fallback)
 * const { engine, reason } = await createFTSEngine(indexPath, 'native', 100);
 * if (reason.includes('fell back')) {
 *   console.log('Native unavailable, using JS fallback');
 * }
 * ```
 */
export async function createFTSEngine(
  dbPath: string,
  preference: FTSEnginePreference,
  fileCount: number
): Promise<EngineSelectionResult> {
  const logger = getLogger();

  // User explicitly chose JS
  if (preference === 'js') {
    logger.info('ftsEngineFactory', 'Creating JS engine (user preference)', {
      preference,
      fileCount,
    });

    return {
      engine: createNaturalBM25Engine(),
      type: 'js',
      reason: 'User preference: js',
    };
  }

  // User explicitly chose native
  if (preference === 'native') {
    const nativeAvailable = await isNativeAvailable();

    if (nativeAvailable) {
      logger.info('ftsEngineFactory', 'Creating native engine (user preference)', {
        preference,
        fileCount,
      });

      // Dynamic import to avoid loading native module when not needed
      const { createSQLiteFTS5Engine } = await import('./sqliteFTS5.js');
      const ftsDbPath = getFTSDbPath(dbPath);

      return {
        engine: await createSQLiteFTS5Engine(ftsDbPath),
        type: 'native',
        reason: 'User preference: native',
      };
    }

    // Fall back to JS with warning
    logger.warn(
      'ftsEngineFactory',
      'Native FTS engine requested but better-sqlite3 not available. Using JS engine.',
      { preference, fileCount }
    );

    return {
      engine: createNaturalBM25Engine(),
      type: 'js',
      reason: 'User preference: native (unavailable, fell back to js)',
    };
  }

  // Auto mode: decide based on codebase size and availability
  return createFTSEngineAuto(dbPath, fileCount);
}

/**
 * Auto-detect and create the best FTS engine based on project characteristics.
 *
 * This function implements the auto-detection logic:
 * 1. Check file count against threshold
 * 2. If above threshold, try native engine
 * 3. Fall back to JS if native unavailable
 *
 * @param dbPath - Path to the database directory
 * @param fileCount - Number of files in the codebase
 * @returns Promise resolving to engine selection result
 */
async function createFTSEngineAuto(
  dbPath: string,
  fileCount: number
): Promise<EngineSelectionResult> {
  const logger = getLogger();

  // Check if codebase is large enough to warrant native engine
  if (fileCount > FILE_COUNT_THRESHOLD) {
    const nativeAvailable = await isNativeAvailable();

    if (nativeAvailable) {
      logger.info(
        'ftsEngineFactory',
        `Auto-selecting native engine for large codebase (${fileCount} files > ${FILE_COUNT_THRESHOLD} threshold)`,
        { fileCount, threshold: FILE_COUNT_THRESHOLD }
      );

      // Dynamic import to avoid loading native module when not needed
      const { createSQLiteFTS5Engine } = await import('./sqliteFTS5.js');
      const ftsDbPath = getFTSDbPath(dbPath);

      return {
        engine: await createSQLiteFTS5Engine(ftsDbPath),
        type: 'native',
        reason: `Auto: ${fileCount} files > ${FILE_COUNT_THRESHOLD} threshold, native available`,
      };
    }

    // Large codebase but native unavailable
    logger.warn(
      'ftsEngineFactory',
      `Large codebase detected (${fileCount} files) but native engine unavailable. Using JS engine.`,
      { fileCount, threshold: FILE_COUNT_THRESHOLD }
    );
    logger.info(
      'ftsEngineFactory',
      'TIP: Install better-sqlite3 for better performance on large projects: npm install better-sqlite3'
    );

    return {
      engine: createNaturalBM25Engine(),
      type: 'js',
      reason: `Auto: ${fileCount} files > ${FILE_COUNT_THRESHOLD} threshold, but native unavailable`,
    };
  }

  // Small/medium codebase - use JS engine
  logger.info(
    'ftsEngineFactory',
    `Auto-selecting JS engine for codebase (${fileCount} files <= ${FILE_COUNT_THRESHOLD} threshold)`,
    { fileCount, threshold: FILE_COUNT_THRESHOLD }
  );

  return {
    engine: createNaturalBM25Engine(),
    type: 'js',
    reason: `Auto: ${fileCount} files <= ${FILE_COUNT_THRESHOLD} threshold`,
  };
}

/**
 * Get the full path for the FTS SQLite database file.
 *
 * @param indexPath - Base index directory path
 * @returns Full path to the FTS database file
 */
function getFTSDbPath(indexPath: string): string {
  // Use forward slash path separator for consistency
  return `${indexPath}/fts.sqlite`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the native FTS engine is available in the current environment.
 *
 * This is a convenience re-export of isNativeAvailable from sqliteFTS5.
 * Use this to check availability before making decisions that depend on
 * the native engine being present.
 *
 * @returns Promise resolving to true if native engine is available
 *
 * @example
 * ```typescript
 * const canUseNative = await checkNativeAvailable();
 * if (canUseNative) {
 *   console.log('Native SQLite FTS5 engine is available');
 * } else {
 *   console.log('Falling back to JavaScript engine');
 * }
 * ```
 */
export async function checkNativeAvailable(): Promise<boolean> {
  return isNativeAvailable();
}

/**
 * Get a human-readable description of why a particular engine was selected.
 *
 * This is useful for displaying to users in status output or logs.
 *
 * @param type - The engine type that was selected
 * @param reason - The raw reason string from selection
 * @returns Formatted description for user display
 */
export function formatEngineSelectionReason(type: FTSEngineType, reason: string): string {
  const engineName = type === 'native' ? 'SQLite FTS5 (native)' : 'JavaScript (natural)';
  return `FTS Engine: ${engineName}\nSelection reason: ${reason}`;
}

/**
 * Determine if the given file count would trigger native engine selection in auto mode.
 *
 * Useful for predicting which engine will be selected before actually creating it.
 *
 * @param fileCount - Number of files in the codebase
 * @returns true if file count exceeds the threshold for native engine selection
 */
export function wouldSelectNative(fileCount: number): boolean {
  return fileCount > FILE_COUNT_THRESHOLD;
}

/**
 * Load an existing FTS engine based on the type stored in metadata.
 *
 * This function creates an FTS engine instance but does NOT load its index data.
 * The caller should call `engine.load(path)` to load the persisted index.
 *
 * @param indexPath - Path to the index directory
 * @param engineType - The engine type ('js' or 'native')
 * @returns FTS engine instance ready for loading, or null if type is unknown
 *
 * @example
 * ```typescript
 * const engine = await loadFTSEngine(indexPath, 'js');
 * if (engine) {
 *   await engine.load(ftsIndexPath);
 *   const results = await engine.search('query', 10);
 * }
 * ```
 */
export async function loadFTSEngine(
  indexPath: string,
  engineType: FTSEngineType | string
): Promise<FTSEngine | null> {
  const logger = getLogger();

  if (engineType === 'js') {
    logger.debug('ftsEngineFactory', 'Loading JS FTS engine');
    return createNaturalBM25Engine();
  }

  if (engineType === 'native') {
    const nativeAvailable = await isNativeAvailable();

    if (nativeAvailable) {
      logger.debug('ftsEngineFactory', 'Loading native FTS engine');
      const { createSQLiteFTS5Engine } = await import('./sqliteFTS5.js');
      const ftsDbPath = getFTSDbPath(indexPath);
      return createSQLiteFTS5Engine(ftsDbPath);
    }

    logger.warn(
      'ftsEngineFactory',
      'Native FTS engine type specified but better-sqlite3 not available. Cannot load.'
    );
    return null;
  }

  logger.warn('ftsEngineFactory', `Unknown FTS engine type: ${engineType}`);
  return null;
}
