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
  // New dual-model constants
  CODE_MODEL_NAME,
  CODE_EMBEDDING_DIMENSION,
  DOCS_MODEL_NAME,
  DOCS_EMBEDDING_DIMENSION,
  // Deprecated (backward compat)
  MODEL_NAME,
  EMBEDDING_DIMENSION,
  // Common constants
  BATCH_SIZE,
  // Types
  type EmbeddingResult,
  type EmbeddingProgressCallback,
  type DownloadProgressCallback,
  type EmbeddingEngineConfig,
  // Configurations
  CODE_ENGINE_CONFIG,
  DOCS_ENGINE_CONFIG,
  // Class
  EmbeddingEngine,
  // Dual singleton getters
  getCodeEmbeddingEngine,
  getDocsEmbeddingEngine,
  // Deprecated singleton getter (backward compat)
  getEmbeddingEngine,
  // Reset functions
  resetCodeEmbeddingEngine,
  resetDocsEmbeddingEngine,
  resetEmbeddingEngine,
  // Convenience functions
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

// FTS Engine Interface
export {
  type FTSChunk,
  type FTSSearchResult,
  type FTSStats,
  type FTSEngineType,
  type FTSEngine,
  FTSNotInitializedError,
  FTSQueryError,
  FTSSerializationError,
} from './ftsEngine.js';

// NaturalBM25 FTS Engine (JavaScript implementation)
export {
  NaturalBM25Engine,
  createNaturalBM25Engine,
} from './naturalBM25.js';

// SQLite FTS5 Engine (Native implementation)
export {
  SQLiteFTS5Engine,
  createSQLiteFTS5Engine,
  isNativeAvailable,
  resetNativeAvailableCache,
  type SQLiteFTS5Options,
} from './sqliteFTS5.js';

// FTS Engine Factory (Auto-detection and selection)
export {
  FILE_COUNT_THRESHOLD,
  type EngineSelectionResult,
  createFTSEngine,
  checkNativeAvailable,
  formatEngineSelectionReason,
  wouldSelectNative,
} from './ftsEngineFactory.js';
