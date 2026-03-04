/**
 * @hmc/multi-tenant - Multi-tenancy middleware and utilities
 *
 * Provides:
 * - Tenant context resolution (header → subdomain → custom domain → session)
 * - Subscription status validation (active, trial, suspended, cancelled)
 * - Feature gating per tenant
 * - Subscription tier enforcement
 * - Static asset bypass
 *
 * Uses adapter pattern for tenant lookups (database-agnostic).
 */

import { createLogger } from '@hmc/logger';
import type { RequestHandler } from 'express';

const logger = createLogger('multi-tenant');

// ── Types ───────────────────────────────────────────────────────

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  isolationMode: 'shared' | 'dedicated_schema' | 'dedicated_db';
  verticalType: string;
  enabledFeatures: Record<string, boolean>;
  maxUsers: number;
  maxTokensPerMonth: number;
  maxStorageMb: number;
}

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  isolationMode: string;
  verticalType: string;
  enabledFeatures: Record<string, boolean> | null;
  maxUsers: number;
  maxTokensPerMonth: number;
  maxStorageMb: number;
  trialEndsAt?: Date | null;
}

export interface TenantDbAdapter {
  findTenantById(id: string): Promise<TenantRecord | null>;
  findTenantBySlug(slug: string): Promise<TenantRecord | null>;
  findTenantByCustomDomain(domain: string): Promise<{ tenantId: string; verified: boolean } | null>;
}

export interface MultiTenantConfig {
  /** Known app domains for subdomain extraction (e.g., ['myapp.com', 'myapp.app']) */
  appDomains: string[];
  /** Main app hostnames that should NOT resolve to a tenant (e.g., ['app.myapp.com', 'www.myapp.com']) */
  mainAppHostnames?: string[];
  /** Default features for new tenants */
  defaultFeatures?: Record<string, boolean>;
}

// ── Augment Express Request ─────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

// ── Service State ───────────────────────────────────────────────

let tenantAdapter: TenantDbAdapter | null = null;
let config: MultiTenantConfig = { appDomains: [] };

/**
 * Initialize multi-tenant middleware with a DB adapter and config.
 */
export function initMultiTenant(adapter: TenantDbAdapter, cfg: MultiTenantConfig): void {
  tenantAdapter = adapter;
  config = cfg;
  logger.info('Multi-tenant middleware initialized', { appDomains: cfg.appDomains });
}

function getAdapter(): TenantDbAdapter {
  if (!tenantAdapter) {
    throw new Error('Multi-tenant not initialized. Call initMultiTenant() first.');
  }
  return tenantAdapter;
}

// ── Subdomain Extraction ────────────────────────────────────────

function extractSubdomain(host: string): string | null {
  const hostname = host.split(':')[0];
  const parts = hostname.split('.');

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  // Skip main app hostnames
  const mainHosts = config.mainAppHostnames || [];
  if (mainHosts.includes(hostname)) {
    return null;
  }

  // For subdomains like "tenant.myapp.com" (3+ parts, ending in known domain)
  if (parts.length >= 3) {
    const domain = parts.slice(-2).join('.');
    if (config.appDomains.some(d => domain.endsWith(d))) {
      return parts[0];
    }
  }

  return null;
}

// ── Static Asset Check ──────────────────────────────────────────

const STATIC_EXTENSIONS = ['.js', '.css', '.map', '.png', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.jpg', '.jpeg', '.gif', '.webp'];
const STATIC_PREFIXES = ['/assets/', '/static/', '/favicon.ico'];

function isStaticAsset(path: string): boolean {
  if (STATIC_PREFIXES.some(prefix => path.startsWith(prefix))) return true;
  if (STATIC_EXTENSIONS.some(ext => path.endsWith(ext))) return true;
  return false;
}

// ── Middleware ───────────────────────────────────────────────────

/**
 * Middleware to extract and validate tenant context from the request.
 *
 * Resolution order:
 * 1. X-Tenant-ID header (for API access)
 * 2. Subdomain (e.g., tenant.myapp.com)
 * 3. Custom domain lookup
 * 4. Continue without tenant context (platform routes, public pages)
 */
export function createTenantMiddleware(): RequestHandler {
  return async (req, res, next) => {
    try {
      // Skip tenant resolution for static assets
      if (isStaticAsset(req.path)) {
        return next();
      }

      const adapter = getAdapter();
      let tenantId: string | null = null;
      let tenantSlug: string | null = null;

      // 1. Check X-Tenant-ID header
      const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
      if (headerTenantId) {
        tenantId = headerTenantId;
      }

      // 2. Check subdomain
      if (!tenantId) {
        const host = req.headers.host || '';
        tenantSlug = extractSubdomain(host);
      }

      // 3. Check custom domain
      if (!tenantId && !tenantSlug) {
        const host = req.headers.host?.split(':')[0] || '';
        const skipDomains = ['localhost', '127.0.0.1', ...(config.mainAppHostnames || [])];
        const isSkip = skipDomains.includes(host) ||
          host.endsWith('.replit.app') || host.endsWith('.replit.dev');

        if (!isSkip) {
          try {
            const customDomain = await adapter.findTenantByCustomDomain(host);
            if (customDomain && customDomain.verified) {
              tenantId = customDomain.tenantId;
            }
          } catch (err) {
            logger.warn('Custom domain lookup failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // No tenant identifier found — continue without tenant context
      if (!tenantId && !tenantSlug) {
        return next();
      }

      // Look up tenant
      let tenant: TenantRecord | null = null;
      if (tenantId) {
        tenant = await adapter.findTenantById(tenantId);
      } else if (tenantSlug) {
        tenant = await adapter.findTenantBySlug(tenantSlug);
      }

      if (!tenant) {
        return res.status(404).json({
          error: 'Tenant not found',
          message: 'The requested organization could not be found.',
        });
      }

      // Check subscription status
      if (tenant.subscriptionStatus === 'suspended') {
        return res.status(403).json({
          error: 'Account suspended',
          message: "This organization's account has been suspended. Please contact support.",
        });
      }

      if (tenant.subscriptionStatus === 'cancelled') {
        return res.status(403).json({
          error: 'Account cancelled',
          message: "This organization's account has been cancelled.",
        });
      }

      if (tenant.subscriptionStatus === 'trial' && tenant.trialEndsAt) {
        if (new Date(tenant.trialEndsAt) < new Date()) {
          return res.status(403).json({
            error: 'Trial expired',
            message: "This organization's trial has expired. Please upgrade to continue.",
          });
        }
      }

      const defaultFeatures = config.defaultFeatures || {};

      // Attach tenant context to request
      req.tenant = {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        subscriptionTier: tenant.subscriptionTier,
        subscriptionStatus: tenant.subscriptionStatus,
        isolationMode: tenant.isolationMode as TenantContext['isolationMode'],
        verticalType: tenant.verticalType,
        enabledFeatures: tenant.enabledFeatures || defaultFeatures,
        maxUsers: tenant.maxUsers,
        maxTokensPerMonth: tenant.maxTokensPerMonth,
        maxStorageMb: tenant.maxStorageMb,
      };

      next();
    } catch (error) {
      logger.error('Tenant context error', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to resolve tenant context.',
      });
    }
  };
}

/**
 * Middleware that requires a tenant context to be present.
 */
export const requireTenant: RequestHandler = (req, res, next) => {
  if (!req.tenant) {
    return res.status(400).json({
      error: 'Tenant required',
      message: 'This endpoint requires a tenant context. Access via subdomain or provide X-Tenant-ID header.',
    });
  }
  next();
};

/**
 * Middleware to check if a specific feature is enabled for the tenant.
 */
export function requireTenantFeature(feature: string): RequestHandler {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(400).json({
        error: 'Tenant required',
        message: 'This endpoint requires a tenant context.',
      });
    }

    if (!req.tenant.enabledFeatures[feature]) {
      return res.status(403).json({
        error: 'Feature not available',
        message: `The "${feature}" feature is not enabled for this organization. Please upgrade your plan.`,
      });
    }

    next();
  };
}

/**
 * Middleware to check subscription tier.
 */
export function requireSubscriptionTier(...allowedTiers: string[]): RequestHandler {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(400).json({
        error: 'Tenant required',
        message: 'This endpoint requires a tenant context.',
      });
    }

    if (!allowedTiers.includes(req.tenant.subscriptionTier)) {
      return res.status(403).json({
        error: 'Upgrade required',
        message: `This feature requires one of the following plans: ${allowedTiers.join(', ')}.`,
      });
    }

    next();
  };
}
