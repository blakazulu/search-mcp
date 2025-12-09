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

// Indexing Policy Engine
export {
  HARDCODED_DENY_PATTERNS,
  ALL_DENY_PATTERNS,
  type PolicyResult,
  loadGitignore,
  isBinaryFile,
  checkFileSize,
  matchesAnyPattern,
  isHardDenied,
  shouldIndex,
  IndexingPolicy,
} from './indexPolicy.js';

// Chunking Engine
export {
  type Chunk,
  type SplitOptions,
  type ChunkWithLines,
  DEFAULT_SPLIT_OPTIONS,
  splitText,
  splitWithLineNumbers,
  chunkFile,
  chunkFileSync,
} from './chunking.js';

// Embedding Engine
export {
  MODEL_NAME,
  EMBEDDING_DIMENSION,
  BATCH_SIZE,
  type EmbeddingResult,
  type EmbeddingProgressCallback,
  type DownloadProgressCallback,
  EmbeddingEngine,
  getEmbeddingEngine,
  resetEmbeddingEngine,
  embedText,
  embedBatch,
} from './embedding.js';

// Index Manager
export {
  FILE_BATCH_SIZE,
  type IndexPhase,
  type IndexProgress,
  type ProgressCallback,
  type IndexResult,
  type IndexStats,
  scanFiles,
  createFullIndex,
  updateFile,
  removeFile,
  applyDelta,
  IndexManager,
  type DeltaResult,
} from './indexManager.js';

// File Watcher Engine
export {
  type WatchEvent,
  type FileEvent,
  type WatcherStats,
  DEFAULT_DEBOUNCE_DELAY,
  STABILITY_THRESHOLD,
  POLL_INTERVAL,
  WATCHER_OPTIONS,
  FileWatcher,
  createFileWatcher,
} from './fileWatcher.js';

// Integrity Engine
export {
  type DriftReport,
  type ReconcileResult,
  type ReconcileProgress,
  type ReconcileProgressCallback,
  DEFAULT_CHECK_INTERVAL,
  scanCurrentState,
  calculateDrift,
  reconcile,
  IntegrityScheduler,
  IntegrityEngine,
  runStartupCheck,
  runStartupCheckBackground,
  createIntegrityEngine,
} from './integrity.js';
