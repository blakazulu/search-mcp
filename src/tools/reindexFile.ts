/**
 * reindex_file Tool
 *
 * MCP tool to re-index a single specific file. Useful when the file watcher missed
 * a change or for manual refresh of a specific file. Does not require confirmation
 * as it's a fast, low-impact operation.
 *
 * Features:
 * - Single file reindexing
 * - File validation (exists, passes policy, in index)
 * - Old chunks removed before adding new
 * - Fingerprint updated
 * - No confirmation required (fast operation)
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import { IndexManager } from '../engines/indexManager.js';
import { IndexingPolicy, isHardDenied } from '../engines/indexPolicy.js';
import { ConfigManager, Config } from '../storage/config.js';
import { LanceDBStore, ChunkRecord } from '../storage/lancedb.js';
import { FingerprintsManager } from '../storage/fingerprints.js';
import { MetadataManager } from '../storage/metadata.js';
import { chunkFile } from '../engines/chunking.js';
import { getEmbeddingEngine } from '../engines/embedding.js';
import { getIndexPath, toAbsolutePath, normalizePath, safeJoin, sanitizeIndexPath } from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { MCPError, ErrorCode, isMCPError, fileNotFound, indexNotFound } from '../errors/index.js';
import type { ToolContext } from './searchCode.js';

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Input schema for reindex_file tool
 *
 * Accepts the relative path to the file to reindex.
 */
export const ReindexFileInputSchema = z.object({
  path: z.string()
    .min(1)
    .describe("Relative path to the file (e.g., 'src/auth/login.ts')"),
});

/**
 * Inferred input type from schema
 */
export type ReindexFileInput = z.infer<typeof ReindexFileInputSchema>;

/**
 * Output status for reindex_file tool
 */
export type ReindexFileStatus = 'success' | 'error';

/**
 * Output structure for reindex_file tool
 */
export interface ReindexFileOutput {
  /** Result status */
  status: ReindexFileStatus;
  /** Path of the file that was reindexed */
  path: string;
  /** Number of chunks created (if successful) */
  chunksCreated?: number;
  /** Additional message (for errors or information) */
  message?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of file path validation
 */
export interface ValidationResult {
  /** Whether the file is valid for reindexing */
  valid: boolean;
  /** Error code if validation failed */
  errorCode?: ErrorCode;
  /** Error message if validation failed */
  errorMessage?: string;
  /** User-friendly error message if validation failed */
  userMessage?: string;
}

// ============================================================================
// File Validation
// ============================================================================

/**
 * Validate a file path for reindexing
 *
 * Checks:
 * 1. File exists
 * 2. File is not in hardcoded deny list
 * 3. File passes indexing policy
 *
 * @param relativePath - Relative path to the file
 * @param projectPath - Absolute path to the project root
 * @param policy - Initialized IndexingPolicy instance
 * @returns Validation result
 */
export async function validateFilePath(
  relativePath: string,
  projectPath: string,
  policy: IndexingPolicy
): Promise<ValidationResult> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);

  // Security check: prevent path traversal
  const safePath = safeJoin(normalizedProjectPath, relativePath);
  if (safePath === null) {
    logger.warn('reindexFile', 'Path traversal attempt detected', { relativePath });
    return {
      valid: false,
      errorCode: ErrorCode.FILE_NOT_FOUND,
      errorMessage: `Invalid file path: ${relativePath}`,
      userMessage: 'Invalid file path. Please provide a path within the project directory.',
    };
  }

  const absolutePath = toAbsolutePath(relativePath, normalizedProjectPath);

  // 1. Check if file exists
  if (!fs.existsSync(absolutePath)) {
    logger.debug('reindexFile', 'File not found', { relativePath, absolutePath });
    return {
      valid: false,
      errorCode: ErrorCode.FILE_NOT_FOUND,
      errorMessage: `File not found: ${relativePath}`,
      userMessage: `The file '${relativePath}' could not be found.`,
    };
  }

  // 2. Check if file is in hardcoded deny list
  // Normalize the path to forward slashes for pattern matching
  const normalizedRelativePath = relativePath.replace(/\\/g, '/');
  if (isHardDenied(normalizedRelativePath)) {
    logger.debug('reindexFile', 'File in hardcoded deny list', { relativePath });
    return {
      valid: false,
      errorCode: ErrorCode.PERMISSION_DENIED,
      errorMessage: `File is in deny list: ${relativePath}`,
      userMessage: `The file '${relativePath}' cannot be indexed because it is in the security deny list (e.g., node_modules, .git, .env files).`,
    };
  }

  // 3. Check if file passes indexing policy
  const policyResult = await policy.shouldIndex(normalizedRelativePath, absolutePath);
  if (!policyResult.shouldIndex) {
    logger.debug('reindexFile', 'File excluded by policy', {
      relativePath,
      reason: policyResult.reason,
      category: policyResult.category,
    });
    return {
      valid: false,
      errorCode: ErrorCode.PERMISSION_DENIED,
      errorMessage: `File excluded by policy: ${relativePath} - ${policyResult.reason}`,
      userMessage: `The file '${relativePath}' cannot be indexed: ${policyResult.reason}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Main Tool Implementation
// ============================================================================

/**
 * Re-index a single specific file
 *
 * Validates the file, removes old chunks, generates new chunks and embeddings,
 * and updates the index.
 *
 * @param input - The input containing the file path
 * @param context - Tool context containing the project path
 * @returns Reindex result with chunk count
 *
 * @example
 * ```typescript
 * const result = await reindexFile(
 *   { path: 'src/auth/login.ts' },
 *   { projectPath: '/path/to/project' }
 * );
 *
 * console.log(result.status);        // 'success'
 * console.log(result.chunksCreated); // 5
 * ```
 */
export async function reindexFile(
  input: ReindexFileInput,
  context: ToolContext
): Promise<ReindexFileOutput> {
  const logger = getLogger();
  const relativePath = input.path.replace(/\\/g, '/'); // Normalize to forward slashes

  logger.info('reindexFile', 'Starting file reindex', {
    relativePath,
    projectPath: context.projectPath,
  });

  try {
    const projectPath = normalizePath(context.projectPath);
    const indexPath = getIndexPath(projectPath);

    // Step 1: Check if index exists
    const indexManager = new IndexManager(projectPath);
    const indexed = await indexManager.isIndexed();

    if (!indexed) {
      logger.warn('reindexFile', 'No index exists for project', { projectPath });
      throw new MCPError({
        code: ErrorCode.INDEX_NOT_FOUND,
        userMessage:
          'No search index exists for this project. Please create one first using the create_index tool.',
        developerMessage: `Index not found at ${sanitizeIndexPath(indexPath)}`,
      });
    }

    // Step 2: Load config and initialize policy
    const configManager = new ConfigManager(indexPath);
    const config = await configManager.load();

    const policy = new IndexingPolicy(projectPath, config);
    await policy.initialize();

    // Step 3: Validate file path
    const validation = await validateFilePath(relativePath, projectPath, policy);
    if (!validation.valid) {
      throw new MCPError({
        code: validation.errorCode!,
        userMessage: validation.userMessage!,
        developerMessage: validation.errorMessage!,
      });
    }

    // Step 4: Initialize components
    const store = new LanceDBStore(indexPath);
    await store.open();

    const fingerprintsManager = new FingerprintsManager(indexPath, projectPath);
    await fingerprintsManager.load();

    const metadataManager = new MetadataManager(indexPath);
    await metadataManager.load();

    const embeddingEngine = getEmbeddingEngine();
    await embeddingEngine.initialize();

    try {
      // Step 5: Delete existing chunks for this file
      const absolutePath = toAbsolutePath(relativePath, projectPath);
      const deletedCount = await store.deleteByPath(relativePath);
      logger.debug('reindexFile', 'Deleted existing chunks', { relativePath, deletedCount });

      // Step 6: Read and chunk the file
      const chunks = await chunkFile(absolutePath, relativePath);
      logger.debug('reindexFile', 'File chunked', { relativePath, chunkCount: chunks.length });

      let chunksCreated = 0;

      if (chunks.length > 0) {
        // Step 7: Generate embeddings
        const texts = chunks.map((c) => c.text);
        const embeddingResult = await embeddingEngine.embedBatch(texts);

        // SECURITY (SMCP-054): Only insert chunks with successful embeddings
        const records: ChunkRecord[] = [];
        for (let successIdx = 0; successIdx < embeddingResult.successIndices.length; successIdx++) {
          const originalIndex = embeddingResult.successIndices[successIdx];
          const chunk = chunks[originalIndex];
          records.push({
            id: chunk.id,
            path: chunk.path,
            text: chunk.text,
            vector: embeddingResult.vectors[successIdx],
            start_line: chunk.startLine,
            end_line: chunk.endLine,
            content_hash: chunk.contentHash,
          });
        }

        // Log if any embeddings failed
        if (embeddingResult.failedCount > 0) {
          logger.warn('reindexFile', `${embeddingResult.failedCount} chunks failed to embed for file`, {
            relativePath,
            failedCount: embeddingResult.failedCount,
          });
        }

        // Step 9: Insert new chunks (only successful embeddings)
        if (records.length > 0) {
          await store.insertChunks(records);
        }
        chunksCreated = records.length;

        logger.debug('reindexFile', 'Inserted new chunks', { relativePath, chunksCreated });
      }

      // Step 10: Update fingerprint
      const newHash = await hashFile(absolutePath);
      fingerprintsManager.set(relativePath, newHash);
      await fingerprintsManager.save();

      // Step 11: Update metadata
      const totalChunks = await store.countChunks();
      const totalFiles = await store.countFiles();
      const storageSize = await store.getStorageSize();
      metadataManager.updateStats(totalFiles, totalChunks, storageSize);
      metadataManager.markIncrementalUpdate();
      await metadataManager.save();

      await store.close();

      logger.info('reindexFile', 'File reindexed successfully', {
        relativePath,
        chunksCreated,
      });

      return {
        status: 'success',
        path: relativePath,
        chunksCreated,
      };
    } catch (error) {
      await store.close();
      throw error;
    }
  } catch (error) {
    // If it's already an MCPError, re-throw
    if (isMCPError(error)) {
      throw error;
    }

    // Wrap unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    logger.error('reindexFile', 'Unexpected error during file reindex', {
      relativePath,
      error: message,
    });

    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage: `Failed to reindex the file '${relativePath}'. Please try again.`,
      developerMessage: `Unexpected error during file reindex: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================================================
// MCP Tool Definition
// ============================================================================

/**
 * MCP tool definition for reindex_file
 *
 * This tool re-indexes a single specific file.
 * It does NOT require confirmation as it's a fast, low-impact operation.
 */
export const reindexFileTool = {
  name: 'reindex_file',
  description: 'Re-index a single specific file. Useful when the file watcher missed a change or for manual refresh.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: "Relative path to the file (e.g., 'src/auth/login.ts')",
      },
    },
    required: ['path'],
  },
  requiresConfirmation: false,
};
