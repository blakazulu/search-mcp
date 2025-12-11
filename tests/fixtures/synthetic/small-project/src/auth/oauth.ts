/**
 * OAuth 2.0 Implementation
 *
 * This module implements OAuth 2.0 authentication flow for third-party providers
 * including Google, GitHub, and Microsoft authentication.
 */

import { DatabaseConnection } from '../db/connection';
import { generateUUID } from '../utils/crypto';
import { OAuthProvider, OAuthTokenResponse, OAuthUserInfo } from './types';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
}

export interface OAuthState {
  nonce: string;
  provider: OAuthProvider;
  returnUrl: string;
  createdAt: Date;
}

// Provider configurations
const PROVIDER_ENDPOINTS: Record<OAuthProvider, { auth: string; token: string; userinfo: string }> = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    userinfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
  },
  github: {
    auth: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    userinfo: 'https://api.github.com/user',
  },
  microsoft: {
    auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfo: 'https://graph.microsoft.com/v1.0/me',
  },
};

/**
 * Generates the OAuth authorization URL for the specified provider.
 *
 * This creates a secure authentication redirect URL with:
 * - Client ID for provider identification
 * - Redirect URI for callback handling
 * - Scope for requested permissions
 * - State parameter for CSRF protection
 *
 * @param provider - OAuth provider (google, github, microsoft)
 * @param config - OAuth configuration for the provider
 * @param returnUrl - URL to redirect after authentication
 * @returns Authorization URL to redirect the user to
 */
export async function generateAuthorizationUrl(
  provider: OAuthProvider,
  config: OAuthConfig,
  returnUrl: string
): Promise<string> {
  const endpoints = PROVIDER_ENDPOINTS[provider];
  if (!endpoints) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  // Generate secure state for CSRF protection
  const state = await createOAuthState(provider, returnUrl);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope.join(' '),
    response_type: 'code',
    state: state.nonce,
    access_type: 'offline', // For refresh tokens
    prompt: 'consent',
  });

  return `${endpoints.auth}?${params.toString()}`;
}

/**
 * Creates and stores OAuth state for CSRF protection.
 */
async function createOAuthState(provider: OAuthProvider, returnUrl: string): Promise<OAuthState> {
  const state: OAuthState = {
    nonce: generateUUID(),
    provider,
    returnUrl,
    createdAt: new Date(),
  };

  const db = DatabaseConnection.getInstance();
  await db.execute(
    'INSERT INTO oauth_states (nonce, provider, returnUrl, createdAt) VALUES (?, ?, ?, ?)',
    [state.nonce, state.provider, state.returnUrl, state.createdAt]
  );

  return state;
}

/**
 * Handles the OAuth callback and exchanges the authorization code for tokens.
 *
 * This function:
 * 1. Validates the state parameter to prevent CSRF
 * 2. Exchanges the authorization code for access/refresh tokens
 * 3. Fetches user information from the provider
 * 4. Creates or updates the user account
 *
 * @param code - Authorization code from the provider
 * @param state - State parameter for validation
 * @param config - OAuth configuration
 * @returns User information and tokens
 */
export async function handleOAuthCallback(
  code: string,
  state: string,
  config: OAuthConfig
): Promise<{ user: OAuthUserInfo; tokens: OAuthTokenResponse }> {
  // Validate state
  const oauthState = await validateOAuthState(state);
  if (!oauthState) {
    throw new Error('Invalid OAuth state - possible CSRF attack');
  }

  const provider = oauthState.provider;
  const endpoints = PROVIDER_ENDPOINTS[provider];

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code, config, endpoints.token);

  // Fetch user info
  const userInfo = await fetchUserInfo(tokens.access_token, endpoints.userinfo, provider);

  // Clean up used state
  await deleteOAuthState(state);

  return { user: userInfo, tokens };
}

/**
 * Validates the OAuth state parameter.
 */
async function validateOAuthState(nonce: string): Promise<OAuthState | null> {
  const db = DatabaseConnection.getInstance();
  const result = await db.query<OAuthState>(
    'SELECT * FROM oauth_states WHERE nonce = ? AND createdAt > DATE_SUB(NOW(), INTERVAL 10 MINUTE)',
    [nonce]
  );
  return result || null;
}

/**
 * Deletes used OAuth state.
 */
async function deleteOAuthState(nonce: string): Promise<void> {
  const db = DatabaseConnection.getInstance();
  await db.execute('DELETE FROM oauth_states WHERE nonce = ?', [nonce]);
}

/**
 * Exchanges authorization code for access and refresh tokens.
 */
async function exchangeCodeForTokens(
  code: string,
  config: OAuthConfig,
  tokenEndpoint: string
): Promise<OAuthTokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches user information from the OAuth provider.
 */
async function fetchUserInfo(
  accessToken: string,
  userinfoEndpoint: string,
  provider: OAuthProvider
): Promise<OAuthUserInfo> {
  const response = await fetch(userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  }

  const data = await response.json();

  // Normalize user info across providers
  return normalizeUserInfo(data, provider);
}

/**
 * Normalizes user info from different providers into a common format.
 */
function normalizeUserInfo(data: Record<string, unknown>, provider: OAuthProvider): OAuthUserInfo {
  switch (provider) {
    case 'google':
      return {
        id: data.id as string,
        email: data.email as string,
        name: data.name as string,
        picture: data.picture as string,
        provider,
      };
    case 'github':
      return {
        id: String(data.id),
        email: data.email as string,
        name: data.name as string || data.login as string,
        picture: data.avatar_url as string,
        provider,
      };
    case 'microsoft':
      return {
        id: data.id as string,
        email: data.mail as string || data.userPrincipalName as string,
        name: data.displayName as string,
        picture: undefined, // Microsoft requires additional API call
        provider,
      };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Refreshes an expired access token using the refresh token.
 *
 * @param refreshToken - The refresh token
 * @param provider - OAuth provider
 * @param config - OAuth configuration
 * @returns New token response
 */
export async function refreshAccessToken(
  refreshToken: string,
  provider: OAuthProvider,
  config: OAuthConfig
): Promise<OAuthTokenResponse> {
  const endpoints = PROVIDER_ENDPOINTS[provider];

  const response = await fetch(endpoints.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.statusText}`);
  }

  return response.json();
}
