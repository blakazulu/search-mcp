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
  // Schema
  ConfigSchema,
  // Constants
  DEFAULT_CONFIG,
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
