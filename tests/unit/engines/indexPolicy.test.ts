/**
 * Indexing Policy Engine Tests
 *
 * Tests cover:
 * - Hardcoded deny list patterns
 * - User include/exclude patterns
 * - Gitignore integration (including nested .gitignore)
 * - Binary file detection (extension and content-based)
 * - File size limits
 * - Priority order of policy rules
 * - IndexingPolicy class
 * - Security features:
 *   - Case-insensitive matching on Windows
 *   - Unicode path normalization
 *   - Content-based binary detection
 *   - Nested gitignore pattern scoping
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  HARDCODED_DENY_PATTERNS,
  ALL_DENY_PATTERNS,
  loadGitignore,
  isBinaryFile,
  isBinaryContent,
  isBinaryFileOrContent,
  checkFileSize,
  matchesAnyPattern,
  isHardDenied,
  shouldIndex,
  IndexingPolicy,
  normalizePathUnicode,
  IS_CASE_INSENSITIVE_FS,
  type PolicyResult,
  type Ignore,
} from '../../../src/engines/indexPolicy.js';
import { Config, DEFAULT_CONFIG } from '../../../src/storage/config.js';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a temporary directory with optional structure
 */
async function createTempDir(prefix: string): Promise<string> {
  const tempBase = os.tmpdir();
  const tempDir = await fs.promises.mkdtemp(path.join(tempBase, prefix));
  return tempDir;
}

/**
 * Remove a directory recursively
 */
async function removeTempDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Create a file in a directory
 */
async function createFile(
  dirPath: string,
  fileName: string,
  content: string = ''
): Promise<string> {
  const filePath = path.join(dirPath, fileName);
  const parentDir = path.dirname(filePath);
  await fs.promises.mkdir(parentDir, { recursive: true });
  await fs.promises.writeFile(filePath, content);
  return filePath;
}

/**
 * Create a directory
 */
async function createDirectory(dirPath: string, dirName: string): Promise<string> {
  const fullPath = path.join(dirPath, dirName);
  await fs.promises.mkdir(fullPath, { recursive: true });
  return fullPath;
}

// ============================================================================
// Tests
// ============================================================================

describe('Indexing Policy Engine', () => {
  describe('HARDCODED_DENY_PATTERNS', () => {
    it('should have all expected categories', () => {
      expect(HARDCODED_DENY_PATTERNS.dependencies).toBeDefined();
      expect(HARDCODED_DENY_PATTERNS.versionControl).toBeDefined();
      expect(HARDCODED_DENY_PATTERNS.buildArtifacts).toBeDefined();
      expect(HARDCODED_DENY_PATTERNS.secrets).toBeDefined();
      expect(HARDCODED_DENY_PATTERNS.logsAndLocks).toBeDefined();
      expect(HARDCODED_DENY_PATTERNS.ideConfig).toBeDefined();
      expect(HARDCODED_DENY_PATTERNS.testing).toBeDefined();
    });

    it('should include node_modules in dependencies', () => {
      expect(HARDCODED_DENY_PATTERNS.dependencies).toContain('node_modules/**');
    });

    it('should include .git in versionControl', () => {
      expect(HARDCODED_DENY_PATTERNS.versionControl).toContain('.git/**');
    });

    it('should include dist in buildArtifacts', () => {
      expect(HARDCODED_DENY_PATTERNS.buildArtifacts).toContain('dist/**');
    });

    it('should include .env in secrets', () => {
      expect(HARDCODED_DENY_PATTERNS.secrets).toContain('.env');
      expect(HARDCODED_DENY_PATTERNS.secrets).toContain('.env.*');
      expect(HARDCODED_DENY_PATTERNS.secrets).toContain('*.pem');
      expect(HARDCODED_DENY_PATTERNS.secrets).toContain('*.key');
    });

    it('should include lock files in logsAndLocks', () => {
      expect(HARDCODED_DENY_PATTERNS.logsAndLocks).toContain('package-lock.json');
      expect(HARDCODED_DENY_PATTERNS.logsAndLocks).toContain('yarn.lock');
      expect(HARDCODED_DENY_PATTERNS.logsAndLocks).toContain('*.log');
    });

    it('should include IDE config directories', () => {
      expect(HARDCODED_DENY_PATTERNS.ideConfig).toContain('.idea/**');
      expect(HARDCODED_DENY_PATTERNS.ideConfig).toContain('.vscode/**');
    });

    it('should include coverage in testing', () => {
      expect(HARDCODED_DENY_PATTERNS.testing).toContain('coverage/**');
    });
  });

  describe('ALL_DENY_PATTERNS', () => {
    it('should be a flattened array of all patterns', () => {
      expect(Array.isArray(ALL_DENY_PATTERNS)).toBe(true);
      expect(ALL_DENY_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should contain patterns from all categories', () => {
      expect(ALL_DENY_PATTERNS).toContain('node_modules/**');
      expect(ALL_DENY_PATTERNS).toContain('.git/**');
      expect(ALL_DENY_PATTERNS).toContain('.env');
      expect(ALL_DENY_PATTERNS).toContain('coverage/**');
    });
  });

  describe('isHardDenied', () => {
    it('should deny node_modules', () => {
      expect(isHardDenied('node_modules/lodash/index.js')).toBe(true);
      expect(isHardDenied('node_modules/react/package.json')).toBe(true);
    });

    it('should deny .git directory', () => {
      expect(isHardDenied('.git/config')).toBe(true);
      expect(isHardDenied('.git/objects/pack/pack-123.idx')).toBe(true);
    });

    it('should deny dist directory', () => {
      expect(isHardDenied('dist/index.js')).toBe(true);
      expect(isHardDenied('dist/utils/helper.js')).toBe(true);
    });

    it('should deny build directory', () => {
      expect(isHardDenied('build/index.js')).toBe(true);
    });

    it('should deny .env files', () => {
      expect(isHardDenied('.env')).toBe(true);
      expect(isHardDenied('.env.local')).toBe(true);
      expect(isHardDenied('.env.production')).toBe(true);
    });

    it('should deny secret files', () => {
      expect(isHardDenied('server.pem')).toBe(true);
      expect(isHardDenied('private.key')).toBe(true);
      expect(isHardDenied('certificate.p12')).toBe(true);
    });

    it('should deny log files', () => {
      expect(isHardDenied('app.log')).toBe(true);
      expect(isHardDenied('error.log')).toBe(true);
    });

    it('should deny lock files', () => {
      expect(isHardDenied('package-lock.json')).toBe(true);
      expect(isHardDenied('yarn.lock')).toBe(true);
      expect(isHardDenied('pnpm-lock.yaml')).toBe(true);
    });

    it('should deny IDE directories', () => {
      expect(isHardDenied('.idea/workspace.xml')).toBe(true);
      expect(isHardDenied('.vscode/settings.json')).toBe(true);
    });

    it('should deny coverage directory', () => {
      expect(isHardDenied('coverage/lcov.info')).toBe(true);
    });

    it('should allow regular source files', () => {
      expect(isHardDenied('src/index.ts')).toBe(false);
      expect(isHardDenied('src/utils/helper.ts')).toBe(false);
      expect(isHardDenied('README.md')).toBe(false);
      expect(isHardDenied('package.json')).toBe(false);
    });

    it('should allow files with similar names but in allowed locations', () => {
      expect(isHardDenied('src/utils/environment.ts')).toBe(false);
      expect(isHardDenied('docs/log-analysis.md')).toBe(false);
    });
  });

  describe('matchesAnyPattern', () => {
    it('should match exact patterns', () => {
      expect(matchesAnyPattern('src/index.ts', ['src/index.ts'])).toBe(true);
    });

    it('should match glob patterns with **', () => {
      expect(matchesAnyPattern('src/utils/hash.ts', ['src/**/*.ts'])).toBe(true);
      expect(matchesAnyPattern('src/index.ts', ['**/*.ts'])).toBe(true);
    });

    it('should match glob patterns with *', () => {
      expect(matchesAnyPattern('config.json', ['*.json'])).toBe(true);
      expect(matchesAnyPattern('src/config.json', ['*.json'])).toBe(false);
    });

    it('should match multiple patterns', () => {
      expect(matchesAnyPattern('test.js', ['*.ts', '*.js'])).toBe(true);
      expect(matchesAnyPattern('test.py', ['*.ts', '*.js'])).toBe(false);
    });

    it('should match dot files with dot: true', () => {
      expect(matchesAnyPattern('.gitignore', ['.*'])).toBe(true);
      expect(matchesAnyPattern('.env', ['.*'])).toBe(true);
    });
  });

  describe('isBinaryFile', () => {
    it('should detect binary file extensions', () => {
      expect(isBinaryFile('image.png')).toBe(true);
      expect(isBinaryFile('image.jpg')).toBe(true);
      expect(isBinaryFile('image.gif')).toBe(true);
      expect(isBinaryFile('document.pdf')).toBe(true);
      expect(isBinaryFile('archive.zip')).toBe(true);
      expect(isBinaryFile('archive.tar.gz')).toBe(true);
      expect(isBinaryFile('program.exe')).toBe(true);
      expect(isBinaryFile('library.dll')).toBe(true);
      expect(isBinaryFile('object.o')).toBe(true);
    });

    it('should allow text file extensions', () => {
      expect(isBinaryFile('index.ts')).toBe(false);
      expect(isBinaryFile('index.js')).toBe(false);
      expect(isBinaryFile('style.css')).toBe(false);
      expect(isBinaryFile('index.html')).toBe(false);
      expect(isBinaryFile('README.md')).toBe(false);
      expect(isBinaryFile('config.json')).toBe(false);
      expect(isBinaryFile('data.xml')).toBe(false);
      expect(isBinaryFile('script.py')).toBe(false);
    });

    it('should handle paths with directories', () => {
      expect(isBinaryFile('src/assets/logo.png')).toBe(true);
      expect(isBinaryFile('src/utils/helper.ts')).toBe(false);
    });
  });

  describe('checkFileSize', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('size-check-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should return underLimit: true for files under limit', async () => {
      const filePath = await createFile(tempDir, 'small.txt', 'small content');
      const result = await checkFileSize(filePath, 1024 * 1024); // 1MB limit
      expect(result.underLimit).toBe(true);
      expect(result.actualSize).toBeLessThan(1024 * 1024);
    });

    it('should return underLimit: false for files over limit', async () => {
      const content = 'x'.repeat(2000); // 2000 bytes
      const filePath = await createFile(tempDir, 'large.txt', content);
      const result = await checkFileSize(filePath, 1000); // 1000 byte limit
      expect(result.underLimit).toBe(false);
      expect(result.actualSize).toBe(2000);
    });

    it('should handle non-existent files', async () => {
      const result = await checkFileSize(
        path.join(tempDir, 'nonexistent.txt'),
        1024
      );
      // Should assume under limit if file doesn't exist
      expect(result.underLimit).toBe(true);
    });

    it('should handle exact size match', async () => {
      const content = 'x'.repeat(100);
      const filePath = await createFile(tempDir, 'exact.txt', content);
      const result = await checkFileSize(filePath, 100);
      expect(result.underLimit).toBe(true); // <= is considered under limit
    });
  });

  describe('loadGitignore', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('gitignore-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should load root .gitignore patterns', async () => {
      await createFile(tempDir, '.gitignore', '*.tmp\ntemp/\n');

      const ig = await loadGitignore(tempDir);

      expect(ig.ignores('file.tmp')).toBe(true);
      expect(ig.ignores('temp/data.txt')).toBe(true);
      expect(ig.ignores('src/index.ts')).toBe(false);
    });

    it('should handle nested .gitignore files', async () => {
      // Root gitignore
      await createFile(tempDir, '.gitignore', '*.log\n');

      // Create nested directory with its own gitignore
      const subDir = await createDirectory(tempDir, 'subdir');
      await createFile(subDir, '.gitignore', '*.tmp\n');

      const ig = await loadGitignore(tempDir);

      expect(ig.ignores('app.log')).toBe(true);
      expect(ig.ignores('subdir/cache.tmp')).toBe(true);
      expect(ig.ignores('subdir/data.txt')).toBe(false);
    });

    it('should handle comments in gitignore', async () => {
      await createFile(tempDir, '.gitignore', '# This is a comment\n*.tmp\n# Another comment\n');

      const ig = await loadGitignore(tempDir);

      expect(ig.ignores('file.tmp')).toBe(true);
    });

    it('should handle empty gitignore', async () => {
      await createFile(tempDir, '.gitignore', '');

      const ig = await loadGitignore(tempDir);

      expect(ig.ignores('anything.txt')).toBe(false);
    });

    it('should handle missing gitignore', async () => {
      const ig = await loadGitignore(tempDir);

      expect(ig.ignores('anything.txt')).toBe(false);
    });

    it('should handle negation patterns', async () => {
      await createFile(tempDir, '.gitignore', '*.log\n!important.log\n');

      const ig = await loadGitignore(tempDir);

      expect(ig.ignores('debug.log')).toBe(true);
      expect(ig.ignores('important.log')).toBe(false);
    });

    it('should skip searching in denied directories', async () => {
      // Create a node_modules directory with a gitignore
      const nodeModules = await createDirectory(tempDir, 'node_modules');
      await createFile(nodeModules, '.gitignore', 'secret.txt\n');

      // Create a src directory with a gitignore
      const src = await createDirectory(tempDir, 'src');
      await createFile(src, '.gitignore', '*.bak\n');

      const ig = await loadGitignore(tempDir);

      // src gitignore should be loaded
      expect(ig.ignores('src/file.bak')).toBe(true);
      // node_modules gitignore should NOT be loaded (skipped directory)
      // The file itself would be denied by hardcoded patterns anyway
    });
  });

  describe('shouldIndex', () => {
    let tempDir: string;
    let config: Config;
    let gitignore: Ignore | null;

    beforeEach(async () => {
      tempDir = await createTempDir('should-index-');
      config = { ...DEFAULT_CONFIG };
      gitignore = null;
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    describe('Priority 1: Hardcoded Deny List', () => {
      it('should always deny hardcoded patterns', async () => {
        const result = await shouldIndex(
          'node_modules/lodash/index.js',
          path.join(tempDir, 'node_modules/lodash/index.js'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(false);
        expect(result.category).toBe('hardcoded');
      });

      it('should deny .env even with user include', async () => {
        config.include = ['.env'];
        const result = await shouldIndex(
          '.env',
          path.join(tempDir, '.env'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(false);
        expect(result.category).toBe('hardcoded');
      });
    });

    describe('Priority 2: User Exclude', () => {
      it('should skip files matching user exclude patterns', async () => {
        config.exclude = ['**/*.test.ts', 'tests/**'];

        const result1 = await shouldIndex(
          'src/utils/hash.test.ts',
          path.join(tempDir, 'src/utils/hash.test.ts'),
          config,
          gitignore
        );
        expect(result1.shouldIndex).toBe(false);
        expect(result1.category).toBe('user-exclude');

        const result2 = await shouldIndex(
          'tests/unit/helper.ts',
          path.join(tempDir, 'tests/unit/helper.ts'),
          config,
          gitignore
        );
        expect(result2.shouldIndex).toBe(false);
        expect(result2.category).toBe('user-exclude');
      });

      it('should not skip files not matching exclude patterns', async () => {
        config.exclude = ['**/*.test.ts'];
        await createFile(tempDir, 'src/index.ts', 'export const x = 1;');

        const result = await shouldIndex(
          'src/index.ts',
          path.join(tempDir, 'src/index.ts'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(true);
      });
    });

    describe('Priority 3: Gitignore', () => {
      it('should skip files matching gitignore when respectGitignore is true', async () => {
        config.respectGitignore = true;
        await createFile(tempDir, '.gitignore', '*.generated.ts\n');
        gitignore = await loadGitignore(tempDir);

        const result = await shouldIndex(
          'src/types.generated.ts',
          path.join(tempDir, 'src/types.generated.ts'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(false);
        expect(result.category).toBe('gitignore');
      });

      it('should not skip gitignored files when respectGitignore is false', async () => {
        config.respectGitignore = false;
        await createFile(tempDir, '.gitignore', '*.generated.ts\n');
        gitignore = await loadGitignore(tempDir);
        await createFile(tempDir, 'src/types.generated.ts', 'export type X = string;');

        const result = await shouldIndex(
          'src/types.generated.ts',
          path.join(tempDir, 'src/types.generated.ts'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(true);
      });
    });

    describe('Priority 4: Binary Detection', () => {
      it('should skip binary files', async () => {
        const result = await shouldIndex(
          'assets/logo.png',
          path.join(tempDir, 'assets/logo.png'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(false);
        expect(result.category).toBe('binary');
      });

      it('should allow text files', async () => {
        await createFile(tempDir, 'src/index.ts', 'export const x = 1;');

        const result = await shouldIndex(
          'src/index.ts',
          path.join(tempDir, 'src/index.ts'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(true);
      });
    });

    describe('Priority 5: File Size', () => {
      it('should skip files over size limit', async () => {
        config.maxFileSize = '100KB'; // 100 KB limit
        const largeContent = 'x'.repeat(150 * 1024); // 150 KB
        await createFile(tempDir, 'large.txt', largeContent);

        const result = await shouldIndex(
          'large.txt',
          path.join(tempDir, 'large.txt'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(false);
        expect(result.category).toBe('size');
      });

      it('should allow files under size limit', async () => {
        config.maxFileSize = '100KB';
        const smallContent = 'x'.repeat(10 * 1024); // 10 KB
        await createFile(tempDir, 'small.txt', smallContent);

        const result = await shouldIndex(
          'small.txt',
          path.join(tempDir, 'small.txt'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(true);
      });
    });

    describe('Priority 6: User Include', () => {
      it('should skip files not matching include patterns (when not default)', async () => {
        config.include = ['src/**/*.ts'];
        await createFile(tempDir, 'docs/readme.md', '# Readme');

        const result = await shouldIndex(
          'docs/readme.md',
          path.join(tempDir, 'docs/readme.md'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(false);
        expect(result.category).toBe('include-mismatch');
      });

      it('should allow files matching include patterns', async () => {
        config.include = ['src/**/*.ts'];
        await createFile(tempDir, 'src/index.ts', 'export const x = 1;');

        const result = await shouldIndex(
          'src/index.ts',
          path.join(tempDir, 'src/index.ts'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(true);
      });

      it('should allow all files with default include pattern', async () => {
        config.include = ['**/*'];
        await createFile(tempDir, 'any/file.xyz', 'content');

        const result = await shouldIndex(
          'any/file.xyz',
          path.join(tempDir, 'any/file.xyz'),
          config,
          gitignore
        );
        expect(result.shouldIndex).toBe(true);
      });
    });

    describe('Priority Order', () => {
      it('should check hardcoded before user exclude', async () => {
        config.exclude = []; // No user excludes
        config.include = ['node_modules/**']; // Explicitly include node_modules

        const result = await shouldIndex(
          'node_modules/lodash/index.js',
          path.join(tempDir, 'node_modules/lodash/index.js'),
          config,
          gitignore
        );

        // Should be denied by hardcoded, not allowed by include
        expect(result.shouldIndex).toBe(false);
        expect(result.category).toBe('hardcoded');
      });

      it('should check user exclude before gitignore', async () => {
        config.exclude = ['*.special.ts'];
        config.respectGitignore = true;
        await createFile(tempDir, '.gitignore', '!*.special.ts\n'); // gitignore would allow it
        gitignore = await loadGitignore(tempDir);

        const result = await shouldIndex(
          'file.special.ts',
          path.join(tempDir, 'file.special.ts'),
          config,
          gitignore
        );

        expect(result.shouldIndex).toBe(false);
        expect(result.category).toBe('user-exclude');
      });
    });
  });

  describe('IndexingPolicy class', () => {
    let tempDir: string;
    let config: Config;

    beforeEach(async () => {
      tempDir = await createTempDir('policy-class-');
      config = { ...DEFAULT_CONFIG };
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should create instance with project path and config', () => {
      const policy = new IndexingPolicy(tempDir, config);
      expect(policy.getProjectPath()).toBe(tempDir);
      expect(policy.getConfig()).toEqual(config);
    });

    it('should initialize lazily on first shouldIndex call', async () => {
      const policy = new IndexingPolicy(tempDir, config);
      expect(policy.isInitialized()).toBe(false);

      await createFile(tempDir, 'src/index.ts', 'export const x = 1;');
      await policy.shouldIndex('src/index.ts', path.join(tempDir, 'src/index.ts'));

      expect(policy.isInitialized()).toBe(true);
    });

    it('should load gitignore during initialization', async () => {
      await createFile(tempDir, '.gitignore', '*.tmp\n');
      await createFile(tempDir, 'cache.tmp', 'temp data');

      const policy = new IndexingPolicy(tempDir, config);
      await policy.initialize();

      const result = await policy.shouldIndex(
        'cache.tmp',
        path.join(tempDir, 'cache.tmp')
      );
      expect(result.shouldIndex).toBe(false);
      expect(result.category).toBe('gitignore');
    });

    it('should provide synchronous isHardDenied check', () => {
      const policy = new IndexingPolicy(tempDir, config);

      // No initialization needed for isHardDenied
      expect(policy.isHardDenied('node_modules/test.js')).toBe(true);
      expect(policy.isHardDenied('src/index.ts')).toBe(false);
    });

    it('should reload gitignore when requested', async () => {
      const policy = new IndexingPolicy(tempDir, config);
      await policy.initialize();

      // Create gitignore after initialization
      await createFile(tempDir, '.gitignore', '*.newpattern\n');
      await policy.reloadGitignore();

      const result = await policy.shouldIndex(
        'file.newpattern',
        path.join(tempDir, 'file.newpattern')
      );
      expect(result.shouldIndex).toBe(false);
      expect(result.category).toBe('gitignore');
    });

    it('should not load gitignore when respectGitignore is false', async () => {
      config.respectGitignore = false;
      await createFile(tempDir, '.gitignore', '*.ignored\n');
      await createFile(tempDir, 'test.ignored', 'content');

      const policy = new IndexingPolicy(tempDir, config);
      await policy.initialize();

      const result = await policy.shouldIndex(
        'test.ignored',
        path.join(tempDir, 'test.ignored')
      );
      expect(result.shouldIndex).toBe(true);
    });

    it('should handle multiple calls without re-initialization', async () => {
      const policy = new IndexingPolicy(tempDir, config);

      await createFile(tempDir, 'file1.ts', 'content');
      await createFile(tempDir, 'file2.ts', 'content');

      const result1 = await policy.shouldIndex(
        'file1.ts',
        path.join(tempDir, 'file1.ts')
      );
      const result2 = await policy.shouldIndex(
        'file2.ts',
        path.join(tempDir, 'file2.ts')
      );

      expect(result1.shouldIndex).toBe(true);
      expect(result2.shouldIndex).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    let tempDir: string;
    let config: Config;

    beforeEach(async () => {
      tempDir = await createTempDir('edge-cases-');
      config = { ...DEFAULT_CONFIG };
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should handle paths with special characters', async () => {
      await createFile(tempDir, 'file-with-dash.ts', 'content');
      await createFile(tempDir, 'file_with_underscore.ts', 'content');
      await createFile(tempDir, 'file.multiple.dots.ts', 'content');

      const policy = new IndexingPolicy(tempDir, config);

      const result1 = await policy.shouldIndex(
        'file-with-dash.ts',
        path.join(tempDir, 'file-with-dash.ts')
      );
      expect(result1.shouldIndex).toBe(true);

      const result2 = await policy.shouldIndex(
        'file_with_underscore.ts',
        path.join(tempDir, 'file_with_underscore.ts')
      );
      expect(result2.shouldIndex).toBe(true);

      const result3 = await policy.shouldIndex(
        'file.multiple.dots.ts',
        path.join(tempDir, 'file.multiple.dots.ts')
      );
      expect(result3.shouldIndex).toBe(true);
    });

    it('should handle empty exclude and include arrays', async () => {
      config.exclude = [];
      config.include = [];
      await createFile(tempDir, 'test.ts', 'content');

      const policy = new IndexingPolicy(tempDir, config);
      const result = await policy.shouldIndex(
        'test.ts',
        path.join(tempDir, 'test.ts')
      );

      // Empty include should act like no restriction
      expect(result.shouldIndex).toBe(true);
    });

    it('should correctly identify .env variations', async () => {
      const policy = new IndexingPolicy(tempDir, config);

      // All these should be denied
      expect(policy.isHardDenied('.env')).toBe(true);
      expect(policy.isHardDenied('.env.local')).toBe(true);
      expect(policy.isHardDenied('.env.development')).toBe(true);
      expect(policy.isHardDenied('.env.production')).toBe(true);

      // But not these
      expect(policy.isHardDenied('environment.ts')).toBe(false);
      expect(policy.isHardDenied('src/env-config.ts')).toBe(false);
    });

    it('should handle deeply nested paths', async () => {
      const deepPath = 'a/b/c/d/e/f/g/h/file.ts';
      await createFile(tempDir, deepPath, 'content');

      const policy = new IndexingPolicy(tempDir, config);
      const result = await policy.shouldIndex(
        deepPath,
        path.join(tempDir, deepPath)
      );

      expect(result.shouldIndex).toBe(true);
    });

    it('should handle files at project root', async () => {
      await createFile(tempDir, 'index.ts', 'export const x = 1;');

      const policy = new IndexingPolicy(tempDir, config);
      const result = await policy.shouldIndex(
        'index.ts',
        path.join(tempDir, 'index.ts')
      );

      expect(result.shouldIndex).toBe(true);
    });
  });

  // ============================================================================
  // Security Tests: Unicode Path Normalization (SMCP-056)
  // ============================================================================

  describe('Unicode Path Normalization (Security)', () => {
    it('should normalize NFC/NFD Unicode forms', () => {
      // The character "e" can be composed (NFC) or decomposed (NFD)
      const nfc = 'caf\u00e9.ts'; // cafe with composed e
      const nfd = 'cafe\u0301.ts'; // cafe with e + combining acute accent

      const normalizedNfc = normalizePathUnicode(nfc);
      const normalizedNfd = normalizePathUnicode(nfd);

      // Both should normalize to the same NFC form
      expect(normalizedNfc).toBe(normalizedNfd);
    });

    it('should remove zero-width characters', () => {
      // Zero-width space could be used to bypass filters
      const withZeroWidth = 'file\u200B.env'; // file + zero-width space + .env
      const normalized = normalizePathUnicode(withZeroWidth);

      expect(normalized).toBe('file.env');
    });

    it('should remove RTL override characters', () => {
      // RTL override could disguise "txt.exe" as "exe.txt" visually
      const withRtl = '\u202Efile.txt'; // RTL override + file.txt
      const normalized = normalizePathUnicode(withRtl);

      expect(normalized).toBe('file.txt');
    });

    it('should remove multiple dangerous Unicode characters', () => {
      // Combined attack: zero-width + RTL
      const malicious = '\u202Afile\u200B\u200C\u200D.env\u202E';
      const normalized = normalizePathUnicode(malicious);

      expect(normalized).toBe('file.env');
    });

    it('should block .env with zero-width character bypass attempt', () => {
      // Attempt to bypass .env block with zero-width character
      const bypassAttempt = '.env\u200B'; // .env + zero-width space

      // isHardDenied normalizes Unicode internally
      expect(isHardDenied(bypassAttempt)).toBe(true);
    });
  });

  // ============================================================================
  // Security Tests: Case-Insensitive Matching (SMCP-056)
  // ============================================================================

  describe('Case-Insensitive Matching (Security)', () => {
    it('should report correct platform case sensitivity', () => {
      // This test verifies the constant is set correctly
      if (process.platform === 'win32') {
        expect(IS_CASE_INSENSITIVE_FS).toBe(true);
      } else {
        expect(IS_CASE_INSENSITIVE_FS).toBe(false);
      }
    });

    describe('on Windows (case-insensitive)', () => {
      // These tests verify case-insensitive matching behavior
      // The actual behavior depends on IS_CASE_INSENSITIVE_FS

      it('should block .ENV variant on Windows', () => {
        // On Windows, .ENV should be blocked same as .env
        if (process.platform === 'win32') {
          expect(isHardDenied('.ENV')).toBe(true);
          expect(isHardDenied('.Env')).toBe(true);
          expect(isHardDenied('.eNv')).toBe(true);
        }
      });

      it('should block .ENV.local variant on Windows', () => {
        if (process.platform === 'win32') {
          expect(isHardDenied('.ENV.local')).toBe(true);
          expect(isHardDenied('.ENV.LOCAL')).toBe(true);
        }
      });

      it('should block NODE_MODULES on Windows', () => {
        if (process.platform === 'win32') {
          expect(isHardDenied('NODE_MODULES/test.js')).toBe(true);
          expect(isHardDenied('Node_Modules/test.js')).toBe(true);
        }
      });
    });

    describe('matchesAnyPattern with case sensitivity', () => {
      it('should respect case-insensitive flag', () => {
        const patterns = ['*.ENV', 'secret.*'];

        // Case-sensitive (default)
        expect(matchesAnyPattern('test.env', patterns, false)).toBe(false);
        expect(matchesAnyPattern('test.ENV', patterns, false)).toBe(true);

        // Case-insensitive
        expect(matchesAnyPattern('test.env', patterns, true)).toBe(true);
        expect(matchesAnyPattern('test.ENV', patterns, true)).toBe(true);
        expect(matchesAnyPattern('SECRET.txt', patterns, true)).toBe(true);
      });
    });
  });

  // ============================================================================
  // Security Tests: Content-Based Binary Detection (SMCP-056)
  // ============================================================================

  describe('Content-Based Binary Detection (Security)', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('binary-content-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should detect binary content via null bytes', async () => {
      // Create a file with binary content (null bytes)
      const binaryContent = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f, 0x72, 0x6c, 0x64]);
      const filePath = path.join(tempDir, 'hidden-binary.txt');
      await fs.promises.writeFile(filePath, binaryContent);

      const isBinary = await isBinaryContent(filePath);
      expect(isBinary).toBe(true);
    });

    it('should detect renamed executable as binary', async () => {
      // Simulate an exe file renamed to .txt
      // Executables typically have null bytes in their header
      const exeHeader = Buffer.from([0x4d, 0x5a, 0x00, 0x00]); // MZ header with nulls
      const filePath = path.join(tempDir, 'renamed.txt');
      await fs.promises.writeFile(filePath, exeHeader);

      const isBinary = await isBinaryContent(filePath);
      expect(isBinary).toBe(true);
    });

    it('should allow text file with unusual extension', async () => {
      // A text file with .bin extension should be detected as text
      const textContent = 'This is plain text content without null bytes.';
      const filePath = path.join(tempDir, 'text.bin');
      await fs.promises.writeFile(filePath, textContent);

      const isBinary = await isBinaryContent(filePath);
      expect(isBinary).toBe(false);
    });

    it('should handle empty files', async () => {
      const filePath = path.join(tempDir, 'empty.unknown');
      await fs.promises.writeFile(filePath, '');

      const isBinary = await isBinaryContent(filePath);
      expect(isBinary).toBe(false);
    });

    it('should handle non-existent files gracefully', async () => {
      const filePath = path.join(tempDir, 'nonexistent.file');

      const isBinary = await isBinaryContent(filePath);
      expect(isBinary).toBe(false);
    });

    it('should use comprehensive check with isBinaryFileOrContent', async () => {
      // Known text extension - should skip content check
      const tsFile = path.join(tempDir, 'code.ts');
      await fs.promises.writeFile(tsFile, 'const x = 1;');
      expect(await isBinaryFileOrContent('code.ts', tsFile)).toBe(false);

      // Known binary extension - should return true without content check
      expect(await isBinaryFileOrContent('image.png', '/fake/path')).toBe(true);

      // Unknown extension with binary content
      const binaryContent = Buffer.from([0x00, 0x01, 0x02]);
      const unknownFile = path.join(tempDir, 'data.xyz');
      await fs.promises.writeFile(unknownFile, binaryContent);
      expect(await isBinaryFileOrContent('data.xyz', unknownFile)).toBe(true);

      // Unknown extension with text content
      const textFile = path.join(tempDir, 'readme.xyz');
      await fs.promises.writeFile(textFile, 'Plain text');
      expect(await isBinaryFileOrContent('readme.xyz', textFile)).toBe(false);
    });
  });

  // ============================================================================
  // Security Tests: Nested Gitignore Pattern Scoping (SMCP-056)
  // ============================================================================

  describe('Nested Gitignore Pattern Scoping (Security)', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir('nested-gitignore-');
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should match nested gitignore patterns recursively', async () => {
      // Create nested directory structure
      await createDirectory(tempDir, 'secrets');
      await createDirectory(tempDir, 'secrets/deep');
      await createDirectory(tempDir, 'secrets/deep/nested');

      // Create gitignore in secrets/ with *.key pattern
      await createFile(tempDir, 'secrets/.gitignore', '*.key\n');

      const ig = await loadGitignore(tempDir);

      // Pattern should match at all depths within secrets/
      expect(ig.ignores('secrets/api.key')).toBe(true);
      expect(ig.ignores('secrets/deep/private.key')).toBe(true);
      expect(ig.ignores('secrets/deep/nested/root.key')).toBe(true);

      // But not outside secrets/
      expect(ig.ignores('other/file.key')).toBe(false);
    });

    it('should handle multiple nested gitignore files', async () => {
      // Create structure: project/src/components/
      await createDirectory(tempDir, 'src');
      await createDirectory(tempDir, 'src/components');
      await createDirectory(tempDir, 'src/components/private');

      // Root gitignore
      await createFile(tempDir, '.gitignore', '*.log\n');

      // src/.gitignore
      await createFile(tempDir, 'src/.gitignore', '*.tmp\n');

      // src/components/.gitignore
      await createFile(tempDir, 'src/components/.gitignore', '*.bak\n');

      const ig = await loadGitignore(tempDir);

      // Root pattern applies everywhere
      expect(ig.ignores('app.log')).toBe(true);
      expect(ig.ignores('src/debug.log')).toBe(true);
      expect(ig.ignores('src/components/trace.log')).toBe(true);

      // src pattern applies within src/
      expect(ig.ignores('src/cache.tmp')).toBe(true);
      expect(ig.ignores('src/components/cache.tmp')).toBe(true);
      expect(ig.ignores('cache.tmp')).toBe(false); // Not in src/

      // components pattern applies within components/
      expect(ig.ignores('src/components/file.bak')).toBe(true);
      expect(ig.ignores('src/components/private/file.bak')).toBe(true);
      expect(ig.ignores('src/file.bak')).toBe(false); // Not in components/
    });

    it('should handle patterns with wildcards correctly', async () => {
      await createDirectory(tempDir, 'config');
      await createDirectory(tempDir, 'config/env');

      // Gitignore with wildcard pattern
      await createFile(tempDir, 'config/.gitignore', 'env/*.secret\n');

      const ig = await loadGitignore(tempDir);

      // Should match in env/ subdirectory
      expect(ig.ignores('config/env/db.secret')).toBe(true);
      expect(ig.ignores('config/env/api.secret')).toBe(true);
    });

    it('should handle negation patterns in nested gitignore', async () => {
      await createDirectory(tempDir, 'data');

      // Ignore all json except schema.json
      await createFile(tempDir, 'data/.gitignore', '*.json\n!schema.json\n');

      const ig = await loadGitignore(tempDir);

      expect(ig.ignores('data/config.json')).toBe(true);
      expect(ig.ignores('data/schema.json')).toBe(false);
    });

    it('should block sensitive files in deeply nested directories', async () => {
      // Critical security test: ensure *.key in nested gitignore blocks keys everywhere
      await createDirectory(tempDir, 'credentials');
      await createDirectory(tempDir, 'credentials/production');
      await createDirectory(tempDir, 'credentials/production/aws');

      await createFile(tempDir, 'credentials/.gitignore', '*.pem\n*.key\n');

      const ig = await loadGitignore(tempDir);

      // All of these should be blocked
      expect(ig.ignores('credentials/server.pem')).toBe(true);
      expect(ig.ignores('credentials/production/server.pem')).toBe(true);
      expect(ig.ignores('credentials/production/aws/private.key')).toBe(true);
    });
  });

  // ============================================================================
  // Security Integration Tests
  // ============================================================================

  describe('Security Integration Tests', () => {
    let tempDir: string;
    let config: Config;

    beforeEach(async () => {
      tempDir = await createTempDir('security-integration-');
      config = { ...DEFAULT_CONFIG };
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it('should block .env with Unicode bypass attempt', async () => {
      // Create a file that looks like .env but has hidden Unicode
      const maliciousName = '.env\u200B'; // .env with zero-width space
      await createFile(tempDir, '.env', 'SECRET=value'); // Create the actual normalized file

      const policy = new IndexingPolicy(tempDir, config);
      const result = await policy.shouldIndex(
        maliciousName,
        path.join(tempDir, '.env')
      );

      expect(result.shouldIndex).toBe(false);
      expect(result.category).toBe('hardcoded');
    });

    it('should detect renamed binary in shouldIndex', async () => {
      // Create a binary file disguised as .unknown extension
      const binaryContent = Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0x00]);
      const filePath = path.join(tempDir, 'malware.unknown');
      await fs.promises.writeFile(filePath, binaryContent);

      const policy = new IndexingPolicy(tempDir, config);
      const result = await policy.shouldIndex('malware.unknown', filePath);

      expect(result.shouldIndex).toBe(false);
      expect(result.category).toBe('binary');
    });

    it('should allow legitimate text file with unknown extension', async () => {
      const textContent = 'This is legitimate text content without any null bytes.';
      const filePath = path.join(tempDir, 'readme.xyz');
      await fs.promises.writeFile(filePath, textContent);

      const policy = new IndexingPolicy(tempDir, config);
      const result = await policy.shouldIndex('readme.xyz', filePath);

      expect(result.shouldIndex).toBe(true);
    });

    it('should apply all security checks in correct order', async () => {
      // Test that security checks don't interfere with each other
      await createFile(tempDir, 'src/index.ts', 'const x = 1;');
      await createFile(tempDir, '.gitignore', '*.generated.ts\n');

      const policy = new IndexingPolicy(tempDir, config);
      await policy.initialize();

      // Normal file should be indexed
      const normalResult = await policy.shouldIndex(
        'src/index.ts',
        path.join(tempDir, 'src/index.ts')
      );
      expect(normalResult.shouldIndex).toBe(true);

      // Gitignored file should be blocked
      const gitignoreResult = await policy.shouldIndex(
        'src/types.generated.ts',
        path.join(tempDir, 'src/types.generated.ts')
      );
      expect(gitignoreResult.shouldIndex).toBe(false);
      expect(gitignoreResult.category).toBe('gitignore');
    });
  });
});
