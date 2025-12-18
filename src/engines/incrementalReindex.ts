/**
 * Incremental Reindexing Engine (SMCP-098)
 *
 * Implements surgical chunk-level updates to avoid re-embedding entire files
 * when only a small portion has changed. This dramatically improves performance
 * for large files where most content remains unchanged.
 *
 * Key Features:
 * - Hash-based chunk change detection (position-independent)
 * - Moved chunk detection (same content, different position)
 * - Reuses existing embeddings for unchanged chunks
 * - Surgical deletion of removed chunks
 *
 * Performance Improvement:
 * - Before: Edit 1 line in 5000-line file = re-embed ~50 chunks = ~2.5 seconds
 * - After: Edit 1 line = re-embed ~2 affected chunks = ~100ms (25x faster)
 *
 * @module incrementalReindex
 */

import * as crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../utils/logger.js';
import { Chunk } from './chunking.js';
import { ExistingChunk, ChunkRecord } from '../storage/lancedb.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Result of comparing old and new chunks for a file
 */
export interface ChunkDiffResult {
  /** Chunks that need to be added (new content, need embedding) */
  added: NewChunk[];
  /** Chunks that were removed (delete from store) */
  removed: ExistingChunk[];
  /** Chunks that are unchanged (keep as-is) */
  unchanged: ExistingChunk[];
  /** Chunks that moved position but content is same (update metadata only) */
  moved: MovedChunk[];
  /** Statistics about the diff */
  stats: ChunkDiffStats;
}

/**
 * A new chunk that needs embedding
 */
export interface NewChunk {
  /** Generated UUID for the chunk */
  id: string;
  /** Chunk text content */
  text: string;
  /** Start line in source file */
  startLine: number;
  /** End line in source file */
  endLine: number;
  /** Position-independent hash of chunk content */
  chunkHash: string;
}

/**
 * A chunk that moved position but has the same content
 */
export interface MovedChunk {
  /** The existing chunk (with old position) */
  existing: ExistingChunk;
  /** New line position */
  newStartLine: number;
  /** New end line position */
  newEndLine: number;
}

/**
 * Statistics about the chunk diff
 */
export interface ChunkDiffStats {
  /** Total old chunks */
  oldChunkCount: number;
  /** Total new chunks */
  newChunkCount: number;
  /** Number of chunks to add */
  addedCount: number;
  /** Number of chunks to remove */
  removedCount: number;
  /** Number of unchanged chunks */
  unchangedCount: number;
  /** Number of moved chunks */
  movedCount: number;
  /** Estimated embedding operations saved */
  embeddingsSaved: number;
  /** Whether incremental approach was beneficial */
  incrementalBeneficial: boolean;
}

/**
 * Result of an incremental reindex operation
 */
export interface IncrementalReindexResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Number of new chunks embedded */
  chunksEmbedded: number;
  /** Number of chunks reused (embedding saved) */
  chunksReused: number;
  /** Number of chunks deleted */
  chunksDeleted: number;
  /** Number of chunks with updated metadata */
  chunksUpdated: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Hash Functions
// ============================================================================

/**
 * Compute a position-independent hash for a chunk
 *
 * This hash is based only on the normalized text content, not on
 * line numbers or position. This allows detecting moved chunks
 * that have the same content but different positions.
 *
 * @param text - Chunk text content
 * @returns SHA256 hash (first 32 characters)
 */
export function computeChunkHash(text: string): string {
  // Normalize: trim whitespace and collapse multiple whitespace to single space
  // This makes the hash more robust to minor formatting changes
  const normalized = text.trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').substring(0, 32);
}

// ============================================================================
// Diff Algorithm
// ============================================================================

/**
 * Compare old chunks with new chunks to determine minimal update operations
 *
 * Algorithm:
 * 1. Build a map of old chunks by their content hash
 * 2. For each new chunk:
 *    - If hash matches an old chunk at same position -> unchanged
 *    - If hash matches an old chunk at different position -> moved
 *    - If hash doesn't match any old chunk -> added
 * 3. Old chunks not matched by any new chunk -> removed
 *
 * @param oldChunks - Existing chunks from the database
 * @param newChunks - Newly generated chunks from the file
 * @returns ChunkDiffResult with categorized chunks
 */
export function diffChunks(
  oldChunks: ExistingChunk[],
  newChunks: Chunk[]
): ChunkDiffResult {
  const logger = getLogger();

  // Build map of old chunks by content hash
  // Multiple chunks can have the same hash (duplicate content)
  const oldByHash = new Map<string, ExistingChunk[]>();
  for (const chunk of oldChunks) {
    // Use existing hash if available, otherwise compute it
    const hash = chunk.chunkHash || computeChunkHash(chunk.text);
    const existing = oldByHash.get(hash) || [];
    existing.push(chunk);
    oldByHash.set(hash, existing);
  }

  // Track which old chunks have been matched
  const matchedOldIds = new Set<string>();

  // Categorize new chunks
  const added: NewChunk[] = [];
  const unchanged: ExistingChunk[] = [];
  const moved: MovedChunk[] = [];

  for (const newChunk of newChunks) {
    const hash = computeChunkHash(newChunk.text);
    const matchingOld = oldByHash.get(hash) || [];

    // Find an unmatched old chunk with this hash
    let matched: ExistingChunk | undefined;
    for (const candidate of matchingOld) {
      if (!matchedOldIds.has(candidate.id)) {
        matched = candidate;
        break;
      }
    }

    if (matched) {
      matchedOldIds.add(matched.id);

      // Check if position changed
      if (matched.startLine === newChunk.startLine && matched.endLine === newChunk.endLine) {
        // Exact match - unchanged
        unchanged.push(matched);
      } else {
        // Same content, different position - moved
        moved.push({
          existing: matched,
          newStartLine: newChunk.startLine,
          newEndLine: newChunk.endLine,
        });
      }
    } else {
      // No matching old chunk - this is new content
      added.push({
        id: uuidv4(),
        text: newChunk.text,
        startLine: newChunk.startLine,
        endLine: newChunk.endLine,
        chunkHash: hash,
      });
    }
  }

  // Find removed chunks (old chunks not matched by any new chunk)
  const removed: ExistingChunk[] = oldChunks.filter(
    (chunk) => !matchedOldIds.has(chunk.id)
  );

  // Calculate statistics
  const stats: ChunkDiffStats = {
    oldChunkCount: oldChunks.length,
    newChunkCount: newChunks.length,
    addedCount: added.length,
    removedCount: removed.length,
    unchangedCount: unchanged.length,
    movedCount: moved.length,
    embeddingsSaved: unchanged.length + moved.length,
    // Incremental is beneficial if we save more than half the embeddings
    incrementalBeneficial: unchanged.length + moved.length > newChunks.length / 2,
  };

  logger.debug('IncrementalReindex', 'Chunk diff completed', {
    old: stats.oldChunkCount,
    new: stats.newChunkCount,
    added: stats.addedCount,
    removed: stats.removedCount,
    unchanged: stats.unchangedCount,
    moved: stats.movedCount,
    embeddingsSaved: stats.embeddingsSaved,
  });

  return {
    added,
    removed,
    unchanged,
    moved,
    stats,
  };
}

// ============================================================================
// Record Conversion
// ============================================================================

/**
 * Create ChunkRecords from moved chunks (reusing existing embeddings)
 *
 * @param movedChunks - Chunks that moved position
 * @param relativePath - File path for the records
 * @param contentHash - File content hash
 * @returns ChunkRecords ready for insertion
 */
export function createRecordsFromMovedChunks(
  movedChunks: MovedChunk[],
  relativePath: string,
  contentHash: string
): ChunkRecord[] {
  return movedChunks.map((moved) => ({
    id: moved.existing.id,
    path: relativePath,
    text: moved.existing.text,
    vector: moved.existing.vector,
    start_line: moved.newStartLine,
    end_line: moved.newEndLine,
    content_hash: contentHash,
    chunk_hash: moved.existing.chunkHash,
  }));
}

/**
 * Create ChunkRecords from unchanged chunks (reusing everything)
 *
 * @param unchangedChunks - Chunks that haven't changed
 * @param relativePath - File path for the records
 * @param contentHash - File content hash
 * @returns ChunkRecords ready for insertion
 */
export function createRecordsFromUnchangedChunks(
  unchangedChunks: ExistingChunk[],
  relativePath: string,
  contentHash: string
): ChunkRecord[] {
  return unchangedChunks.map((chunk) => ({
    id: chunk.id,
    path: relativePath,
    text: chunk.text,
    vector: chunk.vector,
    start_line: chunk.startLine,
    end_line: chunk.endLine,
    content_hash: contentHash,
    chunk_hash: chunk.chunkHash,
  }));
}

/**
 * Create partial ChunkRecords from new chunks (need embedding)
 *
 * @param newChunks - New chunks that need embedding
 * @param relativePath - File path for the records
 * @param contentHash - File content hash
 * @returns Partial ChunkRecords (vector field will be empty)
 */
export function createPartialRecordsFromNewChunks(
  newChunks: NewChunk[],
  relativePath: string,
  contentHash: string
): ChunkRecord[] {
  return newChunks.map((chunk) => ({
    id: chunk.id,
    path: relativePath,
    text: chunk.text,
    vector: [], // Will be filled by embedding engine
    start_line: chunk.startLine,
    end_line: chunk.endLine,
    content_hash: contentHash,
    chunk_hash: chunk.chunkHash,
  }));
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if incremental reindexing should be used for this update
 *
 * Incremental reindexing has overhead (loading existing chunks, diffing).
 * It's only beneficial for larger files where we expect to save embeddings.
 *
 * @param oldChunkCount - Number of existing chunks for the file
 * @returns true if incremental approach should be used
 */
export function shouldUseIncremental(oldChunkCount: number): boolean {
  // Use incremental for files with 3+ chunks
  // Below that, the overhead isn't worth it
  return oldChunkCount >= 3;
}

/**
 * Determine if the diff result justifies incremental approach
 *
 * If most chunks are new anyway, it might be faster to just re-embed everything.
 *
 * @param diff - The chunk diff result
 * @returns true if incremental was worthwhile
 */
export function wasIncrementalWorthwhile(diff: ChunkDiffResult): boolean {
  // If we saved at least 25% of embeddings, it was worthwhile
  if (diff.stats.newChunkCount === 0) return true;
  const savedRatio = diff.stats.embeddingsSaved / diff.stats.newChunkCount;
  return savedRatio >= 0.25;
}
