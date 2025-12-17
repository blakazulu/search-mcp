#!/usr/bin/env node
/**
 * Search MCP - Entry Point
 *
 * A local-first Model Context Protocol (MCP) server that provides
 * semantic search capabilities for codebases.
 *
 * This is the main entry point that either:
 * - Starts the MCP server (default, for use by AI assistants)
 * - Runs CLI commands (index, search, status, reindex)
 * - Runs setup wizard (setup)
 * - Shows help/version (--help, --version)
 *
 * Usage:
 *   npx @liraz-sbz/search-mcp                    # Start MCP server
 *   npx @liraz-sbz/search-mcp index              # Create search index
 *   npx @liraz-sbz/search-mcp search "query"     # Search code
 *   npx @liraz-sbz/search-mcp status             # Show index status
 *   npx @liraz-sbz/search-mcp reindex            # Rebuild index
 *   npx @liraz-sbz/search-mcp setup              # Configure MCP clients
 *   npx @liraz-sbz/search-mcp --help             # Show help
 *   npx @liraz-sbz/search-mcp --version          # Show version
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Early crash logging - write to file before any other imports that might fail
function logCrash(error: unknown): void {
  try {
    const logDir = path.join(os.homedir(), '.mcp', 'search', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'server.log');
    const timestamp = new Date().toISOString();
    const errorMsg = error instanceof Error
      ? `${error.message}\n${error.stack}`
      : String(error);
    const logEntry = `[${timestamp}] [ERROR] [startup] Server crashed: ${errorMsg}\n`;
    fs.appendFileSync(logFile, logEntry);
  } catch {
    // If we can't write to log, at least write to stderr
  }
  console.error('Failed to start search-mcp:', error);
}

// Parse CLI arguments early (before dynamic imports)
const args = process.argv.slice(2);

// CLI commands that should be routed to the CLI handler
const CLI_COMMANDS = ['index', 'search', 'status', 'reindex', 'setup', 'logs'];

// Check if any CLI command is present
const hasCliCommand = args.length > 0 && (
  CLI_COMMANDS.includes(args[0]) ||
  args.includes('--help') ||
  args.includes('-h') ||
  args.includes('--version') ||
  args.includes('-v')
);

// Global error handlers to catch crashes during runtime
process.on('uncaughtException', (error) => {
  logCrash(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logCrash(reason instanceof Error ? reason : new Error(String(reason)));
  process.exit(1);
});

async function main() {
  // If CLI command detected, route to CLI handler
  if (hasCliCommand) {
    const { runCLI } = await import('./cli/commands.js');
    await runCLI(process.argv);
    return;
  }

  // Legacy flag support for backward compatibility
  if (args.includes('--setup')) {
    const { runSetup } = await import('./cli/setup.js');
    await runSetup();
    process.exit(0);
  }

  if (args.includes('--logs')) {
    const { showLogs } = await import('./cli/setup.js');
    showLogs();
    process.exit(0);
  }

  // Default: Start the MCP server (when no CLI arguments)
  const { startServer } = await import('./server.js');
  await startServer();
}

main().catch((error) => {
  logCrash(error);
  process.exit(1);
});
