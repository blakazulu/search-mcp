#!/usr/bin/env node
/**
 * Post-install script
 *
 * Prints setup instructions after npm install.
 * This helps users understand how to configure their MCP clients.
 */

const PACKAGE_NAME = '@liraz-sbz/search-mcp';

// ANSI colors
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function print(text, color) {
  if (color && colors[color]) {
    console.log(`${colors[color]}${text}${colors.reset}`);
  } else {
    console.log(text);
  }
}

// Don't show message if running in CI or as a dependency
const isCI = process.env.CI || process.env.CONTINUOUS_INTEGRATION;
const isNpx = process.env.npm_config_global === 'false' && process.env.npm_lifecycle_event === 'postinstall';

// Only show for direct installs (global or local dev)
if (!isCI) {
  console.log('');
  print('========================================', 'cyan');
  print('  Search MCP installed successfully!', 'green');
  print('========================================', 'cyan');
  console.log('');
  print('Quick Setup:', 'bold');
  console.log('');
  print('  Option 1: Run the setup wizard', 'yellow');
  console.log(`    npx ${PACKAGE_NAME} --setup`);
  console.log('');
  print('  Option 2: Claude Code CLI', 'yellow');
  console.log(`    claude mcp add search -- npx ${PACKAGE_NAME}`);
  console.log('');
  print('  Option 3: Manual config', 'yellow');
  console.log('    Add to .mcp.json:');
  console.log('    {');
  console.log('      "mcpServers": {');
  console.log('        "search": {');
  console.log('          "command": "npx",');
  console.log(`          "args": ["-y", "${PACKAGE_NAME}"]`);
  console.log('        }');
  console.log('      }');
  console.log('    }');
  console.log('');
  print('After configuring:', 'dim');
  console.log('  1. Restart your AI assistant');
  console.log('  2. Ask: "Create a search index for this project"');
  console.log('');
  print('Docs: https://github.com/blakazulu/search-mcp', 'dim');
  console.log('');
}
