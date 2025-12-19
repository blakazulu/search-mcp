/**
 * CLI Commands Module
 *
 * Zero-config CLI interface for search-mcp. Provides direct command-line access
 * to indexing and searching without requiring MCP client setup.
 *
 * Commands:
 * - index: Create or update index for current project
 * - search: Search code with natural language queries
 * - status: Show index statistics and configuration
 * - reindex: Rebuild entire index from scratch
 *
 * Inspired by mcp-vector-search's excellent CLI UX.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import cliProgress from 'cli-progress';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

// Project imports
import { IndexManager, IndexResult, IndexProgress } from '../engines/indexManager.js';
import { DocsIndexManager, DocsIndexResult } from '../engines/docsIndexManager.js';
import { searchCode, SearchCodeInput, SearchCodeOutput } from '../tools/searchCode.js';
import { searchDocs, SearchDocsInput, SearchDocsOutput } from '../tools/searchDocs.js';
import { collectStatus, GetIndexStatusOutput, formatStorageSize } from '../tools/getIndexStatus.js';
import { detectProjectRoot } from '../engines/projectRoot.js';
import { getIndexPath } from '../utils/paths.js';
import { loadConfig } from '../storage/config.js';
import { loadMetadata } from '../storage/metadata.js';
import { formatDuration } from '../tools/createIndex.js';
import { MCPError, isMCPError } from '../errors/index.js';
import { safeDeleteIndex } from '../tools/deleteIndex.js';
import type { CompactSearchOutput } from '../utils/searchResultProcessing.js';
import { getLogger, initGlobalLogger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

interface CLIOptions {
  json?: boolean;
  topK?: number;
  mode?: 'hybrid' | 'vector' | 'fts';
  alpha?: number;
  docs?: boolean;
  verbose?: boolean;
  force?: boolean;
}

interface SearchResultItem {
  path: string;
  text: string;
  score: number;
  startLine: number;
  endLine: number;
}

// ============================================================================
// Output Formatters
// ============================================================================

/**
 * Print a styled header
 */
function printHeader(text: string): void {
  console.log('');
  console.log(chalk.cyan.bold(text));
  console.log(chalk.cyan('='.repeat(text.length)));
  console.log('');
}

/**
 * Print a success message
 */
function printSuccess(text: string): void {
  console.log(chalk.green('  ' + text));
}

/**
 * Print an error message
 */
function printError(text: string): void {
  console.log(chalk.red('  Error: ' + text));
}

/**
 * Print a warning message
 */
function printWarning(text: string): void {
  console.log(chalk.yellow('  Warning: ' + text));
}

/**
 * Print an info message
 */
function printInfo(label: string, value: string | number): void {
  console.log(chalk.gray(`  ${label}: `) + chalk.white(String(value)));
}

/**
 * Format a search result for display
 */
function formatSearchResult(result: SearchResultItem, index: number): string {
  const lines: string[] = [];

  // Header with file path and score
  lines.push(chalk.cyan.bold(`[${index + 1}] ${result.path}`) + chalk.gray(` (lines ${result.startLine}-${result.endLine})`));
  lines.push(chalk.yellow(`    Score: ${(result.score * 100).toFixed(1)}%`));

  // Code snippet (truncate if too long)
  const snippet = result.text.trim();
  const maxLines = 8;
  const snippetLines = snippet.split('\n');

  if (snippetLines.length > maxLines) {
    const truncated = snippetLines.slice(0, maxLines).join('\n');
    lines.push(chalk.gray('    ---'));
    lines.push(truncated.split('\n').map(l => chalk.dim('    ' + l)).join('\n'));
    lines.push(chalk.gray(`    ... (${snippetLines.length - maxLines} more lines)`));
  } else {
    lines.push(chalk.gray('    ---'));
    lines.push(snippet.split('\n').map(l => chalk.dim('    ' + l)).join('\n'));
  }

  return lines.join('\n');
}

// ============================================================================
// Progress Bar Factory
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

// ============================================================================
// Command: index
// ============================================================================

/**
 * Create or update index for current project
 */
async function indexCommand(options: CLIOptions): Promise<void> {
  // Set silent mode unless verbose flag is passed
  if (!options.verbose) {
    const logger = getLogger();
    logger.setSilentConsole(true);
  }

  const cwd = process.cwd();

  if (options.json) {
    // JSON mode - minimal output
    try {
      const projectPath = await detectProject(cwd);
      const result = await runIndexing(projectPath, false);
      console.log(JSON.stringify({
        success: true,
        projectPath: result.projectPath,
        filesIndexed: result.filesIndexed,
        chunksCreated: result.chunksCreated,
        duration: result.duration,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ success: false, error: message }));
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  printHeader('Search MCP - Index Project');

  const spinner = ora('Detecting project root...').start();

  try {
    // Step 1: Detect project root
    const projectPath = await detectProject(cwd);
    spinner.succeed(`Project detected: ${chalk.cyan(projectPath)}`);

    // Step 2: Check if index exists
    const indexPath = getIndexPath(projectPath);
    const metadata = await loadMetadata(indexPath);

    if (metadata) {
      console.log(chalk.yellow('  Existing index found. Will rebuild.'));
    }

    // Step 3: Run indexing with progress
    const result = await runIndexing(projectPath, true);

    // Step 4: Print summary
    console.log('');
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    printSuccess('Index created successfully!');
    console.log('');
    printInfo('Code', `${result.codeFiles.toLocaleString()} files, ${result.codeChunks.toLocaleString()} chunks`);
    if (result.docsFiles > 0) {
      printInfo('Docs', `${result.docsFiles.toLocaleString()} files, ${result.docsChunks.toLocaleString()} chunks`);
    }
    printInfo('Duration', result.duration);
    if (result.computeDevice) {
      printInfo('Device', result.computeDevice);
    }

    console.log('');
    console.log(chalk.gray('  Next: Run ') + chalk.cyan('search-mcp search "your query"') + chalk.gray(' to search'));
    console.log('');

  } catch (error) {
    spinner.fail('Indexing failed');
    handleError(error);
  }
}

/**
 * Detect project root with fallback
 */
async function detectProject(cwd: string): Promise<string> {
  try {
    const result = await detectProjectRoot(cwd);
    return result.projectPath;
  } catch {
    // If no project markers found, use current directory
    return cwd;
  }
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
 * Create a progress callback factory for code or docs indexing
 * Shows: spinner with current file + overall progress bar
 */
function createCliProgressCallback(label: string) {
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
  // For batch processing: track cumulative progress
  let batchBaseOffset = 0;
  let lastBatchTotal = 0;
  let maxProgress = 0;
  // Spinner frames
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIndex = 0;

  const updateFileBar = () => {
    if (fileBar && currentFilename) {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      const pct = totalFiles > 0 ? Math.round((maxProgress / totalFiles) * 100) : 0;
      fileBar.update(0, { spinner: spinnerFrames[spinnerIndex], filename: currentFilename, pct: `${pct}%` });
    }
  };

  const callback = (progress: IndexProgress) => {
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

  const cleanup = () => {
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
 * Run indexing with optional progress display
 */
async function runIndexing(projectPath: string, showProgress: boolean): Promise<{
  projectPath: string;
  filesIndexed: number;
  chunksCreated: number;
  codeFiles: number;
  codeChunks: number;
  docsFiles: number;
  docsChunks: number;
  duration: string;
  computeDevice?: string;
}> {
  const indexPath = getIndexPath(projectPath);
  const config = await loadConfig(indexPath);

  let codeProgressHelper: ReturnType<typeof createCliProgressCallback> | null = null;
  let docsProgressHelper: ReturnType<typeof createCliProgressCallback> | null = null;

  // === Code Indexing ===
  if (showProgress) {
    console.log('');
    console.log(chalk.cyan('Code Index:'));
    codeProgressHelper = createCliProgressCallback('code files');
  }

  const indexManager = new IndexManager(projectPath);
  const codeResult = await indexManager.createIndex(codeProgressHelper?.callback);

  if (showProgress && codeProgressHelper) {
    codeProgressHelper.cleanup();
    console.log(chalk.green(`  \u2714 Code index complete: ${codeResult.filesIndexed.toLocaleString()} files, ${codeResult.chunksCreated.toLocaleString()} chunks`));
  }

  // Get compute device info
  let computeDevice: string | undefined;
  try {
    const { getCodeEmbeddingEngine } = await import('../engines/embedding.js');
    const engine = getCodeEmbeddingEngine();
    const deviceInfo = engine.getDeviceInfo();
    if (deviceInfo) {
      computeDevice = deviceInfo.gpuName || (deviceInfo.device === 'cpu' ? 'CPU' : deviceInfo.device);
    }
  } catch {
    // Ignore device detection errors
  }

  // === Docs Indexing ===
  let docsResult: DocsIndexResult | null = null;
  if (config.indexDocs) {
    if (showProgress) {
      console.log('');
      console.log(chalk.cyan('Docs Index:'));
      docsProgressHelper = createCliProgressCallback('doc files');
    }

    const docsIndexManager = new DocsIndexManager(projectPath, indexPath);
    await docsIndexManager.initialize();
    docsResult = await docsIndexManager.createDocsIndex(docsProgressHelper?.callback);
    await docsIndexManager.close();

    if (showProgress && docsProgressHelper) {
      docsProgressHelper.cleanup();
      console.log(chalk.green(`  \u2714 Docs index complete: ${docsResult.filesIndexed.toLocaleString()} files, ${docsResult.chunksCreated.toLocaleString()} chunks`));
    }
  }

  // Combine results
  const totalDurationMs = codeResult.durationMs + (docsResult?.durationMs || 0);
  const totalFilesIndexed = codeResult.filesIndexed + (docsResult?.filesIndexed || 0);
  const totalChunksCreated = codeResult.chunksCreated + (docsResult?.chunksCreated || 0);

  return {
    projectPath,
    filesIndexed: totalFilesIndexed,
    chunksCreated: totalChunksCreated,
    codeFiles: codeResult.filesIndexed,
    codeChunks: codeResult.chunksCreated,
    docsFiles: docsResult?.filesIndexed || 0,
    docsChunks: docsResult?.chunksCreated || 0,
    duration: formatDuration(totalDurationMs),
    computeDevice,
  };
}

// ============================================================================
// Command: search
// ============================================================================

/**
 * Search code with natural language query
 */
async function searchCommand(query: string, options: CLIOptions): Promise<void> {
  const cwd = process.cwd();

  if (options.json) {
    // JSON mode
    try {
      const results = await runSearch(cwd, query, options);
      console.log(JSON.stringify(results));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ success: false, error: message }));
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  const spinner = ora('Searching...').start();

  try {
    const projectPath = await detectProject(cwd);
    const results = await runSearch(projectPath, query, options);

    spinner.stop();

    // Check for results - handle both normal and compact formats
    let resultItems: SearchResultItem[] = [];
    let searchTimeMs = 0;
    let searchMode: string | undefined;

    if ('results' in results) {
      // Normal format
      resultItems = results.results;
      searchTimeMs = results.searchTimeMs;
      if ('searchMode' in results) {
        searchMode = results.searchMode;
      }
    } else if ('r' in results) {
      // Compact format - convert back to normal format for display
      resultItems = results.r.map(r => {
        const [pathPart, lineRange] = r.l.split(':');
        const [startLine, endLine] = lineRange.split('-').map(Number);
        return {
          path: pathPart,
          text: r.t,
          score: r.s,
          startLine,
          endLine,
        };
      });
      searchTimeMs = results.ms;
    }

    if (resultItems.length === 0) {
      console.log('');
      console.log(chalk.yellow('  No results found for: ') + chalk.white(query));
      console.log('');
      console.log(chalk.gray('  Tips:'));
      console.log(chalk.gray('    - Try different keywords'));
      console.log(chalk.gray('    - Use more specific terms'));
      console.log(chalk.gray('    - Check if the index is up to date with: search-mcp status'));
      console.log('');
      return;
    }

    // Print results
    printHeader(`Search Results for "${query}"`);

    console.log(chalk.gray(`  Found ${resultItems.length} results in ${searchTimeMs}ms`));
    if (searchMode) {
      console.log(chalk.gray(`  Search mode: ${searchMode}`));
    }
    console.log('');

    for (let i = 0; i < resultItems.length; i++) {
      const result = resultItems[i];
      console.log(formatSearchResult(result, i));
      console.log('');
    }

  } catch (error) {
    spinner.fail('Search failed');
    handleError(error);
  }
}

/**
 * Run search operation
 */
async function runSearch(projectPath: string, query: string, options: CLIOptions): Promise<SearchCodeOutput | SearchDocsOutput | CompactSearchOutput> {
  const indexPath = getIndexPath(projectPath);

  // Check if index exists
  const metadata = await loadMetadata(indexPath);
  if (!metadata) {
    throw new Error('No index found. Run "search-mcp index" first to create an index.');
  }

  const context = { projectPath };

  if (options.docs) {
    // Search docs
    const input: SearchDocsInput = {
      query,
      top_k: options.topK || 10,
      compact: false,
      mode: options.mode,
      alpha: options.alpha,
    };
    return await searchDocs(input, context);
  } else {
    // Search code
    const input: SearchCodeInput = {
      query,
      top_k: options.topK || 10,
      compact: false,
      mode: options.mode,
      alpha: options.alpha,
    };
    return await searchCode(input, context);
  }
}

// ============================================================================
// Command: status
// ============================================================================

/**
 * Show index status and statistics
 */
async function statusCommand(options: CLIOptions): Promise<void> {
  const cwd = process.cwd();

  if (options.json) {
    try {
      const projectPath = await detectProject(cwd);
      const status = await collectStatus({ projectPath });
      console.log(JSON.stringify(status));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ status: 'error', error: message }));
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  const spinner = ora('Checking index status...').start();

  try {
    const projectPath = await detectProject(cwd);
    const status = await collectStatus({ projectPath });

    spinner.stop();

    printHeader('Index Status');

    if (status.status === 'not_found') {
      console.log(chalk.yellow('  No index found for this project.'));
      console.log('');
      console.log(chalk.gray('  Run ') + chalk.cyan('search-mcp index') + chalk.gray(' to create an index.'));
      console.log('');
      return;
    }

    // Status indicator
    const statusColors: Record<string, typeof chalk> = {
      ready: chalk.green,
      indexing: chalk.yellow,
      failed: chalk.red,
      incomplete: chalk.yellow,
    };
    const statusColor = statusColors[status.status] || chalk.white;
    console.log(chalk.gray('  Status: ') + statusColor.bold(status.status.toUpperCase()));
    console.log('');

    // Project info
    printInfo('Project', status.projectPath || 'Unknown');
    printInfo('Index path', status.indexPath || 'Unknown');
    console.log('');

    // Statistics
    console.log(chalk.white.bold('  Statistics:'));
    printInfo('  Total files', status.totalFiles || 0);
    printInfo('  Total chunks', status.totalChunks || 0);
    printInfo('  Storage size', status.storageSize || '0B');
    printInfo('  Last updated', status.lastUpdated || 'Never');
    console.log('');

    // Hybrid search info
    if (status.hybridSearch) {
      console.log(chalk.white.bold('  Hybrid Search:'));
      printInfo('  Enabled', status.hybridSearch.enabled ? 'Yes' : 'No');
      if (status.hybridSearch.enabled) {
        printInfo('  FTS engine', status.hybridSearch.ftsEngine || 'Unknown');
        printInfo('  FTS chunks', status.hybridSearch.ftsChunkCount || 0);
        printInfo('  Default alpha', status.hybridSearch.defaultAlpha ?? 0.5);
      }
      console.log('');
    }

    // Compute device
    if (status.compute) {
      console.log(chalk.white.bold('  Compute:'));
      printInfo('  Device', status.compute.device);
      if (status.compute.gpuName) {
        printInfo('  GPU', status.compute.gpuName);
      }
      if (status.compute.fallbackReason) {
        printWarning(status.compute.fallbackReason);
      }
      console.log('');
    }

    // Warnings
    if (status.warning) {
      printWarning(status.warning);
      console.log('');
    }

    if (status.modelMismatchWarning) {
      printWarning(status.modelMismatchWarning);
      console.log('');
    }

  } catch (error) {
    spinner.fail('Failed to get status');
    handleError(error);
  }
}

// ============================================================================
// Command: reindex
// ============================================================================

/**
 * Rebuild entire index from scratch
 */
async function reindexCommand(options: CLIOptions): Promise<void> {
  // Set silent mode unless verbose flag is passed
  if (!options.verbose) {
    const logger = getLogger();
    logger.setSilentConsole(true);
  }

  const cwd = process.cwd();

  if (options.json) {
    try {
      const projectPath = await detectProject(cwd);
      const result = await runIndexing(projectPath, false);
      console.log(JSON.stringify({
        success: true,
        projectPath: result.projectPath,
        filesIndexed: result.filesIndexed,
        chunksCreated: result.chunksCreated,
        duration: result.duration,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ success: false, error: message }));
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  printHeader('Search MCP - Rebuild Index');

  const spinner = ora('Detecting project root...').start();

  try {
    const projectPath = await detectProject(cwd);
    spinner.succeed(`Project: ${chalk.cyan(projectPath)}`);

    // Check if index exists
    const indexPath = getIndexPath(projectPath);
    const metadata = await loadMetadata(indexPath);

    if (!metadata) {
      console.log(chalk.yellow('  No existing index found. Creating new index.'));
    } else {
      console.log(chalk.yellow('  Rebuilding index from scratch...'));
    }

    // Run indexing with progress
    const result = await runIndexing(projectPath, true);

    // Print summary
    console.log('');
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    printSuccess('Index rebuilt successfully!');
    console.log('');
    printInfo('Code', `${result.codeFiles.toLocaleString()} files, ${result.codeChunks.toLocaleString()} chunks`);
    if (result.docsFiles > 0) {
      printInfo('Docs', `${result.docsFiles.toLocaleString()} files, ${result.docsChunks.toLocaleString()} chunks`);
    }
    printInfo('Duration', result.duration);
    if (result.computeDevice) {
      printInfo('Device', result.computeDevice);
    }
    console.log('');

  } catch (error) {
    spinner.fail('Reindexing failed');
    handleError(error);
  }
}

// ============================================================================
// Command: delete
// ============================================================================

/**
 * Prompt user for confirmation
 */
function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Delete index for current project
 */
async function deleteCommand(options: CLIOptions): Promise<void> {
  const cwd = process.cwd();

  if (options.json) {
    try {
      const projectPath = await detectProject(cwd);
      const indexPath = getIndexPath(projectPath);
      const metadata = await loadMetadata(indexPath);

      if (!metadata) {
        console.log(JSON.stringify({ success: false, error: 'No index found' }));
        process.exit(1);
        return;
      }

      const result = await safeDeleteIndex(indexPath);
      console.log(JSON.stringify({
        success: result.success,
        projectPath,
        warnings: result.warnings,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ success: false, error: message }));
      process.exit(1);
    }
    return;
  }

  // Interactive mode
  printHeader('Search MCP - Delete Index');

  const spinner = ora('Detecting project root...').start();

  try {
    const projectPath = await detectProject(cwd);
    spinner.succeed(`Project: ${chalk.cyan(projectPath)}`);

    // Check if index exists
    const indexPath = getIndexPath(projectPath);
    const metadata = await loadMetadata(indexPath);

    if (!metadata) {
      console.log('');
      console.log(chalk.yellow('  No index found for this project.'));
      console.log('');
      return;
    }

    // Show index info
    console.log('');
    console.log(chalk.white('  Index found:'));
    console.log(chalk.gray(`    Path: ${indexPath}`));
    console.log('');

    // Confirm deletion (skip if force flag is set)
    if (!options.force) {
      console.log(chalk.red.bold('  Warning: This will permanently delete the index.'));
      console.log(chalk.red('  You will need to re-run "search-mcp index" to rebuild it.'));
      console.log('');

      const confirmed = await promptConfirm(chalk.yellow('  Delete index? [y/N]: '));

      if (!confirmed) {
        console.log('');
        console.log(chalk.gray('  Cancelled.'));
        console.log('');
        return;
      }
    }

    // Delete the index
    const deleteSpinner = ora('Deleting index...').start();
    const result = await safeDeleteIndex(indexPath);

    if (result.success) {
      deleteSpinner.succeed('Index deleted successfully');

      if (result.warnings.length > 0) {
        console.log('');
        console.log(chalk.yellow('  Warnings:'));
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`    - ${warning}`));
        }
      }

      console.log('');
      console.log(chalk.gray('  Run ') + chalk.cyan('search-mcp index') + chalk.gray(' to create a new index.'));
    } else {
      deleteSpinner.fail('Failed to delete index');
    }

    console.log('');

  } catch (error) {
    spinner.fail('Delete failed');
    handleError(error);
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handle and display errors
 */
function handleError(error: unknown): void {
  console.log('');

  if (isMCPError(error)) {
    printError(error.userMessage);
    if (process.env.DEBUG || process.env.SEARCH_MCP_DEBUG) {
      console.log(chalk.gray('  Developer: ' + error.developerMessage));
    }
  } else if (error instanceof Error) {
    printError(error.message);
    if (process.env.DEBUG || process.env.SEARCH_MCP_DEBUG) {
      console.log(chalk.gray('  Stack: ' + error.stack));
    }
  } else {
    printError(String(error));
  }

  console.log('');
  console.log(chalk.gray('  For more details, run with DEBUG=1 environment variable'));
  console.log('');

  process.exit(1);
}

// ============================================================================
// CLI Program
// ============================================================================

/**
 * Create and configure the CLI program
 */
export function createCLI(): Command {
  const program = new Command();

  program
    .name('search-mcp')
    .description('Semantic code search for AI assistants - local-first, zero-config')
    .version(getVersion(), '-v, --version', 'Show version number');

  // index command
  program
    .command('index')
    .description('Create or update search index for current project')
    .option('--json', 'Output results as JSON')
    .option('--verbose', 'Show detailed logging output')
    .action(indexCommand);

  // search command
  program
    .command('search <query>')
    .description('Search code with natural language query')
    .option('-k, --top-k <number>', 'Number of results to return (default: 10)', parseInt)
    .option('-m, --mode <mode>', 'Search mode: hybrid, vector, or fts')
    .option('-a, --alpha <number>', 'Alpha weight for hybrid search (0-1)', parseFloat)
    .option('-d, --docs', 'Search documentation files instead of code')
    .option('--json', 'Output results as JSON')
    .action(searchCommand);

  // status command
  program
    .command('status')
    .description('Show index statistics and configuration')
    .option('--json', 'Output results as JSON')
    .action(statusCommand);

  // reindex command
  program
    .command('reindex')
    .description('Rebuild entire index from scratch')
    .option('--json', 'Output results as JSON')
    .option('--verbose', 'Show detailed logging output')
    .action(reindexCommand);

  // delete command
  program
    .command('delete')
    .description('Delete index for current project')
    .option('--json', 'Output results as JSON (skips confirmation)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(deleteCommand);

  // setup command (existing)
  program
    .command('setup')
    .description('Configure MCP clients to use search-mcp')
    .option('--verbose', 'Show detailed logging output')
    .option('-V, --verbose-flag', 'Show detailed logging output (alias)')
    .action(async (options) => {
      const { runSetup } = await import('./setup.js');
      const verbose = options.verbose || options.verboseFlag;
      await runSetup({ verbose });
    });

  // logs command (existing)
  program
    .command('logs')
    .description('Show log file locations for debugging')
    .action(async () => {
      const { showLogs } = await import('./setup.js');
      showLogs();
    });

  return program;
}

/**
 * Get package version
 */
function getVersion(): string {
  try {
    const packageJsonPath = new URL('../../package.json', import.meta.url);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return '0.0.0';
  }
}

/**
 * Run the CLI
 */
export async function runCLI(args: string[]): Promise<void> {
  const program = createCLI();
  await program.parseAsync(args, { from: 'node' });
}

// ============================================================================
// Exports
// ============================================================================

export {
  indexCommand,
  searchCommand,
  statusCommand,
  reindexCommand,
  deleteCommand,
  handleError,
};
