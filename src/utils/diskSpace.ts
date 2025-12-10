/**
 * Disk Space Utilities
 *
 * Provides disk space checking functionality for indexing operations.
 * Helps prevent disk full errors during indexing by checking available
 * space before starting.
 *
 * Note: statfs may not work on all platforms (especially Windows and network drives).
 * Falls back gracefully when unavailable.
 */

import * as fs from 'node:fs';
import { getLogger } from './logger.js';
import { diskFull } from '../errors/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Minimum required free space for indexing operations (100MB)
 * This accounts for LanceDB storage, fingerprints, and metadata
 */
export const MIN_REQUIRED_SPACE_BYTES = 100 * 1024 * 1024;

/**
 * Safety buffer multiplier for estimated space requirements
 * We require 10% more than estimated to be safe
 */
export const SPACE_BUFFER_MULTIPLIER = 1.1;

/**
 * Estimated bytes per file for indexing
 * Based on average chunk size and embedding storage
 */
export const ESTIMATED_BYTES_PER_FILE = 5 * 1024; // 5KB average

// ============================================================================
// Types
// ============================================================================

/**
 * Result of disk space check
 */
export interface DiskSpaceInfo {
  /** Available bytes on the filesystem */
  available: number;
  /** Total bytes on the filesystem */
  total: number;
  /** Used bytes on the filesystem */
  used: number;
  /** Whether the check was successful */
  success: boolean;
  /** Error message if check failed */
  error?: string;
}

/**
 * Result of disk space validation
 */
export interface DiskSpaceValidation {
  /** Whether there is sufficient space */
  sufficient: boolean;
  /** Available space in bytes */
  availableBytes: number;
  /** Required space in bytes */
  requiredBytes: number;
  /** Warning message if space is low but not critical */
  warning?: string;
}

// ============================================================================
// Disk Space Functions
// ============================================================================

/**
 * Check available disk space at a given path
 *
 * Uses Node.js statfs to get filesystem statistics.
 * Falls back gracefully if statfs is not available (some platforms/network drives).
 *
 * @param path - Path to check (usually the index directory)
 * @returns DiskSpaceInfo with available, total, and used space
 */
export async function checkDiskSpace(path: string): Promise<DiskSpaceInfo> {
  const logger = getLogger();

  try {
    // Ensure the path exists (or at least its parent)
    let checkPath = path;
    while (!fs.existsSync(checkPath)) {
      const parent = require('path').dirname(checkPath);
      if (parent === checkPath) {
        // Reached root without finding existing path
        return {
          available: 0,
          total: 0,
          used: 0,
          success: false,
          error: 'Could not find existing path to check disk space',
        };
      }
      checkPath = parent;
    }

    // Use statfs to get filesystem info
    const stats = await fs.promises.statfs(checkPath);

    const available = stats.bfree * stats.bsize;
    const total = stats.blocks * stats.bsize;
    const used = total - available;

    logger.debug('DiskSpace', 'Disk space checked', {
      path: checkPath,
      availableMB: Math.round(available / (1024 * 1024)),
      totalMB: Math.round(total / (1024 * 1024)),
    });

    return {
      available,
      total,
      used,
      success: true,
    };
  } catch (error) {
    // statfs may fail on some platforms (Windows, network drives, etc.)
    const message = error instanceof Error ? error.message : String(error);
    logger.debug('DiskSpace', 'Could not check disk space (may be unsupported)', {
      path,
      error: message,
    });

    return {
      available: 0,
      total: 0,
      used: 0,
      success: false,
      error: `Disk space check not available: ${message}`,
    };
  }
}

/**
 * Estimate required disk space for indexing a number of files
 *
 * @param fileCount - Number of files to be indexed
 * @returns Estimated bytes required
 */
export function estimateRequiredSpace(fileCount: number): number {
  // Base requirement plus per-file estimate with safety buffer
  const estimated = MIN_REQUIRED_SPACE_BYTES + fileCount * ESTIMATED_BYTES_PER_FILE;
  return Math.ceil(estimated * SPACE_BUFFER_MULTIPLIER);
}

/**
 * Check if there is sufficient disk space for indexing
 *
 * @param path - Path to check (usually the index directory)
 * @param fileCount - Number of files to be indexed (optional, for estimation)
 * @returns DiskSpaceValidation with sufficiency status
 */
export async function hasSufficientSpace(
  path: string,
  fileCount?: number
): Promise<DiskSpaceValidation> {
  const logger = getLogger();
  const spaceInfo = await checkDiskSpace(path);

  // Calculate required space
  const requiredBytes = fileCount
    ? estimateRequiredSpace(fileCount)
    : MIN_REQUIRED_SPACE_BYTES;

  // If we couldn't check space, assume it's OK but log warning
  if (!spaceInfo.success) {
    logger.warn('DiskSpace', 'Could not verify disk space, proceeding anyway', {
      error: spaceInfo.error,
    });
    return {
      sufficient: true,
      availableBytes: 0,
      requiredBytes,
      warning: 'Could not verify disk space. Indexing may fail if disk is full.',
    };
  }

  const sufficient = spaceInfo.available >= requiredBytes;

  // Check for low space warning (less than 500MB)
  const lowSpaceThreshold = 500 * 1024 * 1024;
  let warning: string | undefined;

  if (sufficient && spaceInfo.available < lowSpaceThreshold) {
    warning = `Low disk space warning: only ${formatBytes(spaceInfo.available)} available.`;
    logger.warn('DiskSpace', warning);
  }

  if (!sufficient) {
    logger.error('DiskSpace', 'Insufficient disk space', {
      availableMB: Math.round(spaceInfo.available / (1024 * 1024)),
      requiredMB: Math.round(requiredBytes / (1024 * 1024)),
    });
  }

  return {
    sufficient,
    availableBytes: spaceInfo.available,
    requiredBytes,
    warning,
  };
}

/**
 * Validate disk space and throw error if insufficient
 *
 * @param path - Path to check (usually the index directory)
 * @param fileCount - Number of files to be indexed (optional)
 * @throws MCPError with DISK_FULL code if insufficient space
 */
export async function validateDiskSpace(
  path: string,
  fileCount?: number
): Promise<void> {
  const validation = await hasSufficientSpace(path, fileCount);

  if (!validation.sufficient) {
    throw diskFull(validation.requiredBytes, validation.availableBytes);
  }
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Size in bytes
 * @returns Human-readable string like "45MB", "1.2GB"
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
