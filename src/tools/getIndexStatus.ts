/**
 * get_index_status Tool
 *
 * MCP tool to retrieve diagnostic information about the current project's index.
 * Returns status, file counts, chunk counts, storage size, timestamps, and
 * watcher status. Useful for debugging and understanding the index state.
 *
 * Features:
 * - Reports index existence status ('ready' | 'indexing' | 'not_found')
 * - Shows total files and chunks indexed
 * - Displays human-readable storage size
 * - Includes last update timestamp
 * - Reports file watcher active status (when available)
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import { loadMetadata, type Metadata } from '../storage/metadata.js';
import { LanceDBStore } from '../storage/lancedb.js';
import { getIndexPath, getLanceDbPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { indexNotFound, MCPError, ErrorCode, isMCPError } from '../errors/index.js';
import type { ToolContext } from './searchCode.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for get_index_status tool
 *
 * No required inputs - uses current project context from the MCP client.
 */
export const GetIndexStatusInputSchema = z.object({
  // No required inputs - uses current project context
});

/**
 * Inferred input type from schema
 */
export type GetIndexStatusInput = z.infer<typeof GetIndexStatusInputSchema>;

/**
 * Index status enum values
 */
export type IndexStatus = 'ready' | 'indexing' | 'not_found' | 'incomplete' | 'failed';

/**
 * Output structure for get_index_status tool
 */
export interface GetIndexStatusOutput {
  /** Current index status */
  status: IndexStatus;
  /** Absolute path to the project root (if index exists) */
  projectPath?: string;
  /** Total number of files indexed */
  totalFiles?: number;
  /** Total number of chunks in the index */
  totalChunks?: number;
  /** ISO 8601 datetime of last index update */
  lastUpdated?: string;
  /** Human-readable storage size (e.g., "45MB", "1.2GB") */
  storageSize?: string;
  /** Whether the file watcher is currently active */
  watcherActive?: boolean;
  /** Warning message if index is in a problematic state */
  warning?: string;
  /** Number of failed embeddings (if any) */
  failedEmbeddings?: number;
  /** Indexing progress info (if in progress) */
  indexingProgress?: {
    expectedFiles?: number;
    processedFiles?: number;
    startedAt?: string;
  };
}

// ============================================================================
// Storage Size Formatting
// ============================================================================

/**
 * Format bytes to human-readable string
 *
 * Converts a byte count to a human-readable format with appropriate units.
 *
 * @param bytes - Size in bytes
 * @returns Human-readable string like "45MB", "1.2GB", etc.
 *
 * @example
 * ```typescript
 * formatStorageSize(1024);          // "1KB"
 * formatStorageSize(1536);          // "1.5KB"
 * formatStorageSize(1048576);       // "1MB"
 * formatStorageSize(1073741824);    // "1GB"
 * formatStorageSize(500);           // "500B"
 * ```
 */
export function formatStorageSize(bytes: number): string {
  if (bytes < 0) {
    return '0B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  // Convert to larger units while size >= 1024 and we have more units
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  // Format the number: no decimals for whole numbers, one decimal otherwise
  // For bytes, always show as whole number
  if (unitIndex === 0 || size === Math.floor(size)) {
    return `${Math.round(size)}${units[unitIndex]}`;
  }

  // For larger units, show one decimal place if needed
  return `${size.toFixed(1)}${units[unitIndex]}`;
}

// ============================================================================
// Status Collection
// ============================================================================

/**
 * Calculate the total size of a directory in bytes
 *
 * Recursively calculates the size of all files in a directory.
 * Uses async file operations to avoid blocking the event loop.
 *
 * @param dirPath - Path to the directory
 * @returns Total size in bytes
 */
async function calculateDirectorySize(dirPath: string): Promise<number> {
  try {
    await fs.promises.access(dirPath);
  } catch {
    return 0;
  }

  let totalSize = 0;

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;

      if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(fullPath);
      } else {
        try {
          const stats = await fs.promises.stat(fullPath);
          totalSize += stats.size;
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Return 0 if we can't read the directory
  }

  return totalSize;
}

/**
 * Collect index status information
 *
 * Gathers all statistics and status information about the current project's index.
 *
 * @param context - Tool context containing the project path
 * @returns Index status output
 *
 * @example
 * ```typescript
 * const status = await collectStatus({ projectPath: '/path/to/project' });
 * console.log(status.status);       // 'ready'
 * console.log(status.totalFiles);   // 150
 * console.log(status.storageSize);  // '45MB'
 * ```
 */
export async function collectStatus(
  context: ToolContext
): Promise<GetIndexStatusOutput> {
  const logger = getLogger();

  logger.debug('getIndexStatus', 'Collecting status', {
    projectPath: context.projectPath,
  });

  // Get the index path for this project
  const indexPath = getIndexPath(context.projectPath);

  // Try to load metadata
  let metadata: Metadata | null = null;
  try {
    metadata = await loadMetadata(indexPath);
  } catch (error) {
    // If metadata is corrupt, report as not_found
    if (isMCPError(error) && error.code === ErrorCode.INDEX_CORRUPT) {
      logger.warn('getIndexStatus', 'Metadata corrupt', { indexPath });
      return { status: 'not_found' };
    }
    throw error;
  }

  // If no metadata, index doesn't exist
  if (!metadata) {
    logger.debug('getIndexStatus', 'No metadata found', { indexPath });
    return { status: 'not_found' };
  }

  // Get LanceDB storage size (async to avoid blocking event loop)
  const lanceDbPath = getLanceDbPath(indexPath);
  const storageSizeBytes = await calculateDirectorySize(lanceDbPath);

  // Determine last updated timestamp
  // Use lastIncrementalUpdate if available, otherwise use lastFullIndex
  const lastUpdated = metadata.lastIncrementalUpdate || metadata.lastFullIndex;

  // TODO: When FileWatcher is implemented (SMCP-015), get actual watcher status
  // For now, set to undefined as we don't have a file watcher yet
  const watcherActive: boolean | undefined = undefined;

  // Determine status based on indexing state
  let status: IndexStatus = 'ready';
  let warning: string | undefined;
  let indexingProgress: GetIndexStatusOutput['indexingProgress'] | undefined;

  const indexingState = metadata.indexingState;
  if (indexingState) {
    switch (indexingState.state) {
      case 'in_progress':
        status = 'indexing';
        warning = 'Index is currently being built. Search results may be incomplete.';
        indexingProgress = {
          expectedFiles: indexingState.expectedFiles,
          processedFiles: indexingState.processedFiles,
          startedAt: indexingState.startedAt,
        };
        break;
      case 'failed':
        status = 'failed';
        warning = `Indexing failed${indexingState.errorMessage ? `: ${indexingState.errorMessage}` : '. Please try reindexing.'}`;
        break;
      case 'complete':
        status = 'ready';
        break;
    }
  }

  // Build the output
  const output: GetIndexStatusOutput = {
    status,
    projectPath: metadata.projectPath,
    totalFiles: metadata.stats.totalFiles,
    totalChunks: metadata.stats.totalChunks,
    lastUpdated,
    storageSize: formatStorageSize(storageSizeBytes),
    watcherActive,
    warning,
    failedEmbeddings: metadata.stats.failedEmbeddings,
    indexingProgress,
  };

  logger.debug('getIndexStatus', 'Status collected', {
    status: output.status,
    totalFiles: output.totalFiles,
    totalChunks: output.totalChunks,
    storageSize: output.storageSize,
    warning: output.warning,
  });

  return output;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Get index status for the current project
 *
 * Returns diagnostic information about the project's search index including
 * file counts, chunk counts, storage size, and watcher status.
 *
 * @param input - The input (empty object, uses project context)
 * @param context - Tool context containing the project path
 * @returns Index status information
 *
 * @example
 * ```typescript
 * const status = await getIndexStatus(
 *   {},
 *   { projectPath: '/path/to/project' }
 * );
 *
 * console.log(status.status);       // 'ready' | 'indexing' | 'not_found'
 * console.log(status.totalFiles);   // 150
 * console.log(status.storageSize);  // '45MB'
 * ```
 */
export async function getIndexStatus(
  input: GetIndexStatusInput,
  context: ToolContext
): Promise<GetIndexStatusOutput> {
  const logger = getLogger();

  logger.info('getIndexStatus', 'Getting index status', {
    projectPath: context.projectPath,
  });

  try {
    const status = await collectStatus(context);

    logger.info('getIndexStatus', 'Status retrieved', {
      status: status.status,
      totalFiles: status.totalFiles,
    });

    return status;
  } catch (error) {
    // If it's already an MCPError, re-throw
    if (isMCPError(error)) {
      throw error;
    }

    // Wrap unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    logger.error('getIndexStatus', 'Unexpected error', { error: message });

    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage:
        'Failed to retrieve index status. The index may be corrupted.',
      developerMessage: `Unexpected error getting index status: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

/**
 * MCP tool definition for get_index_status
 *
 * This tool provides diagnostic information about the index.
 * It does NOT require confirmation as it's a read-only operation.
 */
export const getIndexStatusTool = {
  name: 'get_index_status',
  description: 'Show statistics about the current project index',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  requiresConfirmation: false,
};
