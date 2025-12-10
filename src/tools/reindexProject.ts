/**
 * reindex_project Tool
 *
 * MCP tool to rebuild the entire search index from scratch. Useful when the index
 * seems stale or corrupt. Preserves user configuration (include/exclude patterns)
 * but regenerates all chunks and embeddings. Requires user confirmation.
 *
 * Features:
 * - Preserves user configuration
 * - Deletes existing index data
 * - Performs full re-indexing
 * - Requires user confirmation (destructive operation)
 * - Progress reporting during reindexing
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import { IndexManager, IndexProgress, IndexResult } from '../engines/indexManager.js';
import { ConfigManager, Config } from '../storage/config.js';
import { getIndexPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { IndexingLock } from '../utils/asyncMutex.js';
import { MCPError, ErrorCode, isMCPError, indexNotFound } from '../errors/index.js';
import { formatDuration, formatProgressMessage, type ProgressCallback } from './createIndex.js';
import type { ToolContext } from './searchCode.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for reindex_project tool
 *
 * No required inputs - uses current directory context from the MCP client.
 */
export const ReindexProjectInputSchema = z.object({
  // No required inputs - uses current directory context
});

/**
 * Inferred input type from schema
 */
export type ReindexProjectInput = z.infer<typeof ReindexProjectInputSchema>;

/**
 * Output status for reindex_project tool
 */
export type ReindexProjectStatus = 'success' | 'cancelled';

/**
 * Output structure for reindex_project tool
 */
export interface ReindexProjectOutput {
  /** Result status */
  status: ReindexProjectStatus;
  /** Number of files indexed (if successful) */
  filesIndexed?: number;
  /** Number of chunks created (if successful) */
  chunksCreated?: number;
  /** Duration string like "45s" or "2m 30s" (if successful) */
  duration?: string;
  /** Additional message (for errors or information) */
  message?: string;
}

/**
 * Extended tool context with optional progress callback
 */
export interface ReindexProjectContext extends ToolContext {
  /** Optional callback for progress updates */
  onProgress?: ProgressCallback;
  /** Whether user has confirmed the operation (for MCP confirmation flow) */
  confirmed?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an index exists for the project
 *
 * @param projectPath - Absolute path to the project root
 * @returns true if an index exists
 */
export async function checkIndexExists(projectPath: string): Promise<boolean> {
  const indexManager = new IndexManager(projectPath);
  return indexManager.isIndexed();
}

/**
 * Load the existing configuration for the project
 *
 * Preserves user configuration (include/exclude patterns) during reindex.
 *
 * @param indexPath - Absolute path to the index directory
 * @returns The existing configuration or null if not found
 */
export async function loadExistingConfig(indexPath: string): Promise<Config | null> {
  const logger = getLogger();
  const configManager = new ConfigManager(indexPath);

  try {
    const config = await configManager.load();
    logger.debug('reindexProject', 'Loaded existing configuration', {
      indexPath,
      hasConfig: config !== null,
    });
    return config;
  } catch (error) {
    // If config doesn't exist or is corrupt, return null
    logger.warn('reindexProject', 'Could not load existing config', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Delete index data while preserving configuration
 *
 * Removes:
 * - LanceDB database
 * - Fingerprints file
 * - Metadata file
 *
 * Preserves:
 * - config.json (user configuration)
 *
 * @param indexPath - Absolute path to the index directory
 */
export async function deleteIndexData(indexPath: string): Promise<void> {
  const logger = getLogger();
  const { LanceDBStore } = await import('../storage/lancedb.js');

  logger.info('reindexProject', 'Deleting index data', { indexPath });

  // Delete LanceDB store
  const store = new LanceDBStore(indexPath);
  await store.delete();

  // Delete fingerprints
  const fingerprintsPath = `${indexPath}/fingerprints.json`;
  if (fs.existsSync(fingerprintsPath)) {
    fs.unlinkSync(fingerprintsPath);
    logger.debug('reindexProject', 'Deleted fingerprints file');
  }

  // Delete metadata
  const metadataPath = `${indexPath}/metadata.json`;
  if (fs.existsSync(metadataPath)) {
    fs.unlinkSync(metadataPath);
    logger.debug('reindexProject', 'Deleted metadata file');
  }

  // Note: config.json is intentionally preserved

  logger.info('reindexProject', 'Index data deleted successfully');
}

// ============================================================================
// Main Tool Implementation
// ============================================================================

/**
 * Rebuild the entire search index from scratch
 *
 * Deletes the existing index data (preserving configuration) and creates
 * a fresh index. Useful when the index is corrupted or out of sync.
 *
 * Uses the IndexingLock to prevent concurrent indexing operations.
 *
 * @param input - The input (empty object, uses project context)
 * @param context - Tool context containing the project path and optional callbacks
 * @returns Reindex result with statistics
 *
 * @example
 * ```typescript
 * const result = await reindexProject(
 *   {},
 *   {
 *     projectPath: '/path/to/project',
 *     confirmed: true,
 *     onProgress: (progress) => console.log(formatProgressMessage(progress))
 *   }
 * );
 *
 * console.log(result.status);       // 'success'
 * console.log(result.filesIndexed); // 150
 * console.log(result.duration);     // '45s'
 * ```
 */
export async function reindexProject(
  input: ReindexProjectInput,
  context: ReindexProjectContext
): Promise<ReindexProjectOutput> {
  const logger = getLogger();

  logger.info('reindexProject', 'Starting reindex operation', {
    projectPath: context.projectPath,
    confirmed: context.confirmed,
  });

  // Support explicit confirmation for direct API calls (e.g., tests)
  // MCP server handles confirmation via requiresConfirmation flag
  if (context.confirmed === false) {
    logger.info('reindexProject', 'Reindex cancelled by user');
    return { status: 'cancelled' };
  }

  const projectPath = context.projectPath;
  const indexPath = getIndexPath(projectPath);

  // Step 1: Check if index exists (before acquiring lock)
  const exists = await checkIndexExists(projectPath);
  if (!exists) {
    logger.warn('reindexProject', 'No index exists for project', { projectPath });
    throw new MCPError({
      code: ErrorCode.INDEX_NOT_FOUND,
      userMessage:
        'No search index exists for this project. Please use create_index to create one first.',
      developerMessage: `Index not found at ${indexPath}`,
    });
  }

  // Step 2: Acquire global indexing lock to prevent concurrent indexing
  const indexingLock = IndexingLock.getInstance();

  // Check if indexing is already in progress
  if (indexingLock.isIndexing) {
    const currentProject = indexingLock.indexingProject;
    logger.warn('reindexProject', 'Indexing already in progress', {
      currentProject,
      requestedProject: projectPath,
    });
    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage: `Indexing is already in progress for ${currentProject}. Please wait for it to complete.`,
      developerMessage: `Concurrent indexing prevented. Current: ${currentProject}, Requested: ${projectPath}`,
    });
  }

  try {
    // Acquire the lock with the project path
    await indexingLock.acquire(projectPath);

    // Step 3: Load existing configuration (to preserve user settings)
    const existingConfig = await loadExistingConfig(indexPath);
    logger.info('reindexProject', 'Configuration loaded', {
      hasConfig: existingConfig !== null,
    });

    // Step 4: Delete index data (preserves config.json)
    // Note: In a full implementation with file watcher, we would stop the watcher here
    // For now, just delete the index data
    await deleteIndexData(indexPath);

    // Step 5: Perform full re-indexing
    const indexManager = new IndexManager(projectPath);

    logger.info('reindexProject', 'Rebuilding index', {
      projectPath,
      indexPath: indexManager.getIndexPath(),
    });

    // Execute indexing with progress callback
    const result: IndexResult = await indexManager.createIndex(context.onProgress);

    // Step 6: Format the result
    const output: ReindexProjectOutput = {
      status: 'success',
      filesIndexed: result.filesIndexed,
      chunksCreated: result.chunksCreated,
      duration: formatDuration(result.durationMs),
    };

    logger.info('reindexProject', 'Index rebuilt successfully', {
      projectPath,
      filesIndexed: result.filesIndexed,
      chunksCreated: result.chunksCreated,
      duration: output.duration,
    });

    // Note: In a full implementation with file watcher, we would restart the watcher here

    return output;
  } catch (error) {
    // If it's already an MCPError, re-throw
    if (isMCPError(error)) {
      throw error;
    }

    // Wrap unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    logger.error('reindexProject', 'Unexpected error during reindex', { error: message });

    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage: 'Failed to rebuild the search index. Please try again.',
      developerMessage: `Unexpected error during reindex: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  } finally {
    // Always release the lock
    if (indexingLock.isIndexing) {
      indexingLock.release();
    }
  }
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

/**
 * MCP tool definition for reindex_project
 *
 * This tool rebuilds the entire search index from scratch.
 * It REQUIRES confirmation as it is a destructive operation
 * that deletes existing index data.
 */
export const reindexProjectTool = {
  name: 'reindex_project',
  description: 'Rebuild the entire search index from scratch',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  requiresConfirmation: true,
};

/**
 * Get confirmation message for the tool
 *
 * Returns a user-friendly message asking for confirmation before reindexing.
 *
 * @returns Confirmation message string
 */
export function getReindexConfirmationMessage(): string {
  return 'This will rebuild the entire index. Continue? This may take a few minutes for large projects.';
}
