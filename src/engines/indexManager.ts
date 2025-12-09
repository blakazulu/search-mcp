/**
 * Index Manager Module
 *
 * Central orchestrator for all indexing operations. Coordinates file discovery,
 * policy filtering, chunking, embedding, and storage. Handles both full indexing
 * and incremental updates.
 *
 * Features:
 * - Full project indexing with progress reporting
 * - Incremental updates (single file and batch delta)
 * - Atomic operations (rollback on failure)
 * - Memory management with file batching
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import { v4 as uuidv4 } from 'uuid';

// Storage imports
import { LanceDBStore, ChunkRecord } from '../storage/lancedb.js';
import { FingerprintsManager, DeltaResult, Fingerprints } from '../storage/fingerprints.js';
import { MetadataManager } from '../storage/metadata.js';
import { ConfigManager, Config, loadConfig, generateDefaultConfig } from '../storage/config.js';

// Engine imports
import { IndexingPolicy } from './indexPolicy.js';
import { chunkFile, Chunk } from './chunking.js';
import { getEmbeddingEngine, EmbeddingEngine } from './embedding.js';

// Utility imports
import { toRelativePath, toAbsolutePath, normalizePath, getIndexPath } from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { logMemoryUsage, getAdaptiveBatchSize, isMemoryCritical } from '../utils/memory.js';
import { MCPError, ErrorCode, fileLimitWarning, isMCPError } from '../errors/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Batch size for processing files
 * 50 files per batch balances memory usage and progress granularity
 */
export const FILE_BATCH_SIZE = 50;

// ============================================================================
// Progress Reporting Types
// ============================================================================

/**
 * Progress phases during indexing
 */
export type IndexPhase = 'scanning' | 'chunking' | 'embedding' | 'storing';

/**
 * Progress information during indexing operations
 */
export interface IndexProgress {
  /** Current phase of the indexing operation */
  phase: IndexPhase;
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
export type ProgressCallback = (progress: IndexProgress) => void;

/**
 * Result of an indexing operation
 */
export interface IndexResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Number of files indexed */
  filesIndexed: number;
  /** Number of chunks created */
  chunksCreated: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Errors encountered (if any) */
  errors?: string[];
}

/**
 * Statistics for an index
 */
export interface IndexStats {
  /** Total number of indexed files */
  totalFiles: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Storage size in bytes */
  storageSizeBytes: number;
  /** ISO timestamp of last full index */
  lastFullIndex: string;
  /** ISO timestamp of last incremental update (optional) */
  lastIncrementalUpdate?: string;
}

// ============================================================================
// File Scanner
// ============================================================================

/**
 * Scan a project directory for indexable files
 *
 * Recursively finds all files that should be indexed based on:
 * - Hardcoded deny patterns (always excluded)
 * - User exclude patterns from config
 * - Gitignore rules (if respectGitignore is enabled)
 * - Binary file detection
 * - File size limits
 *
 * @param projectPath - Absolute path to the project root
 * @param policy - Initialized IndexingPolicy instance
 * @param config - Project configuration
 * @param onProgress - Optional callback for progress updates
 * @returns Array of relative file paths that should be indexed
 */
export async function scanFiles(
  projectPath: string,
  policy: IndexingPolicy,
  config: Config,
  onProgress?: ProgressCallback
): Promise<string[]> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);

  logger.info('IndexManager', 'Starting file scan', { projectPath: normalizedProjectPath });

  // Report scanning phase started
  if (onProgress) {
    onProgress({
      phase: 'scanning',
      current: 0,
      total: 0, // Unknown until scan completes
    });
  }

  // Get all files in the project using glob
  // Use forward slashes for cross-platform glob compatibility
  const globPattern = '**/*';
  const allFiles: string[] = [];

  try {
    const files = await glob(globPattern, {
      cwd: normalizedProjectPath,
      nodir: true, // Only files, not directories
      dot: true, // Include dotfiles
      absolute: false, // Get relative paths
    });

    // Convert to forward-slash format (glob should already do this)
    for (const file of files) {
      allFiles.push(file.replace(/\\/g, '/'));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('IndexManager', 'Failed to scan directory', {
      projectPath: normalizedProjectPath,
      error: message,
    });
    throw new MCPError({
      code: ErrorCode.PERMISSION_DENIED,
      userMessage: 'Failed to scan the project directory. Please check permissions.',
      developerMessage: `Glob scan failed for ${normalizedProjectPath}: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }

  logger.debug('IndexManager', `Found ${allFiles.length} total files before filtering`);

  // Filter files through indexing policy
  const indexableFiles: string[] = [];
  let scannedCount = 0;

  for (const relativePath of allFiles) {
    scannedCount++;

    // Report progress periodically (every 100 files)
    if (onProgress && scannedCount % 100 === 0) {
      onProgress({
        phase: 'scanning',
        current: scannedCount,
        total: allFiles.length,
        currentFile: relativePath,
      });
    }

    const absolutePath = toAbsolutePath(relativePath, normalizedProjectPath);

    try {
      const result = await policy.shouldIndex(relativePath, absolutePath);
      if (result.shouldIndex) {
        indexableFiles.push(relativePath);
      }
    } catch (error) {
      // Log but skip files that can't be checked
      logger.debug('IndexManager', 'Skipping file due to policy check error', {
        file: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Warn if file count exceeds limit
  if (indexableFiles.length > config.maxFiles) {
    logger.warn('IndexManager', 'File count exceeds limit', {
      count: indexableFiles.length,
      limit: config.maxFiles,
    });
    // Create warning but don't throw - just log it
    fileLimitWarning(indexableFiles.length, config.maxFiles);
  }

  // Final progress update
  if (onProgress) {
    onProgress({
      phase: 'scanning',
      current: allFiles.length,
      total: allFiles.length,
    });
  }

  logger.info('IndexManager', 'File scan complete', {
    total: allFiles.length,
    indexable: indexableFiles.length,
    filtered: allFiles.length - indexableFiles.length,
  });

  return indexableFiles;
}

// ============================================================================
// Indexing Pipeline Functions
// ============================================================================

/**
 * Process a batch of files through the indexing pipeline
 *
 * For each file:
 * 1. Read and chunk the file
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
async function processFileBatch(
  files: string[],
  projectPath: string,
  embeddingEngine: EmbeddingEngine,
  onProgress?: ProgressCallback,
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

  // Log memory at start of batch (MCP-22)
  logMemoryUsage(`Processing batch: ${files.length} files`);

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

    // Check memory before processing each file (MCP-22)
    if (isMemoryCritical()) {
      logger.warn('IndexManager', 'Memory critical, skipping remaining files in batch', {
        processed: i,
        remaining: files.length - i,
      });
      errors.push(`Skipped ${files.length - i} files due to memory constraints`);
      break;
    }

    try {
      // Chunk the file
      const chunks = await chunkFile(absolutePath, relativePath);

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
      logger.warn('IndexManager', 'Failed to chunk file', {
        file: relativePath,
        error: message,
      });
      errors.push(`${relativePath}: ${message}`);
    }
  }

  // Log memory after chunking phase
  logMemoryUsage(`Chunking complete: ${allChunks.length} chunks`);

  // Generate embeddings for all chunks
  if (allChunks.length > 0) {
    const texts = allChunks.map((c) => c.text);

    logger.debug('IndexManager', `Generating embeddings for ${texts.length} chunks`);

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

    // Log memory after embedding phase
    logMemoryUsage(`Embedding complete: ${vectors.length} vectors`);
  }

  return { chunks: allChunks, hashes: fileHashes, errors };
}

/**
 * Create a full index for a project
 *
 * Pipeline stages:
 * 1. Initialize components (policy, store, fingerprints)
 * 2. Scan files (apply policy)
 * 3. Process files in batches (chunk, embed)
 * 4. Store in LanceDB
 * 5. Update fingerprints and metadata
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param onProgress - Optional progress callback
 * @returns IndexResult with operation details
 */
export async function createFullIndex(
  projectPath: string,
  indexPath: string,
  onProgress?: ProgressCallback
): Promise<IndexResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedIndexPath = normalizePath(indexPath);
  const errors: string[] = [];

  logger.info('IndexManager', 'Starting full index creation', {
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

  const store = new LanceDBStore(normalizedIndexPath);
  const fingerprintsManager = new FingerprintsManager(normalizedIndexPath, normalizedProjectPath);
  const metadataManager = new MetadataManager(normalizedIndexPath);

  // Initialize embedding engine
  const embeddingEngine = getEmbeddingEngine();
  await embeddingEngine.initialize();

  try {
    // Delete existing data for clean start
    await store.delete();
    await store.open();

    // Clear fingerprints for new index
    fingerprintsManager.setAll(new Map());

    // Scan files
    const files = await scanFiles(normalizedProjectPath, policy, config, onProgress);

    if (files.length === 0) {
      logger.warn('IndexManager', 'No files to index');

      // Save empty metadata
      metadataManager.initialize(normalizedProjectPath);
      metadataManager.updateStats(0, 0, 0);
      metadataManager.markFullIndex();
      await metadataManager.save();
      await fingerprintsManager.save();

      return {
        success: true,
        filesIndexed: 0,
        chunksCreated: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Process files in batches with adaptive sizing (MCP-22)
    let totalChunks = 0;
    const allHashes = new Map<string, string>();

    // Log memory before starting indexing
    logMemoryUsage('Starting full index');

    let i = 0;
    while (i < files.length) {
      // Use adaptive batch sizing based on memory pressure (MCP-22)
      const currentBatchSize = getAdaptiveBatchSize(FILE_BATCH_SIZE, 10);
      const batch = files.slice(i, i + currentBatchSize);
      const batchNum = Math.floor(i / FILE_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(files.length / FILE_BATCH_SIZE);

      logger.debug('IndexManager', `Processing batch ${batchNum}/${totalBatches}`, {
        batchSize: batch.length,
        adaptedBatchSize: currentBatchSize,
      });

      const { chunks, hashes, errors: batchErrors } = await processFileBatch(
        batch,
        normalizedProjectPath,
        embeddingEngine,
        onProgress,
        i,
        files.length
      );

      errors.push(...batchErrors);

      // Store chunks in LanceDB
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

      i += currentBatchSize;
    }

    // Log memory after indexing
    logMemoryUsage('Full index complete');

    // Update fingerprints
    fingerprintsManager.setAll(allHashes);
    await fingerprintsManager.save();

    // Update metadata
    const storageSize = await store.getStorageSize();
    metadataManager.initialize(normalizedProjectPath);
    metadataManager.updateStats(allHashes.size, totalChunks, storageSize);
    metadataManager.markFullIndex();
    await metadataManager.save();

    await store.close();

    const durationMs = Date.now() - startTime;
    logger.info('IndexManager', 'Full index created successfully', {
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
    logger.error('IndexManager', 'Full index creation failed', { error: message });

    throw new MCPError({
      code: ErrorCode.INDEX_CORRUPT,
      userMessage: 'Failed to create the search index. Please try again.',
      developerMessage: `Index creation failed: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================================================
// Incremental Update Functions
// ============================================================================

/**
 * Update a single file in the index
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
export async function updateFile(
  projectPath: string,
  indexPath: string,
  relativePath: string
): Promise<void> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedIndexPath = normalizePath(indexPath);
  const absolutePath = toAbsolutePath(relativePath, normalizedProjectPath);

  logger.info('IndexManager', 'Updating file', { relativePath });

  // Initialize components
  const store = new LanceDBStore(normalizedIndexPath);
  await store.open();

  const fingerprintsManager = new FingerprintsManager(normalizedIndexPath, normalizedProjectPath);
  await fingerprintsManager.load();

  const metadataManager = new MetadataManager(normalizedIndexPath);
  await metadataManager.load();

  const embeddingEngine = getEmbeddingEngine();
  await embeddingEngine.initialize();

  try {
    // Check if file exists
    const fileExists = fs.existsSync(absolutePath);

    if (!fileExists) {
      // File was deleted - remove from index
      await store.deleteByPath(relativePath);
      fingerprintsManager.delete(relativePath);
      logger.debug('IndexManager', 'Removed deleted file from index', { relativePath });
    } else {
      // File exists - check if it changed
      const newHash = await hashFile(absolutePath);
      const oldHash = fingerprintsManager.get(relativePath);

      if (oldHash === newHash) {
        logger.debug('IndexManager', 'File unchanged, skipping', { relativePath });
        await store.close();
        return;
      }

      // Delete old chunks
      await store.deleteByPath(relativePath);

      // Chunk and embed the file
      const chunks = await chunkFile(absolutePath, relativePath);

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
      logger.debug('IndexManager', 'Updated file in index', {
        relativePath,
        chunks: chunks.length,
      });
    }

    // Save fingerprints
    await fingerprintsManager.save();

    // Update metadata
    const totalChunks = await store.countChunks();
    const totalFiles = await store.countFiles();
    const storageSize = await store.getStorageSize();
    metadataManager.updateStats(totalFiles, totalChunks, storageSize);
    metadataManager.markIncrementalUpdate();
    await metadataManager.save();

    await store.close();
  } catch (error) {
    await store.close();
    throw error;
  }
}

/**
 * Remove a file from the index
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param relativePath - Relative path of the file to remove
 */
export async function removeFile(
  projectPath: string,
  indexPath: string,
  relativePath: string
): Promise<void> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedIndexPath = normalizePath(indexPath);

  logger.info('IndexManager', 'Removing file from index', { relativePath });

  const store = new LanceDBStore(normalizedIndexPath);
  await store.open();

  const fingerprintsManager = new FingerprintsManager(normalizedIndexPath, normalizedProjectPath);
  await fingerprintsManager.load();

  const metadataManager = new MetadataManager(normalizedIndexPath);
  await metadataManager.load();

  try {
    // Delete chunks from store
    await store.deleteByPath(relativePath);

    // Remove from fingerprints
    fingerprintsManager.delete(relativePath);
    await fingerprintsManager.save();

    // Update metadata
    const totalChunks = await store.countChunks();
    const totalFiles = await store.countFiles();
    const storageSize = await store.getStorageSize();
    metadataManager.updateStats(totalFiles, totalChunks, storageSize);
    metadataManager.markIncrementalUpdate();
    await metadataManager.save();

    await store.close();

    logger.debug('IndexManager', 'File removed from index', { relativePath });
  } catch (error) {
    await store.close();
    throw error;
  }
}

/**
 * Apply a delta (batch of changes) to the index
 *
 * Processes:
 * - Added files: Chunk, embed, and insert
 * - Modified files: Delete old chunks, then add new ones
 * - Removed files: Delete chunks and fingerprints
 *
 * @param projectPath - Absolute path to the project root
 * @param indexPath - Absolute path to the index directory
 * @param delta - DeltaResult with added, modified, and removed files
 * @param onProgress - Optional progress callback
 * @returns IndexResult with operation details
 */
export async function applyDelta(
  projectPath: string,
  indexPath: string,
  delta: DeltaResult,
  onProgress?: ProgressCallback
): Promise<IndexResult> {
  const logger = getLogger();
  const startTime = Date.now();
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedIndexPath = normalizePath(indexPath);
  const errors: string[] = [];

  const totalChanges = delta.added.length + delta.modified.length + delta.removed.length;

  if (totalChanges === 0) {
    logger.info('IndexManager', 'No changes to apply');
    return {
      success: true,
      filesIndexed: 0,
      chunksCreated: 0,
      durationMs: Date.now() - startTime,
    };
  }

  logger.info('IndexManager', 'Applying delta', {
    added: delta.added.length,
    modified: delta.modified.length,
    removed: delta.removed.length,
  });

  // Initialize components
  const store = new LanceDBStore(normalizedIndexPath);
  await store.open();

  const fingerprintsManager = new FingerprintsManager(normalizedIndexPath, normalizedProjectPath);
  await fingerprintsManager.load();

  const metadataManager = new MetadataManager(normalizedIndexPath);
  await metadataManager.load();

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
        logger.debug('IndexManager', 'Could not delete modified file chunks', {
          file: relativePath,
        });
      }
    }

    // 3. Process added and modified files together
    const filesToAdd = [...delta.added, ...delta.modified];

    if (filesToAdd.length > 0) {
      // Process in batches
      for (let i = 0; i < filesToAdd.length; i += FILE_BATCH_SIZE) {
        const batch = filesToAdd.slice(i, i + FILE_BATCH_SIZE);

        const { chunks, hashes, errors: batchErrors } = await processFileBatch(
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

    // Update metadata
    const totalChunks = await store.countChunks();
    const totalFiles = await store.countFiles();
    const storageSize = await store.getStorageSize();
    metadataManager.updateStats(totalFiles, totalChunks, storageSize);
    metadataManager.markIncrementalUpdate();
    await metadataManager.save();

    await store.close();

    const durationMs = Date.now() - startTime;
    logger.info('IndexManager', 'Delta applied successfully', {
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
      userMessage: 'Failed to update the search index. Please try rebuilding it.',
      developerMessage: `Delta application failed: ${message}`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

// ============================================================================
// IndexManager Class
// ============================================================================

/**
 * Index Manager class for managing project indexes
 *
 * Provides high-level operations for:
 * - Creating and rebuilding indexes
 * - Incremental file updates
 * - Index deletion
 * - Status and statistics
 *
 * @example
 * ```typescript
 * const manager = new IndexManager('/path/to/project', '/path/to/index');
 *
 * // Create a new index
 * const result = await manager.createIndex((progress) => {
 *   console.log(`${progress.phase}: ${progress.current}/${progress.total}`);
 * });
 *
 * // Update a single file
 * await manager.updateFile('src/utils/helper.ts');
 *
 * // Get statistics
 * const stats = await manager.getStats();
 * console.log(`Indexed ${stats.totalFiles} files`);
 * ```
 */
export class IndexManager {
  private readonly projectPath: string;
  private readonly indexPath: string;

  /**
   * Create a new IndexManager instance
   *
   * @param projectPath - Absolute path to the project root
   * @param indexPath - Absolute path to the index directory (optional - derived from projectPath if not provided)
   */
  constructor(projectPath: string, indexPath?: string) {
    this.projectPath = normalizePath(projectPath);
    this.indexPath = indexPath ? normalizePath(indexPath) : getIndexPath(this.projectPath);
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
   * Create a new index for the project
   *
   * Creates a complete index from scratch, deleting any existing index data.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns IndexResult with operation details
   */
  async createIndex(onProgress?: ProgressCallback): Promise<IndexResult> {
    return createFullIndex(this.projectPath, this.indexPath, onProgress);
  }

  /**
   * Rebuild the index from scratch
   *
   * Alias for createIndex - deletes existing index and recreates it.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns IndexResult with operation details
   */
  async rebuildIndex(onProgress?: ProgressCallback): Promise<IndexResult> {
    return this.createIndex(onProgress);
  }

  /**
   * Delete the index completely
   *
   * Removes all index data including:
   * - LanceDB database
   * - Fingerprints
   * - Metadata
   * - Config (preserves if you want to keep settings)
   */
  async deleteIndex(): Promise<void> {
    const logger = getLogger();
    logger.info('IndexManager', 'Deleting index', { indexPath: this.indexPath });

    // Delete LanceDB store
    const store = new LanceDBStore(this.indexPath);
    await store.delete();

    // Delete fingerprints, metadata files
    const fingerprintsPath = path.join(this.indexPath, 'fingerprints.json');
    const metadataPath = path.join(this.indexPath, 'metadata.json');

    if (fs.existsSync(fingerprintsPath)) {
      fs.unlinkSync(fingerprintsPath);
    }
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

    logger.info('IndexManager', 'Index deleted successfully');
  }

  // ==========================================================================
  // Incremental Operations
  // ==========================================================================

  /**
   * Update a single file in the index
   *
   * @param relativePath - Relative path of the file (forward-slash separated)
   */
  async updateFile(relativePath: string): Promise<void> {
    return updateFile(this.projectPath, this.indexPath, relativePath);
  }

  /**
   * Remove a file from the index
   *
   * @param relativePath - Relative path of the file (forward-slash separated)
   */
  async removeFile(relativePath: string): Promise<void> {
    return removeFile(this.projectPath, this.indexPath, relativePath);
  }

  /**
   * Apply a batch of changes to the index
   *
   * @param delta - DeltaResult with added, modified, and removed files
   * @param onProgress - Optional callback for progress updates
   * @returns IndexResult with operation details
   */
  async applyDelta(delta: DeltaResult, onProgress?: ProgressCallback): Promise<IndexResult> {
    return applyDelta(this.projectPath, this.indexPath, delta, onProgress);
  }

  // ==========================================================================
  // Status and Statistics
  // ==========================================================================

  /**
   * Check if an index exists for this project
   *
   * @returns true if the index exists and has metadata
   */
  async isIndexed(): Promise<boolean> {
    const metadataPath = path.join(this.indexPath, 'metadata.json');
    return fs.existsSync(metadataPath);
  }

  /**
   * Get index statistics
   *
   * @returns IndexStats with file count, chunk count, etc.
   * @throws MCPError if index doesn't exist
   */
  async getStats(): Promise<IndexStats> {
    const metadataManager = new MetadataManager(this.indexPath);
    const metadata = await metadataManager.load();

    if (!metadata) {
      throw new MCPError({
        code: ErrorCode.INDEX_NOT_FOUND,
        userMessage: 'No search index exists for this project. Please create one first using the create_index tool.',
        developerMessage: `No metadata found at ${this.indexPath}`,
      });
    }

    return {
      totalFiles: metadata.stats.totalFiles,
      totalChunks: metadata.stats.totalChunks,
      storageSizeBytes: metadata.stats.storageSizeBytes,
      lastFullIndex: metadata.lastFullIndex,
      lastIncrementalUpdate: metadata.lastIncrementalUpdate,
    };
  }
}

// ============================================================================
// Module Exports
// ============================================================================

export type { DeltaResult } from '../storage/fingerprints.js';
