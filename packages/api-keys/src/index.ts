/**
 * @hmc/api-keys - API key management for service accounts (F-023)
 *
 * Provides:
 * - Secure API key generation with SHA-256 hashing
 * - Key validation with expiry, IP allowlist, and scope checks
 * - Express-style middleware for Bearer token auth
 * - CIDR notation support for IP allowlists
 * - Usage tracking per key
 *
 * Uses adapter pattern for database storage (database-agnostic).
 */

import { createHash, randomBytes } from 'node:crypto';

// ── Types ───────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  ipAllowlist: string[];
  rateLimit: number;
  expiresAt?: Date;
  createdAt: Date;
  lastUsedAt?: Date;
  active: boolean;
}

export interface ApiKeyUsage {
  keyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
}

export interface ApiKeyUsageDaily {
  keyId: string;
  date: string;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
}

export interface CreateApiKeyResult {
  key: string;
  keyId: string;
  prefix: string;
}

// ── Adapter ─────────────────────────────────────────────────────

export interface ApiKeyDbAdapter {
  getApiKeys(tenantId: string): Promise<ApiKey[]>;
  getApiKey(id: string): Promise<ApiKey | null>;
  getApiKeyByHash(hash: string): Promise<ApiKey | null>;
  createApiKey(key: Omit<ApiKey, 'id' | 'createdAt'>): Promise<ApiKey>;
  updateApiKey(id: string, updates: Partial<ApiKey>): Promise<ApiKey>;
  deleteApiKey(id: string): Promise<void>;
  recordUsage(usage: ApiKeyUsage): Promise<void>;
  getDailyUsage(keyId: string, startDate: string, endDate: string): Promise<ApiKeyUsageDaily[]>;
  aggregateDailyUsage(date: string): Promise<void>;
}

// ── Business Logic ──────────────────────────────────────────────

/**
 * Hash an API key using SHA-256.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a secure API key with a prefix.
 * Returns the raw key (shown once), its hash (stored), and the prefix.
 */
export function generateApiKey(prefix?: string): { key: string; hash: string; prefix: string } {
  const keyPrefix = prefix ?? 'hmc_';
  const rawKey = randomBytes(32).toString('base64url');
  const key = `${keyPrefix}${rawKey}`;
  const hash = hashApiKey(key);

  return { key, hash, prefix: keyPrefix };
}

/**
 * Check if an IP address is allowed based on a CIDR allowlist.
 * Supports exact IP matches and CIDR notation (e.g., 192.168.1.0/24).
 */
export function isIpAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return true; // Empty allowlist means all IPs allowed
  }

  for (const entry of allowlist) {
    if (entry === ip) {
      return true;
    }

    // CIDR check
    if (entry.includes('/')) {
      const [network, maskBits] = entry.split('/');
      const mask = parseInt(maskBits, 10);

      if (isNaN(mask) || mask < 0 || mask > 32) {
        continue;
      }

      const ipNum = ipToNumber(ip);
      const networkNum = ipToNumber(network);

      if (ipNum === null || networkNum === null) {
        continue;
      }

      const maskNum = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;

      if ((ipNum & maskNum) === (networkNum & maskNum)) {
        return true;
      }
    }
  }

  return false;
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) {
      return null;
    }
    result = (result << 8) + num;
  }

  return result >>> 0;
}

/**
 * Validate an API key against the database.
 * Checks key existence, active status, expiry, IP allowlist, and scopes.
 */
export async function validateApiKey(
  adapter: ApiKeyDbAdapter,
  key: string,
  opts?: { checkIp?: string; checkScope?: string },
): Promise<{ valid: boolean; keyId?: string; reason?: string }> {
  const hash = hashApiKey(key);
  const apiKey = await adapter.getApiKeyByHash(hash);

  if (!apiKey) {
    return { valid: false, reason: 'Invalid API key' };
  }

  if (!apiKey.active) {
    return { valid: false, keyId: apiKey.id, reason: 'API key is disabled' };
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false, keyId: apiKey.id, reason: 'API key has expired' };
  }

  if (opts?.checkIp && !isIpAllowed(opts.checkIp, apiKey.ipAllowlist)) {
    return { valid: false, keyId: apiKey.id, reason: 'IP address not allowed' };
  }

  if (opts?.checkScope && apiKey.scopes.length > 0 && !apiKey.scopes.includes(opts.checkScope)) {
    return { valid: false, keyId: apiKey.id, reason: `Scope '${opts.checkScope}' not granted` };
  }

  // Update last used timestamp
  await adapter.updateApiKey(apiKey.id, { lastUsedAt: new Date() });

  return { valid: true, keyId: apiKey.id };
}

/**
 * Create an Express-style middleware for API key validation.
 * Validates the Authorization: Bearer header.
 */
export function createApiKeyMiddleware(
  adapter: ApiKeyDbAdapter,
): (req: { headers: Record<string, string | undefined>; ip?: string }, res: { status(code: number): { json(body: unknown): void } }, next: () => void) => Promise<void> {
  return async (
    req: { headers: Record<string, string | undefined>; ip?: string },
    res: { status(code: number): { json(body: unknown): void } },
    next: () => void,
  ): Promise<void> => {
    const authHeader = req.headers['authorization'] ?? req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const key = authHeader.substring(7);

    const result = await validateApiKey(adapter, key, {
      checkIp: req.ip,
    });

    if (!result.valid) {
      res.status(403).json({ error: result.reason });
      return;
    }

    next();
  };
}

/**
 * Track usage of an API key.
 */
export async function trackApiKeyUsage(
  adapter: ApiKeyDbAdapter,
  keyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime: number,
): Promise<void> {
  await adapter.recordUsage({
    keyId,
    endpoint,
    method,
    statusCode,
    responseTime,
    timestamp: new Date(),
  });
}
