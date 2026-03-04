/**
 * Example Drizzle ORM adapter for @hmc/auth
 *
 * This shows how to implement the AuthDbAdapter interface using Drizzle ORM.
 * Copy and customize this for your specific database schema.
 *
 * Prerequisites:
 *   npm install drizzle-orm
 *
 * Usage:
 *   import { initAuth } from '@hmc/auth';
 *   import { createDrizzleAuthAdapter } from '@hmc/auth/adapters/drizzle';
 *   import { db } from './db';
 *
 *   initAuth(createDrizzleAuthAdapter(db));
 */

// import { eq, and } from 'drizzle-orm';
import type { AuthDbAdapter } from '../middleware.js';

// ── Schema References ─────────────────────────────────────────────────────────
// These would be your actual Drizzle table definitions. For example:
//
// import { pgTable, text, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';
//
// export const users = pgTable('users', {
//   id: uuid('id').primaryKey().defaultRandom(),
//   email: text('email').notNull().unique(),
//   displayName: text('display_name'),
//   role: text('role').notNull().default('user'),
//   isActive: boolean('is_active').notNull().default(true),
//   tenantId: uuid('tenant_id').references(() => tenants.id),
//   createdAt: timestamp('created_at').defaultNow(),
// });
//
// export const tenantMembers = pgTable('tenant_members', {
//   userId: uuid('user_id').notNull().references(() => users.id),
//   tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
//   role: text('role').notNull().default('member'),
//   isActive: boolean('is_active').notNull().default(true),
// });
//
// export const tenants = pgTable('tenants', {
//   id: uuid('id').primaryKey().defaultRandom(),
//   name: text('name').notNull(),
//   isActive: boolean('is_active').notNull().default(true),
// });
//
// export const auditLogs = pgTable('audit_logs', {
//   id: uuid('id').primaryKey().defaultRandom(),
//   tenantId: uuid('tenant_id').notNull(),
//   userId: uuid('user_id').notNull(),
//   action: text('action').notNull(),
//   resourceType: text('resource_type').notNull(),
//   resourceId: text('resource_id').notNull(),
//   newValues: jsonb('new_values'),
//   ipAddress: text('ip_address'),
//   userAgent: text('user_agent'),
//   createdAt: timestamp('created_at').defaultNow(),
// });

/**
 * Creates a Drizzle-based AuthDbAdapter.
 *
 * @param db - Your Drizzle database instance (e.g., drizzle(pool))
 * @returns An AuthDbAdapter implementation backed by Drizzle queries
 *
 * @example
 * ```ts
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { Pool } from 'pg';
 * import { initAuth } from '@hmc/auth';
 * import { createDrizzleAuthAdapter } from '@hmc/auth/adapters/drizzle';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const db = drizzle(pool);
 *
 * initAuth(createDrizzleAuthAdapter(db));
 * ```
 */
export function createDrizzleAuthAdapter(db: any): AuthDbAdapter {
  // Replace 'users', 'tenantMembers', 'tenants', 'auditLogs' below with
  // your actual imported Drizzle schema table references.

  return {
    /**
     * Look up a user by their primary key ID.
     * Used by all auth middleware to validate the session user.
     */
    async findUserById(id: string) {
      // const [user] = await db
      //   .select({
      //     id: users.id,
      //     email: users.email,
      //     displayName: users.displayName,
      //     role: users.role,
      //     isActive: users.isActive,
      //     tenantId: users.tenantId,
      //   })
      //   .from(users)
      //   .where(eq(users.id, id))
      //   .limit(1);
      // return user ?? null;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Check whether a user is an active member of a specific tenant.
     * Returns the membership role and active status.
     * Used by requireTenantAuth, requireTenantAdmin, requireTenantOwner.
     */
    async findTenantMembership(userId: string, tenantId: string) {
      // const [membership] = await db
      //   .select({
      //     role: tenantMembers.role,
      //     isActive: tenantMembers.isActive,
      //   })
      //   .from(tenantMembers)
      //   .where(
      //     and(
      //       eq(tenantMembers.userId, userId),
      //       eq(tenantMembers.tenantId, tenantId),
      //     ),
      //   )
      //   .limit(1);
      // return membership ?? null;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Find the first active tenant a user belongs to.
     * Fallback when no tenant is resolved from subdomain or user record.
     */
    async findFirstActiveTenantForUser(userId: string) {
      // const [membership] = await db
      //   .select({
      //     tenantId: tenantMembers.tenantId,
      //     role: tenantMembers.role,
      //   })
      //   .from(tenantMembers)
      //   .where(eq(tenantMembers.userId, userId))
      //   .limit(1);
      // return membership ?? null;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Find any active tenant in the system.
     * Last-resort fallback for tenant resolution.
     */
    async findFirstActiveTenant() {
      // const [tenant] = await db
      //   .select({ id: tenants.id })
      //   .from(tenants)
      //   .where(eq(tenants.isActive, true))
      //   .limit(1);
      // return tenant ?? null;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Write an audit log entry for superadmin impersonation events.
     * This is optional -- if not provided, impersonation will still work
     * but won't be persisted to the database.
     */
    async logAudit(entry) {
      // await db.insert(auditLogs).values({
      //   tenantId: entry.tenantId,
      //   userId: entry.userId,
      //   action: entry.action,
      //   resourceType: entry.resourceType,
      //   resourceId: entry.resourceId,
      //   newValues: entry.newValues,
      //   ipAddress: entry.ipAddress,
      //   userAgent: entry.userAgent,
      // });
      throw new Error('Not implemented: replace with your Drizzle query');
    },
  };
}
