#!/usr/bin/env node
/**
 * Search MCP - Entry Point
 *
 * A local-first Model Context Protocol (MCP) server that provides
 * semantic search capabilities for codebases.
 *
 * This is the main entry point that either:
 * - Starts the MCP server (default, for use by AI assistants)
 * - Runs setup wizard (--setup)
 * - Shows help/version (--help, --version)
 *
 * Usage:
 *   npx @liraz-sbz/search-mcp           # Start MCP server
 *   npx @liraz-sbz/search-mcp --setup   # Configure MCP clients
 *   npx @liraz-sbz/search-mcp --help    # Show help
 *   npx @liraz-sbz/search-mcp --version # Show version
 */

import { startServer } from './server.js';
import { runSetup, printHelp, printVersion, showLogs } from './cli/setup.js';

// Parse CLI arguments
const args = process.argv.slice(2);

async function main() {
  // Handle CLI flags
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    printVersion();
    process.exit(0);
  }

  if (args.includes('--setup') || args.includes('setup')) {
    await runSetup();
    process.exit(0);
  }

  if (args.includes('--logs') || args.includes('logs')) {
    showLogs();
    process.exit(0);
  }

  // Default: Start the MCP server
  await startServer();
}

main().catch((error) => {
  console.error('Failed to start search-mcp:', error);
  process.exit(1);
});
