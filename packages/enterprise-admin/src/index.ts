// F-064: Enterprise Admin
// Delegated admin roles, config management, service health monitoring.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DelegatedAdmin {
  userId: string;
  scope: string[];
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
}

export interface ConfigSnapshot {
  id: string;
  tenantId: string;
  name: string;
  config: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  description?: string;
}

export interface ConfigChange {
  id: string;
  tenantId: string;
  path: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastChecked: string;
  details?: Record<string, unknown>;
}

export interface HealthCheck {
  name: string;
  check: () => Promise<{ healthy: boolean; latencyMs: number; details?: Record<string, unknown> }>;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface AdminDbAdapter {
  getDelegatedAdmins(tenantId: string): Promise<DelegatedAdmin[]>;
  grantDelegatedAdmin(admin: DelegatedAdmin): Promise<DelegatedAdmin>;
  revokeDelegatedAdmin(userId: string, scope: string): Promise<void>;
  getConfigSnapshots(tenantId: string): Promise<ConfigSnapshot[]>;
  createSnapshot(snapshot: ConfigSnapshot): Promise<ConfigSnapshot>;
  getConfigHistory(tenantId: string, path?: string): Promise<ConfigChange[]>;
  logConfigChange(change: ConfigChange): Promise<void>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const HEALTH_CHECK_TIMEOUT_MS = 5000;

// ─── Health Check Registry ───────────────────────────────────────────────────

const healthChecks: Map<string, HealthCheck> = new Map();

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Checks if a user is a delegated admin with the required scope.
 */
export async function isDelegatedAdmin(
  adapter: AdminDbAdapter,
  userId: string,
  requiredScope: string
): Promise<boolean> {
  const admins = await adapter.getDelegatedAdmins('');

  const admin = admins.find((a) => a.userId === userId);
  if (!admin) {
    return false;
  }

  // Check expiration
  if (admin.expiresAt) {
    const expiresAt = new Date(admin.expiresAt);
    if (expiresAt <= new Date()) {
      return false;
    }
  }

  // Check if the required scope is in the admin's scope list
  // Support wildcard scopes like 'admin.*'
  return admin.scope.some((scope) => {
    if (scope === '*') return true;
    if (scope === requiredScope) return true;
    if (scope.endsWith('.*')) {
      const prefix = scope.slice(0, -2);
      return requiredScope.startsWith(prefix);
    }
    return false;
  });
}

/**
 * Creates a snapshot of the current configuration.
 */
export async function createConfigSnapshot(
  adapter: AdminDbAdapter,
  tenantId: string,
  name: string,
  config: Record<string, unknown>,
  createdBy: string
): Promise<ConfigSnapshot> {
  const snapshot: ConfigSnapshot = {
    id: `snap_${Date.now()}`,
    tenantId,
    name,
    config,
    createdBy,
    createdAt: new Date().toISOString(),
  };

  return adapter.createSnapshot(snapshot);
}

/**
 * Performs a deep diff between two config objects, returning a list of changes.
 */
export function diffConfigs(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  basePath: string = '',
  tenantId: string = '',
  changedBy: string = ''
): ConfigChange[] {
  const changes: ConfigChange[] = [];

  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    const currentPath = basePath ? `${basePath}.${key}` : key;
    const oldValue = a[key];
    const newValue = b[key];

    if (oldValue === newValue) {
      continue;
    }

    if (
      typeof oldValue === 'object' &&
      typeof newValue === 'object' &&
      oldValue !== null &&
      newValue !== null &&
      !Array.isArray(oldValue) &&
      !Array.isArray(newValue)
    ) {
      // Recurse into nested objects
      const nestedChanges = diffConfigs(
        oldValue as Record<string, unknown>,
        newValue as Record<string, unknown>,
        currentPath,
        tenantId,
        changedBy
      );
      changes.push(...nestedChanges);
    } else {
      changes.push({
        id: `chg_${Date.now()}_${key}`,
        tenantId,
        path: currentPath,
        oldValue,
        newValue,
        changedBy,
        changedAt: new Date().toISOString(),
      });
    }
  }

  return changes;
}

/**
 * Registers a health check with the given name and check function.
 */
export function registerHealthCheck(
  name: string,
  check: HealthCheck['check']
): void {
  healthChecks.set(name, { name, check });
}

/**
 * Runs all registered health checks in parallel with a timeout.
 */
export async function runHealthChecks(): Promise<ServiceHealth[]> {
  const checks = Array.from(healthChecks.values());

  const results = await Promise.all(
    checks.map(async (hc): Promise<ServiceHealth> => {
      try {
        const result = await Promise.race([
          hc.check(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timed out')), HEALTH_CHECK_TIMEOUT_MS)
          ),
        ]);

        return {
          name: hc.name,
          status: result.healthy ? 'healthy' : 'unhealthy',
          latencyMs: result.latencyMs,
          lastChecked: new Date().toISOString(),
          details: result.details,
        };
      } catch (error) {
        return {
          name: hc.name,
          status: 'unknown',
          latencyMs: HEALTH_CHECK_TIMEOUT_MS,
          lastChecked: new Date().toISOString(),
          details: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    })
  );

  return results;
}

/**
 * Returns the overall health status based on the worst-of aggregate.
 */
export function getOverallHealth(
  services: ServiceHealth[]
): 'healthy' | 'degraded' | 'unhealthy' {
  if (services.length === 0) {
    return 'healthy';
  }

  const statusPriority: Record<string, number> = {
    healthy: 0,
    degraded: 1,
    unknown: 2,
    unhealthy: 3,
  };

  let worstPriority = 0;

  for (const service of services) {
    const priority = statusPriority[service.status] ?? 0;
    if (priority > worstPriority) {
      worstPriority = priority;
    }
  }

  if (worstPriority >= 3) return 'unhealthy';
  if (worstPriority >= 1) return 'degraded';
  return 'healthy';
}
