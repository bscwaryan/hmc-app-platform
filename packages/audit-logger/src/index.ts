/**
 * @hmc/audit-logger - Compliance audit logging with analytics
 *
 * Provides:
 * - Structured audit log entries with tenant isolation
 * - Filtered queries with pagination
 * - Category and response-type breakdowns for analytics
 * - Recent query history per user
 *
 * Uses adapter pattern for database storage (database-agnostic).
 */

import { createLogger } from '@hmc/logger';

const logger = createLogger('audit-logger');

// ── Types ───────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  requestId: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string | null;
  tenantId: string | null;
  action: string;
  category: string;
  riskLevel: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  responseType?: string;
  processingTimeMs?: number;
  createdAt: Date;
}

export interface AuditLogFilters {
  tenantId?: string;
  userId?: string;
  category?: string;
  action?: string;
  riskLevel?: string;
  responseType?: string;
  startDate?: Date;
  endDate?: Date;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogDbAdapter {
  insertLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry>;
  queryLogs(filters: AuditLogFilters): Promise<AuditLogEntry[]>;
  getLogById(id: string, tenantId?: string): Promise<AuditLogEntry | null>;
  countLogs(filters: AuditLogFilters): Promise<number>;
  getCategoryBreakdown(
    startDate: Date,
    endDate: Date,
    tenantId?: string,
  ): Promise<Array<{ category: string; count: number; percentage: number }>>;
  getResponseTypeBreakdown(
    startDate: Date,
    endDate: Date,
    tenantId?: string,
  ): Promise<Array<{ type: string; count: number; percentage: number }>>;
}

// ── Service ─────────────────────────────────────────────────────

let dbAdapter: AuditLogDbAdapter | null = null;

export function initAuditLogger(adapter: AuditLogDbAdapter): void {
  dbAdapter = adapter;
  logger.info('Audit logger initialized');
}

function getAdapter(): AuditLogDbAdapter {
  if (!dbAdapter) {
    throw new Error('Audit logger not initialized. Call initAuditLogger() first.');
  }
  return dbAdapter;
}

/**
 * Log an audit event.
 */
export async function logAudit(
  entry: Omit<AuditLogEntry, 'id' | 'createdAt'>,
): Promise<AuditLogEntry> {
  const adapter = getAdapter();
  const result = await adapter.insertLog(entry);
  logger.debug('Audit event logged', {
    action: entry.action,
    category: entry.category,
    userId: entry.userId,
    tenantId: entry.tenantId,
  });
  return result;
}

/**
 * Query audit logs with filters and pagination.
 */
export async function getAuditLogs(
  filters: AuditLogFilters,
): Promise<AuditLogEntry[]> {
  return getAdapter().queryLogs(filters);
}

/**
 * Get a single audit log by ID.
 */
export async function getAuditLogById(
  id: string,
  tenantId?: string,
): Promise<AuditLogEntry | null> {
  return getAdapter().getLogById(id, tenantId);
}

/**
 * Count audit logs matching filters.
 */
export async function getAuditLogCount(
  filters: AuditLogFilters,
): Promise<number> {
  return getAdapter().countLogs(filters);
}

/**
 * Get recent queries for a specific user.
 */
export async function getRecentQueries(
  userId: string,
  tenantId?: string,
  limit: number = 10,
): Promise<AuditLogEntry[]> {
  return getAuditLogs({ userId, tenantId, limit });
}

/**
 * Get category breakdown for analytics.
 */
export async function getCategoryBreakdown(
  startDate: Date,
  endDate: Date,
  tenantId?: string,
): Promise<Array<{ category: string; count: number; percentage: number }>> {
  return getAdapter().getCategoryBreakdown(startDate, endDate, tenantId);
}

/**
 * Get response type breakdown for analytics.
 */
export async function getResponseTypeBreakdown(
  startDate: Date,
  endDate: Date,
  tenantId?: string,
): Promise<Array<{ type: string; count: number; percentage: number }>> {
  return getAdapter().getResponseTypeBreakdown(startDate, endDate, tenantId);
}
