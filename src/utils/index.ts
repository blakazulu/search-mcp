/**
 * Utility Modules
 *
 * Exports all utility functions:
 * - hash: SHA256 utilities
 * - paths: Path manipulation
 * - logger: Logging
 */

// Logger exports
export {
  LogLevel,
  type Logger,
  type LoggerConfig,
  createLogger,
  getLogger,
  resetLogger,
  getDefaultLogDir,
  parseLogLevel,
} from './logger.js';

// Hash exports
export {
  hashString,
  hashFile,
  hashFileSync,
  hashProjectPath,
} from './hash.js';

// SQL escaping exports
export {
  escapeSqlString,
  escapeLikePattern,
  globToSafeLikePattern,
} from './sql.js';

// Path exports
export {
  // Constants
  MAX_PATH_LENGTH_WINDOWS,
  MAX_PATH_LENGTH_UNIX,
  // Path normalization
  normalizePath,
  normalizeUnicode,
  toRelativePath,
  toAbsolutePath,
  // Security functions
  isPathTraversal,
  safeJoin,
  isWithinDirectory,
  validatePathLength,
  checkPathLength,
  // Storage paths
  getStorageRoot,
  getIndexPath,
  getIndexesDir,
  // Index subdirectory helpers
  getLogsPath,
  getConfigPath,
  getMetadataPath,
  getFingerprintsPath,
  getLanceDbPath,
  getDocsFingerprintsPath,
  getDocsLanceDbPath,
  getDirtyFilesPath,
  // Utility functions
  expandTilde,
  getExtension,
  getBaseName,
} from './paths.js';

// Async Mutex exports
export {
  AsyncMutex,
  ReadWriteLock,
  IndexingLock,
} from './asyncMutex.js';

// Atomic Write exports
export {
  atomicWrite,
  atomicWriteJson,
} from './atomicWrite.js';

// Memory monitoring exports
export {
  type MemoryStats,
  type MemoryWarningLevel,
  type MemoryStatus,
  type MemoryWarningCallback,
  MEMORY_WARNING_THRESHOLD,
  MEMORY_CRITICAL_THRESHOLD,
  DEFAULT_CHECK_INTERVAL,
  getMemoryStats,
  formatBytes,
  getMemoryStatus,
  logMemoryUsage,
  isMemoryCritical,
  isMemoryWarning,
  requestGarbageCollection,
  getAdaptiveBatchSize,
  MemoryMonitor,
} from './memory.js';

// Timestamp utilities exports
export {
  type TimestampValidationResult,
  type PerfTimer,
  MAX_REASONABLE_AGE_MS,
  MAX_FUTURE_TOLERANCE_MS,
  NFS_TIMESTAMP_RESOLUTION_MS,
  validateTimestamp,
  couldBeNfsAliased,
  getSafeTimestamp,
  createPerfTimer,
  measureDuration,
} from './timestamp.js';

// Disk space utilities exports
export {
  type DiskSpaceInfo,
  type DiskSpaceValidation,
  MIN_REQUIRED_SPACE_BYTES,
  SPACE_BUFFER_MULTIPLIER,
  ESTIMATED_BYTES_PER_FILE,
  checkDiskSpace,
  estimateRequiredSpace,
  hasSufficientSpace,
  validateDiskSpace,
} from './diskSpace.js';

// Search result processing exports
export {
  type SearchResultItem,
  type CompactSearchResult,
  type CompactSearchOutput,
  trimChunkWhitespace,
  areRangesMergeable,
  deduplicateSameFileResults,
  processSearchResults,
  formatCompactResult,
  formatCompactResults,
  formatCompactOutput,
} from './searchResultProcessing.js';
