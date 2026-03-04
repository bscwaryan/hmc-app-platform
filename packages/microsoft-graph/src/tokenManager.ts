/**
 * Token Manager - OAuth token lifecycle for Microsoft Graph API
 *
 * Uses adapter pattern for token storage (database-agnostic)
 * and encryption from @hmc/security.
 */

import { createLogger } from '@hmc/logger';
import { encrypt, decrypt } from '@hmc/security';
import type { GraphTokenAdapter, TokenRefreshFn } from './types.js';

const logger = createLogger('graph-token-manager');

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes before expiry

export class AuthenticationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

let tokenAdapter: GraphTokenAdapter | null = null;
let refreshFn: TokenRefreshFn | null = null;

/**
 * Initialize the token manager with a storage adapter and refresh function.
 */
export function initTokenManager(adapter: GraphTokenAdapter, refresh: TokenRefreshFn): void {
  tokenAdapter = adapter;
  refreshFn = refresh;
  logger.info('Token manager initialized');
}

function getAdapter(): GraphTokenAdapter {
  if (!tokenAdapter) {
    throw new Error('Token manager not initialized. Call initTokenManager() first.');
  }
  return tokenAdapter;
}

function getRefreshFn(): TokenRefreshFn {
  if (!refreshFn) {
    throw new Error('Token manager not initialized. Call initTokenManager() first.');
  }
  return refreshFn;
}

/**
 * Get a valid access token for the given user.
 * Automatically refreshes if expiring soon.
 */
export async function getValidToken(userId: string): Promise<string> {
  const adapter = getAdapter();
  const cached = await adapter.getToken(userId);

  if (!cached) {
    throw new AuthenticationError(
      'NO_GRAPH_TOKEN',
      'User has not authorized Microsoft 365 access. Please re-authenticate.',
    );
  }

  const expiresIn = cached.expiresAt.getTime() - Date.now();

  if (expiresIn < REFRESH_THRESHOLD_MS) {
    logger.info('Refreshing token', { userId });
    return refreshToken(userId, cached.refreshTokenEncrypted, cached.scopes);
  }

  return decrypt(cached.accessTokenEncrypted);
}

/**
 * Store tokens for a user (after initial OAuth flow).
 */
export async function storeTokens(
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: Date; scopes: string[] },
): Promise<void> {
  const adapter = getAdapter();
  await adapter.storeToken(userId, {
    accessTokenEncrypted: encrypt(tokens.accessToken),
    refreshTokenEncrypted: encrypt(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  });
}

/**
 * Clear cached tokens for a user.
 */
export async function clearTokens(userId: string): Promise<void> {
  const adapter = getAdapter();
  await adapter.clearToken(userId);
}

async function refreshToken(
  userId: string,
  encryptedRefreshToken: string,
  storedScopes?: string[] | null,
): Promise<string> {
  try {
    const refreshTokenValue = decrypt(encryptedRefreshToken);
    const refresh = getRefreshFn();
    const scopesToRequest = storedScopes && storedScopes.length > 0 ? storedScopes : undefined;
    const response = await refresh(refreshTokenValue, scopesToRequest);

    if (!response) {
      throw new Error('Failed to acquire token');
    }

    const adapter = getAdapter();
    await adapter.storeToken(userId, {
      accessTokenEncrypted: encrypt(response.accessToken),
      refreshTokenEncrypted: encryptedRefreshToken, // Reuse existing refresh token
      expiresAt: response.expiresOn,
      scopes: response.scopes,
    });

    return response.accessToken;
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err.errorCode === 'invalid_grant') {
      const adapter = getAdapter();
      await adapter.clearToken(userId);
      throw new AuthenticationError(
        'TOKEN_EXPIRED',
        'Microsoft 365 authorization has expired. Please re-authenticate.',
      );
    }
    throw error;
  }
}
