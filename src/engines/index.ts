/**
 * Core Processing Engines
 *
 * Exports all processing engines:
 * - projectRoot: Project detection
 * - indexPolicy: File filtering (deny list, gitignore)
 * - chunking: Text splitting
 * - embedding: Vector generation
 * - fileWatcher: Change detection
 * - integrity: Drift reconciliation
 */

// Project Root Detection
export {
  PROJECT_MARKERS,
  MARKER_TYPES,
  type ProjectMarker,
  type MarkerType,
  type DetectionResult,
  detectProjectRoot,
  findProjectRoot,
  isProjectRoot,
  isFilesystemRoot,
  checkMarker,
} from './projectRoot.js';

// Additional engine exports will be added as they are implemented
