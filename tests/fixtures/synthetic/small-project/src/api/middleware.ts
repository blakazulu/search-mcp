/**
 * API Middleware Functions
 *
 * Common middleware for authentication, rate limiting, logging,
 * and request processing.
 */

import { Request, Response, NextFunction } from 'express';
import { validateSession } from '../auth/login';
import { Logger } from '../utils/demoLogger';
import { ApiError } from '../errors/api';

const logger = new Logger('middleware');

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionToken?: string;
}

/**
 * Authentication middleware.
 *
 * Validates the Authorization header and attaches user info to the request.
 * Supports Bearer token authentication.
 *
 * Security features:
 * - Token validation
 * - Session expiry checking
 * - Request authentication tagging
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing authorization header', { path: req.path });
    res.status(401).json({ error: 'Authorization required' });
    return;
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    logger.warn('Invalid authorization format', { scheme, path: req.path });
    res.status(401).json({ error: 'Invalid authorization format' });
    return;
  }

  validateSession(token)
    .then((isValid) => {
      if (!isValid) {
        logger.warn('Invalid or expired session', { path: req.path });
        res.status(401).json({ error: 'Invalid or expired session' });
        return;
      }

      // Decode token to get user ID
      const payload = JSON.parse(Buffer.from(token, 'base64').toString());
      req.userId = payload.sub;
      req.sessionToken = token;

      next();
    })
    .catch((error) => {
      logger.error('Authentication error', error);
      res.status(500).json({ error: 'Authentication error' });
    });
}

/**
 * Rate limiting middleware.
 *
 * Limits the number of requests from a single IP address within a time window.
 * Protects against DoS attacks and API abuse.
 *
 * Performance optimization:
 * - Uses in-memory store for fast lookups
 * - Automatic cleanup of expired entries
 * - Configurable limits per route
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  const { maxRequests, windowMs } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIP(req);
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || record.resetAt < now) {
      // Create new record or reset expired one
      record = { count: 1, resetAt: now + windowMs };
      rateLimitStore.set(key, record);
    } else {
      record.count++;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    if (record.count > maxRequests) {
      logger.warn('Rate limit exceeded', { ip, path: req.path, count: record.count });
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

/**
 * Request logging middleware.
 *
 * Logs incoming requests with timing information.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Attach request ID for tracking
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Log request start
  logger.info('Request started', {
    requestId,
    method: req.method,
    path: req.path,
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'],
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });
  });

  next();
}

/**
 * CORS middleware.
 *
 * Handles Cross-Origin Resource Sharing for API access from browsers.
 */
export function corsMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Error handling middleware.
 *
 * Catches errors and returns appropriate HTTP responses.
 * Sanitizes error messages in production.
 */
export function errorHandlerMiddleware(err: Error, req: Request, res: Response, next: NextFunction): void {
  const requestId = (req as any).requestId;

  if (err instanceof ApiError) {
    logger.warn('API Error', {
      requestId,
      code: err.statusCode,
      message: err.message,
    });
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Log unexpected errors
  logger.error('Unexpected error', {
    requestId,
    error: err.message,
    stack: err.stack,
  });

  // Don't expose internal errors in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(500).json({
    error: message,
    requestId,
  });
}

/**
 * Request body parser with size limits.
 *
 * Security: Prevents large payload attacks.
 */
export function bodyParserMiddleware(maxSize: string = '100kb') {
  const maxBytes = parseSize(maxSize);

  return (req: Request, res: Response, next: NextFunction): void => {
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        res.status(413).json({ error: 'Payload too large' });
      }
    });

    next();
  };
}

// Helper functions

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

function parseSize(size: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);
  if (!match) return 102400; // Default 100kb

  return parseInt(match[1]) * units[match[2]];
}

// Periodic cleanup of rate limit store
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore) {
    if (value.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Every minute
