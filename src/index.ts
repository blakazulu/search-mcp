#!/usr/bin/env node
/**
 * Search MCP - Entry Point
 *
 * A local-first Model Context Protocol (MCP) server that provides
 * semantic search capabilities for codebases.
 *
 * This is the main entry point that starts the MCP server with
 * stdio transport for communication with MCP clients like
 * Claude Desktop, Claude Code, Cursor, Windsurf, or Antigravity.
 *
 * Usage:
 *   npx @blakazulu/search-mcp
 *
 * Or after global installation:
 *   search-mcp
 */

import { startServer } from './server.js';

// Start the MCP server
startServer().catch((error) => {
  console.error('Failed to start search-mcp server:', error);
  process.exit(1);
});
