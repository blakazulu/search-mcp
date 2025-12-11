/**
 * Logging Utility
 *
 * Provides structured logging with configurable levels,
 * formatting, and output destinations.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text';
  output: 'console' | 'file' | 'both';
  filePath?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Global configuration
let globalConfig: LoggerConfig = {
  level: 'info',
  format: 'text',
  output: 'console',
};

/**
 * Logger provides structured logging capabilities.
 *
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Structured data attachment
 * - JSON or text formatting
 * - Module-based log identification
 *
 * Performance optimization:
 * - Early exit for filtered log levels
 * - Lazy serialization of data
 */
export class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  /**
   * Configures the global logger settings.
   */
  static configure(config: Partial<LoggerConfig>): void {
    globalConfig = { ...globalConfig, ...config };
  }

  /**
   * Gets the current configuration.
   */
  static getConfig(): LoggerConfig {
    return { ...globalConfig };
  }

  /**
   * Logs a debug message.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Logs an info message.
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Logs a warning message.
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Logs an error message.
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    let data: Record<string, unknown> | undefined;

    if (error instanceof Error) {
      data = {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
      };
    } else {
      data = error;
    }

    this.log('error', message, data);
  }

  /**
   * Internal logging method.
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Early exit if level is filtered
    if (LOG_LEVELS[level] < LOG_LEVELS[globalConfig.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      data,
    };

    this.output(entry);
  }

  /**
   * Outputs the log entry.
   */
  private output(entry: LogEntry): void {
    const formatted = globalConfig.format === 'json'
      ? this.formatJson(entry)
      : this.formatText(entry);

    if (globalConfig.output === 'console' || globalConfig.output === 'both') {
      this.writeToConsole(entry.level, formatted);
    }

    if ((globalConfig.output === 'file' || globalConfig.output === 'both') && globalConfig.filePath) {
      this.writeToFile(formatted);
    }
  }

  /**
   * Formats entry as JSON.
   */
  private formatJson(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  /**
   * Formats entry as readable text.
   */
  private formatText(entry: LogEntry): string {
    const levelPadded = entry.level.toUpperCase().padEnd(5);
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `${entry.timestamp} [${levelPadded}] [${entry.module}] ${entry.message}${dataStr}`;
  }

  /**
   * Writes to console with appropriate method.
   */
  private writeToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        break;
    }
  }

  /**
   * Writes to file (placeholder - would use fs in real implementation).
   */
  private writeToFile(message: string): void {
    // In production, this would use fs.appendFile
    // For now, just console output
    console.log('[FILE]', message);
  }

  /**
   * Creates a child logger with additional context.
   */
  child(context: string): Logger {
    return new Logger(`${this.module}:${context}`);
  }

  /**
   * Starts a timer for performance logging.
   */
  time(label: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { durationMs: Math.round(duration * 100) / 100 });
    };
  }
}

/**
 * Creates a request-scoped logger with request ID.
 */
export function createRequestLogger(requestId: string, module: string): Logger {
  const logger = new Logger(module);
  const originalLog = (logger as any).log.bind(logger);

  (logger as any).log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    originalLog(level, message, { ...data, requestId });
  };

  return logger;
}

/**
 * Default logger instance.
 */
export const defaultLogger = new Logger('app');
