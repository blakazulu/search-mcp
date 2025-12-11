/**
 * Persistence Layer
 *
 * Exports all storage modules:
 * - lancedb: Vector store
 * - fingerprints: File hash tracking
 * - config: Configuration management
 * - metadata: Index metadata
 */

// Config Management
export {
  // Types
  type Config,
  type ConfigWithDocs,
  type FTSEnginePreference,
  type HybridSearchConfig,
  // Schema
  ConfigSchema,
  HybridSearchSchema,
  // Constants
  DEFAULT_CONFIG,
  DEFAULT_HYBRID_SEARCH,
  HARDCODED_EXCLUDES,
  // Functions
  parseFileSize,
  formatFileSize,
  loadConfig,
  saveConfig,
  generateDefaultConfig,
  // Class
  ConfigManager,
} from './config.js';

// Metadata Management
export {
  // Types
  type Metadata,
  type Stats,
  // Schema
  MetadataSchema,
  StatsSchema,
  // Constants
  CURRENT_VERSION,
  // Functions
  loadMetadata,
  saveMetadata,
  createMetadata,
  // Class
  MetadataManager,
} from './metadata.js';

// Fingerprints Management
export {
  // Types
  type Fingerprints,
  type DeltaResult,
  // Constants
  FINGERPRINTS_VERSION,
  // Functions
  loadFingerprints,
  saveFingerprints,
  calculateDelta,
  // Class
  FingerprintsManager,
} from './fingerprints.js';

// Docs Fingerprints Management
export {
  // Types
  type DocsFingerprints,
  type DocsDeltaResult,
  // Constants
  DOCS_FINGERPRINTS_VERSION,
  // Functions
  loadDocsFingerprints,
  saveDocsFingerprints,
  calculateDocsDelta,
  // Class
  DocsFingerprintsManager,
} from './docsFingerprints.js';

// LanceDB Vector Store
export {
  // Types
  type ChunkRecord,
  type SearchResult,
  // Constants
  TABLE_NAME,
  VECTOR_DIMENSION,
  // Functions
  distanceToScore,
  globToLikePattern,
  cleanupStaleLockfiles,
  // Class
  LanceDBStore,
} from './lancedb.js';

// Docs LanceDB Vector Store
export {
  // Constants
  DOCS_TABLE_NAME,
  // Functions
  getDocsLanceDbPath,
  // Class
  DocsLanceDBStore,
} from './docsLancedb.js';

// Dirty Files Management (for lazy indexing strategy)
export {
  // Constants
  DIRTY_FILES_VERSION,
  DELETED_PREFIX,
  // Class
  DirtyFilesManager,
} from './dirtyFiles.js';
