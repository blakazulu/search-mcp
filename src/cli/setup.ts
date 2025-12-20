/**
 * CLI Setup Command
 *
 * Detects installed MCP clients and helps configure them to use search-mcp.
 * Supports Claude Desktop, Claude Code, Cursor, and Windsurf.
 *
 * Enhanced flow (SMCP-088):
 * 1. Configure MCP client(s)
 * 2. Ask if user wants to index the current project
 * 3. If index exists, offer to delete and recreate
 * 4. Run indexing with progress display
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import * as readline from 'node:readline';
import ora, { Ora } from 'ora';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { getLogger, initGlobalLogger } from '../utils/logger.js';
import { setPreferredDevice, resetEmbeddingEngine } from '../engines/embedding.js';

const PACKAGE_NAME = '@liraz-sbz/search-mcp';

interface MCPClient {
  name: string;
  configPath: string;
  exists: boolean;
  configured: boolean;
}

/**
 * Get platform-specific config paths for various MCP clients
 */
function getClientConfigPaths(): Record<string, string> {
  const home = os.homedir();
  const platform = os.platform();

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return {
      'Claude Desktop': path.join(appData, 'Claude', 'claude_desktop_config.json'),
      'Claude Code (User)': path.join(home, '.claude', '.mcp.json'),
      'Claude Code (Project)': path.join(process.cwd(), '.mcp.json'),
      'Cursor': path.join(appData, 'Cursor', 'mcp.json'),
      'Windsurf': path.join(appData, 'Windsurf', 'mcp.json'),
    };
  } else if (platform === 'darwin') {
    return {
      'Claude Desktop': path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      'Claude Code (User)': path.join(home, '.claude', '.mcp.json'),
      'Claude Code (Project)': path.join(process.cwd(), '.mcp.json'),
      'Cursor': path.join(home, 'Library', 'Application Support', 'Cursor', 'mcp.json'),
      'Windsurf': path.join(home, 'Library', 'Application Support', 'Windsurf', 'mcp.json'),
    };
  } else {
    // Linux
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return {
      'Claude Desktop': path.join(configHome, 'Claude', 'claude_desktop_config.json'),
      'Claude Code (User)': path.join(home, '.claude', '.mcp.json'),
      'Claude Code (Project)': path.join(process.cwd(), '.mcp.json'),
      'Cursor': path.join(configHome, 'Cursor', 'mcp.json'),
      'Windsurf': path.join(configHome, 'Windsurf', 'mcp.json'),
    };
  }
}

/**
 * Check if Claude Code CLI is available
 */
function isClaudeCodeCLIAvailable(): boolean {
  try {
    execSync('claude --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a config file has search-mcp already configured
 */
function isAlreadyConfigured(configPath: string): boolean {
  try {
    if (!fs.existsSync(configPath)) return false;
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    const servers = config.mcpServers || {};
    // Check if any server uses our package
    return Object.values(servers).some((server: any) => {
      const args = server.args || [];
      return args.some((arg: string) => arg.includes(PACKAGE_NAME) || arg.includes('search-mcp'));
    });
  } catch {
    return false;
  }
}

/**
 * Detect which MCP clients are available
 */
function detectClients(): MCPClient[] {
  const paths = getClientConfigPaths();
  const clients: MCPClient[] = [];

  for (const [name, configPath] of Object.entries(paths)) {
    const configDir = path.dirname(configPath);
    // Check if the config directory exists (indicates the app is installed)
    // For project-level config, always show as an option
    const isProjectLevel = name.includes('Project');
    const dirExists = isProjectLevel || fs.existsSync(configDir);

    clients.push({
      name,
      configPath,
      exists: dirExists,
      configured: isAlreadyConfigured(configPath),
    });
  }

  return clients;
}

/**
 * Create or update MCP config for a client
 */
function configureClient(client: MCPClient): { success: boolean; message: string } {
  try {
    const configDir = path.dirname(client.configPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config: any = { mcpServers: {} };

    // Read existing config if it exists
    if (fs.existsSync(client.configPath)) {
      try {
        const content = fs.readFileSync(client.configPath, 'utf-8');
        config = JSON.parse(content);
        if (!config.mcpServers) {
          config.mcpServers = {};
        }
      } catch {
        // If we can't parse, start fresh but warn
        console.log(`  Warning: Could not parse existing config, creating new one`);
      }
    }

    // Add search-mcp configuration
    config.mcpServers.search = {
      command: 'npx',
      args: ['-y', PACKAGE_NAME],
    };

    // Write config with pretty formatting
    fs.writeFileSync(client.configPath, JSON.stringify(config, null, 2) + '\n');

    return {
      success: true,
      message: `Configured ${client.name} at ${client.configPath}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure ${client.name}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Fix Windows path normalization in Claude config
 *
 * Claude CLI saves project paths with forward slashes (C:/path/to/project)
 * but Claude Code reads with backslashes (C:\path\to\project).
 * This function copies mcpServers config to the backslash version.
 */
function fixWindowsPathNormalization(): void {
  if (os.platform() !== 'win32') return;

  const claudeConfigPath = path.join(os.homedir(), '.claude.json');
  if (!fs.existsSync(claudeConfigPath)) return;

  try {
    const content = fs.readFileSync(claudeConfigPath, 'utf-8');
    const config = JSON.parse(content);

    if (!config.projects) return;

    const cwd = process.cwd();
    // Normalize current directory to forward slash format (how CLI saves it)
    const cwdForwardSlash = cwd.replace(/\\/g, '/');
    // Normalize to backslash format (how Claude Code reads it)
    const cwdBackslash = cwd.replace(/\//g, '\\');

    // Check if we have a forward-slash entry with mcpServers
    const forwardSlashEntry = config.projects[cwdForwardSlash];
    const backslashEntry = config.projects[cwdBackslash];

    if (forwardSlashEntry?.mcpServers && Object.keys(forwardSlashEntry.mcpServers).length > 0) {
      // Ensure backslash entry exists
      if (!config.projects[cwdBackslash]) {
        config.projects[cwdBackslash] = {};
      }

      // Copy mcpServers to backslash entry
      config.projects[cwdBackslash].mcpServers = {
        ...config.projects[cwdBackslash].mcpServers,
        ...forwardSlashEntry.mcpServers,
      };

      // Write back
      fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2) + '\n');
    }
  } catch {
    // Ignore errors - this is a best-effort fix
  }
}

/**
 * Configure using Claude Code CLI
 */
function configureWithClaudeCLI(): { success: boolean; message: string } {
  try {
    // First, try to remove existing config (ignore errors if it doesn't exist)
    try {
      execSync('claude mcp remove search', { stdio: 'ignore' });
    } catch {
      // Ignore - server may not exist yet
    }

    // Now add the new config
    execSync(`claude mcp add search -- npx -y ${PACKAGE_NAME}`, { stdio: 'inherit' });

    // Fix Windows path normalization issue (forward slash vs backslash in .claude.json)
    if (os.platform() === 'win32') {
      fixWindowsPathNormalization();
    }
    return {
      success: true,
      message: 'Configured via Claude Code CLI',
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure via CLI: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Prompt user for input
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Print colored output
 */
function print(text: string, color?: 'green' | 'yellow' | 'red' | 'cyan' | 'dim') {
  const colors: Record<string, string> = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
  };
  const reset = '\x1b[0m';

  if (color && colors[color]) {
    console.log(`${colors[color]}${text}${reset}`);
  } else {
    console.log(text);
  }
}

// ============================================================================
// Indexing Support Functions
// ============================================================================

/**
 * Create a progress bar for indexing
 */
function createProgressBar(format: string): cliProgress.SingleBar {
  return new cliProgress.SingleBar({
    format: format,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    clearOnComplete: false,
  }, cliProgress.Presets.shades_classic);
}

/**
 * Helper to safely stop a spinner
 */
function stopSpinner(spinner: Ora | null, message?: string): void {
  if (spinner) {
    if (message) {
      spinner.succeed(message);
    } else {
      spinner.succeed();
    }
  }
}

/**
 * Helper to safely stop a progress bar
 */
function stopProgressBar(bar: cliProgress.SingleBar | null): void {
  if (bar) {
    bar.stop();
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format relative time (e.g., "2 days ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Check if an index exists and return its status
 */
async function checkExistingIndex(projectPath: string): Promise<{
  exists: boolean;
  totalFiles?: number;
  totalChunks?: number;
  lastUpdated?: string;
  storageSize?: string;
} | null> {
  try {
    const { getIndexPath } = await import('../utils/paths.js');
    const { loadMetadata } = await import('../storage/metadata.js');
    const { collectStatus } = await import('../tools/getIndexStatus.js');

    const indexPath = getIndexPath(projectPath);
    const metadata = await loadMetadata(indexPath);

    if (!metadata) {
      return { exists: false };
    }

    // Get full status for detailed info
    const status = await collectStatus({ projectPath });

    return {
      exists: true,
      totalFiles: status.totalFiles,
      totalChunks: status.totalChunks,
      lastUpdated: status.lastUpdated,
      storageSize: status.storageSize,
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Delete an existing index
 */
async function deleteExistingIndex(projectPath: string): Promise<boolean> {
  try {
    const { getIndexPath } = await import('../utils/paths.js');
    const { safeDeleteIndex } = await import('../tools/deleteIndex.js');

    const indexPath = getIndexPath(projectPath);
    const result = await safeDeleteIndex(indexPath);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Extended result with separate code and docs stats
 */
interface IndexingResult {
  success: boolean;
  codeFiles: number;
  codeChunks: number;
  docsFiles: number;
  docsChunks: number;
  duration: string;
  computeDevice?: string;
  error?: string;
}

/**
 * Create a progress callback factory for code or docs indexing
 * Shows: spinner with current file + overall progress bar
 */
function createProgressCallbackFactory(label: string) {
  let multiBar: cliProgress.MultiBar | null = null;
  let fileBar: cliProgress.SingleBar | null = null;
  let progressBar: cliProgress.SingleBar | null = null;
  let phaseSpinner: Ora | null = null;
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;
  let scanTotal = 0;
  let hasShownScanResults = false;
  let hasCreatedProgressBar = false;
  let totalFiles = 0;
  let currentFilename = '';
  let lastFilename = '';
  // For batch processing: track cumulative progress
  let batchBaseOffset = 0;
  let lastBatchTotal = 0;
  let maxProgress = 0;
  // Spinner frames (ora dots spinner)
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIndex = 0;
  // Per-file progress (0-100)
  let fileProgress = 0;

  const updateFileBar = () => {
    if (fileBar && currentFilename) {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      // Detect file change and reset per-file progress
      if (currentFilename !== lastFilename) {
        fileProgress = 0;
        lastFilename = currentFilename;
      }
      // Animate per-file progress (increment by 2-5% per tick, capped at 95% until file completes)
      if (fileProgress < 95) {
        fileProgress += Math.random() * 3 + 2;
        if (fileProgress > 95) fileProgress = 95;
      }
      const purpleSpinner = chalk.magenta(spinnerFrames[spinnerIndex]);
      fileBar.update(0, { spinner: purpleSpinner, filename: currentFilename, pct: `${Math.round(fileProgress)}%` });
    }
  };

  const callback = (progress: {
    phase: 'scanning' | 'chunking' | 'embedding' | 'storing';
    current: number;
    total: number;
    currentFile?: string;
  }) => {
    switch (progress.phase) {
      case 'scanning':
        // Start/update scanning spinner
        if (!hasShownScanResults) {
          if (!phaseSpinner) {
            phaseSpinner = ora(`  Scanning ${label}...`).start();
          }
          scanTotal = progress.total;
          phaseSpinner.text = `  Scanning ${label}... (${progress.total.toLocaleString()} files)`;
        }
        break;

      case 'chunking':
        // Stop scanning spinner and show results (only once)
        if (phaseSpinner) {
          phaseSpinner.stop();
          phaseSpinner = null;
        }
        if (!hasShownScanResults) {
          totalFiles = progress.total;
          console.log(`  \u2714 Scanned ${scanTotal.toLocaleString()} files \u2192 ${totalFiles.toLocaleString()} indexable`);
          hasShownScanResults = true;
          lastBatchTotal = progress.total;
        }

        // Create multi-bar only once
        if (!hasCreatedProgressBar) {
          multiBar = new cliProgress.MultiBar({
            clearOnComplete: false,
            hideCursor: true,
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
          }, cliProgress.Presets.shades_classic);

          // Current file line (spinner + filename + percentage)
          fileBar = multiBar.create(1, 0, {}, { format: '  Current  {spinner} {filename} {pct}' });
          // Overall progress bar
          progressBar = multiBar.create(totalFiles, 0, {}, { format: '  Overall  [{bar}] {percentage}% | {value}/{total} files' });
          hasCreatedProgressBar = true;

          // Start spinner animation timer
          spinnerTimer = setInterval(updateFileBar, 80);
        }

        // Detect new batch
        if (progress.current < maxProgress && progress.total !== lastBatchTotal) {
          batchBaseOffset += lastBatchTotal;
          lastBatchTotal = progress.total;
          totalFiles = batchBaseOffset + progress.total;
          if (progressBar) {
            progressBar.setTotal(totalFiles);
          }
        }

        // Update current file
        if (progress.currentFile) {
          const filename = progress.currentFile.split('/').pop() || progress.currentFile;
          currentFilename = filename.length > 40 ? filename.substring(0, 37) + '...' : filename;
        }

        // Update overall progress
        const currentProgress = batchBaseOffset + progress.current;
        if (currentProgress > maxProgress) {
          maxProgress = currentProgress;
          if (progressBar) {
            progressBar.update(maxProgress);
          }
        }
        break;

      case 'embedding':
      case 'storing':
        // Keep progress bars at current state
        break;
    }
  };

  const cleanup = (success: boolean, _message?: string) => {
    // Stop spinner timer
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    // Complete and stop progress bars
    if (progressBar) {
      progressBar.update(totalFiles);
    }
    if (fileBar) {
      fileBar.update(0, { spinner: '\u2714', filename: 'done', pct: '' });
    }
    if (multiBar) {
      multiBar.stop();
      multiBar = null;
    }
    if (phaseSpinner) {
      phaseSpinner.stop();
      phaseSpinner = null;
    }
  };

  return { callback, cleanup };
}

/**
 * Run indexing with progress display
 * Simplified UX: scanning → indexing progress bar → complete
 */
async function runIndexingWithProgress(projectPath: string): Promise<IndexingResult> {
  const { IndexManager } = await import('../engines/indexManager.js');
  const { DocsIndexManager } = await import('../engines/docsIndexManager.js');
  const { getIndexPath } = await import('../utils/paths.js');
  const { loadConfig } = await import('../storage/config.js');
  const { getCodeEmbeddingEngine } = await import('../engines/embedding.js');

  const indexPath = getIndexPath(projectPath);
  const config = await loadConfig(indexPath);
  const startTime = Date.now();

  try {
    // === Code Indexing ===
    console.log('');
    print('Code Index:', 'cyan');

    const codeProgress = createProgressCallbackFactory('code files');
    const indexManager = new IndexManager(projectPath);
    const codeResult = await indexManager.createIndex(codeProgress.callback);
    codeProgress.cleanup(true);

    print(`  \u2714 Code index complete: ${codeResult.filesIndexed.toLocaleString()} files, ${codeResult.chunksCreated.toLocaleString()} chunks`, 'green');

    // Get compute device info
    let computeDevice: string | undefined;
    try {
      const engine = getCodeEmbeddingEngine();
      const deviceInfo = engine.getDeviceInfo();
      if (deviceInfo) {
        computeDevice = deviceInfo.gpuName || (deviceInfo.device === 'cpu' ? 'CPU' : deviceInfo.device);
      }
    } catch {
      // Ignore device detection errors
    }

    // === Docs Indexing ===
    let docsFilesIndexed = 0;
    let docsChunksCreated = 0;

    if (config.indexDocs) {
      console.log('');
      print('Docs Index:', 'cyan');

      const docsProgress = createProgressCallbackFactory('doc files');
      const docsIndexManager = new DocsIndexManager(projectPath, indexPath);
      await docsIndexManager.initialize();
      const docsResult = await docsIndexManager.createDocsIndex(docsProgress.callback);
      await docsIndexManager.close();

      docsFilesIndexed = docsResult.filesIndexed;
      docsChunksCreated = docsResult.chunksCreated;

      docsProgress.cleanup(true);
      print(`  \u2714 Docs index complete: ${docsFilesIndexed.toLocaleString()} files, ${docsChunksCreated.toLocaleString()} chunks`, 'green');
    }

    // === Summary ===
    const totalDurationMs = Date.now() - startTime;

    return {
      success: true,
      codeFiles: codeResult.filesIndexed,
      codeChunks: codeResult.chunksCreated,
      docsFiles: docsFilesIndexed,
      docsChunks: docsChunksCreated,
      duration: formatDuration(totalDurationMs),
      computeDevice,
    };
  } catch (error) {
    return {
      success: false,
      codeFiles: 0,
      codeChunks: 0,
      docsFiles: 0,
      docsChunks: 0,
      duration: '0s',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Prompt user to choose compute device for indexing
 * Only shows GPU option on Windows (DirectML)
 */
async function promptDeviceChoice(): Promise<void> {
  const isWindows = os.platform() === 'win32';

  if (!isWindows) {
    // Non-Windows: CPU only, no choice needed
    setPreferredDevice('cpu');
    return;
  }

  console.log('');
  print('Compute Device:', 'cyan');
  console.log('');
  console.log('  [1] GPU (DirectML) - Faster, but may cause system stuttering');
  console.log('  [2] CPU - Slower, but system stays responsive');
  console.log('');

  const answer = await prompt('Select compute device [1]: ');

  if (answer === '2') {
    setPreferredDevice('cpu');
    print('Using CPU for embedding generation.', 'dim');
  } else {
    setPreferredDevice('dml');
    print('Using GPU (DirectML) for embedding generation.', 'dim');
  }

  // Reset any existing engine instances to apply new device preference
  resetEmbeddingEngine();
}

/**
 * Detect project root from current directory
 */
async function detectProject(): Promise<string> {
  try {
    const { detectProjectRoot } = await import('../engines/projectRoot.js');
    const result = await detectProjectRoot(process.cwd());
    return result.projectPath;
  } catch {
    // If no project markers found, use current directory
    return process.cwd();
  }
}

/**
 * Run the indexing flow after configuration
 * Returns true if indexing was performed or skipped, false if there was an error
 */
async function runIndexingFlow(): Promise<boolean> {
  console.log('');

  // Ask if user wants to index
  const indexAnswer = await prompt('Would you like to index this project now? [Y/n]: ');

  if (indexAnswer.toLowerCase() === 'n') {
    print('Skipping indexing.', 'dim');
    return true;
  }

  console.log('');
  const spinner = ora('Detecting project root...').start();

  try {
    // Step 1: Detect project
    const projectPath = await detectProject();
    spinner.succeed(`Project detected: ${projectPath}`);

    // Step 2: Check for existing index
    const existingIndex = await checkExistingIndex(projectPath);

    if (existingIndex?.exists) {
      console.log('');
      print('Existing index found:', 'yellow');
      console.log(`  Files:    ${existingIndex.totalFiles?.toLocaleString() || 'unknown'}`);
      console.log(`  Chunks:   ${existingIndex.totalChunks?.toLocaleString() || 'unknown'}`);
      console.log(`  Size:     ${existingIndex.storageSize || 'unknown'}`);
      if (existingIndex.lastUpdated) {
        console.log(`  Updated:  ${formatRelativeTime(existingIndex.lastUpdated)}`);
      }
      console.log('');

      const deleteAnswer = await prompt('Delete and recreate index? [y/N]: ');

      if (deleteAnswer.toLowerCase() !== 'y') {
        print('Keeping existing index.', 'dim');
        return true;
      }

      // Delete existing index
      const deleteSpinner = ora('Deleting existing index...').start();
      const deleted = await deleteExistingIndex(projectPath);

      if (!deleted) {
        deleteSpinner.fail('Failed to delete existing index');
        return false;
      }

      deleteSpinner.succeed('Existing index deleted');
    }

    // Step 3: Choose compute device
    await promptDeviceChoice();

    // Step 4: Run indexing
    console.log('');
    print(`Creating index for: ${projectPath}`, 'cyan');
    console.log('');

    const result = await runIndexingWithProgress(projectPath);

    if (!result.success) {
      print(`Indexing failed: ${result.error}`, 'red');
      return false;
    }

    // Step 5: Show results summary
    console.log('');
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    print('Index created successfully!', 'green');
    console.log('');
    console.log(`  Code:     ${result.codeFiles.toLocaleString()} files, ${result.codeChunks.toLocaleString()} chunks`);
    if (result.docsFiles > 0) {
      console.log(`  Docs:     ${result.docsFiles.toLocaleString()} files, ${result.docsChunks.toLocaleString()} chunks`);
    }
    console.log(`  Duration: ${result.duration}`);
    if (result.computeDevice) {
      console.log(`  Device:   ${result.computeDevice}`);
    }

    return true;
  } catch (error) {
    spinner.fail('Failed to detect project');
    print(`Error: ${error instanceof Error ? error.message : String(error)}`, 'red');
    return false;
  }
}

// ============================================================================
// Main Setup Flow
// ============================================================================

/**
 * Options for setup command
 */
export interface SetupOptions {
  /** Show verbose logging output (default: false) */
  verbose?: boolean;
}

/**
 * Main setup flow
 * @param options - Setup options including verbose flag
 */
export async function runSetup(options: SetupOptions = {}): Promise<void> {
  // Initialize global logger and set silent mode unless verbose
  initGlobalLogger();
  const logger = getLogger();
  if (!options.verbose) {
    logger.setSilentConsole(true);
  }

  console.log('');
  print('Search MCP Setup', 'cyan');
  print('================', 'cyan');
  console.log('');

  // Step 0: Verify project directory
  const projectPath = await detectProject();
  print('Detected project directory:', 'cyan');
  console.log(`  ${projectPath}`);
  console.log('');

  const confirmProject = await prompt('Is this the correct project folder? [Y/n]: ');
  if (confirmProject.toLowerCase() === 'n') {
    console.log('');
    print('Please navigate to your project root directory and run setup again.', 'yellow');
    console.log('');
    console.log('  Example:');
    console.log(`    cd /path/to/your/project`);
    console.log(`    npx ${PACKAGE_NAME} setup`);
    console.log('');
    return;
  }

  console.log('');

  // Detect available clients
  const clients = detectClients();
  const availableClients = clients.filter(c => c.exists);
  const configuredClients = clients.filter(c => c.configured);

  // Check for Claude Code CLI
  const hasClaudeCLI = isClaudeCodeCLIAvailable();

  // Check if Claude CLI is already configured
  const isClaudeCLIConfigured = hasClaudeCLI && configuredClients.some(c => c.name.includes('Claude Code'));

  if (availableClients.length === 0) {
    print('No MCP clients detected.', 'yellow');
    console.log('');
    print('Supported clients:', 'cyan');
    console.log('  - Claude Desktop');
    console.log('  - Claude Code');
    console.log('  - Cursor');
    console.log('  - Windsurf');
    console.log('');
    print('Manual setup:', 'cyan');
    console.log(`  Create .mcp.json in your project or home directory with:`);
    console.log('');
    console.log('  {');
    console.log('    "mcpServers": {');
    console.log('      "search": {');
    console.log('        "command": "npx",');
    console.log(`        "args": ["-y", "${PACKAGE_NAME}"]`);
    console.log('      }');
    console.log('    }');
    console.log('  }');
    console.log('');
    return;
  }

  // Show options - include ALL available clients, marking configured ones
  print('Available MCP clients to configure:', 'cyan');
  console.log('');

  const menuOptions: { key: string; label: string; configured: boolean; action: () => { success: boolean; message: string } | Promise<{ success: boolean; message: string }> }[] = [];

  // Add Claude CLI option if available
  if (hasClaudeCLI) {
    menuOptions.push({
      key: String(menuOptions.length + 1),
      label: 'Claude Code (via CLI) - Recommended',
      configured: isClaudeCLIConfigured,
      action: () => configureWithClaudeCLI(),
    });
  }

  // Add ALL available clients (not just unconfigured)
  for (const client of availableClients) {
    menuOptions.push({
      key: String(menuOptions.length + 1),
      label: client.name,
      configured: client.configured,
      action: () => configureClient(client),
    });
  }

  // Add "all" option if multiple choices
  if (menuOptions.length > 1) {
    menuOptions.push({
      key: 'a',
      label: 'Configure all',
      configured: false,
      action: async () => {
        const results: string[] = [];
        for (const opt of menuOptions.filter(o => o.key !== 'a')) {
          const result = await opt.action();
          results.push(result.message);
        }
        return { success: true, message: results.join('\n') };
      },
    });
  }

  // Show options with configured status (exclude "Configure all" - we'll show it separately)
  for (const opt of menuOptions.filter(o => o.key !== 'a')) {
    if (opt.configured) {
      console.log(`  [${opt.key}] ${opt.label} ${chalk.green('✓ configured')}`);
    } else {
      console.log(`  [${opt.key}] ${opt.label}`);
    }
  }

  // Show Configure all and Quit
  if (menuOptions.length > 1) {
    console.log(`  [a] Configure all`);
  }
  console.log(`  [q] Quit`);

  // Add skip option if any clients are already configured
  const hasConfigured = menuOptions.some(o => o.configured);
  if (hasConfigured) {
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  [s] Skip to indexing - No config needed`);
  }
  console.log('');

  // Get user choice
  const answer = await prompt('Select an option: ');

  // Handle skip to indexing
  if (hasConfigured && answer.toLowerCase() === 's') {
    await runIndexingFlow();
    console.log('');
    print('Done!', 'green');
    console.log('');
    return;
  }

  if (answer.toLowerCase() === 'q' || answer === '') {
    print('Setup cancelled.', 'dim');
    return;
  }

  const selected = menuOptions.find(o => o.key === answer.toLowerCase());
  if (!selected) {
    print('Invalid option.', 'red');
    return;
  }

  // If already configured, notify user we're reconfiguring
  if (selected.configured) {
    print(`Reconfiguring ${selected.label}...`, 'yellow');
  }

  console.log('');
  const result = await selected.action();

  if (result.success) {
    if (selected.configured) {
      print(`✓ Reconfigured successfully`, 'green');
    }
    print(result.message, 'green');

    // Offer indexing after successful configuration
    await runIndexingFlow();

    console.log('');
    print('Setup complete! Next steps:', 'cyan');
    console.log('  1. Restart your AI assistant');
    console.log('  2. Type /mcp to verify "search" is connected');
    console.log('  3. Ask: "Search for authentication code"');
  } else {
    print(result.message, 'red');
  }
  console.log('');

  // Restore console logging
  logger.setSilentConsole(false);
}

/**
 * Print version info
 */
export function printVersion(): void {
  try {
    const packageJsonPath = new URL('../../package.json', import.meta.url);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    console.log(`search-mcp v${packageJson.version}`);
  } catch {
    console.log('search-mcp (version unknown)');
  }
}

/**
 * Show log file locations
 */
export function showLogs(): void {
  const home = os.homedir();
  const searchDir = path.join(home, '.mcp', 'search');
  const indexesDir = path.join(searchDir, 'indexes');
  const globalLogPath = path.join(searchDir, 'logs', 'server.log');

  console.log('');
  print('Search MCP Log Files', 'cyan');
  print('====================', 'cyan');
  console.log('');

  // Show global server log
  print('Global Server Log:', 'yellow');
  if (fs.existsSync(globalLogPath)) {
    const stats = fs.statSync(globalLogPath);
    const sizeKB = Math.round(stats.size / 1024);
    print(`  ${globalLogPath} (${sizeKB} KB)`, 'green');
    console.log('  Contains: server start/stop, errors, connection issues');
  } else {
    print('  (no server log yet - run the MCP server first)', 'dim');
  }
  console.log('');

  // Check if indexes directory exists
  if (!fs.existsSync(indexesDir)) {
    print('No project indexes found yet.', 'dim');
    console.log('');
    return;
  }

  // List all index directories
  try {
    const entries = fs.readdirSync(indexesDir, { withFileTypes: true });
    const indexDirs = entries.filter(e => e.isDirectory());

    if (indexDirs.length === 0) {
      print('No indexes found. Create an index first to generate logs.', 'yellow');
      console.log('');
      return;
    }

    // Gather index info with metadata and log status
    interface IndexInfo {
      name: string;
      projectPath: string;
      logPath: string;
      hasLog: boolean;
      logSize: number;
      mtime: number;
    }

    const indexInfos: IndexInfo[] = [];

    for (const dir of indexDirs) {
      const indexPath = path.join(indexesDir, dir.name);
      const metadataPath = path.join(indexPath, 'metadata.json');
      const logPath = path.join(indexPath, 'logs', 'search-mcp.log');

      let projectPath = 'Unknown project';
      let mtime = 0;
      try {
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          projectPath = metadata.projectPath || projectPath;
          const stats = fs.statSync(metadataPath);
          mtime = stats.mtimeMs;
        }
      } catch {
        // Ignore metadata read errors
      }

      const hasLog = fs.existsSync(logPath);
      let logSize = 0;
      if (hasLog) {
        try {
          const stats = fs.statSync(logPath);
          logSize = stats.size;
        } catch {
          // Ignore stat errors
        }
      }

      indexInfos.push({
        name: dir.name,
        projectPath,
        logPath,
        hasLog,
        logSize,
        mtime,
      });
    }

    // Sort: prioritize indexes with logs, then by modification time (newest first)
    indexInfos.sort((a, b) => {
      if (a.hasLog && !b.hasLog) return -1;
      if (!a.hasLog && b.hasLog) return 1;
      return b.mtime - a.mtime;
    });

    // Limit to 10 indexes to keep output manageable
    const MAX_DISPLAYED = 10;
    const displayedIndexes = indexInfos.slice(0, MAX_DISPLAYED);
    const hiddenCount = indexInfos.length - displayedIndexes.length;

    print(`Project Indexes:`, 'yellow');
    if (indexInfos.length > MAX_DISPLAYED) {
      console.log(`  Showing ${MAX_DISPLAYED} most recent (${hiddenCount} older indexes hidden)`);
    }
    console.log('');

    for (const info of displayedIndexes) {
      console.log(`  Project: ${info.projectPath}`);
      console.log(`  Index:   ${info.name}`);
      if (info.hasLog) {
        const sizeKB = Math.round(info.logSize / 1024);
        print(`  Log:     ${info.logPath} (${sizeKB} KB)`, 'green');
      } else {
        print(`  Log:     (no log file yet)`, 'dim');
      }
      console.log('');
    }

    print('To share logs for debugging:', 'cyan');
    console.log('  1. Find the log file for your project above');
    console.log('  2. Copy the contents and share with the developer');
    console.log('');
  } catch (error) {
    print(`Error reading indexes: ${error}`, 'red');
  }
}

/**
 * Print help
 */
export function printHelp(): void {
  console.log(`
Search MCP - Semantic code search for AI assistants

Usage:
  npx --yes ${PACKAGE_NAME}@latest [options]

Options:
  --setup     Configure MCP clients to use search-mcp
  --logs      Show log file locations for debugging
  --verbose   Show detailed logging output (for debugging)
  --version   Show version number
  --help      Show this help message

When run without options, starts the MCP server (for use by AI assistants).

Quick Start:
  1. Run: npx --yes ${PACKAGE_NAME}@latest --setup
  2. Restart your AI assistant
  3. Type /mcp to verify "search" is connected
  4. Say: "Use search-mcp to create an index for this project"

Manual Configuration:
  Claude Code:
    claude mcp add search -- npx -y ${PACKAGE_NAME}

  Other clients: Add to your MCP config file:
  {
    "mcpServers": {
      "search": {
        "command": "npx",
        "args": ["-y", "${PACKAGE_NAME}"]
      }
    }
  }

Learn more: https://github.com/blakazulu/search-mcp
`);
}
