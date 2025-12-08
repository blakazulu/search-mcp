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
