/**
 * Authentication Type Definitions
 *
 * Common types used across the authentication module.
 */

export type OAuthProvider = 'google' | 'github' | 'microsoft';

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: OAuthProvider;
}

export interface AuthConfig {
  jwtSecret: string;
  tokenExpiry: number;
  refreshTokenExpiry: number;
  bcryptRounds: number;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  expiresAt: Date;
  used: boolean;
}
