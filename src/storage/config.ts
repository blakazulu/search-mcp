/**
 * Config Manager Module
 *
 * Provides configuration management for project-level settings:
 * - Zod schema validation for configuration
 * - Loading config with sensible defaults
 * - Auto-generation of config.json with documentation
 * - Caching with reload support
 */

import * as fs from 'node:fs';
import { z } from 'zod';
import { getConfigPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';

// ============================================================================
// File Size Parser
// ============================================================================

/**
 * Parse a file size string to bytes
 *
 * Supports KB and MB units only (per RFC specification).
 *
 * @param size - Size string like "1MB" or "500KB"
 * @returns Size in bytes
 * @throws Error if format is invalid
 *
 * @example
 * ```typescript
 * parseFileSize('1MB')   // => 1048576
 * parseFileSize('500KB') // => 512000
 * parseFileSize('100KB') // => 102400
 * ```
 */
export function parseFileSize(size: string): number {
  const match = size.match(/^(\d+)(KB|MB)$/i);
  if (!match) {
    throw new Error(
      `Invalid file size format: "${size}". Expected format like "1MB" or "500KB".`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();

  switch (unit) {
    case 'KB':
      return value * 1024;
    case 'MB':
      return value * 1024 * 1024;
    default:
      throw new Error(`Unsupported unit: ${unit}. Use KB or MB.`);
  }
}

/**
 * Format bytes as a human-readable file size string
 *
 * @param bytes - Size in bytes
 * @returns Formatted string like "1MB" or "500KB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = Math.round(bytes / (1024 * 1024));
    return `${mb}MB`;
  }
  const kb = Math.round(bytes / 1024);
  return `${kb}KB`;
}

// ============================================================================
// Config Schema
// ============================================================================

/**
 * Regex pattern for file size validation (e.g., "1MB", "500KB")
 */
const FILE_SIZE_REGEX = /^\d+(KB|MB)$/i;

/**
 * Zod schema for configuration validation
 *
 * Validates configuration with sensible defaults for all fields.
 * Underscore-prefixed fields (_comment, etc.) are stripped during parsing.
 */
export const ConfigSchema = z
  .object({
    /** Glob patterns for files to include (default: all files) */
    include: z.array(z.string()).default(['**/*']),

    /** Glob patterns for files to exclude (in addition to hardcoded excludes) */
    exclude: z.array(z.string()).default([]),

    /** Whether to respect .gitignore patterns */
    respectGitignore: z.boolean().default(true),

    /** Maximum file size to index (e.g., "1MB", "500KB") */
    maxFileSize: z
      .string()
      .regex(FILE_SIZE_REGEX, 'Must be a valid file size like "1MB" or "500KB"')
      .default('1MB'),

    /** Maximum number of files to index */
    maxFiles: z.number().positive().int().default(50000),
  })
  .strict()
  .passthrough(); // Allow underscore-prefixed documentation fields

/**
 * Inferred Config type from the schema
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Config with documentation fields for generated config files
 */
export interface ConfigWithDocs extends Config {
  _comment?: string;
  _hardcodedExcludes?: string[];
  _availableOptions?: Record<string, string>;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration values
 *
 * These values are used when:
 * - No config file exists
 * - Config file is invalid
 * - A specific field is missing
 */
export const DEFAULT_CONFIG: Config = {
  include: ['**/*'],
  exclude: [],
  respectGitignore: true,
  maxFileSize: '1MB',
  maxFiles: 50000,
};

/**
 * Hardcoded exclusion patterns that cannot be overridden
 *
 * These are always excluded for security and performance reasons.
 */
export const HARDCODED_EXCLUDES: readonly string[] = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.env',
  '*.pem',
  '*.key',
  '*.log',
  '*.lock',
  '.idea/',
  '.vscode/',
  'coverage/',
] as const;

// ============================================================================
// Config I/O Functions
// ============================================================================

/**
 * Load configuration from an index path
 *
 * Loads config.json from the index directory. Falls back to defaults if:
 * - File doesn't exist
 * - File is not valid JSON
 * - Content fails schema validation
 *
 * @param indexPath - Absolute path to the index directory
 * @returns Validated configuration object
 *
 * @example
 * ```typescript
 * const config = await loadConfig('/home/user/.mcp/search/indexes/abc123');
 * console.log(config.maxFileSize); // "1MB"
 * ```
 */
export async function loadConfig(indexPath: string): Promise<Config> {
  const logger = getLogger();
  const configPath = getConfigPath(indexPath);

  try {
    // Check if config file exists
    if (!fs.existsSync(configPath)) {
      logger.debug('ConfigManager', 'No config file found, using defaults', {
        configPath,
      });
      return { ...DEFAULT_CONFIG };
    }

    // Read and parse the config file
    const content = await fs.promises.readFile(configPath, 'utf-8');
    const rawConfig = JSON.parse(content);

    // Strip documentation fields before validation
    const configWithoutDocs = stripDocumentationFields(rawConfig);

    // Validate against schema
    const result = ConfigSchema.safeParse(configWithoutDocs);

    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      logger.warn(
        'ConfigManager',
        'Config validation failed, using defaults',
        {
          configPath,
          errors,
        }
      );
      return { ...DEFAULT_CONFIG };
    }

    logger.debug('ConfigManager', 'Config loaded successfully', { configPath });
    return result.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('ConfigManager', 'Failed to load config, using defaults', {
      configPath,
      error: message,
    });
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to an index path
 *
 * Saves the configuration to config.json with pretty formatting.
 * Preserves existing documentation fields if present.
 *
 * @param indexPath - Absolute path to the index directory
 * @param config - Configuration to save
 */
export async function saveConfig(
  indexPath: string,
  config: Config
): Promise<void> {
  const logger = getLogger();
  const configPath = getConfigPath(indexPath);

  try {
    // Validate config before saving
    const validatedConfig = ConfigSchema.parse(config);

    // Try to preserve existing documentation fields
    let existingDocs: Partial<ConfigWithDocs> = {};
    if (fs.existsSync(configPath)) {
      try {
        const content = await fs.promises.readFile(configPath, 'utf-8');
        const existing = JSON.parse(content);
        existingDocs = extractDocumentationFields(existing);
      } catch {
        // Ignore errors reading existing file
      }
    }

    // Merge config with documentation fields
    const configWithDocs: ConfigWithDocs = {
      ...existingDocs,
      ...validatedConfig,
    };

    // Write with pretty formatting
    const json = JSON.stringify(configWithDocs, null, 2);
    await fs.promises.writeFile(configPath, json + '\n', 'utf-8');

    logger.debug('ConfigManager', 'Config saved successfully', { configPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('ConfigManager', 'Failed to save config', {
      configPath,
      error: message,
    });
    throw error;
  }
}

/**
 * Generate a default config file with documentation comments
 *
 * Creates a config.json file with all default values and
 * helpful documentation fields explaining each option.
 *
 * @param indexPath - Absolute path to the index directory
 */
export async function generateDefaultConfig(indexPath: string): Promise<void> {
  const logger = getLogger();
  const configPath = getConfigPath(indexPath);

  // Config with documentation comments
  const configWithDocs: ConfigWithDocs = {
    _comment:
      'Search MCP configuration file. Modify these settings to customize indexing behavior.',
    _hardcodedExcludes: [...HARDCODED_EXCLUDES],
    _availableOptions: {
      include:
        'Array of glob patterns for files to include (default: ["**/*"])',
      exclude:
        'Array of glob patterns for additional files to exclude (merged with hardcoded excludes)',
      respectGitignore:
        'Whether to respect .gitignore patterns (default: true)',
      maxFileSize:
        'Maximum file size to index, e.g., "1MB" or "500KB" (default: "1MB")',
      maxFiles:
        'Maximum number of files to index (default: 50000). Warning shown if exceeded.',
    },
    ...DEFAULT_CONFIG,
  };

  // Write with pretty formatting
  const json = JSON.stringify(configWithDocs, null, 2);
  await fs.promises.writeFile(configPath, json + '\n', 'utf-8');

  logger.info('ConfigManager', 'Generated default config file', { configPath });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Strip underscore-prefixed documentation fields from an object
 */
function stripDocumentationFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith('_')) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extract underscore-prefixed documentation fields from an object
 */
function extractDocumentationFields(obj: Record<string, unknown>): Partial<ConfigWithDocs> {
  const result: Partial<ConfigWithDocs> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

// ============================================================================
// ConfigManager Class
// ============================================================================

/**
 * Config Manager class for managing project configuration
 *
 * Provides:
 * - Loading and caching configuration
 * - Saving configuration changes
 * - Ensuring config file exists
 * - Detecting config changes on reload
 *
 * @example
 * ```typescript
 * const manager = new ConfigManager('/path/to/index');
 * await manager.ensureExists();
 * const config = await manager.load();
 * console.log(config.maxFileSize);
 *
 * // Later, get cached config
 * const cachedConfig = manager.getConfig();
 * ```
 */
export class ConfigManager {
  private readonly indexPath: string;
  private cachedConfig: Config | null = null;
  private lastLoadedAt: number = 0;

  /**
   * Create a new ConfigManager instance
   *
   * @param indexPath - Absolute path to the index directory
   */
  constructor(indexPath: string) {
    this.indexPath = indexPath;
  }

  /**
   * Load configuration from disk
   *
   * Always reads from disk, updating the cache.
   *
   * @returns Validated configuration
   */
  async load(): Promise<Config> {
    this.cachedConfig = await loadConfig(this.indexPath);
    this.lastLoadedAt = Date.now();
    return this.cachedConfig;
  }

  /**
   * Save configuration to disk
   *
   * Updates both disk and cache.
   *
   * @param config - Configuration to save
   */
  async save(config: Config): Promise<void> {
    await saveConfig(this.indexPath, config);
    this.cachedConfig = config;
    this.lastLoadedAt = Date.now();
  }

  /**
   * Ensure config file exists
   *
   * If no config.json exists, creates one with defaults and documentation.
   */
  async ensureExists(): Promise<void> {
    const configPath = getConfigPath(this.indexPath);
    if (!fs.existsSync(configPath)) {
      await generateDefaultConfig(this.indexPath);
    }
  }

  /**
   * Get cached configuration
   *
   * Returns cached config if available, otherwise loads from disk.
   * Use this for synchronous access after initial load.
   *
   * @returns Cached configuration (may be stale if disk changed)
   * @throws Error if config has never been loaded
   */
  getConfig(): Config {
    if (this.cachedConfig === null) {
      throw new Error(
        'Config not loaded. Call load() or ensureExists() first.'
      );
    }
    return this.cachedConfig;
  }

  /**
   * Check if config has been loaded
   */
  isLoaded(): boolean {
    return this.cachedConfig !== null;
  }

  /**
   * Get the timestamp of the last load operation
   */
  getLastLoadedAt(): number {
    return this.lastLoadedAt;
  }

  /**
   * Reload configuration if the file has been modified
   *
   * Compares file modification time with last load time to detect changes.
   *
   * @returns true if config was reloaded, false if unchanged
   */
  async reloadIfChanged(): Promise<boolean> {
    const configPath = getConfigPath(this.indexPath);

    try {
      if (!fs.existsSync(configPath)) {
        // No config file - ensure we have defaults cached
        if (this.cachedConfig === null) {
          await this.load();
          return true;
        }
        return false;
      }

      const stats = await fs.promises.stat(configPath);
      const modifiedAt = stats.mtimeMs;

      if (modifiedAt > this.lastLoadedAt) {
        await this.load();
        return true;
      }

      return false;
    } catch {
      // If we can't check, reload to be safe
      await this.load();
      return true;
    }
  }

  /**
   * Get the path to the config file
   */
  getConfigPath(): string {
    return getConfigPath(this.indexPath);
  }

  /**
   * Get the index path this manager is associated with
   */
  getIndexPath(): string {
    return this.indexPath;
  }

  /**
   * Get the max file size in bytes
   *
   * Convenience method that parses the maxFileSize string.
   */
  getMaxFileSizeBytes(): number {
    const config = this.getConfig();
    return parseFileSize(config.maxFileSize);
  }
}
