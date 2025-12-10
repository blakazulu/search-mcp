/**
 * create_index Tool
 *
 * MCP tool to create a search index for the current project. Detects project root,
 * scans files, chunks content, generates embeddings, and stores in LanceDB.
 * Requires user confirmation before starting.
 *
 * Features:
 * - Automatic project root detection
 * - User confirmation before indexing
 * - Progress reporting during indexing
 * - File watcher startup after completion
 * - Handles existing index (offers to reindex)
 */

import { z } from 'zod';
import { detectProjectRoot } from '../engines/projectRoot.js';
import { IndexManager, IndexProgress, IndexResult } from '../engines/indexManager.js';
import { getIndexPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { IndexingLock } from '../utils/asyncMutex.js';
import { MCPError, ErrorCode, isMCPError } from '../errors/index.js';
import type { ToolContext } from './searchCode.js';
import type { StrategyOrchestrator } from '../engines/strategyOrchestrator.js';
import type { Config } from '../storage/config.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for create_index tool
 *
 * No required inputs - uses current directory context from the MCP client.
 */
export const CreateIndexInputSchema = z.object({
  // No required inputs - uses current directory context
});

/**
 * Inferred input type from schema
 */
export type CreateIndexInput = z.infer<typeof CreateIndexInputSchema>;

/**
 * Output status for create_index tool
 */
export type CreateIndexStatus = 'success' | 'cancelled';

/**
 * Output structure for create_index tool
 */
export interface CreateIndexOutput {
  /** Result status */
  status: CreateIndexStatus;
  /** Absolute path to the project root (if successful) */
  projectPath?: string;
  /** Number of files indexed (if successful) */
  filesIndexed?: number;
  /** Number of chunks created (if successful) */
  chunksCreated?: number;
  /** Duration string like "45s" or "2m 30s" (if successful) */
  duration?: string;
}

/**
 * Progress callback type for MCP progress reporting
 */
export type ProgressCallback = (progress: IndexProgress) => void;

/**
 * Extended tool context with optional progress callback
 */
export interface CreateIndexContext extends ToolContext {
  /** Optional callback for progress updates */
  onProgress?: ProgressCallback;
  /** Whether user has confirmed the operation (for MCP confirmation flow) */
  confirmed?: boolean;
  /** Optional strategy orchestrator for starting indexing strategy after completion */
  orchestrator?: StrategyOrchestrator;
  /** Optional config for starting strategy (required if orchestrator is provided) */
  config?: Config;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format duration in milliseconds to human-readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration like "45s" or "2m 30s"
 *
 * @example
 * ```typescript
 * formatDuration(45000);    // "45s"
 * formatDuration(150000);   // "2m 30s"
 * formatDuration(3600000);  // "1h 0m"
 * ```
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format progress message for display
 *
 * @param progress - Current progress information
 * @returns Human-readable progress message
 *
 * @example
 * ```typescript
 * formatProgressMessage({ phase: 'scanning', current: 100, total: 500 })
 * // => "Scanning files... [100/500]"
 * ```
 */
export function formatProgressMessage(progress: IndexProgress): string {
  const { phase, current, total, currentFile } = progress;

  switch (phase) {
    case 'scanning':
      if (total === 0) {
        return 'Scanning files...';
      }
      return `Scanning files... [${current}/${total}]`;

    case 'chunking':
      if (currentFile) {
        return `Creating chunks... [${current}/${total}] ${currentFile}`;
      }
      return `Creating chunks... [${current}/${total}]`;

    case 'embedding':
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      return `Generating embeddings... [${percent}%]`;

    case 'storing':
      return `Storing chunks... [${current}/${total}]`;

    default:
      return `Processing... [${current}/${total}]`;
  }
}

// ============================================================================
// Project Detection
// ============================================================================

/**
 * Detect the project root for indexing
 *
 * Uses the project root detection engine to find the project root.
 * If not found, returns the current working directory as fallback.
 *
 * @param context - Tool context containing the project path (cwd)
 * @returns Detected project path
 *
 * @example
 * ```typescript
 * const projectPath = await detectProject({ projectPath: '/Users/dev/project/src' });
 * // => '/Users/dev/project' (detected from .git or package.json)
 * ```
 */
export async function detectProject(context: ToolContext): Promise<string> {
  const logger = getLogger();

  try {
    const result = await detectProjectRoot(context.projectPath);
    logger.info('createIndex', 'Project root detected', {
      projectPath: result.projectPath,
      detectedBy: result.detectedBy,
    });
    return result.projectPath;
  } catch (error) {
    // If project not detected, use the current directory
    if (isMCPError(error) && error.code === ErrorCode.PROJECT_NOT_DETECTED) {
      logger.info('createIndex', 'No project markers found, using current directory', {
        projectPath: context.projectPath,
      });
      return context.projectPath;
    }
    throw error;
  }
}

// ============================================================================
// Index Existence Check
// ============================================================================

/**
 * Check if an index already exists for the project
 *
 * @param projectPath - Absolute path to the project root
 * @returns true if an index already exists
 */
export async function indexExists(projectPath: string): Promise<boolean> {
  const indexManager = new IndexManager(projectPath);
  return indexManager.isIndexed();
}

// ============================================================================
// Main Tool Implementation
// ============================================================================

/**
 * Create a search index for the current project
 *
 * Detects the project root, scans files, chunks content, generates embeddings,
 * and stores in LanceDB. Returns statistics about the created index.
 *
 * Uses the IndexingLock to prevent concurrent indexing operations.
 *
 * @param input - The input (empty object, uses project context)
 * @param context - Tool context containing the project path and optional callbacks
 * @returns Index creation result with statistics
 *
 * @example
 * ```typescript
 * const result = await createIndex(
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
export async function createIndex(
  input: CreateIndexInput,
  context: CreateIndexContext
): Promise<CreateIndexOutput> {
  const logger = getLogger();

  logger.info('createIndex', 'Starting index creation', {
    projectPath: context.projectPath,
    confirmed: context.confirmed,
  });

  // Support explicit confirmation for direct API calls (e.g., tests)
  // MCP server handles confirmation via requiresConfirmation flag
  if (context.confirmed === false) {
    logger.info('createIndex', 'Index creation cancelled by user');
    return { status: 'cancelled' };
  }

  // Step 1: Detect project root (before acquiring lock)
  const projectPath = await detectProject(context);

  // Step 2: Acquire global indexing lock to prevent concurrent indexing
  const indexingLock = IndexingLock.getInstance();

  // Check if indexing is already in progress
  if (indexingLock.isIndexing) {
    const currentProject = indexingLock.indexingProject;
    logger.warn('createIndex', 'Indexing already in progress', {
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

    // Step 3: Check if index already exists
    const exists = await indexExists(projectPath);
    if (exists) {
      logger.info('createIndex', 'Index already exists, will rebuild', { projectPath });
      // Continue with reindexing - user already confirmed
    }

    // Step 4: Create the index
    const indexManager = new IndexManager(projectPath);

    logger.info('createIndex', 'Creating index', {
      projectPath,
      indexPath: indexManager.getIndexPath(),
    });

    // Execute indexing with progress callback
    const result: IndexResult = await indexManager.createIndex(context.onProgress);

    // Step 5: Format the result
    const output: CreateIndexOutput = {
      status: 'success',
      projectPath,
      filesIndexed: result.filesIndexed,
      chunksCreated: result.chunksCreated,
      duration: formatDuration(result.durationMs),
    };

    logger.info('createIndex', 'Index created successfully', {
      projectPath,
      filesIndexed: result.filesIndexed,
      chunksCreated: result.chunksCreated,
      duration: output.duration,
    });

    // Step 6: Start indexing strategy if orchestrator and config provided
    if (context.orchestrator && context.config) {
      logger.debug('createIndex', 'Starting indexing strategy', {
        strategy: context.config.indexingStrategy,
      });
      await context.orchestrator.setStrategy(context.config);
      logger.info('createIndex', 'Indexing strategy started', {
        strategy: context.config.indexingStrategy,
      });
    }

    return output;
  } catch (error) {
    // If it's already an MCPError, re-throw
    if (isMCPError(error)) {
      throw error;
    }

    // Wrap unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    logger.error('createIndex', 'Unexpected error during index creation', { error: message });

    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage: 'Failed to create the search index. Please try again.',
      developerMessage: `Unexpected error during index creation: ${message}`,
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
 * MCP tool definition for create_index
 *
 * This tool creates a search index for the current project.
 * It REQUIRES confirmation as it performs file system operations
 * and may take several minutes for large projects.
 */
export const createIndexTool = {
  name: 'create_index',
  description: 'Create a search index for the current project. This scans all files, generates embeddings, and enables semantic code search.',
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
 * Returns a user-friendly message asking for confirmation before indexing.
 *
 * @param projectPath - The detected project path
 * @returns Confirmation message string
 */
export function getConfirmationMessage(projectPath: string): string {
  return `Index project at ${projectPath}? This may take a few minutes for large projects.`;
}
