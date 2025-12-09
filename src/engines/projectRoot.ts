/**
 * Project Root Detection Engine
 *
 * Implements automatic project root detection by searching for common project markers
 * (.git, package.json, etc.). Falls back to error when no markers found.
 *
 * This determines the scope of indexing by finding the root directory of a project.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectNotDetected } from '../errors/index.js';
import { normalizePath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';

// ============================================================================
// Constants and Types
// ============================================================================

/**
 * Project markers to search for when detecting project root.
 * Listed in priority order - first match wins.
 */
export const PROJECT_MARKERS = [
  '.git',           // Git repository (most common)
  'package.json',   // Node.js
  'pyproject.toml', // Python (modern)
  'Cargo.toml',     // Rust
  'go.mod',         // Go
] as const;

/**
 * Type for valid project markers
 */
export type ProjectMarker = typeof PROJECT_MARKERS[number];

/**
 * Marker type - determines how we check for the marker's existence
 */
export type MarkerType = 'directory' | 'file' | 'either';

/**
 * Mapping of markers to their types for proper filesystem checks.
 * Note: .git can be either a directory (normal repos) or a file (git worktrees)
 */
export const MARKER_TYPES: Record<ProjectMarker, MarkerType> = {
  '.git': 'either',          // Can be directory or file (worktrees)
  'package.json': 'file',
  'pyproject.toml': 'file',
  'Cargo.toml': 'file',
  'go.mod': 'file',
};

/**
 * Result of project root detection
 */
export interface DetectionResult {
  /** Absolute path to the detected project root */
  projectPath: string;
  /** The marker that was found (e.g., '.git', 'package.json') */
  detectedBy: ProjectMarker;
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Check if a marker exists in a directory
 *
 * @param directory - The directory to check
 * @param marker - The marker to look for
 * @returns true if the marker exists and matches the expected type
 */
export async function checkMarker(directory: string, marker: ProjectMarker): Promise<boolean> {
  const markerPath = path.join(directory, marker);
  const expectedType = MARKER_TYPES[marker];

  try {
    const stats = await fs.promises.stat(markerPath);

    switch (expectedType) {
      case 'file':
        return stats.isFile();
      case 'directory':
        return stats.isDirectory();
      case 'either':
        // .git can be a file (worktrees) or directory (normal repos)
        return stats.isFile() || stats.isDirectory();
      default:
        return false;
    }
  } catch {
    // File/directory doesn't exist or can't be accessed
    return false;
  }
}

/**
 * Check if a path is a filesystem root
 *
 * Handles both Unix root (/) and Windows drive roots (C:\)
 *
 * @param dirPath - The path to check
 * @returns true if this is a filesystem root
 */
export function isFilesystemRoot(dirPath: string): boolean {
  const normalized = normalizePath(dirPath);
  const parent = path.dirname(normalized);

  // On both Unix and Windows, the root's parent is itself
  return normalized === parent;
}

/**
 * Search upward from a starting path to find a project root
 *
 * Checks each directory from startPath up to the filesystem root for project markers.
 *
 * @param startPath - The path to start searching from
 * @returns DetectionResult if found, null otherwise
 */
export async function findProjectRoot(startPath: string): Promise<DetectionResult | null> {
  const logger = getLogger();
  let currentDir = normalizePath(startPath);

  // Handle case where startPath is a file - start from its directory
  try {
    const stats = await fs.promises.stat(currentDir);
    if (stats.isFile()) {
      currentDir = path.dirname(currentDir);
    }
  } catch {
    // Path doesn't exist, try to use it as is
  }

  logger.debug('ProjectRoot', `Starting search from: ${currentDir}`);

  // Search upward through the directory tree
  while (true) {
    logger.debug('ProjectRoot', `Checking directory: ${currentDir}`);

    // Check all markers in priority order
    for (const marker of PROJECT_MARKERS) {
      const found = await checkMarker(currentDir, marker);
      if (found) {
        logger.info('ProjectRoot', `Found project root at: ${currentDir}`, { marker });
        return {
          projectPath: currentDir,
          detectedBy: marker,
        };
      }
    }

    // Check if we've reached the filesystem root
    if (isFilesystemRoot(currentDir)) {
      logger.debug('ProjectRoot', 'Reached filesystem root without finding markers');
      return null;
    }

    // Move to parent directory
    const parentDir = path.dirname(currentDir);

    // Safety check: ensure we're actually moving up
    if (parentDir === currentDir) {
      logger.debug('ProjectRoot', 'Parent equals current, stopping search');
      return null;
    }

    currentDir = parentDir;
  }
}

// ============================================================================
// Main Public API
// ============================================================================

/**
 * Detect the project root from a given path or current working directory
 *
 * Searches upward from the starting path looking for project markers.
 * Throws PROJECT_NOT_DETECTED error if no markers are found.
 *
 * @param cwd - Starting path to search from (defaults to process.cwd())
 * @returns DetectionResult with project path and the marker that was found
 * @throws MCPError with code PROJECT_NOT_DETECTED if no project root found
 *
 * @example
 * ```typescript
 * // Detect from current directory
 * const result = await detectProjectRoot();
 * console.log(result.projectPath); // '/Users/dev/my-project'
 * console.log(result.detectedBy);  // 'package.json'
 *
 * // Detect from a specific path
 * const result = await detectProjectRoot('/Users/dev/my-project/src/utils');
 * console.log(result.projectPath); // '/Users/dev/my-project'
 * ```
 */
export async function detectProjectRoot(cwd?: string): Promise<DetectionResult> {
  const logger = getLogger();
  const startPath = cwd ?? process.cwd();

  logger.info('ProjectRoot', `Detecting project root from: ${startPath}`);

  const result = await findProjectRoot(startPath);

  if (!result) {
    throw projectNotDetected(startPath);
  }

  return result;
}

/**
 * Check if a specific path is a project root (contains any project marker)
 *
 * Useful for validation or when you have a specific path you want to verify.
 *
 * @param directoryPath - The directory to check
 * @returns The marker found, or null if not a project root
 *
 * @example
 * ```typescript
 * const marker = await isProjectRoot('/Users/dev/my-project');
 * if (marker) {
 *   console.log(`Found ${marker} in directory`);
 * }
 * ```
 */
export async function isProjectRoot(directoryPath: string): Promise<ProjectMarker | null> {
  const normalizedPath = normalizePath(directoryPath);

  for (const marker of PROJECT_MARKERS) {
    const found = await checkMarker(normalizedPath, marker);
    if (found) {
      return marker;
    }
  }

  return null;
}
