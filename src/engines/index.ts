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
  type ChunkingStrategy,
  type SmartChunkOptions,
  DEFAULT_SPLIT_OPTIONS,
  splitText,
  splitWithLineNumbers,
  chunkFile,
  chunkFileSync,
  chunkFileWithStrategy,
} from './chunking.js';

// Code-Aware Chunking Engine
export {
  type SupportedLanguage,
  type CodeAwareChunkOptions,
  DEFAULT_CODE_AWARE_OPTIONS,
  detectLanguage,
  splitCodeWithLineNumbers,
  supportsCodeAwareChunking,
  getLanguageName,
} from './codeAwareChunking.js';

// Docs Chunking Engine
export {
  DOC_FILE_EXTENSIONS,
  DOC_FILE_PATTERNS,
  DOC_SPLIT_OPTIONS,
  isDocFile,
  chunkDocFile,
} from './docsChunking.js';

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

// Docs Index Manager
export {
  DOC_FILE_BATCH_SIZE,
  type DocsIndexPhase,
  type DocsIndexProgress,
  type DocsProgressCallback,
  type DocsIndexResult,
  type DocsStats,
  scanDocFiles,
  createDocsIndex,
  updateDocFile,
  removeDocFile,
  applyDocsDelta,
  DocsIndexManager,
  type DocsDeltaResult,
} from './docsIndexManager.js';

// Indexing Strategy Interface
export {
  type StrategyFileEvent,
  type StrategyStats,
  type IndexingStrategy,
  type StrategyName,
  STRATEGY_NAMES,
  isValidStrategyName,
} from './indexingStrategy.js';

// Indexing Strategies
export {
  RealtimeStrategy,
  createRealtimeStrategy,
  type RealtimeStrategyOptions,
  LazyStrategy,
  createLazyStrategy,
  type LazyStrategyOptions,
  GitStrategy,
  createGitStrategy,
  DEFAULT_GIT_DEBOUNCE_DELAY,
  type GitStrategyOptions,
} from './strategies/index.js';

// Strategy Orchestrator
export {
  StrategyOrchestrator,
  createStrategyOrchestrator,
  type StrategyOrchestratorDependencies,
} from './strategyOrchestrator.js';
