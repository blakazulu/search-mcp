/**
 * Logger Module
 *
 * Provides a logging utility with configurable log levels,
 * file-based logging with rotation, and structured log format.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Log levels ordered by severity (lower = more severe)
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * Logger interface defining the logging methods
 */
export interface Logger {
  error(component: string, message: string, meta?: object): void;
  warn(component: string, message: string, meta?: object): void;
  info(component: string, message: string, meta?: object): void;
  debug(component: string, message: string, meta?: object): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

/**
 * Configuration options for the logger
 */
export interface LoggerConfig {
  /** Log directory path (defaults to console if not provided) */
  logDir?: string;
  /** Maximum log file size in bytes before rotation (default: 10MB) */
  maxFileSize?: number;
  /** Maximum number of rotated log files to keep (default: 3) */
  maxFiles?: number;
  /** Initial log level (default: INFO) */
  level?: LogLevel;
  /** Log file name (default: search-mcp.log) */
  fileName?: string;
}

/** Default configuration values */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILES = 3;
const DEFAULT_LOG_FILE_NAME = 'search-mcp.log';

/**
 * Level names for formatting
 */
const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
};

/**
 * File-based logger implementation with rotation support
 */
class FileLogger implements Logger {
  private level: LogLevel;
  private logDir: string | null;
  private maxFileSize: number;
  private maxFiles: number;
  private fileName: string;
  private writeQueue: Promise<void>;
  private initialized: boolean;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? LogLevel.INFO;
    this.logDir = config.logDir ?? null;
    this.maxFileSize = config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.maxFiles = config.maxFiles ?? DEFAULT_MAX_FILES;
    this.fileName = config.fileName ?? DEFAULT_LOG_FILE_NAME;
    this.writeQueue = Promise.resolve();
    this.initialized = false;

    if (this.logDir) {
      this.initializeLogDir();
    }
  }

  /**
   * Create log directory if it doesn't exist
   */
  private initializeLogDir(): void {
    if (!this.logDir || this.initialized) return;

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.initialized = true;
    } catch (err) {
      // Fall back to console logging if directory creation fails
      console.error(
        `[Logger] Failed to create log directory: ${this.logDir}`,
        err
      );
      this.logDir = null;
    }
  }

  /**
   * Get the full path to the current log file
   */
  private getLogFilePath(): string | null {
    if (!this.logDir) return null;
    return path.join(this.logDir, this.fileName);
  }

  /**
   * Get the path for a rotated log file
   */
  private getRotatedFilePath(index: number): string {
    if (!this.logDir) throw new Error('No log directory configured');
    const baseName = path.basename(this.fileName, '.log');
    return path.join(this.logDir, `${baseName}.${index}.log`);
  }

  /**
   * Rotate log files when size limit is exceeded
   */
  private rotateLogsIfNeeded(): void {
    const logFilePath = this.getLogFilePath();
    if (!logFilePath) return;

    try {
      if (!fs.existsSync(logFilePath)) return;

      const stats = fs.statSync(logFilePath);
      if (stats.size < this.maxFileSize) return;

      // Delete oldest file if it exists
      const oldestFile = this.getRotatedFilePath(this.maxFiles - 1);
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }

      // Shift existing rotated files
      for (let i = this.maxFiles - 2; i >= 0; i--) {
        const currentFile =
          i === 0 ? logFilePath : this.getRotatedFilePath(i);
        const nextFile = this.getRotatedFilePath(i + 1);
        if (fs.existsSync(currentFile)) {
          fs.renameSync(currentFile, nextFile);
        }
      }
    } catch (err) {
      console.error('[Logger] Failed to rotate log files:', err);
    }
  }

  /**
   * Format a log entry with timestamp, level, component, and message
   */
  private formatLogEntry(
    level: LogLevel,
    component: string,
    message: string,
    meta?: object
  ): string {
    const timestamp = new Date().toISOString();
    const levelName = LEVEL_NAMES[level];
    let formattedMessage = `[${timestamp}] [${levelName}] [${component}] ${message}`;

    if (meta && Object.keys(meta).length > 0) {
      formattedMessage += ` ${JSON.stringify(meta)}`;
    }

    return formattedMessage;
  }

  /**
   * Write a log entry (async to avoid blocking MCP operations)
   */
  private writeLog(
    level: LogLevel,
    component: string,
    message: string,
    meta?: object
  ): void {
    // Check if this log should be written based on current level
    if (level > this.level) return;

    const logEntry = this.formatLogEntry(level, component, message, meta);
    const logFilePath = this.getLogFilePath();

    if (!logFilePath) {
      // Fallback to console
      this.writeToConsole(level, logEntry);
      return;
    }

    // Queue the write operation to ensure sequential writes
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        this.rotateLogsIfNeeded();
        fs.appendFileSync(logFilePath, logEntry + '\n');
      } catch (err) {
        // Fallback to console if file write fails
        console.error('[Logger] Failed to write to log file:', err);
        this.writeToConsole(level, logEntry);
      }
    });
  }

  /**
   * Write to console as fallback
   */
  private writeToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.DEBUG:
        console.debug(message);
        break;
    }
  }

  error(component: string, message: string, meta?: object): void {
    this.writeLog(LogLevel.ERROR, component, message, meta);
  }

  warn(component: string, message: string, meta?: object): void {
    this.writeLog(LogLevel.WARN, component, message, meta);
  }

  info(component: string, message: string, meta?: object): void {
    this.writeLog(LogLevel.INFO, component, message, meta);
  }

  debug(component: string, message: string, meta?: object): void {
    this.writeLog(LogLevel.DEBUG, component, message, meta);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Update the log directory (used when switching between projects/indexes)
   */
  setLogDir(logDir: string): void {
    this.logDir = logDir;
    this.initialized = false;
    this.initializeLogDir();
  }

  /**
   * Get the current log directory
   */
  getLogDir(): string | null {
    return this.logDir;
  }
}

// Singleton logger instance
let loggerInstance: FileLogger | null = null;

/**
 * Get log level from environment variables
 * Supports DEBUG=1, DEBUG=true, SEARCH_MCP_DEBUG=1, or LOG_LEVEL=debug
 */
function getLogLevelFromEnv(): LogLevel {
  const debug = process.env.DEBUG || process.env.SEARCH_MCP_DEBUG;
  if (debug === '1' || debug === 'true' || debug?.toLowerCase() === 'debug') {
    return LogLevel.DEBUG;
  }

  const logLevel = process.env.LOG_LEVEL || process.env.SEARCH_MCP_LOG_LEVEL;
  if (logLevel) {
    return parseLogLevel(logLevel);
  }

  return LogLevel.INFO;
}

/**
 * Create a new logger instance with the specified index path
 * @param indexPath Path to the index directory (logs stored in <indexPath>/logs/)
 * @param config Additional configuration options
 */
export function createLogger(
  indexPath: string,
  config: Omit<LoggerConfig, 'logDir'> = {}
): Logger {
  const logDir = path.join(indexPath, 'logs');
  loggerInstance = new FileLogger({ ...config, logDir });
  return loggerInstance;
}

/**
 * Get the existing logger instance, or create a console-only logger if none exists
 * Respects DEBUG, SEARCH_MCP_DEBUG, LOG_LEVEL, and SEARCH_MCP_LOG_LEVEL env vars
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    // Create a console-only logger as fallback with env-based log level
    const level = getLogLevelFromEnv();
    loggerInstance = new FileLogger({ level });

    // Log at debug level if debug mode is enabled
    if (level === LogLevel.DEBUG) {
      loggerInstance.debug('logger', 'Debug logging enabled via environment variable');
    }
  }
  return loggerInstance;
}

/**
 * Reset the logger instance (mainly for testing)
 */
export function resetLogger(): void {
  loggerInstance = null;
}

/**
 * Get the default log directory for a given index hash
 * Uses ~/.mcp/search/indexes/<hash>/logs/
 */
export function getDefaultLogDir(indexHash: string): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.mcp', 'search', 'indexes', indexHash, 'logs');
}

/**
 * Get the global log directory for server-level logs
 * Uses ~/.mcp/search/logs/
 */
export function getGlobalLogDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.mcp', 'search', 'logs');
}

/**
 * Initialize the global logger with file-based logging
 * Should be called at server startup before any logging occurs
 */
export function initGlobalLogger(): Logger {
  const logDir = getGlobalLogDir();
  const level = getLogLevelFromEnv();
  loggerInstance = new FileLogger({ logDir, level, fileName: 'server.log' });
  return loggerInstance;
}

/**
 * Parse a log level string to LogLevel enum
 */
export function parseLogLevel(level: string): LogLevel {
  const normalized = level.toUpperCase();
  switch (normalized) {
    case 'ERROR':
      return LogLevel.ERROR;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'INFO':
      return LogLevel.INFO;
    case 'DEBUG':
      return LogLevel.DEBUG;
    default:
      return LogLevel.INFO;
  }
}
