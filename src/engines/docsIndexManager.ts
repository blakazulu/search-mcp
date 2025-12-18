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
import {
  getDocsEmbeddingEngine,
  EmbeddingEngine,
  DOCS_MODEL_NAME,
  DOCS_EMBEDDING_DIMENSION,
} from './embedding.js';
import {
  extractComments,
  supportsCommentExtraction,
  formatCommentForIndex,
  type ExtractedComment,
} from './commentExtractor.js';

// Utility imports
import {
  toRelativePath,
  toAbsolutePath,
  normalizePath,
  getIndexPath,
} from '../utils/paths.js';
import { hashFile } from '../utils/hash.js';
import { getLogger } from '../utils/logger.js';
import { logMemoryUsage, isMemoryHigh, requestGarbageCollection } from '../utils/memory.js';
import { MCPError, ErrorCode, isMCPError } from '../errors/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Batch size for processing doc files
 * 50 files per batch balances memory usage and progress granularity
 */
export const DOC_FILE_BATCH_SIZE = 50;

/**
 * Streaming batch size for high memory situations
 * When memory is above 80%, we use this smaller batch size
 */
export const DOC_STREAMING_BATCH_SIZE = 3;

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
  /** Warning message (e.g., when 0 docs indexed despite files existing) */
  warning?: string;
  /** Number of doc files found by glob before filtering (for diagnostics) */
  globFilesFound?: number;
  /** Number of code files scanned for comments (SMCP-100) */
  codeFilesScanned?: number;
  /** Number of comments extracted from code (SMCP-100) */
  commentsExtracted?: number;
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
 * @returns Scan result with files array and diagnostic info
 */
export interface ScanDocFilesResult {
  /** Files that passed filtering and will be indexed */
  files: string[];
  /** Total files found by glob before filtering */
  globFilesFound: number;
}

export async function scanDocFiles(
  projectPath: string,
  policy: IndexingPolicy,
  config: Config,
  onProgress?: DocsProgressCallback
): Promise<ScanDocFilesResult> {
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

  // Log raw glob results for debugging (helpful when 0 docs are indexed)
  logger.info('DocsIndexManager', 'Glob found doc files before filtering', {
    count: allDocFiles.length,
    patterns: DOC_FILE_PATTERNS,
    cwd: normalizedProjectPath,
    sampleFiles: allDocFiles.slice(0, 5),
  });

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

  // Log warning when no docs found for easier debugging
  if (indexableDocFiles.length === 0 && allDocFiles.length > 0) {
    logger.warn('DocsIndexManager', 'All doc files were filtered out by policy', {
      totalFound: allDocFiles.length,
      sampleFilteredFiles: allDocFiles.slice(0, 5),
    });
  }

  return {
    files: indexableDocFiles,
    globFilesFound: allDocFiles.length,
  };
}

// ============================================================================
// Code Comment Extraction (SMCP-100)
// ============================================================================

/**
 * Scan code files and extract documentation comments
 *
 * Extracts JSDoc, docstrings, and other documentation comments from code files
 * to make them searchable via the docs index.
 *
 * @param projectPath - Absolute path to the project root
 * @param policy - Initialized IndexingPolicy instance
 * @param config - Project configuration
 * @param onProgress - Optional callback for progress updates
 * @returns Array of extracted comments with metadata
 */
export async function extractCodeComments(
  projectPath: string,
  policy: IndexingPolicy,
  config: Config,
  onProgress?: DocsProgressCallback
): Promise<{ comments: ExtractedComment[]; codeFilesScanned: number; errors: string[] }> {
  const logger = getLogger();
  const normalizedProjectPath = normalizePath(projectPath);
  const allComments: ExtractedComment[] = [];
  const errors: string[] = [];

  // Check if comment extraction is enabled
  if (!config.extractComments) {
    logger.debug('DocsIndexManager', 'Comment extraction disabled in config');
    return { comments: [], codeFilesScanned: 0, errors: [] };
  }

  logger.info('DocsIndexManager', 'Starting code comment extraction', {
    projectPath: normalizedProjectPath,
  });

  // Scan for code files that support comment extraction
  const codePatterns = [
    '**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.cjs',
    '**/*.py', '**/*.pyw',
    '**/*.go',
    '**/*.rs',
    '**/*.java',
    '**/*.cs',
    '**/*.c', '**/*.cpp', '**/*.h', '**/*.hpp',
  ];

  const codeFiles: string[] = [];

  try {
    for (const pattern of codePatterns) {
      const files = await glob(pattern, {
        cwd: normalizedProjectPath,
        nodir: true,
        dot: true,
        absolute: false,
      });

      for (const file of files) {
        const normalized = file.replace(/\\/g, '/');
        if (!codeFiles.includes(normalized)) {
          codeFiles.push(normalized);
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('DocsIndexManager', 'Failed to scan for code files', { error: message });
    return { comments: [], codeFilesScanned: 0, errors: [message] };
  }

  logger.info('DocsIndexManager', 'Found code files for comment extraction', {
    count: codeFiles.length,
  });

  // Filter through policy and extract comments
  let scannedCount = 0;
  const indexableFiles: string[] = [];

  for (const relativePath of codeFiles) {
    const absolutePath = toAbsolutePath(relativePath, normalizedProjectPath);

    try {
      const result = await policy.shouldIndex(relativePath, absolutePath);
      if (result.shouldIndex && supportsCommentExtraction(relativePath)) {
        indexableFiles.push(relativePath);
      }
    } catch (error) {
      // Skip files that can't be checked
      logger.debug('DocsIndexManager', 'Skipping code file due to policy check error', {
        file: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('DocsIndexManager', 'Filtered code files for comment extraction', {
    total: codeFiles.length,
    indexable: indexableFiles.length,
  });

  // Extract comments from indexable files
  for (let i = 0; i < indexableFiles.length; i++) {
    const relativePath = indexableFiles[i];
    const absolutePath = toAbsolutePath(relativePath, normalizedProjectPath);

    // Report progress periodically
    if (onProgress && (i % 50 === 0 || i === indexableFiles.length - 1)) {
      onProgress({
        phase: 'scanning',
        current: i + 1,
        total: indexableFiles.length,
        currentFile: relativePath,
      });
    }

    try {
      // Read file content
      const content = await fs.promises.readFile(absolutePath, 'utf-8');

      // Extract comments
      const comments = await extractComments(content, relativePath);

      if (comments.length > 0) {
        allComments.push(...comments);
        logger.debug('DocsIndexManager', 'Extracted comments from file', {
          file: relativePath,
          count: comments.length,
        });
      }

      scannedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug('DocsIndexManager', 'Failed to extract comments from file', {
        file: relativePath,
        error: message,
      });
      errors.push(`${relativePath}: ${message}`);
    }
  }

  logger.info('DocsIndexManager', 'Code comment extraction complete', {
    filesScanned: scannedCount,
    commentsExtracted: allComments.length,
    errors: errors.length,
  });

  return { comments: allComments, codeFilesScanned: scannedCount, errors };
}

/**
 * Convert extracted comments to ChunkRecords for indexing
 *
 * @param comments - Array of extracted comments
 * @param embeddingEngine - Initialized embedding engine
 * @param onProgress - Optional progress callback
 * @returns Array of ChunkRecords ready for insertion
 */
async function processCommentBatch(
  comments: ExtractedComment[],
  embeddingEngine: EmbeddingEngine,
  onProgress?: DocsProgressCallback
): Promise<{ chunks: ChunkRecord[]; errors: string[] }> {
  const logger = getLogger();
  const errors: string[] = [];

  if (comments.length === 0) {
    return { chunks: [], errors: [] };
  }

  // Format comments for indexing
  const textsAndRecords: { text: string; comment: ExtractedComment }[] = comments.map(comment => ({
    text: formatCommentForIndex(comment),
    comment,
  }));

  const texts = textsAndRecords.map(t => t.text);

  logger.debug('DocsIndexManager', `Generating embeddings for ${texts.length} comment chunks`);

  // Report embedding phase
  if (onProgress) {
    onProgress({
      phase: 'embedding',
      current: 0,
      total: texts.length,
    });
  }

  // Generate embeddings
  const embeddingResult = await embeddingEngine.embedBatch(texts, (completed, total) => {
    if (onProgress) {
      onProgress({
        phase: 'embedding',
        current: completed,
        total,
      });
    }
  });

  // Create ChunkRecords for successful embeddings
  const chunks: ChunkRecord[] = [];
  for (let successIdx = 0; successIdx < embeddingResult.successIndices.length; successIdx++) {
    const originalIndex = embeddingResult.successIndices[successIdx];
    const { text, comment } = textsAndRecords[originalIndex];

    // Create a unique ID that indicates this is a code comment
    const chunkId = `comment:${comment.filePath}:${comment.startLine}:${uuidv4().slice(0, 8)}`;

    // Use the file path with a marker for code comments
    // This allows filtering comments in search results if needed
    const indexPath = `[code-comment] ${comment.filePath}`;

    chunks.push({
      id: chunkId,
      path: indexPath,
      text,
      vector: embeddingResult.vectors[successIdx],
      start_line: comment.startLine,
      end_line: comment.endLine,
      content_hash: '', // Comments don't need content hash tracking
    });
  }

  // Log embedding failures
  if (embeddingResult.failedCount > 0) {
    logger.warn('DocsIndexManager', `${embeddingResult.failedCount} comment chunks failed to embed`, {
      failedCount: embeddingResult.failedCount,
      successCount: embeddingResult.vectors.length,
    });
    errors.push(`${embeddingResult.failedCount} comment chunks failed to embed`);
  }

  return { chunks, errors };
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

    const embeddingResult = await embeddingEngine.embedBatch(texts, (completed, total) => {
      if (onProgress) {
        onProgress({
          phase: 'embedding',
          current: completed,
          total: total,
        });
      }
    });

    // SECURITY (SMCP-054): Only keep chunks with successful embeddings
    // Filter out chunks that failed to embed (no zero vectors inserted)
    const successfulChunks: ChunkRecord[] = [];
    for (let successIdx = 0; successIdx < embeddingResult.successIndices.length; successIdx++) {
      const originalIndex = embeddingResult.successIndices[successIdx];
      const chunk = allChunks[originalIndex];
      chunk.vector = embeddingResult.vectors[successIdx];
      successfulChunks.push(chunk);
    }

    // Log embedding failures
    if (embeddingResult.failedCount > 0) {
      logger.warn('DocsIndexManager', `${embeddingResult.failedCount} doc chunks failed to embed and were skipped`, {
        failedCount: embeddingResult.failedCount,
        successCount: embeddingResult.vectors.length,
      });
      errors.push(`${embeddingResult.failedCount} doc chunks failed to embed`);
    }

    return { chunks: successfulChunks, hashes: fileHashes, errors };
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

  // SMCP-074: Use docs embedding engine with 768 dimensions
  const store = new DocsLanceDBStore(normalizedIndexPath, DOCS_EMBEDDING_DIMENSION);
  const fingerprintsManager = new DocsFingerprintsManager(
    normalizedIndexPath,
    normalizedProjectPath
  );

  // SMCP-074: Initialize docs embedding engine (BGE-base, 768 dims)
  const embeddingEngine = getDocsEmbeddingEngine();
  await embeddingEngine.initialize();

  try {
    // Delete existing docs data for clean start
    await store.delete();
    await store.open();

    // Clear docs fingerprints for new index
    fingerprintsManager.setAll(new Map());

    // Scan doc files
    const scanResult = await scanDocFiles(
      normalizedProjectPath,
      policy,
      config,
      onProgress
    );
    const { files, globFilesFound } = scanResult;

    if (files.length === 0) {
      logger.info('DocsIndexManager', 'No doc files to index, checking for code comments', {
        globFilesFound,
        projectPath: normalizedProjectPath,
      });

      // Even with no doc files, we may still want to extract comments
      let codeFilesScanned = 0;
      let commentsExtracted = 0;
      let totalChunks = 0;

      if (config.extractComments) {
        const commentResult = await extractCodeComments(
          normalizedProjectPath,
          policy,
          config,
          onProgress
        );

        codeFilesScanned = commentResult.codeFilesScanned;
        commentsExtracted = commentResult.comments.length;
        errors.push(...commentResult.errors);

        if (commentResult.comments.length > 0) {
          const { chunks: commentChunks, errors: commentErrors } = await processCommentBatch(
            commentResult.comments,
            embeddingEngine,
            onProgress
          );

          errors.push(...commentErrors);

          if (commentChunks.length > 0) {
            await store.insertChunks(commentChunks);
            totalChunks = commentChunks.length;
          }
        }
      }

      await fingerprintsManager.save();

      // Include warning when glob found files but all were filtered
      const warning = globFilesFound > 0
        ? `Found ${globFilesFound} doc files (*.md, *.txt) but all were filtered out by indexing policy. Check gitignore, exclude patterns, or file size limits.`
        : undefined;

      return {
        success: true,
        filesIndexed: 0,
        chunksCreated: totalChunks,
        durationMs: Date.now() - startTime,
        warning,
        globFilesFound,
        codeFilesScanned,
        commentsExtracted,
      };
    }

    // Process files in batches
    let totalChunks = 0;
    const allHashes = new Map<string, string>();

    // Log memory before starting indexing
    logMemoryUsage('Starting docs index');

    // Detect if we should use streaming mode (memory > 80%)
    const useStreamingMode = isMemoryHigh();
    if (useStreamingMode) {
      logger.info('DocsIndexManager', 'Using streaming mode due to high memory pressure', {
        batchSize: DOC_STREAMING_BATCH_SIZE,
      });
    }

    const effectiveBatchSize = useStreamingMode ? DOC_STREAMING_BATCH_SIZE : DOC_FILE_BATCH_SIZE;

    for (let i = 0; i < files.length; i += effectiveBatchSize) {
      const batch = files.slice(i, i + effectiveBatchSize);
      const batchNum = Math.floor(i / effectiveBatchSize) + 1;
      const totalBatches = Math.ceil(files.length / effectiveBatchSize);

      // Request GC before each batch to free memory from previous operations
      requestGarbageCollection();

      logger.debug('DocsIndexManager', `Processing batch ${batchNum}/${totalBatches}`, {
        batchSize: batch.length,
        streamingMode: useStreamingMode,
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

    // SMCP-100: Extract and index code comments
    let codeFilesScanned = 0;
    let commentsExtracted = 0;

    if (config.extractComments) {
      logger.info('DocsIndexManager', 'Starting code comment extraction (SMCP-100)');

      const commentResult = await extractCodeComments(
        normalizedProjectPath,
        policy,
        config,
        onProgress
      );

      codeFilesScanned = commentResult.codeFilesScanned;
      commentsExtracted = commentResult.comments.length;
      errors.push(...commentResult.errors);

      // Process and store comments
      if (commentResult.comments.length > 0) {
        logger.info('DocsIndexManager', 'Processing extracted comments', {
          count: commentResult.comments.length,
        });

        const { chunks: commentChunks, errors: commentErrors } = await processCommentBatch(
          commentResult.comments,
          embeddingEngine,
          onProgress
        );

        errors.push(...commentErrors);

        // Store comment chunks
        if (commentChunks.length > 0) {
          if (onProgress) {
            onProgress({
              phase: 'storing',
              current: commentChunks.length,
              total: commentChunks.length,
            });
          }

          await store.insertChunks(commentChunks);
          totalChunks += commentChunks.length;

          logger.info('DocsIndexManager', 'Stored comment chunks', {
            count: commentChunks.length,
          });
        }
      }
    }

    // SMCP-074: Update metadata with docs model info and stats
    const metadataManager = new MetadataManager(normalizedIndexPath);
    const existingMetadata = await metadataManager.load();
    if (existingMetadata) {
      // Update docs stats
      const storageSize = await store.getStorageSize();
      metadataManager.updateDocsStats(allHashes.size, totalChunks, storageSize);
      // Save docs embedding model info for migration detection
      metadataManager.updateDocsModelInfo(DOCS_MODEL_NAME, DOCS_EMBEDDING_DIMENSION);
      metadataManager.markDocsIndex();
      await metadataManager.save();
    }

    await store.close();

    const durationMs = Date.now() - startTime;
    logger.info('DocsIndexManager', 'Full docs index created successfully', {
      filesIndexed: allHashes.size,
      chunksCreated: totalChunks,
      codeFilesScanned,
      commentsExtracted,
      durationMs,
      errorCount: errors.length,
    });

    return {
      success: errors.length === 0,
      filesIndexed: allHashes.size,
      chunksCreated: totalChunks,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
      codeFilesScanned,
      commentsExtracted,
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
  // SMCP-074: Use docs embedding engine with 768 dimensions
  const store = new DocsLanceDBStore(normalizedIndexPath, DOCS_EMBEDDING_DIMENSION);
  await store.open();

  const fingerprintsManager = new DocsFingerprintsManager(
    normalizedIndexPath,
    normalizedProjectPath
  );
  await fingerprintsManager.load();

  // SMCP-074: use dedicated docs embedding engine
  const embeddingEngine = getDocsEmbeddingEngine();
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
          logger.warn('DocsIndexManager', `${embeddingResult.failedCount} doc chunks failed to embed for file`, {
            relativePath,
            failedCount: embeddingResult.failedCount,
          });
        }

        if (records.length > 0) {
          await store.insertChunks(records);
        }
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

  // SMCP-074: Use docs embedding engine with 768 dimensions
  const store = new DocsLanceDBStore(normalizedIndexPath, DOCS_EMBEDDING_DIMENSION);
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
  // SMCP-074: Use docs embedding engine with 768 dimensions
  const store = new DocsLanceDBStore(normalizedIndexPath, DOCS_EMBEDDING_DIMENSION);
  await store.open();

  const fingerprintsManager = new DocsFingerprintsManager(
    normalizedIndexPath,
    normalizedProjectPath
  );
  await fingerprintsManager.load();

  // SMCP-074: use dedicated docs embedding engine
  const embeddingEngine = getDocsEmbeddingEngine();
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
    // SMCP-074: Use docs embedding engine with 768 dimensions
    this.store = new DocsLanceDBStore(this.indexPath, DOCS_EMBEDDING_DIMENSION);
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
    const logger = getLogger();

    // Close current connection for clean start
    await this.close();

    const result = await createDocsIndex(
      this.projectPath,
      this.indexPath,
      onProgress
    );

    // Re-initialize after creation (Bug #24 - handle initialization errors)
    try {
      await this.initialize();
    } catch (error) {
      // Log the error but don't fail - the indexing itself succeeded
      logger.error('DocsIndexManager', 'Failed to reinitialize after index creation', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Reset to a known state
      this.isInitialized = false;
    }

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
      // SMCP-074: Use docs embedding engine with 768 dimensions
      const tempStore = new DocsLanceDBStore(this.indexPath, DOCS_EMBEDDING_DIMENSION);
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
    // SMCP-074: Use docs embedding engine with 768 dimensions
    const tempStore = new DocsLanceDBStore(this.indexPath, DOCS_EMBEDDING_DIMENSION);
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
   * @returns Scan result with files array and diagnostic info
   */
  async scanDocFiles(
    config?: Config,
    onProgress?: DocsProgressCallback
  ): Promise<ScanDocFilesResult> {
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
