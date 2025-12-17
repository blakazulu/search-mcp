/**
 * Merkle DAG Change Detection Engine
 *
 * Implements Merkle tree-based change detection for efficient incremental indexing.
 * This enables chunk-level change detection instead of file-level, reducing reindex
 * time significantly for large codebases with small changes.
 *
 * Inspired by claude-context-local's Merkle DAG implementation.
 *
 * Features:
 * - Content-hash based change detection
 * - Hierarchical structure: Project -> Directory -> File -> Chunk
 * - Efficient diff algorithm to identify changed nodes only
 * - Snapshot persistence for fast startup
 * - Support for detecting moved/renamed chunks
 *
 * @module merkleTree
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '../utils/logger.js';
import { atomicWriteJson } from '../utils/atomicWrite.js';
import { safeLoadJSON, MAX_JSON_FILE_SIZE, ResourceLimitError } from '../utils/limits.js';
import { MCPError, ErrorCode, isMCPError } from '../errors/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Type of Merkle node in the tree hierarchy
 */
export type MerkleNodeType = 'project' | 'directory' | 'file' | 'chunk';

/**
 * Base Merkle node structure
 */
export interface MerkleNode {
  /** Node type */
  type: MerkleNodeType;
  /** Relative path from project root */
  path: string;
  /** SHA256 hash of this node's content */
  hash: string;
  /** Hash of children combined (for non-leaf nodes) */
  childrenHash?: string;
  /** Child node hashes (for non-leaf nodes) */
  children?: Map<string, string>;
}

/**
 * Chunk node with additional metadata
 */
export interface ChunkNode extends MerkleNode {
  type: 'chunk';
  /** Start line in source file (1-indexed) */
  startLine: number;
  /** End line in source file (1-indexed) */
  endLine: number;
  /** Hash of the chunk text content */
  contentHash: string;
  /** Optional chunk type (function, class, etc.) */
  chunkType?: string;
  /** Optional chunk name */
  chunkName?: string;
}

/**
 * File node containing chunk children
 */
export interface FileNode extends MerkleNode {
  type: 'file';
  /** File content hash */
  contentHash: string;
  /** Size in bytes */
  size: number;
  /** Last modified timestamp */
  mtime: number;
  /** Map of chunk ID to chunk hash */
  chunks: Map<string, string>;
  /** Ordered list of chunk IDs for detecting reordering */
  chunkOrder: string[];
}

/**
 * Directory node containing file and subdirectory children
 */
export interface DirectoryNode extends MerkleNode {
  type: 'directory';
  /** Map of child name to child hash */
  children: Map<string, string>;
}

/**
 * Project root node
 */
export interface ProjectNode extends MerkleNode {
  type: 'project';
  /** Map of relative path to hash */
  children: Map<string, string>;
  /** Version for format migrations */
  version: string;
  /** Timestamp of last update */
  lastUpdated: string;
}

/**
 * Result of comparing two Merkle trees
 */
export interface MerkleDiff {
  /** Files that were added (new files) */
  addedFiles: string[];
  /** Files that were modified (content changed) */
  modifiedFiles: string[];
  /** Files that were removed */
  removedFiles: string[];
  /** Files with only chunk-level changes (for partial reindexing) */
  chunkChanges: ChunkDiff[];
  /** Total number of changes */
  totalChanges: number;
}

/**
 * Chunk-level diff for a single file
 */
export interface ChunkDiff {
  /** File path */
  filePath: string;
  /** Chunks that were added */
  addedChunks: string[];
  /** Chunks that were modified */
  modifiedChunks: string[];
  /** Chunks that were removed */
  removedChunks: string[];
  /** Chunks that appear to have moved (same hash, different position) */
  movedChunks: Array<{ chunkId: string; from: number; to: number }>;
}

/**
 * Serialized format for persistence
 */
interface SerializedMerkleTree {
  version: string;
  projectPath: string;
  rootHash: string;
  lastUpdated: string;
  files: Record<string, SerializedFileNode>;
  chunks: Record<string, SerializedChunkNode>;
}

interface SerializedFileNode {
  path: string;
  hash: string;
  contentHash: string;
  size: number;
  mtime: number;
  chunkOrder: string[];
}

interface SerializedChunkNode {
  id: string;
  filePath: string;
  hash: string;
  contentHash: string;
  startLine: number;
  endLine: number;
  chunkType?: string;
  chunkName?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Current Merkle tree format version */
export const MERKLE_TREE_VERSION = '1.0.0';

/** File name for persisted Merkle tree */
export const MERKLE_TREE_FILE = 'merkle-tree.json';

// ============================================================================
// Hash Computation Functions
// ============================================================================

/**
 * Compute SHA256 hash of a string
 */
export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compute hash for a chunk node
 *
 * @param text - Chunk text content
 * @param startLine - Start line number
 * @param endLine - End line number
 * @returns SHA256 hash
 */
export function computeChunkHash(
  text: string,
  startLine: number,
  endLine: number
): string {
  // Include position in hash to detect moved chunks
  const combined = `${startLine}:${endLine}:${text}`;
  return computeHash(combined);
}

/**
 * Compute content-only hash for a chunk (position-independent)
 *
 * Used for detecting moved chunks that have the same content
 *
 * @param text - Chunk text content
 * @returns SHA256 hash
 */
export function computeChunkContentHash(text: string): string {
  return computeHash(text);
}

/**
 * Compute hash for a file node based on its chunks
 *
 * The file hash is computed from the ordered list of chunk hashes,
 * making it sensitive to chunk reordering.
 *
 * @param chunkHashes - Ordered array of chunk hashes
 * @returns SHA256 hash
 */
export function computeFileHash(chunkHashes: string[]): string {
  const combined = chunkHashes.join(':');
  return computeHash(combined);
}

/**
 * Compute hash for a directory node based on its children
 *
 * Children are sorted by name for deterministic hashing.
 *
 * @param children - Map of child name to child hash
 * @returns SHA256 hash
 */
export function computeDirectoryHash(children: Map<string, string>): string {
  const sortedEntries = Array.from(children.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const combined = sortedEntries.map(([name, hash]) => `${name}:${hash}`).join('|');
  return computeHash(combined);
}

/**
 * Compute the root hash for the entire project
 *
 * @param fileHashes - Map of file path to file hash
 * @returns SHA256 hash
 */
export function computeProjectHash(fileHashes: Map<string, string>): string {
  const sortedEntries = Array.from(fileHashes.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const combined = sortedEntries.map(([path, hash]) => `${path}:${hash}`).join('|');
  return computeHash(combined);
}

// ============================================================================
// Diff Algorithm
// ============================================================================

/**
 * Compare two file node maps to detect changes
 *
 * @param oldFiles - Previous state file map
 * @param newFiles - Current state file map
 * @returns MerkleDiff with categorized changes
 */
export function diffFileMaps(
  oldFiles: Map<string, FileNode>,
  newFiles: Map<string, FileNode>
): MerkleDiff {
  const addedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const removedFiles: string[] = [];
  const chunkChanges: ChunkDiff[] = [];

  // Find added and modified files
  for (const [path, newFile] of newFiles) {
    const oldFile = oldFiles.get(path);

    if (!oldFile) {
      // File is new
      addedFiles.push(path);
    } else if (oldFile.hash !== newFile.hash) {
      // File changed - determine if it's a full change or chunk-level
      if (oldFile.contentHash !== newFile.contentHash) {
        // Content hash changed - file content completely different
        modifiedFiles.push(path);
      } else {
        // Same content hash but different file hash means chunk boundaries changed
        // This is a partial change that can be handled at chunk level
        const chunkDiff = diffChunks(path, oldFile, newFile);
        if (chunkDiff.addedChunks.length > 0 ||
            chunkDiff.modifiedChunks.length > 0 ||
            chunkDiff.removedChunks.length > 0) {
          chunkChanges.push(chunkDiff);
        } else {
          // Only chunk order changed - still needs reindexing
          modifiedFiles.push(path);
        }
      }
    }
    // else: unchanged file (same hash)
  }

  // Find removed files
  for (const path of oldFiles.keys()) {
    if (!newFiles.has(path)) {
      removedFiles.push(path);
    }
  }

  return {
    addedFiles,
    modifiedFiles,
    removedFiles,
    chunkChanges,
    totalChanges: addedFiles.length + modifiedFiles.length + removedFiles.length + chunkChanges.length,
  };
}

/**
 * Compare chunks within a file to detect chunk-level changes
 *
 * @param filePath - Path to the file
 * @param oldFile - Previous file state
 * @param newFile - Current file state
 * @returns ChunkDiff with categorized chunk changes
 */
function diffChunks(
  filePath: string,
  oldFile: FileNode,
  newFile: FileNode
): ChunkDiff {
  const addedChunks: string[] = [];
  const modifiedChunks: string[] = [];
  const removedChunks: string[] = [];
  const movedChunks: Array<{ chunkId: string; from: number; to: number }> = [];

  // Build index of old chunk positions
  const oldChunkPositions = new Map<string, number>();
  oldFile.chunkOrder.forEach((id, index) => oldChunkPositions.set(id, index));

  // Build index of new chunk positions
  const newChunkPositions = new Map<string, number>();
  newFile.chunkOrder.forEach((id, index) => newChunkPositions.set(id, index));

  // Find added and modified chunks
  for (const [chunkId, newHash] of newFile.chunks) {
    const oldHash = oldFile.chunks.get(chunkId);

    if (!oldHash) {
      addedChunks.push(chunkId);
    } else if (oldHash !== newHash) {
      modifiedChunks.push(chunkId);
    } else {
      // Same hash - check if position changed
      const oldPos = oldChunkPositions.get(chunkId);
      const newPos = newChunkPositions.get(chunkId);
      if (oldPos !== undefined && newPos !== undefined && oldPos !== newPos) {
        movedChunks.push({ chunkId, from: oldPos, to: newPos });
      }
    }
  }

  // Find removed chunks
  for (const chunkId of oldFile.chunks.keys()) {
    if (!newFile.chunks.has(chunkId)) {
      removedChunks.push(chunkId);
    }
  }

  return {
    filePath,
    addedChunks,
    modifiedChunks,
    removedChunks,
    movedChunks,
  };
}

// ============================================================================
// MerkleTreeManager Class
// ============================================================================

/**
 * Merkle Tree Manager for tracking project state
 *
 * Maintains a Merkle tree structure for efficient change detection.
 * Supports chunk-level granularity for partial reindexing.
 *
 * @example
 * ```typescript
 * const manager = new MerkleTreeManager('/path/to/index');
 * await manager.load();
 *
 * // Add files and chunks
 * manager.addFile('src/index.ts', chunks, contentHash, stat);
 *
 * // Compute diff against previous state
 * const diff = manager.computeDiff(previousManager);
 *
 * // Save state
 * await manager.save();
 * ```
 */
export class MerkleTreeManager {
  private readonly indexPath: string;
  private files: Map<string, FileNode> = new Map();
  private chunks: Map<string, ChunkNode> = new Map();
  private rootHash: string = '';
  private lastUpdated: string = '';
  private isDirty: boolean = false;
  private isLoaded: boolean = false;

  /**
   * Create a new MerkleTreeManager
   *
   * @param indexPath - Path to the index directory
   */
  constructor(indexPath: string) {
    this.indexPath = indexPath;
  }

  // ==========================================================================
  // Lifecycle Methods
  // ==========================================================================

  /**
   * Load Merkle tree state from disk
   *
   * Returns empty state if file doesn't exist.
   */
  async load(): Promise<void> {
    const logger = getLogger();
    const treePath = this.getTreePath();

    try {
      await fs.promises.access(treePath);
    } catch {
      // File doesn't exist - start with empty state
      logger.debug('MerkleTree', 'No existing tree found, starting fresh', { treePath });
      this.isLoaded = true;
      return;
    }

    try {
      const data = await safeLoadJSON<SerializedMerkleTree>(treePath, MAX_JSON_FILE_SIZE);

      // Validate version
      if (data.version !== MERKLE_TREE_VERSION) {
        logger.warn('MerkleTree', 'Version mismatch, rebuilding tree', {
          found: data.version,
          expected: MERKLE_TREE_VERSION,
        });
        this.isLoaded = true;
        return;
      }

      // Deserialize files
      for (const [path, serialized] of Object.entries(data.files)) {
        const fileNode: FileNode = {
          type: 'file',
          path: serialized.path,
          hash: serialized.hash,
          contentHash: serialized.contentHash,
          size: serialized.size,
          mtime: serialized.mtime,
          chunks: new Map(),
          chunkOrder: serialized.chunkOrder,
        };

        // Link chunks to file
        for (const chunkId of serialized.chunkOrder) {
          const chunkData = data.chunks[chunkId];
          if (chunkData) {
            fileNode.chunks.set(chunkId, chunkData.hash);
          }
        }

        this.files.set(path, fileNode);
      }

      // Deserialize chunks
      for (const [id, serialized] of Object.entries(data.chunks)) {
        const chunkNode: ChunkNode = {
          type: 'chunk',
          path: `${serialized.filePath}#${id}`,
          hash: serialized.hash,
          contentHash: serialized.contentHash,
          startLine: serialized.startLine,
          endLine: serialized.endLine,
          chunkType: serialized.chunkType,
          chunkName: serialized.chunkName,
        };
        this.chunks.set(id, chunkNode);
      }

      this.rootHash = data.rootHash;
      this.lastUpdated = data.lastUpdated;
      this.isLoaded = true;
      this.isDirty = false;

      logger.debug('MerkleTree', 'Loaded tree state', {
        files: this.files.size,
        chunks: this.chunks.size,
        rootHash: this.rootHash.substring(0, 8),
      });
    } catch (error) {
      if (error instanceof ResourceLimitError) {
        throw new MCPError({
          code: ErrorCode.INDEX_CORRUPT,
          userMessage: 'The Merkle tree file is too large. Please rebuild the index.',
          developerMessage: `Merkle tree exceeds size limit: ${error.message}`,
          cause: error,
        });
      }

      if (isMCPError(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.warn('MerkleTree', 'Failed to load tree, starting fresh', { error: message });
      this.isLoaded = true;
    }
  }

  /**
   * Save Merkle tree state to disk
   *
   * Uses atomic write to prevent corruption.
   */
  async save(): Promise<void> {
    if (!this.isDirty) {
      return;
    }

    const logger = getLogger();
    const treePath = this.getTreePath();

    // Serialize files
    const serializedFiles: Record<string, SerializedFileNode> = {};
    for (const [path, file] of this.files) {
      serializedFiles[path] = {
        path: file.path,
        hash: file.hash,
        contentHash: file.contentHash,
        size: file.size,
        mtime: file.mtime,
        chunkOrder: file.chunkOrder,
      };
    }

    // Serialize chunks
    const serializedChunks: Record<string, SerializedChunkNode> = {};
    for (const [id, chunk] of this.chunks) {
      // Extract file path from chunk path (format: "filePath#chunkId")
      const filePath = chunk.path.split('#')[0];
      serializedChunks[id] = {
        id,
        filePath,
        hash: chunk.hash,
        contentHash: chunk.contentHash,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        chunkType: chunk.chunkType,
        chunkName: chunk.chunkName,
      };
    }

    const data: SerializedMerkleTree = {
      version: MERKLE_TREE_VERSION,
      projectPath: '',
      rootHash: this.rootHash,
      lastUpdated: new Date().toISOString(),
      files: serializedFiles,
      chunks: serializedChunks,
    };

    await atomicWriteJson(treePath, data);
    this.isDirty = false;

    logger.debug('MerkleTree', 'Saved tree state', {
      files: this.files.size,
      chunks: this.chunks.size,
    });
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.files.clear();
    this.chunks.clear();
    this.rootHash = '';
    this.lastUpdated = '';
    this.isDirty = true;
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  /**
   * Add or update a file in the tree
   *
   * @param filePath - Relative path to the file
   * @param chunks - Array of chunk info
   * @param contentHash - SHA256 hash of file content
   * @param stats - File stats (size, mtime)
   */
  addFile(
    filePath: string,
    chunks: Array<{
      id: string;
      text: string;
      startLine: number;
      endLine: number;
      chunkType?: string;
      chunkName?: string;
    }>,
    contentHash: string,
    stats: { size: number; mtime: number }
  ): void {
    // Create chunk nodes and compute hashes
    const chunkOrder: string[] = [];
    const chunkHashes: string[] = [];
    const fileChunks = new Map<string, string>();

    for (const chunk of chunks) {
      const chunkContentHash = computeChunkContentHash(chunk.text);
      const chunkHash = computeChunkHash(chunk.text, chunk.startLine, chunk.endLine);

      const chunkNode: ChunkNode = {
        type: 'chunk',
        path: `${filePath}#${chunk.id}`,
        hash: chunkHash,
        contentHash: chunkContentHash,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        chunkType: chunk.chunkType,
        chunkName: chunk.chunkName,
      };

      this.chunks.set(chunk.id, chunkNode);
      chunkOrder.push(chunk.id);
      chunkHashes.push(chunkHash);
      fileChunks.set(chunk.id, chunkHash);
    }

    // Compute file hash from chunk hashes
    const fileHash = computeFileHash(chunkHashes);

    // Create file node
    const fileNode: FileNode = {
      type: 'file',
      path: filePath,
      hash: fileHash,
      contentHash,
      size: stats.size,
      mtime: stats.mtime,
      chunks: fileChunks,
      chunkOrder,
    };

    this.files.set(filePath, fileNode);
    this.isDirty = true;
  }

  /**
   * Remove a file from the tree
   *
   * @param filePath - Relative path to the file
   */
  removeFile(filePath: string): void {
    const file = this.files.get(filePath);
    if (!file) {
      return;
    }

    // Remove all chunks belonging to this file
    for (const chunkId of file.chunkOrder) {
      this.chunks.delete(chunkId);
    }

    this.files.delete(filePath);
    this.isDirty = true;
  }

  /**
   * Check if a file exists in the tree
   */
  hasFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  /**
   * Get a file node
   */
  getFile(filePath: string): FileNode | undefined {
    return this.files.get(filePath);
  }

  /**
   * Get all file paths
   */
  getFilePaths(): string[] {
    return Array.from(this.files.keys());
  }

  /**
   * Get the number of files
   */
  getFileCount(): number {
    return this.files.size;
  }

  /**
   * Get the number of chunks
   */
  getChunkCount(): number {
    return this.chunks.size;
  }

  // ==========================================================================
  // Diff Operations
  // ==========================================================================

  /**
   * Compute the root hash
   *
   * Call this after making changes to update the root hash.
   */
  computeRootHash(): string {
    const fileHashes = new Map<string, string>();
    for (const [path, file] of this.files) {
      fileHashes.set(path, file.hash);
    }
    this.rootHash = computeProjectHash(fileHashes);
    this.lastUpdated = new Date().toISOString();
    this.isDirty = true;
    return this.rootHash;
  }

  /**
   * Get the current root hash
   */
  getRootHash(): string {
    return this.rootHash;
  }

  /**
   * Compute diff between this tree and another
   *
   * @param other - Other Merkle tree manager (typically the previous state)
   * @returns MerkleDiff with all changes
   */
  computeDiff(other: MerkleTreeManager): MerkleDiff {
    return diffFileMaps(other.files, this.files);
  }

  /**
   * Quick check if the tree has changed from another
   *
   * Uses root hash comparison for O(1) check.
   *
   * @param other - Other Merkle tree manager
   * @returns true if trees are different
   */
  hasChanged(other: MerkleTreeManager): boolean {
    return this.rootHash !== other.rootHash;
  }

  /**
   * Get files that have changed compared to another tree
   *
   * Optimized version that only returns file paths without full diff details.
   *
   * @param other - Other Merkle tree manager
   * @returns Array of changed file paths
   */
  getChangedFiles(other: MerkleTreeManager): string[] {
    const changed: string[] = [];

    // Quick exit if root hashes match
    if (this.rootHash === other.rootHash) {
      return changed;
    }

    // Find added and modified files
    for (const [path, file] of this.files) {
      const otherFile = other.files.get(path);
      if (!otherFile || otherFile.hash !== file.hash) {
        changed.push(path);
      }
    }

    // Find removed files
    for (const path of other.files.keys()) {
      if (!this.files.has(path)) {
        changed.push(path);
      }
    }

    return changed;
  }

  // ==========================================================================
  // Chunk Operations
  // ==========================================================================

  /**
   * Get a chunk node by ID
   */
  getChunk(chunkId: string): ChunkNode | undefined {
    return this.chunks.get(chunkId);
  }

  /**
   * Get all chunks for a file
   */
  getFileChunks(filePath: string): ChunkNode[] {
    const file = this.files.get(filePath);
    if (!file) {
      return [];
    }

    const chunks: ChunkNode[] = [];
    for (const chunkId of file.chunkOrder) {
      const chunk = this.chunks.get(chunkId);
      if (chunk) {
        chunks.push(chunk);
      }
    }
    return chunks;
  }

  /**
   * Find chunks by content hash (for detecting moved chunks)
   *
   * @param contentHash - Content hash to search for
   * @returns Array of chunk IDs with matching content
   */
  findChunksByContentHash(contentHash: string): string[] {
    const matches: string[] = [];
    for (const [id, chunk] of this.chunks) {
      if (chunk.contentHash === contentHash) {
        matches.push(id);
      }
    }
    return matches;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Get the path to the Merkle tree file
   */
  getTreePath(): string {
    return path.join(this.indexPath, MERKLE_TREE_FILE);
  }

  /**
   * Check if the manager has been loaded
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Check if there are unsaved changes
   */
  get dirty(): boolean {
    return this.isDirty;
  }

  /**
   * Get statistics about the tree
   */
  getStats(): {
    fileCount: number;
    chunkCount: number;
    rootHash: string;
    lastUpdated: string;
  } {
    return {
      fileCount: this.files.size,
      chunkCount: this.chunks.size,
      rootHash: this.rootHash,
      lastUpdated: this.lastUpdated,
    };
  }

  /**
   * Create a snapshot of the current state (for rollback)
   */
  createSnapshot(): MerkleTreeManager {
    const snapshot = new MerkleTreeManager(this.indexPath);
    snapshot.files = new Map(this.files);
    snapshot.chunks = new Map(this.chunks);
    snapshot.rootHash = this.rootHash;
    snapshot.lastUpdated = this.lastUpdated;
    snapshot.isLoaded = true;
    snapshot.isDirty = false;
    return snapshot;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create and load a MerkleTreeManager
 *
 * @param indexPath - Path to the index directory
 * @returns Loaded MerkleTreeManager
 */
export async function createMerkleTreeManager(indexPath: string): Promise<MerkleTreeManager> {
  const manager = new MerkleTreeManager(indexPath);
  await manager.load();
  return manager;
}

/**
 * Build a Merkle tree from file and chunk data
 *
 * Helper function for building a tree from scratch during indexing.
 *
 * @param indexPath - Path to the index directory
 * @param files - Array of file data
 * @returns Populated MerkleTreeManager
 */
export async function buildMerkleTree(
  indexPath: string,
  files: Array<{
    path: string;
    contentHash: string;
    size: number;
    mtime: number;
    chunks: Array<{
      id: string;
      text: string;
      startLine: number;
      endLine: number;
      chunkType?: string;
      chunkName?: string;
    }>;
  }>
): Promise<MerkleTreeManager> {
  const manager = new MerkleTreeManager(indexPath);

  for (const file of files) {
    manager.addFile(file.path, file.chunks, file.contentHash, {
      size: file.size,
      mtime: file.mtime,
    });
  }

  manager.computeRootHash();
  return manager;
}
