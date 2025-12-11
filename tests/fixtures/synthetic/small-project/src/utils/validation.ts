/**
 * Input Validation Utilities
 *
 * Provides comprehensive validation functions for user inputs,
 * request parameters, and data integrity checking.
 */

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: unknown[];
  custom?: (value: unknown) => boolean;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an email address format.
 *
 * @param email - Email address to validate
 * @returns True if email format is valid
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // RFC 5322 simplified pattern
  const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailPattern.test(email) && email.length <= 254;
}

/**
 * Validates a password meets security requirements.
 *
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 *
 * @param password - Password to validate
 * @returns True if password meets requirements
 */
export function validatePassword(password: string): boolean {
  if (!password || typeof password !== 'string') {
    return false;
  }

  if (password.length < 8 || password.length > 128) {
    return false;
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  return hasUppercase && hasLowercase && hasNumber && hasSpecial;
}

/**
 * Validates password strength and returns a score.
 *
 * @param password - Password to check
 * @returns Score from 0-4 (0=weak, 4=strong)
 */
export function getPasswordStrength(password: string): number {
  if (!password) return 0;

  let score = 0;

  // Length score
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Character variety
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  // Penalty for common patterns
  if (/^[a-zA-Z]+$/.test(password)) score--;
  if (/^[0-9]+$/.test(password)) score--;
  if (/(.)\1{2,}/.test(password)) score--; // Repeated characters

  return Math.max(0, Math.min(4, score));
}

/**
 * Validates a URL format.
 *
 * @param url - URL to validate
 * @param allowedProtocols - Allowed protocols (default: http, https)
 * @returns True if URL is valid
 */
export function validateUrl(url: string, allowedProtocols: string[] = ['http', 'https']): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol.replace(':', ''));
  } catch {
    return false;
  }
}

/**
 * Validates a phone number format.
 *
 * @param phone - Phone number to validate
 * @returns True if phone format is valid
 */
export function validatePhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // Remove common separators
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // Check for valid phone pattern (international or local)
  const phonePattern = /^\+?[1-9]\d{6,14}$/;
  return phonePattern.test(cleaned);
}

/**
 * Validates a username format.
 *
 * @param username - Username to validate
 * @returns True if username is valid
 */
export function validateUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }

  // 3-30 characters, alphanumeric and underscore, must start with letter
  const usernamePattern = /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/;
  return usernamePattern.test(username);
}

/**
 * Validates a UUID format.
 *
 * @param uuid - UUID to validate
 * @returns True if UUID is valid
 */
export function validateUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(uuid);
}

/**
 * Validates request body against a schema.
 *
 * @param body - Request body to validate
 * @param schema - Validation schema
 * @returns Validated and typed body
 * @throws Error if validation fails
 */
export function validateRequestBody<T>(body: unknown, schema: ValidationSchema): T {
  const result = validateObject(body, schema);

  if (!result.valid) {
    throw new ValidationError(result.errors.join(', '));
  }

  return body as T;
}

/**
 * Validates query parameters against a schema.
 *
 * @param params - Query parameters to validate
 * @param schema - Validation schema
 * @returns Validated and coerced parameters
 */
export function validateQueryParams<T>(params: unknown, schema: ValidationSchema): T {
  if (typeof params !== 'object' || params === null) {
    throw new ValidationError('Invalid query parameters');
  }

  const result: Record<string, unknown> = {};

  for (const [key, rule] of Object.entries(schema)) {
    const value = (params as Record<string, unknown>)[key];

    if (value === undefined) {
      if (rule.required) {
        throw new ValidationError(`Missing required parameter: ${key}`);
      }
      continue;
    }

    // Coerce types for query params
    result[key] = coerceType(value, rule.type);
  }

  return result as T;
}

/**
 * Validates an object against a schema.
 *
 * @param obj - Object to validate
 * @param schema - Validation schema
 * @returns Validation result
 */
export function validateObject(obj: unknown, schema: ValidationSchema): ValidationResult {
  const errors: string[] = [];

  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, errors: ['Expected an object'] };
  }

  const data = obj as Record<string, unknown>;

  for (const [key, rule] of Object.entries(schema)) {
    const value = data[key];

    // Check required
    if (value === undefined || value === null) {
      if (rule.required) {
        errors.push(`${key} is required`);
      }
      continue;
    }

    // Check type
    if (!checkType(value, rule.type)) {
      errors.push(`${key} must be of type ${rule.type}`);
      continue;
    }

    // Type-specific validations
    if (rule.type === 'string' && typeof value === 'string') {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push(`${key} must be at least ${rule.minLength} characters`);
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push(`${key} must be at most ${rule.maxLength} characters`);
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`${key} has invalid format`);
      }
    }

    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push(`${key} must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push(`${key} must be at most ${rule.max}`);
      }
    }

    // Check enum
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push(`${key} must be one of: ${rule.enum.join(', ')}`);
    }

    // Custom validation
    if (rule.custom && !rule.custom(value)) {
      errors.push(`${key} failed custom validation`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Checks if a value matches the expected type.
 */
function checkType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

/**
 * Coerces a value to the expected type (for query params).
 */
function coerceType(value: unknown, type: string): unknown {
  if (typeof value === type) return value;

  switch (type) {
    case 'number':
      const num = Number(value);
      return isNaN(num) ? value : num;
    case 'boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    default:
      return value;
  }
}

/**
 * Sanitizes a string to prevent XSS attacks.
 *
 * @param input - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  if (!input) return '';

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Strips HTML tags from a string.
 *
 * @param input - String to strip
 * @returns String without HTML tags
 */
export function stripHtml(input: string): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Custom validation error class.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
