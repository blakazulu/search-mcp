/**
 * Authentication Error Classes
 *
 * Custom error types for authentication-related failures.
 */

/**
 * Base class for authentication errors.
 */
export class AuthError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/**
 * Error thrown when a user is not found.
 */
export class UserNotFoundError extends AuthError {
  public readonly email: string;

  constructor(email: string) {
    super(`User not found: ${email}`, 'USER_NOT_FOUND');
    this.name = 'UserNotFoundError';
    this.email = email;
  }
}

/**
 * Error thrown when credentials are invalid.
 */
export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS');
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Error thrown when a session has expired.
 */
export class SessionExpiredError extends AuthError {
  constructor() {
    super('Session has expired', 'SESSION_EXPIRED');
    this.name = 'SessionExpiredError';
  }
}

/**
 * Error thrown when a session is invalid.
 */
export class InvalidSessionError extends AuthError {
  constructor() {
    super('Invalid session token', 'INVALID_SESSION');
    this.name = 'InvalidSessionError';
  }
}

/**
 * Error thrown when account is locked due to too many failed attempts.
 */
export class AccountLockedError extends AuthError {
  public readonly unlockAt?: Date;

  constructor(unlockAt?: Date) {
    super('Account is locked due to too many failed login attempts', 'ACCOUNT_LOCKED');
    this.name = 'AccountLockedError';
    this.unlockAt = unlockAt;
  }
}

/**
 * Error thrown when email verification is required.
 */
export class EmailNotVerifiedError extends AuthError {
  constructor() {
    super('Email address has not been verified', 'EMAIL_NOT_VERIFIED');
    this.name = 'EmailNotVerifiedError';
  }
}

/**
 * Error thrown when two-factor authentication is required.
 */
export class TwoFactorRequiredError extends AuthError {
  public readonly tempToken: string;

  constructor(tempToken: string) {
    super('Two-factor authentication is required', 'TWO_FACTOR_REQUIRED');
    this.name = 'TwoFactorRequiredError';
    this.tempToken = tempToken;
  }
}

/**
 * Error thrown when two-factor code is invalid.
 */
export class InvalidTwoFactorCodeError extends AuthError {
  constructor() {
    super('Invalid two-factor authentication code', 'INVALID_TWO_FACTOR_CODE');
    this.name = 'InvalidTwoFactorCodeError';
  }
}

/**
 * Error thrown when password reset token is invalid or expired.
 */
export class InvalidResetTokenError extends AuthError {
  constructor() {
    super('Invalid or expired password reset token', 'INVALID_RESET_TOKEN');
    this.name = 'InvalidResetTokenError';
  }
}

/**
 * Error thrown when OAuth authentication fails.
 */
export class OAuthError extends AuthError {
  public readonly provider: string;
  public readonly originalError?: Error;

  constructor(provider: string, message: string, originalError?: Error) {
    super(`OAuth error (${provider}): ${message}`, 'OAUTH_ERROR');
    this.name = 'OAuthError';
    this.provider = provider;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when permission is denied.
 */
export class PermissionDeniedError extends AuthError {
  public readonly requiredPermission: string;

  constructor(requiredPermission: string) {
    super(`Permission denied: ${requiredPermission} is required`, 'PERMISSION_DENIED');
    this.name = 'PermissionDeniedError';
    this.requiredPermission = requiredPermission;
  }
}
