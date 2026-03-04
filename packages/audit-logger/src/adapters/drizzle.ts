/**
 * Example Drizzle ORM adapter for @hmc/audit-logger
 *
 * This shows how to implement the AuditLogDbAdapter interface using Drizzle ORM.
 * Copy and customize this for your specific database schema.
 *
 * Prerequisites:
 *   npm install drizzle-orm
 *
 * Usage:
 *   import { initAuditLogger } from '@hmc/audit-logger';
 *   import { createDrizzleAuditLoggerAdapter } from '@hmc/audit-logger/adapters/drizzle';
 *   import { db } from './db';
 *
 *   initAuditLogger(createDrizzleAuditLoggerAdapter(db));
 */

// import { eq, and, gte, lte, like, sql, desc, count } from 'drizzle-orm';
import type { AuditLogDbAdapter, AuditLogEntry, AuditLogFilters } from '../index.js';

// ── Schema References ─────────────────────────────────────────────────────────
// These would be your actual Drizzle table definitions. For example:
//
// import { pgTable, text, uuid, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
//
// export const auditLogs = pgTable('audit_logs', {
//   id: uuid('id').primaryKey().defaultRandom(),
//   requestId: text('request_id').notNull(),
//   userId: text('user_id').notNull(),
//   userEmail: text('user_email'),
//   userDisplayName: text('user_display_name'),
//   tenantId: text('tenant_id'),
//   action: text('action').notNull(),
//   category: text('category').notNull(),
//   riskLevel: text('risk_level').notNull(),
//   resource: text('resource'),
//   resourceId: text('resource_id'),
//   details: jsonb('details'),
//   ipAddress: text('ip_address'),
//   userAgent: text('user_agent'),
//   responseType: text('response_type'),
//   processingTimeMs: integer('processing_time_ms'),
//   createdAt: timestamp('created_at').defaultNow().notNull(),
// });

/**
 * Creates a Drizzle-based AuditLogDbAdapter.
 *
 * @param db - Your Drizzle database instance (e.g., drizzle(pool))
 * @returns An AuditLogDbAdapter implementation backed by Drizzle queries
 *
 * @example
 * ```ts
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { Pool } from 'pg';
 * import { initAuditLogger } from '@hmc/audit-logger';
 * import { createDrizzleAuditLoggerAdapter } from '@hmc/audit-logger/adapters/drizzle';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const db = drizzle(pool);
 *
 * initAuditLogger(createDrizzleAuditLoggerAdapter(db));
 * ```
 */
export function createDrizzleAuditLoggerAdapter(db: any): AuditLogDbAdapter {
  // Replace 'auditLogs' below with your actual imported Drizzle schema table reference.

  return {
    /**
     * Insert a new audit log entry.
     * Should generate an ID and set createdAt automatically.
     */
    async insertLog(entry) {
      // const [inserted] = await db
      //   .insert(auditLogs)
      //   .values({
      //     requestId: entry.requestId,
      //     userId: entry.userId,
      //     userEmail: entry.userEmail,
      //     userDisplayName: entry.userDisplayName,
      //     tenantId: entry.tenantId,
      //     action: entry.action,
      //     category: entry.category,
      //     riskLevel: entry.riskLevel,
      //     resource: entry.resource,
      //     resourceId: entry.resourceId,
      //     details: entry.details,
      //     ipAddress: entry.ipAddress,
      //     userAgent: entry.userAgent,
      //     responseType: entry.responseType,
      //     processingTimeMs: entry.processingTimeMs,
      //   })
      //   .returning();
      // return inserted as AuditLogEntry;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Query audit logs with filtering, pagination, and search.
     * Applies filters for tenantId, userId, category, action, riskLevel,
     * responseType, date range, and free-text search.
     */
    async queryLogs(filters: AuditLogFilters) {
      // let query = db.select().from(auditLogs);
      //
      // // Build WHERE conditions from filters
      // const conditions = [];
      // if (filters.tenantId) conditions.push(eq(auditLogs.tenantId, filters.tenantId));
      // if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
      // if (filters.category) conditions.push(eq(auditLogs.category, filters.category));
      // if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
      // if (filters.riskLevel) conditions.push(eq(auditLogs.riskLevel, filters.riskLevel));
      // if (filters.responseType) conditions.push(eq(auditLogs.responseType, filters.responseType));
      // if (filters.startDate) conditions.push(gte(auditLogs.createdAt, filters.startDate));
      // if (filters.endDate) conditions.push(lte(auditLogs.createdAt, filters.endDate));
      // if (filters.searchQuery) {
      //   conditions.push(like(auditLogs.action, `%${filters.searchQuery}%`));
      // }
      //
      // if (conditions.length > 0) {
      //   query = query.where(and(...conditions));
      // }
      //
      // query = query.orderBy(desc(auditLogs.createdAt));
      //
      // if (filters.limit) query = query.limit(filters.limit);
      // if (filters.offset) query = query.offset(filters.offset);
      //
      // return await query as AuditLogEntry[];
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Retrieve a single audit log by its ID.
     * Optionally scoped to a tenant for multi-tenant isolation.
     */
    async getLogById(id: string, tenantId?: string) {
      // const conditions = [eq(auditLogs.id, id)];
      // if (tenantId) conditions.push(eq(auditLogs.tenantId, tenantId));
      //
      // const [log] = await db
      //   .select()
      //   .from(auditLogs)
      //   .where(and(...conditions))
      //   .limit(1);
      // return (log as AuditLogEntry) ?? null;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Count audit logs matching the given filters.
     * Used for pagination metadata.
     */
    async countLogs(filters: AuditLogFilters) {
      // const conditions = [];
      // if (filters.tenantId) conditions.push(eq(auditLogs.tenantId, filters.tenantId));
      // if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
      // // ... add more filter conditions as in queryLogs
      //
      // let query = db.select({ value: count() }).from(auditLogs);
      // if (conditions.length > 0) {
      //   query = query.where(and(...conditions));
      // }
      //
      // const [result] = await query;
      // return result.value;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Get the count of audit logs grouped by category within a date range.
     * Used for analytics dashboards.
     */
    async getCategoryBreakdown(startDate: Date, endDate: Date, tenantId?: string) {
      // const conditions = [
      //   gte(auditLogs.createdAt, startDate),
      //   lte(auditLogs.createdAt, endDate),
      // ];
      // if (tenantId) conditions.push(eq(auditLogs.tenantId, tenantId));
      //
      // const rows = await db
      //   .select({
      //     category: auditLogs.category,
      //     count: count(),
      //   })
      //   .from(auditLogs)
      //   .where(and(...conditions))
      //   .groupBy(auditLogs.category);
      //
      // const total = rows.reduce((sum, r) => sum + r.count, 0);
      // return rows.map((r) => ({
      //   category: r.category,
      //   count: r.count,
      //   percentage: total > 0 ? (r.count / total) * 100 : 0,
      // }));
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Get the count of audit logs grouped by response type within a date range.
     * Used for analytics dashboards.
     */
    async getResponseTypeBreakdown(startDate: Date, endDate: Date, tenantId?: string) {
      // const conditions = [
      //   gte(auditLogs.createdAt, startDate),
      //   lte(auditLogs.createdAt, endDate),
      // ];
      // if (tenantId) conditions.push(eq(auditLogs.tenantId, tenantId));
      //
      // const rows = await db
      //   .select({
      //     type: auditLogs.responseType,
      //     count: count(),
      //   })
      //   .from(auditLogs)
      //   .where(and(...conditions))
      //   .groupBy(auditLogs.responseType);
      //
      // const total = rows.reduce((sum, r) => sum + r.count, 0);
      // return rows.map((r) => ({
      //   type: r.type ?? 'unknown',
      //   count: r.count,
      //   percentage: total > 0 ? (r.count / total) * 100 : 0,
      // }));
      throw new Error('Not implemented: replace with your Drizzle query');
    },
  };
}
