/**
 * API Error Classes
 *
 * Custom error types for API-related failures with HTTP status codes.
 */

/**
 * Base class for API errors with HTTP status code.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(statusCode: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || `HTTP_${statusCode}`;
    this.details = details;
  }

  /**
   * Converts error to JSON response format.
   */
  toJSON(): Record<string, unknown> {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        details: this.details,
      },
    };
  }
}

/**
 * Error for 400 Bad Request responses.
 */
export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request', details?: Record<string, unknown>) {
    super(400, message, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

/**
 * Error for 401 Unauthorized responses.
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error for 403 Forbidden responses.
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Access forbidden') {
    super(403, message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Error for 404 Not Found responses.
 */
export class NotFoundError extends ApiError {
  public readonly resource?: string;

  constructor(message: string = 'Resource not found', resource?: string) {
    super(404, message, 'NOT_FOUND', resource ? { resource } : undefined);
    this.name = 'NotFoundError';
    this.resource = resource;
  }
}

/**
 * Error for 409 Conflict responses.
 */
export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict') {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Error for 422 Unprocessable Entity responses.
 */
export class ValidationError extends ApiError {
  public readonly validationErrors: Array<{ field: string; message: string }>;

  constructor(message: string = 'Validation failed', validationErrors: Array<{ field: string; message: string }> = []) {
    super(422, message, 'VALIDATION_ERROR', { validationErrors });
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Error for 429 Too Many Requests responses.
 */
export class RateLimitError extends ApiError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, message: string = 'Too many requests') {
    super(429, message, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Error for 500 Internal Server Error responses.
 */
export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error') {
    super(500, message, 'INTERNAL_ERROR');
    this.name = 'InternalServerError';
  }
}

/**
 * Error for 502 Bad Gateway responses.
 */
export class BadGatewayError extends ApiError {
  constructor(message: string = 'Bad gateway') {
    super(502, message, 'BAD_GATEWAY');
    this.name = 'BadGatewayError';
  }
}

/**
 * Error for 503 Service Unavailable responses.
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(503, message, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error for 504 Gateway Timeout responses.
 */
export class GatewayTimeoutError extends ApiError {
  constructor(message: string = 'Gateway timeout') {
    super(504, message, 'GATEWAY_TIMEOUT');
    this.name = 'GatewayTimeoutError';
  }
}

/**
 * Creates an ApiError from an HTTP status code.
 */
export function createApiError(statusCode: number, message?: string): ApiError {
  switch (statusCode) {
    case 400:
      return new BadRequestError(message);
    case 401:
      return new UnauthorizedError(message);
    case 403:
      return new ForbiddenError(message);
    case 404:
      return new NotFoundError(message);
    case 409:
      return new ConflictError(message);
    case 422:
      return new ValidationError(message);
    case 429:
      return new RateLimitError(60, message);
    case 500:
      return new InternalServerError(message);
    case 502:
      return new BadGatewayError(message);
    case 503:
      return new ServiceUnavailableError(message);
    case 504:
      return new GatewayTimeoutError(message);
    default:
      return new ApiError(statusCode, message || `HTTP Error ${statusCode}`);
  }
}

/**
 * Checks if an error is an ApiError.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Wraps any error as an ApiError.
 */
export function wrapError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(error.message);
  }

  return new InternalServerError(String(error));
}
