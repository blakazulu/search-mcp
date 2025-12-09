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
  // Path normalization
  normalizePath,
  toRelativePath,
  toAbsolutePath,
  // Security functions
  isPathTraversal,
  safeJoin,
  isWithinDirectory,
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
