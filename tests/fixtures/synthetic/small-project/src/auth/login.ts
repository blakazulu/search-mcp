/**
 * Login Authentication Module
 *
 * This module handles user authentication and login functionality.
 * It validates credentials and generates session tokens.
 */

import { hashPassword, verifyPassword } from '../utils/demoHash';
import { validateEmail, validatePassword } from '../utils/validation';
import { DatabaseConnection } from '../db/connection';
import { UserNotFoundError, InvalidCredentialsError } from '../errors/auth';

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  userId?: string;
  expiresAt?: Date;
  error?: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

/**
 * Authenticates a user with email and password credentials.
 *
 * This function performs the following steps:
 * 1. Validates input format
 * 2. Looks up user in database
 * 3. Verifies password hash
 * 4. Generates session token
 * 5. Updates last login timestamp
 *
 * @param credentials - User login credentials
 * @returns LoginResult with success status and token
 */
export async function authenticateUser(credentials: LoginCredentials): Promise<LoginResult> {
  const { email, password, rememberMe = false } = credentials;

  // Validate email format
  if (!validateEmail(email)) {
    return { success: false, error: 'Invalid email format' };
  }

  // Validate password requirements
  if (!validatePassword(password)) {
    return { success: false, error: 'Invalid password format' };
  }

  try {
    // Find user by email
    const db = DatabaseConnection.getInstance();
    const user = await db.query<User>('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      throw new UserNotFoundError(email);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    // Generate session token
    const token = generateSessionToken(user.id, rememberMe);
    const expiresAt = calculateExpiryTime(rememberMe);

    // Update last login timestamp
    await db.execute('UPDATE users SET lastLoginAt = NOW() WHERE id = ?', [user.id]);

    return {
      success: true,
      token,
      userId: user.id,
      expiresAt,
    };
  } catch (error) {
    if (error instanceof UserNotFoundError || error instanceof InvalidCredentialsError) {
      return { success: false, error: 'Invalid email or password' };
    }
    throw error;
  }
}

/**
 * Generates a secure session token for the user.
 *
 * @param userId - The user's unique identifier
 * @param rememberMe - Whether to generate a long-lived token
 * @returns JWT token string
 */
function generateSessionToken(userId: string, rememberMe: boolean): string {
  const payload = {
    sub: userId,
    iat: Date.now(),
    exp: calculateExpiryTime(rememberMe).getTime(),
    type: 'session',
  };

  // In production, use proper JWT signing
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Calculates token expiry time based on remember me preference.
 */
function calculateExpiryTime(rememberMe: boolean): Date {
  const now = new Date();
  if (rememberMe) {
    // 30 days for remember me
    return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
  // 24 hours default
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Logs out a user by invalidating their session token.
 *
 * @param token - Session token to invalidate
 */
export async function logout(token: string): Promise<void> {
  const db = DatabaseConnection.getInstance();
  await db.execute('INSERT INTO invalidated_tokens (token, invalidatedAt) VALUES (?, NOW())', [token]);
}

/**
 * Validates if a session token is still valid.
 *
 * @param token - Session token to validate
 * @returns Whether the token is valid
 */
export async function validateSession(token: string): Promise<boolean> {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());

    // Check expiry
    if (payload.exp < Date.now()) {
      return false;
    }

    // Check if token was invalidated
    const db = DatabaseConnection.getInstance();
    const invalidated = await db.query('SELECT 1 FROM invalidated_tokens WHERE token = ?', [token]);

    return !invalidated;
  } catch {
    return false;
  }
}
