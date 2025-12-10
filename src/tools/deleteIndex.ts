/**
 * delete_index Tool
 *
 * MCP tool to remove the search index for the current project. Deletes all
 * index data including the LanceDB database, fingerprints, config, metadata,
 * and logs. Stops the file watcher if running. Requires user confirmation
 * (destructive operation).
 *
 * Features:
 * - Safe path validation to prevent accidental deletion of user files
 * - File watcher stop before deletion
 * - Complete cleanup of all index files
 * - Graceful handling of missing index
 * - Requires user confirmation (irreversible operation)
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getIndexPath, getIndexesDir, isWithinDirectory, normalizePath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { MCPError, ErrorCode, isMCPError } from '../errors/index.js';
import { loadMetadata } from '../storage/metadata.js';
import type { ToolContext } from './searchCode.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for delete_index tool
 *
 * No required inputs - uses current directory context from the MCP client.
 */
export const DeleteIndexInputSchema = z.object({
  // No required inputs - uses current directory context
});

/**
 * Inferred input type from schema
 */
export type DeleteIndexInput = z.infer<typeof DeleteIndexInputSchema>;

/**
 * Output status for delete_index tool
 */
export type DeleteIndexStatus = 'success' | 'cancelled' | 'not_found';

/**
 * Output structure for delete_index tool
 */
export interface DeleteIndexOutput {
  /** Result status */
  status: DeleteIndexStatus;
  /** Absolute path to the project root (if successful) */
  projectPath?: string;
  /** Additional message */
  message?: string;
}

/**
 * Extended tool context with optional watcher stop callback
 */
export interface DeleteIndexContext extends ToolContext {
  /** Whether user has confirmed the operation (for MCP confirmation flow) */
  confirmed?: boolean;
  /** Optional callback to stop the file watcher before deletion */
  stopWatcher?: () => Promise<void>;
  /** Optional callback to close LanceDB connection before deletion */
  closeLanceDB?: () => Promise<void>;
}

// ============================================================================
// Safe Path Validation
// ============================================================================

/**
 * Verify that a path is within the safe indexes directory
 *
 * This is a security measure to prevent accidental deletion of arbitrary
 * directories on the user's system. Only paths within ~/.mcp/search/indexes/
 * are considered safe to delete.
 *
 * @param targetPath - The path to validate
 * @returns true if the path is safe to delete
 *
 * @example
 * ```typescript
 * isPathSafeToDelete('/home/user/.mcp/search/indexes/abc123')  // => true
 * isPathSafeToDelete('/home/user/Documents')                    // => false
 * isPathSafeToDelete('/etc/passwd')                             // => false
 * ```
 */
export function isPathSafeToDelete(targetPath: string): boolean {
  const logger = getLogger();

  try {
    const normalizedTarget = normalizePath(targetPath);
    const indexesDir = getIndexesDir();
    const normalizedIndexesDir = normalizePath(indexesDir);

    // Verify the target is within the indexes directory
    const isWithin = isWithinDirectory(normalizedTarget, normalizedIndexesDir);

    if (!isWithin) {
      logger.warn('deleteIndex', 'Path safety check failed - not within indexes directory', {
        targetPath: normalizedTarget,
        indexesDir: normalizedIndexesDir,
      });
    }

    return isWithin;
  } catch (error) {
    logger.error('deleteIndex', 'Error during path safety check', {
      targetPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ============================================================================
// Safe Deletion
// ============================================================================

/**
 * Safely delete an index directory
 *
 * Validates the path is within the safe indexes directory before deletion.
 * Handles partial deletion gracefully - continues deleting remaining files
 * if some files fail to delete.
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Object with success status and any warnings
 * @throws MCPError if path validation fails (security error)
 *
 * @example
 * ```typescript
 * const result = await safeDeleteIndex('/home/user/.mcp/search/indexes/abc123');
 * if (result.warnings.length > 0) {
 *   console.warn('Some files could not be deleted:', result.warnings);
 * }
 * ```
 */
export async function safeDeleteIndex(
  indexPath: string
): Promise<{ success: boolean; warnings: string[] }> {
  const logger = getLogger();
  const warnings: string[] = [];

  // Security check: verify path is within indexes directory
  if (!isPathSafeToDelete(indexPath)) {
    throw new MCPError({
      code: ErrorCode.PERMISSION_DENIED,
      userMessage: 'Cannot delete this directory. Only search indexes can be deleted.',
      developerMessage: `Path safety check failed for: ${indexPath}. Path is not within ~/.mcp/search/indexes/`,
    });
  }

  const normalizedPath = normalizePath(indexPath);
  logger.info('deleteIndex', 'Starting safe index deletion', { indexPath: normalizedPath });

  // Check if directory exists
  if (!fs.existsSync(normalizedPath)) {
    logger.debug('deleteIndex', 'Index directory does not exist', { indexPath: normalizedPath });
    return { success: true, warnings: [] };
  }

  // Define the files/directories to delete in order
  const itemsToDelete = [
    { name: 'index.lancedb', isDirectory: true },
    { name: 'fingerprints.json', isDirectory: false },
    { name: 'config.json', isDirectory: false },
    { name: 'metadata.json', isDirectory: false },
    { name: 'logs', isDirectory: true },
  ];

  // Delete each item
  for (const item of itemsToDelete) {
    const itemPath = path.join(normalizedPath, item.name);

    if (!fs.existsSync(itemPath)) {
      logger.debug('deleteIndex', `Item does not exist, skipping: ${item.name}`);
      continue;
    }

    try {
      if (item.isDirectory) {
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(itemPath);
      }
      logger.debug('deleteIndex', `Deleted: ${item.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Failed to delete ${item.name}: ${message}`);
      logger.warn('deleteIndex', `Failed to delete ${item.name}`, { error: message });
      // Continue with remaining files
    }
  }

  // Try to remove the index directory itself if empty
  try {
    const remaining = fs.readdirSync(normalizedPath);
    if (remaining.length === 0) {
      fs.rmdirSync(normalizedPath);
      logger.debug('deleteIndex', 'Removed empty index directory');
    } else {
      logger.debug('deleteIndex', 'Index directory not empty, keeping', {
        remainingFiles: remaining,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Failed to remove index directory: ${message}`);
    logger.warn('deleteIndex', 'Failed to remove index directory', { error: message });
  }

  logger.info('deleteIndex', 'Index deletion completed', {
    indexPath: normalizedPath,
    warningCount: warnings.length,
  });

  return { success: true, warnings };
}

// ============================================================================
// Index Existence Check
// ============================================================================

/**
 * Check if an index exists for the project
 *
 * @param projectPath - Absolute path to the project root
 * @returns true if an index exists (has metadata.json)
 */
export async function checkIndexExistsForDelete(projectPath: string): Promise<boolean> {
  const indexPath = getIndexPath(projectPath);
  const metadata = await loadMetadata(indexPath);
  return metadata !== null;
}

// ============================================================================
// Main Tool Implementation
// ============================================================================

/**
 * Delete the search index for the current project
 *
 * Stops the file watcher, closes LanceDB connection, and removes all index
 * data including the database, fingerprints, config, metadata, and logs.
 *
 * @param input - The input (empty object, uses project context)
 * @param context - Tool context containing the project path and optional callbacks
 * @returns Deletion result with status
 *
 * @example
 * ```typescript
 * const result = await deleteIndex(
 *   {},
 *   {
 *     projectPath: '/path/to/project',
 *     confirmed: true,
 *     stopWatcher: async () => { watcher.stop(); },
 *     closeLanceDB: async () => { store.close(); }
 *   }
 * );
 *
 * console.log(result.status);  // 'success' | 'cancelled' | 'not_found'
 * ```
 */
export async function deleteIndex(
  input: DeleteIndexInput,
  context: DeleteIndexContext
): Promise<DeleteIndexOutput> {
  const logger = getLogger();

  logger.info('deleteIndex', 'Starting index deletion', {
    projectPath: context.projectPath,
    confirmed: context.confirmed,
  });

  // Support explicit confirmation for direct API calls (e.g., tests)
  // MCP server handles confirmation via requiresConfirmation flag
  if (context.confirmed === false) {
    logger.info('deleteIndex', 'Index deletion cancelled by user');
    return { status: 'cancelled' };
  }

  try {
    const projectPath = context.projectPath;
    const indexPath = getIndexPath(projectPath);

    // Step 1: Check if index exists
    const exists = await checkIndexExistsForDelete(projectPath);
    if (!exists) {
      logger.info('deleteIndex', 'No index exists for project', { projectPath });
      return {
        status: 'not_found',
        message: 'No search index exists for this project.',
      };
    }

    // Step 2: Stop file watcher if callback provided
    if (context.stopWatcher) {
      logger.debug('deleteIndex', 'Stopping file watcher');
      try {
        await context.stopWatcher();
        logger.debug('deleteIndex', 'File watcher stopped');
      } catch (error) {
        logger.warn('deleteIndex', 'Failed to stop file watcher', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with deletion even if watcher stop fails
      }
    }

    // Step 3: Close LanceDB connection if callback provided
    if (context.closeLanceDB) {
      logger.debug('deleteIndex', 'Closing LanceDB connection');
      try {
        await context.closeLanceDB();
        logger.debug('deleteIndex', 'LanceDB connection closed');
      } catch (error) {
        logger.warn('deleteIndex', 'Failed to close LanceDB connection', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with deletion even if close fails
      }
    }

    // Step 4: Delete the index directory
    const { success, warnings } = await safeDeleteIndex(indexPath);

    if (warnings.length > 0) {
      logger.warn('deleteIndex', 'Deletion completed with warnings', { warnings });
    }

    logger.info('deleteIndex', 'Index deleted successfully', { projectPath });

    return {
      status: 'success',
      projectPath,
      message: warnings.length > 0
        ? `Index deleted with ${warnings.length} warning(s).`
        : 'Index deleted successfully.',
    };
  } catch (error) {
    // If it's already an MCPError, re-throw
    if (isMCPError(error)) {
      throw error;
    }

    // Wrap unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    logger.error('deleteIndex', 'Unexpected error during index deletion', { error: message });

    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage: 'Failed to delete the search index. Please try again.',
      developerMessage: `Unexpected error during index deletion: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

/**
 * MCP tool definition for delete_index
 *
 * This tool removes the search index for the current project.
 * It REQUIRES confirmation as it is a destructive, irreversible operation.
 */
export const deleteIndexTool = {
  name: 'delete_index',
  description: 'Remove the search index for the current project. This deletes all index data and cannot be undone.',
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
 * Returns a user-friendly message asking for confirmation before deletion.
 *
 * @param projectPath - The detected project path (optional)
 * @returns Confirmation message string
 */
export function getDeleteConfirmationMessage(projectPath?: string): string {
  if (projectPath) {
    return `Delete the index for ${projectPath}? This cannot be undone.`;
  }
  return 'Delete the index for this project? This cannot be undone.';
}
