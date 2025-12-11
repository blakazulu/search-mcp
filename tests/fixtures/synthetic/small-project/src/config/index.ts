/**
 * Configuration Module
 *
 * Centralizes application configuration with environment variable support.
 * Provides type-safe access to configuration options.
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  maxConnections: number;
  idleTimeout: number;
  connectionTimeout: number;
}

export interface AuthConfig {
  jwtSecret: string;
  sessionExpiry: number;
  refreshTokenExpiry: number;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

export interface OAuthConfig {
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  github: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  microsoft: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origins: string[];
    credentials: boolean;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  output: 'console' | 'file' | 'both';
  filePath?: string;
}

export interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  defaultTTL: number;
}

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  database: DatabaseConfig;
  auth: AuthConfig;
  oauth: OAuthConfig;
  server: ServerConfig;
  logging: LoggingConfig;
  cache: CacheConfig;
}

/**
 * Gets configuration value from environment with fallback.
 */
function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

/**
 * Gets numeric configuration value from environment.
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

/**
 * Gets boolean configuration value from environment.
 */
function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Loads and validates application configuration.
 *
 * Configuration options can be set via environment variables.
 * Missing required values will throw an error in production.
 */
export function loadConfig(): AppConfig {
  const env = getEnv('NODE_ENV', 'development') as AppConfig['env'];

  const config: AppConfig = {
    env,

    database: {
      host: getEnv('DATABASE_HOST', 'localhost'),
      port: getEnvNumber('DATABASE_PORT', 5432),
      name: getEnv('DATABASE_NAME', 'myapp'),
      user: getEnv('DATABASE_USER', 'admin'),
      password: getEnv('DATABASE_PASSWORD', ''),
      maxConnections: getEnvNumber('DATABASE_MAX_CONNECTIONS', 10),
      idleTimeout: getEnvNumber('DATABASE_IDLE_TIMEOUT', 30000),
      connectionTimeout: getEnvNumber('DATABASE_CONNECTION_TIMEOUT', 5000),
    },

    auth: {
      jwtSecret: getEnv('JWT_SECRET', 'development-secret'),
      sessionExpiry: getEnvNumber('SESSION_EXPIRY', 86400000), // 24 hours
      refreshTokenExpiry: getEnvNumber('REFRESH_TOKEN_EXPIRY', 2592000000), // 30 days
      bcryptRounds: getEnvNumber('BCRYPT_ROUNDS', 12),
      maxLoginAttempts: getEnvNumber('MAX_LOGIN_ATTEMPTS', 5),
      lockoutDuration: getEnvNumber('LOCKOUT_DURATION', 900000), // 15 minutes
    },

    oauth: {
      google: {
        clientId: getEnv('GOOGLE_CLIENT_ID'),
        clientSecret: getEnv('GOOGLE_CLIENT_SECRET'),
        redirectUri: getEnv('GOOGLE_REDIRECT_URI', '/auth/oauth/google/callback'),
      },
      github: {
        clientId: getEnv('GITHUB_CLIENT_ID'),
        clientSecret: getEnv('GITHUB_CLIENT_SECRET'),
        redirectUri: getEnv('GITHUB_REDIRECT_URI', '/auth/oauth/github/callback'),
      },
      microsoft: {
        clientId: getEnv('MICROSOFT_CLIENT_ID'),
        clientSecret: getEnv('MICROSOFT_CLIENT_SECRET'),
        redirectUri: getEnv('MICROSOFT_REDIRECT_URI', '/auth/oauth/microsoft/callback'),
      },
    },

    server: {
      port: getEnvNumber('PORT', 3000),
      host: getEnv('HOST', '0.0.0.0'),
      cors: {
        origins: getEnv('CORS_ORIGINS', '*').split(','),
        credentials: getEnvBool('CORS_CREDENTIALS', true),
      },
      rateLimit: {
        maxRequests: getEnvNumber('RATE_LIMIT_MAX', 100),
        windowMs: getEnvNumber('RATE_LIMIT_WINDOW', 60000),
      },
    },

    logging: {
      level: getEnv('LOG_LEVEL', 'info') as LoggingConfig['level'],
      format: getEnv('LOG_FORMAT', 'text') as LoggingConfig['format'],
      output: getEnv('LOG_OUTPUT', 'console') as LoggingConfig['output'],
      filePath: getEnv('LOG_FILE_PATH'),
    },

    cache: {
      enabled: getEnvBool('CACHE_ENABLED', true),
      maxSize: getEnvNumber('CACHE_MAX_SIZE', 1000),
      defaultTTL: getEnvNumber('CACHE_TTL', 300000),
    },
  };

  // Validate required configuration in production
  if (env === 'production') {
    validateProductionConfig(config);
  }

  return config;
}

/**
 * Validates that required configuration is set for production.
 */
function validateProductionConfig(config: AppConfig): void {
  const errors: string[] = [];

  if (!config.database.password) {
    errors.push('DATABASE_PASSWORD is required in production');
  }

  if (config.auth.jwtSecret === 'development-secret') {
    errors.push('JWT_SECRET must be set in production');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

/**
 * Global configuration instance.
 */
let configInstance: AppConfig | null = null;

/**
 * Gets the application configuration.
 * Loads from environment on first call.
 */
export function getConfig(): AppConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Resets configuration (for testing).
 */
export function resetConfig(): void {
  configInstance = null;
}
