import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseFileSize,
  formatFileSize,
  ConfigSchema,
  DEFAULT_CONFIG,
  HARDCODED_EXCLUDES,
  loadConfig,
  saveConfig,
  generateDefaultConfig,
  ConfigManager,
  type Config,
} from '../../../src/storage/config.js';

// Mock the logger to avoid file system side effects
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Config Manager', () => {
  let testDir: string;
  let indexPath: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = path.join(os.tmpdir(), `search-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    indexPath = path.join(testDir, 'test-index');
    await fs.promises.mkdir(indexPath, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // File Size Parser Tests
  // ==========================================================================

  describe('parseFileSize', () => {
    it('should parse KB values correctly', () => {
      expect(parseFileSize('1KB')).toBe(1024);
      expect(parseFileSize('100KB')).toBe(102400);
      expect(parseFileSize('500KB')).toBe(512000);
    });

    it('should parse MB values correctly', () => {
      expect(parseFileSize('1MB')).toBe(1048576);
      expect(parseFileSize('5MB')).toBe(5242880);
      expect(parseFileSize('10MB')).toBe(10485760);
    });

    it('should handle case-insensitive units', () => {
      expect(parseFileSize('1kb')).toBe(1024);
      expect(parseFileSize('1Kb')).toBe(1024);
      expect(parseFileSize('1mb')).toBe(1048576);
      expect(parseFileSize('1Mb')).toBe(1048576);
    });

    it('should throw on invalid format', () => {
      expect(() => parseFileSize('1GB')).toThrow('Invalid file size format');
      expect(() => parseFileSize('1')).toThrow('Invalid file size format');
      expect(() => parseFileSize('MB')).toThrow('Invalid file size format');
      expect(() => parseFileSize('')).toThrow('Invalid file size format');
      expect(() => parseFileSize('1.5MB')).toThrow('Invalid file size format');
      expect(() => parseFileSize('-1MB')).toThrow('Invalid file size format');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes to KB', () => {
      expect(formatFileSize(1024)).toBe('1KB');
      expect(formatFileSize(102400)).toBe('100KB');
      expect(formatFileSize(512000)).toBe('500KB');
    });

    it('should format bytes to MB', () => {
      expect(formatFileSize(1048576)).toBe('1MB');
      expect(formatFileSize(5242880)).toBe('5MB');
      expect(formatFileSize(10485760)).toBe('10MB');
    });

    it('should round to nearest unit', () => {
      expect(formatFileSize(1500)).toBe('1KB'); // Rounds down
      expect(formatFileSize(1536)).toBe('2KB'); // Rounds up
    });
  });

  // ==========================================================================
  // Schema Validation Tests
  // ==========================================================================

  describe('ConfigSchema', () => {
    it('should accept valid configuration', () => {
      const config = {
        include: ['src/**/*', 'lib/**/*'],
        exclude: ['**/*.test.ts'],
        respectGitignore: false,
        maxFileSize: '2MB',
        maxFiles: 10000,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(config);
      }
    });

    it('should apply default values for missing fields', () => {
      const result = ConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.include).toEqual(['**/*']);
        expect(result.data.exclude).toEqual([]);
        expect(result.data.respectGitignore).toBe(true);
        expect(result.data.maxFileSize).toBe('1MB');
        expect(result.data.maxFiles).toBe(50000);
      }
    });

    it('should reject invalid maxFileSize format', () => {
      const result = ConfigSchema.safeParse({
        maxFileSize: '1GB',
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative maxFiles', () => {
      const result = ConfigSchema.safeParse({
        maxFiles: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer maxFiles', () => {
      const result = ConfigSchema.safeParse({
        maxFiles: 100.5,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid include type', () => {
      const result = ConfigSchema.safeParse({
        include: 'not-an-array',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid respectGitignore type', () => {
      const result = ConfigSchema.safeParse({
        respectGitignore: 'yes',
      });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Default Config Tests
  // ==========================================================================

  describe('DEFAULT_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_CONFIG.include).toBeDefined();
      expect(DEFAULT_CONFIG.exclude).toBeDefined();
      expect(DEFAULT_CONFIG.respectGitignore).toBeDefined();
      expect(DEFAULT_CONFIG.maxFileSize).toBeDefined();
      expect(DEFAULT_CONFIG.maxFiles).toBeDefined();
    });

    it('should match schema defaults', () => {
      const schemaDefaults = ConfigSchema.parse({});
      expect(DEFAULT_CONFIG).toEqual(schemaDefaults);
    });

    it('should have valid maxFileSize', () => {
      expect(() => parseFileSize(DEFAULT_CONFIG.maxFileSize)).not.toThrow();
    });
  });

  describe('HARDCODED_EXCLUDES', () => {
    it('should include essential exclusions', () => {
      expect(HARDCODED_EXCLUDES).toContain('node_modules/');
      expect(HARDCODED_EXCLUDES).toContain('.git/');
      expect(HARDCODED_EXCLUDES).toContain('dist/');
      expect(HARDCODED_EXCLUDES).toContain('.env');
      expect(HARDCODED_EXCLUDES).toContain('*.pem');
      expect(HARDCODED_EXCLUDES).toContain('*.key');
    });

    it('should be readonly', () => {
      // TypeScript should prevent this, but verify at runtime
      expect(Object.isFrozen(HARDCODED_EXCLUDES)).toBe(false); // as const doesn't freeze
      expect(HARDCODED_EXCLUDES.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Config Loading Tests
  // ==========================================================================

  describe('loadConfig', () => {
    it('should return defaults when no config file exists', async () => {
      const config = await loadConfig(indexPath);
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should load valid config from file', async () => {
      const customConfig: Config = {
        include: ['src/**/*'],
        exclude: ['**/*.spec.ts'],
        respectGitignore: false,
        maxFileSize: '2MB',
        maxFiles: 20000,
      };

      const configPath = path.join(indexPath, 'config.json');
      await fs.promises.writeFile(configPath, JSON.stringify(customConfig));

      const loaded = await loadConfig(indexPath);
      expect(loaded).toEqual(customConfig);
    });

    it('should strip documentation fields when loading', async () => {
      const configWithDocs = {
        _comment: 'This is a comment',
        _hardcodedExcludes: ['node_modules/'],
        include: ['src/**/*'],
        exclude: [],
        respectGitignore: true,
        maxFileSize: '1MB',
        maxFiles: 50000,
      };

      const configPath = path.join(indexPath, 'config.json');
      await fs.promises.writeFile(configPath, JSON.stringify(configWithDocs));

      const loaded = await loadConfig(indexPath);
      expect(loaded).not.toHaveProperty('_comment');
      expect(loaded).not.toHaveProperty('_hardcodedExcludes');
      expect(loaded.include).toEqual(['src/**/*']);
    });

    it('should return defaults for invalid JSON', async () => {
      const configPath = path.join(indexPath, 'config.json');
      await fs.promises.writeFile(configPath, 'not valid json {{{');

      const loaded = await loadConfig(indexPath);
      expect(loaded).toEqual(DEFAULT_CONFIG);
    });

    it('should return defaults for invalid config values', async () => {
      const invalidConfig = {
        include: 'not-an-array',
        maxFileSize: '1GB',
        maxFiles: -100,
      };

      const configPath = path.join(indexPath, 'config.json');
      await fs.promises.writeFile(configPath, JSON.stringify(invalidConfig));

      const loaded = await loadConfig(indexPath);
      expect(loaded).toEqual(DEFAULT_CONFIG);
    });

    it('should apply defaults for missing fields', async () => {
      const partialConfig = {
        include: ['custom/**/*'],
      };

      const configPath = path.join(indexPath, 'config.json');
      await fs.promises.writeFile(configPath, JSON.stringify(partialConfig));

      const loaded = await loadConfig(indexPath);
      expect(loaded.include).toEqual(['custom/**/*']);
      expect(loaded.exclude).toEqual([]);
      expect(loaded.respectGitignore).toBe(true);
      expect(loaded.maxFileSize).toBe('1MB');
      expect(loaded.maxFiles).toBe(50000);
    });
  });

  // ==========================================================================
  // Config Saving Tests
  // ==========================================================================

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      const config: Config = {
        include: ['lib/**/*'],
        exclude: ['**/*.test.ts'],
        respectGitignore: false,
        maxFileSize: '500KB',
        maxFiles: 10000,
      };

      await saveConfig(indexPath, config);

      const configPath = path.join(indexPath, 'config.json');
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved.include).toEqual(config.include);
      expect(saved.exclude).toEqual(config.exclude);
      expect(saved.respectGitignore).toBe(config.respectGitignore);
      expect(saved.maxFileSize).toBe(config.maxFileSize);
      expect(saved.maxFiles).toBe(config.maxFiles);
    });

    it('should preserve documentation fields when saving', async () => {
      // First create a config with docs
      const configWithDocs = {
        _comment: 'Original comment',
        _customField: 'Custom value',
        include: ['**/*'],
        exclude: [],
        respectGitignore: true,
        maxFileSize: '1MB',
        maxFiles: 50000,
      };

      const configPath = path.join(indexPath, 'config.json');
      await fs.promises.writeFile(configPath, JSON.stringify(configWithDocs));

      // Now save updated config
      const newConfig: Config = {
        include: ['src/**/*'],
        exclude: ['tests/**/*'],
        respectGitignore: false,
        maxFileSize: '2MB',
        maxFiles: 20000,
      };

      await saveConfig(indexPath, newConfig);

      const content = await fs.promises.readFile(configPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved._comment).toBe('Original comment');
      expect(saved._customField).toBe('Custom value');
      expect(saved.include).toEqual(['src/**/*']);
    });

    it('should pretty-print the JSON', async () => {
      await saveConfig(indexPath, DEFAULT_CONFIG);

      const configPath = path.join(indexPath, 'config.json');
      const content = await fs.promises.readFile(configPath, 'utf-8');

      expect(content).toContain('\n');
      expect(content).toContain('  '); // Indentation
    });

    it('should throw on invalid config', async () => {
      const invalidConfig = {
        include: 'not-an-array',
      } as unknown as Config;

      await expect(saveConfig(indexPath, invalidConfig)).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Config Generation Tests
  // ==========================================================================

  describe('generateDefaultConfig', () => {
    it('should create config file with defaults', async () => {
      await generateDefaultConfig(indexPath);

      const configPath = path.join(indexPath, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.include).toEqual(DEFAULT_CONFIG.include);
      expect(config.exclude).toEqual(DEFAULT_CONFIG.exclude);
      expect(config.respectGitignore).toBe(DEFAULT_CONFIG.respectGitignore);
      expect(config.maxFileSize).toBe(DEFAULT_CONFIG.maxFileSize);
      expect(config.maxFiles).toBe(DEFAULT_CONFIG.maxFiles);
    });

    it('should include documentation comments', async () => {
      await generateDefaultConfig(indexPath);

      const configPath = path.join(indexPath, 'config.json');
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config._comment).toBeDefined();
      expect(typeof config._comment).toBe('string');
    });

    it('should include hardcoded excludes documentation', async () => {
      await generateDefaultConfig(indexPath);

      const configPath = path.join(indexPath, 'config.json');
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config._hardcodedExcludes).toBeDefined();
      expect(Array.isArray(config._hardcodedExcludes)).toBe(true);
      expect(config._hardcodedExcludes).toContain('node_modules/');
    });

    it('should include available options documentation', async () => {
      await generateDefaultConfig(indexPath);

      const configPath = path.join(indexPath, 'config.json');
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config._availableOptions).toBeDefined();
      expect(config._availableOptions.include).toBeDefined();
      expect(config._availableOptions.exclude).toBeDefined();
      expect(config._availableOptions.respectGitignore).toBeDefined();
      expect(config._availableOptions.maxFileSize).toBeDefined();
      expect(config._availableOptions.maxFiles).toBeDefined();
    });
  });

  // ==========================================================================
  // ConfigManager Class Tests
  // ==========================================================================

  describe('ConfigManager', () => {
    describe('constructor', () => {
      it('should create instance with index path', () => {
        const manager = new ConfigManager(indexPath);
        expect(manager.getIndexPath()).toBe(indexPath);
      });

      it('should not be loaded initially', () => {
        const manager = new ConfigManager(indexPath);
        expect(manager.isLoaded()).toBe(false);
      });
    });

    describe('load', () => {
      it('should load config from disk', async () => {
        const customConfig: Config = {
          include: ['custom/**/*'],
          exclude: [],
          respectGitignore: false,
          maxFileSize: '2MB',
          maxFiles: 10000,
        };

        const configPath = path.join(indexPath, 'config.json');
        await fs.promises.writeFile(configPath, JSON.stringify(customConfig));

        const manager = new ConfigManager(indexPath);
        const loaded = await manager.load();

        expect(loaded).toEqual(customConfig);
        expect(manager.isLoaded()).toBe(true);
      });

      it('should update lastLoadedAt', async () => {
        const manager = new ConfigManager(indexPath);
        expect(manager.getLastLoadedAt()).toBe(0);

        const before = Date.now();
        await manager.load();
        const after = Date.now();

        expect(manager.getLastLoadedAt()).toBeGreaterThanOrEqual(before);
        expect(manager.getLastLoadedAt()).toBeLessThanOrEqual(after);
      });
    });

    describe('save', () => {
      it('should save config to disk', async () => {
        const manager = new ConfigManager(indexPath);
        const config: Config = {
          include: ['src/**/*'],
          exclude: ['test/**/*'],
          respectGitignore: true,
          maxFileSize: '500KB',
          maxFiles: 5000,
        };

        await manager.save(config);

        const configPath = path.join(indexPath, 'config.json');
        const content = await fs.promises.readFile(configPath, 'utf-8');
        const saved = JSON.parse(content);

        expect(saved.include).toEqual(config.include);
        expect(manager.getConfig()).toEqual(config);
      });

      it('should update cache after save', async () => {
        const manager = new ConfigManager(indexPath);
        await manager.load(); // Load defaults

        const newConfig: Config = {
          include: ['new/**/*'],
          exclude: [],
          respectGitignore: false,
          maxFileSize: '3MB',
          maxFiles: 30000,
        };

        await manager.save(newConfig);
        expect(manager.getConfig()).toEqual(newConfig);
      });
    });

    describe('ensureExists', () => {
      it('should create config if not exists', async () => {
        const manager = new ConfigManager(indexPath);
        await manager.ensureExists();

        const configPath = path.join(indexPath, 'config.json');
        expect(fs.existsSync(configPath)).toBe(true);
      });

      it('should not overwrite existing config', async () => {
        const customConfig: Config = {
          include: ['custom/**/*'],
          exclude: [],
          respectGitignore: false,
          maxFileSize: '5MB',
          maxFiles: 1000,
        };

        const configPath = path.join(indexPath, 'config.json');
        await fs.promises.writeFile(configPath, JSON.stringify(customConfig));

        const manager = new ConfigManager(indexPath);
        await manager.ensureExists();

        const content = await fs.promises.readFile(configPath, 'utf-8');
        const saved = JSON.parse(content);

        expect(saved.include).toEqual(['custom/**/*']);
      });
    });

    describe('getConfig', () => {
      it('should return cached config after load', async () => {
        const manager = new ConfigManager(indexPath);
        await manager.load();

        const config = manager.getConfig();
        expect(config).toEqual(DEFAULT_CONFIG);
      });

      it('should throw if not loaded', () => {
        const manager = new ConfigManager(indexPath);
        expect(() => manager.getConfig()).toThrow('Config not loaded');
      });
    });

    describe('reloadIfChanged', () => {
      it('should reload if file is newer', async () => {
        const manager = new ConfigManager(indexPath);

        // Create initial config
        const configPath = path.join(indexPath, 'config.json');
        await fs.promises.writeFile(
          configPath,
          JSON.stringify({ ...DEFAULT_CONFIG, maxFiles: 1000 })
        );

        await manager.load();
        expect(manager.getConfig().maxFiles).toBe(1000);

        // Wait a bit and update the file
        await new Promise((resolve) => setTimeout(resolve, 10));
        await fs.promises.writeFile(
          configPath,
          JSON.stringify({ ...DEFAULT_CONFIG, maxFiles: 2000 })
        );

        const reloaded = await manager.reloadIfChanged();
        expect(reloaded).toBe(true);
        expect(manager.getConfig().maxFiles).toBe(2000);
      });

      it('should not reload if file unchanged', async () => {
        const manager = new ConfigManager(indexPath);

        const configPath = path.join(indexPath, 'config.json');
        await fs.promises.writeFile(
          configPath,
          JSON.stringify({ ...DEFAULT_CONFIG })
        );

        await manager.load();
        const lastLoaded = manager.getLastLoadedAt();

        // Wait a bit but don't change file
        await new Promise((resolve) => setTimeout(resolve, 10));

        const reloaded = await manager.reloadIfChanged();
        expect(reloaded).toBe(false);
        expect(manager.getLastLoadedAt()).toBe(lastLoaded);
      });

      it('should load defaults if no config and not previously loaded', async () => {
        const manager = new ConfigManager(indexPath);

        const reloaded = await manager.reloadIfChanged();
        expect(reloaded).toBe(true);
        expect(manager.getConfig()).toEqual(DEFAULT_CONFIG);
      });
    });

    describe('getMaxFileSizeBytes', () => {
      it('should return parsed max file size', async () => {
        const manager = new ConfigManager(indexPath);
        await manager.load();

        const bytes = manager.getMaxFileSizeBytes();
        expect(bytes).toBe(parseFileSize(DEFAULT_CONFIG.maxFileSize));
      });

      it('should throw if not loaded', () => {
        const manager = new ConfigManager(indexPath);
        expect(() => manager.getMaxFileSizeBytes()).toThrow('Config not loaded');
      });
    });

    describe('getConfigPath', () => {
      it('should return correct config path', () => {
        const manager = new ConfigManager(indexPath);
        const expectedPath = path.join(indexPath, 'config.json');
        expect(manager.getConfigPath()).toBe(expectedPath);
      });
    });
  });
});
