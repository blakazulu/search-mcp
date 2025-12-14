/**
 * CLI Setup Command
 *
 * Detects installed MCP clients and helps configure them to use search-mcp.
 * Supports Claude Desktop, Claude Code, Cursor, and Windsurf.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import * as readline from 'node:readline';

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
 * Configure using Claude Code CLI
 */
function configureWithClaudeCLI(): { success: boolean; message: string } {
  try {
    execSync(`claude mcp add search -- npx -y ${PACKAGE_NAME}`, { stdio: 'inherit' });
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

/**
 * Main setup flow
 */
export async function runSetup(): Promise<void> {
  console.log('');
  print('Search MCP Setup', 'cyan');
  print('================', 'cyan');
  console.log('');

  // Detect available clients
  const clients = detectClients();
  const availableClients = clients.filter(c => c.exists);
  const configuredClients = clients.filter(c => c.configured);

  // Show status
  if (configuredClients.length > 0) {
    print('Already configured:', 'green');
    for (const client of configuredClients) {
      print(`  ✓ ${client.name}`, 'green');
    }
    console.log('');
  }

  // Check for Claude Code CLI
  const hasClaudeCLI = isClaudeCodeCLIAvailable();

  // Filter to unconfigured clients
  const unconfiguredClients = availableClients.filter(c => !c.configured);

  if (unconfiguredClients.length === 0 && configuredClients.length > 0) {
    print('All detected MCP clients are already configured!', 'green');
    console.log('');
    print('Next steps:', 'cyan');
    console.log('  1. Restart your AI assistant');
    console.log('  2. Type /mcp to verify "search" is connected');
    console.log('  3. Say: "Use search-mcp to create an index for this project"');
    console.log('');
    return;
  }

  if (unconfiguredClients.length === 0 && configuredClients.length === 0) {
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

  // Show options
  print('Available MCP clients to configure:', 'cyan');
  console.log('');

  const options: { key: string; label: string; action: () => { success: boolean; message: string } | Promise<{ success: boolean; message: string }> }[] = [];

  // Add Claude CLI option if available
  if (hasClaudeCLI) {
    options.push({
      key: String(options.length + 1),
      label: 'Claude Code (via CLI) - Recommended',
      action: configureWithClaudeCLI,
    });
  }

  // Add unconfigured clients
  for (const client of unconfiguredClients) {
    options.push({
      key: String(options.length + 1),
      label: client.name,
      action: () => configureClient(client),
    });
  }

  // Add "all" option if multiple choices
  if (options.length > 1) {
    options.push({
      key: 'a',
      label: 'Configure all',
      action: async () => {
        const results: string[] = [];
        for (const opt of options.slice(0, -1)) {
          const result = await opt.action();
          results.push(result.message);
        }
        return { success: true, message: results.join('\n') };
      },
    });
  }

  // Show options
  for (const opt of options) {
    console.log(`  [${opt.key}] ${opt.label}`);
  }
  console.log(`  [q] Quit`);
  console.log('');

  // Get user choice
  const answer = await prompt('Select an option: ');

  if (answer.toLowerCase() === 'q' || answer === '') {
    print('Setup cancelled.', 'dim');
    return;
  }

  const selected = options.find(o => o.key === answer.toLowerCase());
  if (!selected) {
    print('Invalid option.', 'red');
    return;
  }

  console.log('');
  const result = await selected.action();

  if (result.success) {
    print(result.message, 'green');
    console.log('');
    print('Next steps:', 'cyan');
    console.log('  1. Restart your AI assistant');
    console.log('  2. Type /mcp to verify "search" is connected');
    console.log('  3. Say: "Use search-mcp to create an index for this project"');
  } else {
    print(result.message, 'red');
  }
  console.log('');
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
  const indexesDir = path.join(home, '.mcp', 'search', 'indexes');

  console.log('');
  print('Search MCP Log Files', 'cyan');
  print('====================', 'cyan');
  console.log('');

  // Check if indexes directory exists
  if (!fs.existsSync(indexesDir)) {
    print('No indexes found. Create an index first to generate logs.', 'yellow');
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

    print(`Found ${indexDirs.length} index(es):`, 'green');
    console.log('');

    for (const dir of indexDirs) {
      const indexPath = path.join(indexesDir, dir.name);
      const metadataPath = path.join(indexPath, 'metadata.json');
      const logPath = path.join(indexPath, 'logs', 'search-mcp.log');

      // Try to read project path from metadata
      let projectPath = 'Unknown project';
      try {
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          projectPath = metadata.projectPath || projectPath;
        }
      } catch {
        // Ignore metadata read errors
      }

      const logExists = fs.existsSync(logPath);

      console.log(`  Project: ${projectPath}`);
      console.log(`  Index:   ${dir.name}`);
      if (logExists) {
        const stats = fs.statSync(logPath);
        const sizeKB = Math.round(stats.size / 1024);
        print(`  Log:     ${logPath} (${sizeKB} KB)`, 'green');
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
  --version   Show version number
  --help      Show this help message

When run without options, starts the MCP server (for use by AI assistants).

Quick Start:
  1. Run: npx --yes ${PACKAGE_NAME}@latest --setup
  2. Restart your AI assistant
  3. Type /mcp to verify "search" is connected
  4. Say: "Use search-mcp to create an index for this project"

Manual Configuration:
  Claude Code:  claude mcp add search -- npx -y ${PACKAGE_NAME}

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
