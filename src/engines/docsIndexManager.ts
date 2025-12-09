/**
 * Docs Index Manager Module
 *
 * Orchestrator for documentation indexing operations. Coordinates scanning doc files,
 * chunking with prose-optimized parameters, generating embeddings, and storing in the
 * docs LanceDB table.
 *
 * Features:
 * - Full documentation indexing with progress reporting
 * - Incremental updates (single file and batch delta)
 * - Prose-optimized chunking with larger chunks and more overlap
 * - Separate storage from code index
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { v4 as uuidv4 } from 'uuid';

// Storage imports
import { DocsLanceDBStore } from '../storage/docsLancedb.js';
import { ChunkRecord } from '../storage/lancedb.js';
import {
  DocsFingerprintsManager,
  DocsDeltaResult,
} from '../storage/docsFingerprints.js';
import { MetadataManager } from '../storage/metadata.js';
import { ConfigManager, Config, loadConfig } from '../storage/config.js';

// Engine imports
import { IndexingPolicy } from './indexPolicy.js';
import { chunkDocFile, isDocFile, DOC_FILE_PATTERNS } from './docsChunking.js';
import { getEmbeddingEngine, EmbeddingEngine } from './embedding.js';

// Utility imports
import {
  toRelativePath,
  toAbsolutePath,
  normalizePath,
  getIndexPath,
} from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { MCPError, ErrorCode, isMCPError } from '../errors/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Batch size for processing doc files
 * 50 files per batch balances memory usage and progress granularity
 */
export const DOC_FILE_BATCH_SIZE = 50;

// ============================================================================
// Progress Reporting Types
// ============================================================================

/**
 * Progress phases during docs indexing
 */
export type DocsIndexPhase = 'scanning' | 'chunking' | 'embedding' | 'storing';

/**
 * Progress information during docs indexing operations
 */
export interface DocsIndexProgress {
  /** Current phase of the indexing operation */
  phase: DocsIndexPhase;
  /** Current item number being processed */
  current: number;
  /** Total items to process in this phase */
  total: number;
  /** Current file being processed (optional) */
  currentFile?: string;
}

/**
 * Callback function for progress updates
 */
export type DocsProgressCallback = (progress: DocsIndexProgress) => void;

/**
 * Result of a docs indexing operation
 */
export interface DocsIndexResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Number of doc files indexed */
  filesIndexed: number;
  /** Number of chunks created */
  chunksCreated: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Errors encountered (if any) */
  errors?: string[];
}

/**
 * Statistics for a docs index
 */
export interface DocsStats {
  /** Total number of indexed doc files */
  totalDocs: number;
  /** Total number of doc chunks */
  totalDocChunks: number;
  /** Storage size in bytes */
  storageSizeBytes: number;
}

// ============================================================================
// File Scanner
// ============================================================================

/**
 * Scan a project directory for documentation files
 *
 * Finds all files matching doc patterns (*.md, *.txt) that should be indexed based on:
 * - Hardcoded deny patterns (always excluded)
 * - User exclude patterns from config
 * - Gitignore rules (if respectGitignore is enabled)
 *
 * @param projectPath - Absolute path to the project root
 * @param policy - Initialized IndexingPolicy instance
 * @param config - Project configuration
 * @param onProgress - Optional callback for progress updates
 * @returns Array of relative file paths that should be indexed
 */
export async function scanDocFiles(
  projectPath: string,
  policy: IndexingPolicy,
  config: Config,
  onProgress?: DocsProgressCallback
): Promise<string[]> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);

  logger.info('DocsIndexManager', 'Starting doc file scan', {
    projectPath: normalizedProjectPath,
  });

  // Report scanning phase started
  if (onProgress) {
    onProgress({
      phase: 'scanning',
      current: 0,
      total: 0, // Unknown until scan completes
    });
  }

  // Get all doc files in the project using glob
  const allDocFiles: string[] = [];

  try {
    for (const pattern of DOC_FILE_PATTERNS) {
      const files = await glob(pattern, {
        cwd: normalizedProjectPath,
        nodir: true, // Only files, not directories
        dot: true, // Include dotfiles
        absolute: false, // Get relative paths
      });

      // Convert to forward-slash format and add to list
      for (const file of files) {
        const normalized = file.replace(/\\/g, '/');
        if (!allDocFiles.includes(normalized)) {
          allDocFiles.push(normalized);
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('DocsIndexManager', 'Failed to scan directory for docs', {
      projectPath: normalizedProjectPath,
      error: message,
    });
    throw new MCPError({
      code: ErrorCode.PERMISSION_DENIED,
      userMessage:
        'Failed to scan the project directory for documentation. Please check permissions.',
      developerMessage: `Glob scan failed for ${normalizedProjectPath}: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }

  logger.debug(
    'DocsIndexManager',
    `Found ${allDocFiles.length} total doc files before filtering`
  );

  // Filter doc files through indexing policy
  const indexableDocFiles: string[] = [];
  let scannedCount = 0;

  for (const relativePath of allDocFiles) {
    scannedCount++;

    // Report progress periodically (every 100 files)
    if (onProgress && scannedCount % 100 === 0) {
      onProgress({
        phase: 'scanning',
        current: scannedCount,
        total: allDocFiles.length,
        currentFile: relativePath,
      });
    }

    const absolutePath = toAbsolutePath(relativePath, normalizedProjectPath);

    try {
      const result = await policy.shouldIndex(relativePath, absolutePath);
      if (result.shouldIndex) {
        // Double-check it's a doc file (by extension)
        if (isDocFile(relativePath)) {
          indexableDocFiles.push(relativePath);
        }
      }
    } catch (error) {
      // Log but skip files that can't be checked
      logger.debug(
        'DocsIndexManager',
        'Skipping doc file due to policy check error',
        {
          file: relativePath,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  // Final progress update
  if (onProgress) {
    onProgress({
      phase: 'scanning',
      current: allDocFiles.length,
      total: allDocFiles.length,
    });
  }

  logger.info('DocsIndexManager', 'Doc file scan complete', {
    total: allDocFiles.length,
    indexable: indexableDocFiles.length,
    filtered: allDocFiles.length - indexableDocFiles.length,
  });

  return indexableDocFiles;
}

// ============================================================================
// Indexing Pipeline Functions
// ============================================================================

/**
 * Process a batch of doc files through the indexing pipeline
 *
 * For each file:
 * 1. Read and chunk the file with prose-optimized settings
 * 2. Generate embeddings for chunks
 * 3. Create ChunkRecords for storage
 *
 * @param files - Array of relative file paths
 * @param projectPath - Absolute path to the project root
 * @param embeddingEngine - Initialized embedding engine
 * @param onProgress - Optional progress callback
 * @param progressOffset - Offset for progress reporting (for batch processing)
 * @param totalFiles - Total files for progress reporting
 * @returns Object with chunks, hashes, and any errors
 */
async function processDocFileBatch(
  files: string[],
  projectPath: string,
  embeddingEngine: EmbeddingEngine,
  onProgress?: DocsProgressCallback,
  progressOffset: number = 0,
  totalFiles: number = files.length
): Promise<{
  chunks: ChunkRecord[];
  hashes: Map<string, string>;
  errors: string[];
}> {
  const logger = getLogger();
  const allChunks: ChunkRecord[] = [];
  const fileHashes = new Map<string, string>();
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const relativePath = files[i];
    const absolutePath = toAbsolutePath(relativePath, projectPath);

    // Report chunking progress
    if (onProgress) {
      onProgress({
        phase: 'chunking',
        current: progressOffset + i + 1,
        total: totalFiles,
        currentFile: relativePath,
      });
    }

    try {
      // Chunk the doc file with prose-optimized settings
      const chunks = await chunkDocFile(absolutePath, relativePath);

      if (chunks.length === 0) {
        // Empty file or no chunks - still track it with its hash
        const hash = await hashFile(absolutePath);
        fileHashes.set(relativePath, hash);
        continue;
      }

      // Store the content hash from the first chunk (all chunks have same hash)
      fileHashes.set(relativePath, chunks[0].contentHash);

      // Collect chunks for embedding
      for (const chunk of chunks) {
        allChunks.push({
          id: chunk.id,
          path: chunk.path,
          text: chunk.text,
          vector: [], // Will be filled during embedding
          start_line: chunk.startLine,
          end_line: chunk.endLine,
          content_hash: chunk.contentHash,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('DocsIndexManager', 'Failed to chunk doc file', {
        file: relativePath,
        error: message,
      });
      errors.push(`${relativePath}: ${message}`);
    }
  }

  // Generate embeddings for all chunks
  if (allChunks.length > 0) {
    const texts = allChunks.map((c) => c.text);

    logger.debug(
      'DocsIndexManager',
      `Generating embeddings for ${texts.length} doc chunks`
    );

    // Report embedding phase
    if (onProgress) {
      onProgress({
        phase: 'embedding',
        current: 0,
        total: texts.length,
      });
    }

    const vectors = await embeddingEngine.embedBatch(texts, (completed, total) => {
      if (onProgress) {
        onProgress({
          phase: 'embedding',
          current: completed,
          total: total,
        });
      }
    });

    // Assign vectors to chunks
    for (let i = 0; i < allChunks.length; i++) {
      allChunks[i].vector = vectors[i];
    }
  }

  return { chunks: allChunks, hashes: fileHashes, errors };
}

/**
 * Create a full docs index for a project
 *
 * Pipeline stages:
 * 1. Initialize components (policy, store, fingerprints)
 * 2. Scan doc files (apply policy)
 * 3. Process files in batches (chunk, embed)
 * 4. Store in DocsLanceDB
 * 5. Update docs-fingerprints.json
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param onProgress - Optional progress callback
 * @returns DocsIndexResult with operation details
 */
export async function createDocsIndex(
  projectPath: string,
  indexPath: string,
  onProgress?: DocsProgressCallback
): Promise<DocsIndexResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedIndexPath = normalizePath(indexPath);
  const errors: string[] = [];

  logger.info('DocsIndexManager', 'Starting full docs index creation', {
    projectPath: normalizedProjectPath,
    indexPath: normalizedIndexPath,
  });

  // Ensure index directory exists
  if (!fs.existsSync(normalizedIndexPath)) {
    fs.mkdirSync(normalizedIndexPath, { recursive: true });
  }

  // Initialize components
  const configManager = new ConfigManager(normalizedIndexPath);
  await configManager.ensureExists();
  const config = await configManager.load();

  const policy = new IndexingPolicy(normalizedProjectPath, config);
  await policy.initialize();

  const store = new DocsLanceDBStore(normalizedIndexPath);
  const fingerprintsManager = new DocsFingerprintsManager(
    normalizedIndexPath,
    normalizedProjectPath
  );

  // Initialize embedding engine
  const embeddingEngine = getEmbeddingEngine();
  await embeddingEngine.initialize();

  try {
    // Delete existing docs data for clean start
    await store.delete();
    await store.open();

    // Clear docs fingerprints for new index
    fingerprintsManager.setAll(new Map());

    // Scan doc files
    const files = await scanDocFiles(
      normalizedProjectPath,
      policy,
      config,
      onProgress
    );

    if (files.length === 0) {
      logger.warn('DocsIndexManager', 'No doc files to index');

      await fingerprintsManager.save();

      return {
        success: true,
        filesIndexed: 0,
        chunksCreated: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Process files in batches
    let totalChunks = 0;
    const allHashes = new Map<string, string>();

    for (let i = 0; i < files.length; i += DOC_FILE_BATCH_SIZE) {
      const batch = files.slice(i, i + DOC_FILE_BATCH_SIZE);
      const batchNum = Math.floor(i / DOC_FILE_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(files.length / DOC_FILE_BATCH_SIZE);

      logger.debug('DocsIndexManager', `Processing batch ${batchNum}/${totalBatches}`, {
        batchSize: batch.length,
      });

      const {
        chunks,
        hashes,
        errors: batchErrors,
      } = await processDocFileBatch(
        batch,
        normalizedProjectPath,
        embeddingEngine,
        onProgress,
        i,
        files.length
      );

      errors.push(...batchErrors);

      // Store chunks in DocsLanceDB
      if (chunks.length > 0) {
        if (onProgress) {
          onProgress({
            phase: 'storing',
            current: i + batch.length,
            total: files.length,
          });
        }

        await store.insertChunks(chunks);
        totalChunks += chunks.length;
      }

      // Collect hashes
      for (const [path, hash] of hashes) {
        allHashes.set(path, hash);
      }
    }

    // Update docs fingerprints
    fingerprintsManager.setAll(allHashes);
    await fingerprintsManager.save();

    await store.close();

    const durationMs = Date.now() - startTime;
    logger.info('DocsIndexManager', 'Full docs index created successfully', {
      filesIndexed: allHashes.size,
      chunksCreated: totalChunks,
      durationMs,
      errorCount: errors.length,
    });

    return {
      success: errors.length === 0,
      filesIndexed: allHashes.size,
      chunksCreated: totalChunks,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    await store.close();

    // Re-throw MCPErrors
    if (isMCPError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error('DocsIndexManager', 'Full docs index creation failed', {
      error: message,
    });

    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage:
        'Failed to create the documentation search index. Please try again.',
      developerMessage: `Docs index creation failed: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================================================
// Incremental Update Functions
// ============================================================================

/**
 * Update a single doc file in the index
 *
 * Handles three cases:
 * - File exists and changed: Delete old chunks, add new ones
 * - File exists and new: Add chunks
 * - File deleted: Remove chunks
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param relativePath - Relative path of the file to update
 */
export async function updateDocFile(
  projectPath: string,
  indexPath: string,
  relativePath: string
): Promise<void> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedIndexPath = normalizePath(indexPath);
  const absolutePath = toAbsolutePath(relativePath, normalizedProjectPath);

  logger.info('DocsIndexManager', 'Updating doc file', { relativePath });

  // Initialize components
  const store = new DocsLanceDBStore(normalizedIndexPath);
  await store.open();

  const fingerprintsManager = new DocsFingerprintsManager(
    normalizedIndexPath,
    normalizedProjectPath
  );
  await fingerprintsManager.load();

  const embeddingEngine = getEmbeddingEngine();
  await embeddingEngine.initialize();

  try {
    // Check if file exists
    const fileExists = fs.existsSync(absolutePath);

    if (!fileExists) {
      // File was deleted - remove from index
      await store.deleteByPath(relativePath);
      fingerprintsManager.delete(relativePath);
      logger.debug('DocsIndexManager', 'Removed deleted doc file from index', {
        relativePath,
      });
    } else {
      // File exists - check if it changed
      const newHash = await hashFile(absolutePath);
      const oldHash = fingerprintsManager.get(relativePath);

      if (oldHash === newHash) {
        logger.debug('DocsIndexManager', 'Doc file unchanged, skipping', {
          relativePath,
        });
        await store.close();
        return;
      }

      // Delete old chunks
      await store.deleteByPath(relativePath);

      // Chunk and embed the doc file
      const chunks = await chunkDocFile(absolutePath, relativePath);

      if (chunks.length > 0) {
        const texts = chunks.map((c) => c.text);
        const vectors = await embeddingEngine.embedBatch(texts);

        const records: ChunkRecord[] = chunks.map((chunk, i) => ({
          id: chunk.id,
          path: chunk.path,
          text: chunk.text,
          vector: vectors[i],
          start_line: chunk.startLine,
          end_line: chunk.endLine,
          content_hash: chunk.contentHash,
        }));

        await store.insertChunks(records);
      }

      // Update fingerprint
      fingerprintsManager.set(relativePath, newHash);
      logger.debug('DocsIndexManager', 'Updated doc file in index', {
        relativePath,
        chunks: chunks.length,
      });
    }

    // Save fingerprints
    await fingerprintsManager.save();

    await store.close();
  } catch (error) {
    await store.close();
    throw error;
  }
}

/**
 * Remove a doc file from the index
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param relativePath - Relative path of the file to remove
 */
export async function removeDocFile(
  projectPath: string,
  indexPath: string,
  relativePath: string
): Promise<void> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedIndexPath = normalizePath(indexPath);

  logger.info('DocsIndexManager', 'Removing doc file from index', { relativePath });

  const store = new DocsLanceDBStore(normalizedIndexPath);
  await store.open();

  const fingerprintsManager = new DocsFingerprintsManager(
    normalizedIndexPath,
    normalizedProjectPath
  );
  await fingerprintsManager.load();

  try {
    // Delete chunks from store
    await store.deleteByPath(relativePath);

    // Remove from fingerprints
    fingerprintsManager.delete(relativePath);
    await fingerprintsManager.save();

    await store.close();

    logger.debug('DocsIndexManager', 'Doc file removed from index', { relativePath });
  } catch (error) {
    await store.close();
    throw error;
  }
}

/**
 * Apply a delta (batch of changes) to the docs index
 *
 * Processes:
 * - Added files: Chunk, embed, and insert
 * - Modified files: Delete old chunks, then add new ones
 * - Removed files: Delete chunks and fingerprints
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param delta - DocsDeltaResult with added, modified, and removed files
 * @param onProgress - Optional progress callback
 * @returns DocsIndexResult with operation details
 */
export async function applyDocsDelta(
  projectPath: string,
  indexPath: string,
  delta: DocsDeltaResult,
  onProgress?: DocsProgressCallback
): Promise<DocsIndexResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedIndexPath = normalizePath(indexPath);
  const errors: string[] = [];

  const totalChanges =
    delta.added.length + delta.modified.length + delta.removed.length;

  if (totalChanges === 0) {
    logger.info('DocsIndexManager', 'No changes to apply');
    return {
      success: true,
      filesIndexed: 0,
      chunksCreated: 0,
      durationMs: Date.now() - startTime,
    };
  }

  logger.info('DocsIndexManager', 'Applying docs delta', {
    added: delta.added.length,
    modified: delta.modified.length,
    removed: delta.removed.length,
  });

  // Initialize components
  const store = new DocsLanceDBStore(normalizedIndexPath);
  await store.open();

  const fingerprintsManager = new DocsFingerprintsManager(
    normalizedIndexPath,
    normalizedProjectPath
  );
  await fingerprintsManager.load();

  const embeddingEngine = getEmbeddingEngine();
  await embeddingEngine.initialize();

  try {
    let totalChunksCreated = 0;
    let processedFiles = 0;

    // 1. Remove deleted files
    for (const relativePath of delta.removed) {
      try {
        await store.deleteByPath(relativePath);
        fingerprintsManager.delete(relativePath);
        processedFiles++;

        if (onProgress) {
          onProgress({
            phase: 'storing',
            current: processedFiles,
            total: totalChanges,
            currentFile: relativePath,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`remove ${relativePath}: ${message}`);
      }
    }

    // 2. Handle modified files (delete old, then add new)
    for (const relativePath of delta.modified) {
      try {
        await store.deleteByPath(relativePath);
      } catch (error) {
        // Log but continue - file might not have been indexed before
        logger.debug(
          'DocsIndexManager',
          'Could not delete modified doc file chunks',
          {
            file: relativePath,
          }
        );
      }
    }

    // 3. Process added and modified files together
    const filesToAdd = [...delta.added, ...delta.modified];

    if (filesToAdd.length > 0) {
      // Process in batches
      for (let i = 0; i < filesToAdd.length; i += DOC_FILE_BATCH_SIZE) {
        const batch = filesToAdd.slice(i, i + DOC_FILE_BATCH_SIZE);

        const {
          chunks,
          hashes,
          errors: batchErrors,
        } = await processDocFileBatch(
          batch,
          normalizedProjectPath,
          embeddingEngine,
          onProgress,
          delta.removed.length + i,
          totalChanges
        );

        errors.push(...batchErrors);

        // Store chunks
        if (chunks.length > 0) {
          await store.insertChunks(chunks);
          totalChunksCreated += chunks.length;
        }

        // Update fingerprints
        for (const [path, hash] of hashes) {
          fingerprintsManager.set(path, hash);
        }

        processedFiles += batch.length;
      }
    }

    // Save fingerprints
    await fingerprintsManager.save();

    await store.close();

    const durationMs = Date.now() - startTime;
    logger.info('DocsIndexManager', 'Docs delta applied successfully', {
      filesProcessed: filesToAdd.length,
      filesRemoved: delta.removed.length,
      chunksCreated: totalChunksCreated,
      durationMs,
      errorCount: errors.length,
    });

    return {
      success: errors.length === 0,
      filesIndexed: filesToAdd.length,
      chunksCreated: totalChunksCreated,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    await store.close();

    if (isMCPError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage:
        'Failed to update the documentation search index. Please try rebuilding it.',
      developerMessage: `Docs delta application failed: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================================================
// DocsIndexManager Class
// ============================================================================

/**
 * Docs Index Manager class for managing documentation indexes
 *
 * Provides high-level operations for:
 * - Creating and rebuilding docs indexes
 * - Incremental doc file updates
 * - Index deletion
 * - Status and statistics
 *
 * @example
 * ```typescript
 * const manager = new DocsIndexManager('/path/to/project', '/path/to/index');
 * await manager.initialize();
 *
 * // Create a new docs index
 * const result = await manager.createDocsIndex((progress) => {
 *   console.log(`${progress.phase}: ${progress.current}/${progress.total}`);
 * });
 *
 * // Update a single doc file
 * await manager.updateDocFile('docs/README.md');
 *
 * // Get statistics
 * const stats = await manager.getDocsStats();
 * console.log(`Indexed ${stats.totalDocs} doc files`);
 *
 * await manager.close();
 * ```
 */
export class DocsIndexManager {
  private readonly projectPath: string;
  private readonly indexPath: string;
  private store: DocsLanceDBStore;
  private fingerprints: DocsFingerprintsManager;
  private isInitialized: boolean = false;

  /**
   * Create a new DocsIndexManager instance
   *
   * @param projectPath - Absolute path to the project root
   * @param indexPath - Absolute path to the index directory (optional - derived from projectPath if not provided)
   */
  constructor(projectPath: string, indexPath?: string) {
    this.projectPath = normalizePath(projectPath);
    this.indexPath = indexPath
      ? normalizePath(indexPath)
      : getIndexPath(this.projectPath);
    this.store = new DocsLanceDBStore(this.indexPath);
    this.fingerprints = new DocsFingerprintsManager(
      this.indexPath,
      this.projectPath
    );
  }

  /**
   * Initialize the manager (open store and load fingerprints)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.store.open();

    // Try to load fingerprints, but don't fail if they don't exist yet
    try {
      await this.fingerprints.load();
    } catch {
      // Fingerprints might not exist yet - that's OK
      this.fingerprints.setAll(new Map());
    }

    this.isInitialized = true;
  }

  /**
   * Close the manager (close store)
   */
  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    await this.store.close();
    this.isInitialized = false;
  }

  /**
   * Get the project path
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Get the index path
   */
  getIndexPath(): string {
    return this.indexPath;
  }

  // ==========================================================================
  // Full Index Operations
  // ==========================================================================

  /**
   * Create a new docs index for the project
   *
   * Creates a complete docs index from scratch, deleting any existing docs index data.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns DocsIndexResult with operation details
   */
  async createDocsIndex(
    onProgress?: DocsProgressCallback
  ): Promise<DocsIndexResult> {
    // Close current connection for clean start
    await this.close();

    const result = await createDocsIndex(
      this.projectPath,
      this.indexPath,
      onProgress
    );

    // Re-initialize after creation
    await this.initialize();

    return result;
  }

  /**
   * Rebuild the docs index from scratch
   *
   * Alias for createDocsIndex - deletes existing docs index and recreates it.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns DocsIndexResult with operation details
   */
  async rebuildDocsIndex(
    onProgress?: DocsProgressCallback
  ): Promise<DocsIndexResult> {
    return this.createDocsIndex(onProgress);
  }

  /**
   * Delete the docs index completely
   *
   * Removes all docs index data including:
   * - DocsLanceDB database
   * - Docs fingerprints
   */
  async deleteDocsIndex(): Promise<void> {
    const logger = getLogger();
    logger.info('DocsIndexManager', 'Deleting docs index', {
      indexPath: this.indexPath,
    });

    await this.close();

    // Delete DocsLanceDB store
    await this.store.delete();

    // Delete docs fingerprints file
    const fingerprintsPath = this.fingerprints.getDocsFingerprintsPath();
    if (fs.existsSync(fingerprintsPath)) {
      fs.unlinkSync(fingerprintsPath);
    }

    logger.info('DocsIndexManager', 'Docs index deleted successfully');
  }

  // ==========================================================================
  // Incremental Operations
  // ==========================================================================

  /**
   * Update a single doc file in the index
   *
   * @param relativePath - Relative path of the file (forward-slash separated)
   */
  async updateDocFile(relativePath: string): Promise<void> {
    await this.close();
    await updateDocFile(this.projectPath, this.indexPath, relativePath);
    await this.initialize();
  }

  /**
   * Remove a doc file from the index
   *
   * @param relativePath - Relative path of the file (forward-slash separated)
   */
  async removeDocFile(relativePath: string): Promise<void> {
    await this.close();
    await removeDocFile(this.projectPath, this.indexPath, relativePath);
    await this.initialize();
  }

  /**
   * Apply a batch of changes to the docs index
   *
   * @param delta - DocsDeltaResult with added, modified, and removed files
   * @param onProgress - Optional callback for progress updates
   * @returns DocsIndexResult with operation details
   */
  async applyDelta(
    delta: DocsDeltaResult,
    onProgress?: DocsProgressCallback
  ): Promise<DocsIndexResult> {
    await this.close();
    const result = await applyDocsDelta(
      this.projectPath,
      this.indexPath,
      delta,
      onProgress
    );
    await this.initialize();
    return result;
  }

  // ==========================================================================
  // Status and Statistics
  // ==========================================================================

  /**
   * Check if a docs index exists for this project
   *
   * @returns true if the docs index exists and has data
   */
  async isDocsIndexed(): Promise<boolean> {
    // Try to open and check if there's data
    try {
      const tempStore = new DocsLanceDBStore(this.indexPath);
      await tempStore.open();
      const hasData = await tempStore.hasData();
      await tempStore.close();
      return hasData;
    } catch {
      return false;
    }
  }

  /**
   * Get docs index statistics
   *
   * @returns DocsStats with file count, chunk count, etc.
   */
  async getDocsStats(): Promise<DocsStats> {
    const tempStore = new DocsLanceDBStore(this.indexPath);
    await tempStore.open();

    const totalDocs = await tempStore.countFiles();
    const totalDocChunks = await tempStore.countChunks();
    const storageSizeBytes = await tempStore.getStorageSize();

    await tempStore.close();

    return {
      totalDocs,
      totalDocChunks,
      storageSizeBytes,
    };
  }

  /**
   * Scan for doc files in the project
   *
   * @param config - Optional config override
   * @param onProgress - Optional progress callback
   * @returns Array of relative file paths for doc files
   */
  async scanDocFiles(
    config?: Config,
    onProgress?: DocsProgressCallback
  ): Promise<string[]> {
    const configToUse =
      config || (await loadConfig(this.indexPath));
    const policy = new IndexingPolicy(this.projectPath, configToUse);
    await policy.initialize();

    return scanDocFiles(this.projectPath, policy, configToUse, onProgress);
  }
}

// ============================================================================
// Module Exports
// ============================================================================

export type { DocsDeltaResult } from '../storage/docsFingerprints.js';
