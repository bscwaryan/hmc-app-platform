/**
 * @hmc/feature-flags - Feature flag evaluation service
 *
 * Provides:
 * - Boolean, percentage-based, tenant-specific, and role-based flags
 * - Deterministic percentage rollout (consistent per userId)
 * - In-memory flag store with CRUD operations
 * - Bulk flag evaluation for frontend consumption
 * - Optional default flags on initialization
 */

import { createLogger } from '@hmc/logger';

const logger = createLogger('feature-flags');

// ── Types ───────────────────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  /** Percentage rollout (0-100). Only applies if enabled=true. */
  rolloutPercentage?: number;
  /** If set, only these tenant IDs get the feature */
  allowedTenants?: string[];
  /** If set, only these roles get the feature */
  allowedRoles?: string[];
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** When this flag was last updated */
  updatedAt: Date;
}

export interface FlagEvaluationContext {
  userId?: string;
  tenantId?: string;
  role?: string;
  attributes?: Record<string, unknown>;
}

// ── In-Memory Flag Store ────────────────────────────────────────

const flagStore = new Map<string, FeatureFlag>();

// ── Service Methods ─────────────────────────────────────────────

/**
 * Initialize flags with defaults. Does not overwrite existing flags.
 */
export function initializeFlags(
  defaults?: Omit<FeatureFlag, 'updatedAt'>[],
): void {
  if (defaults) {
    for (const flag of defaults) {
      if (!flagStore.has(flag.key)) {
        flagStore.set(flag.key, { ...flag, updatedAt: new Date() });
      }
    }
  }
  logger.info('Feature flags initialized', { count: flagStore.size });
}

/**
 * Evaluate whether a feature is enabled for a given context.
 */
export function isFeatureEnabled(key: string, context: FlagEvaluationContext = {}): boolean {
  const flag = flagStore.get(key);
  if (!flag) return false;
  if (!flag.enabled) return false;

  // Tenant restriction
  if (flag.allowedTenants && flag.allowedTenants.length > 0) {
    if (!context.tenantId || !flag.allowedTenants.includes(context.tenantId)) {
      return false;
    }
  }

  // Role restriction
  if (flag.allowedRoles && flag.allowedRoles.length > 0) {
    if (!context.role || !flag.allowedRoles.includes(context.role)) {
      return false;
    }
  }

  // Percentage rollout (deterministic by userId for consistency)
  if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
    if (!context.userId) return false;
    const hash = simpleHash(context.userId + key);
    const bucket = hash % 100;
    if (bucket >= flag.rolloutPercentage) return false;
  }

  return true;
}

/**
 * Get all flags (for admin UI).
 */
export function getAllFlags(): FeatureFlag[] {
  return Array.from(flagStore.values());
}

/**
 * Get a single flag by key.
 */
export function getFlag(key: string): FeatureFlag | undefined {
  return flagStore.get(key);
}

/**
 * Update a flag.
 */
export function updateFlag(
  key: string,
  updates: Partial<Omit<FeatureFlag, 'key' | 'updatedAt'>>,
): FeatureFlag | null {
  const existing = flagStore.get(key);
  if (!existing) return null;

  const updated: FeatureFlag = {
    ...existing,
    ...updates,
    key,
    updatedAt: new Date(),
  };
  flagStore.set(key, updated);
  logger.info('Feature flag updated', { key, changes: Object.keys(updates) });
  return updated;
}

/**
 * Create a new flag.
 */
export function createFlag(flag: Omit<FeatureFlag, 'updatedAt'>): FeatureFlag {
  if (flagStore.has(flag.key)) {
    throw new Error(`Feature flag '${flag.key}' already exists`);
  }
  const newFlag: FeatureFlag = { ...flag, updatedAt: new Date() };
  flagStore.set(flag.key, newFlag);
  logger.info('Feature flag created', { key: flag.key });
  return newFlag;
}

/**
 * Delete a flag.
 */
export function deleteFlag(key: string): boolean {
  const deleted = flagStore.delete(key);
  if (deleted) {
    logger.info('Feature flag deleted', { key });
  }
  return deleted;
}

/**
 * Evaluate all flags for a context (for frontend to consume).
 */
export function evaluateAllFlags(context: FlagEvaluationContext = {}): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key] of flagStore) {
    result[key] = isFeatureEnabled(key, context);
  }
  return result;
}

/**
 * Reset all flags (useful for testing).
 */
export function resetFlags(): void {
  flagStore.clear();
}

// ── Helpers ─────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
