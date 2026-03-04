/**
 * Example Drizzle ORM adapter for @hmc/notifications
 *
 * This shows how to implement the NotificationDbAdapter interface using Drizzle ORM.
 * Copy and customize this for your specific database schema.
 *
 * Prerequisites:
 *   npm install drizzle-orm
 *
 * Usage:
 *   import { initNotifications } from '@hmc/notifications';
 *   import { createDrizzleNotificationsAdapter } from '@hmc/notifications/adapters/drizzle';
 *   import { db } from './db';
 *
 *   initNotifications({
 *     db: createDrizzleNotificationsAdapter(db),
 *     smtp: { ... },            // optional
 *     teamsWebhookUrl: '...',   // optional
 *   });
 */

// import { eq, and, lt, sql, desc, count } from 'drizzle-orm';
import type { NotificationDbAdapter } from '../index.js';

// ── Schema References ─────────────────────────────────────────────────────────
// These would be your actual Drizzle table definitions. For example:
//
// import { pgTable, text, uuid, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
//
// export const notifications = pgTable('notifications', {
//   id: uuid('id').primaryKey(),
//   userId: uuid('user_id').references(() => users.id),
//   tenantId: uuid('tenant_id').references(() => tenants.id),
//   type: text('type').notNull(),
//   title: text('title').notNull(),
//   message: text('message').notNull(),
//   channel: text('channel').default('in_app'),
//   relatedEntityType: text('related_entity_type'),
//   relatedEntityId: text('related_entity_id'),
//   metadata: jsonb('metadata'),
//   isRead: boolean('is_read').notNull().default(false),
//   expiresAt: timestamp('expires_at'),
//   createdAt: timestamp('created_at').defaultNow().notNull(),
// });
//
// export const users = pgTable('users', {
//   id: uuid('id').primaryKey(),
//   email: text('email').notNull(),
//   displayName: text('display_name'),
//   role: text('role').notNull(),
// });
//
// export const tenantMembers = pgTable('tenant_members', {
//   userId: uuid('user_id').notNull(),
//   tenantId: uuid('tenant_id').notNull(),
//   role: text('role').notNull(),
//   isActive: boolean('is_active').notNull().default(true),
// });

/**
 * Creates a Drizzle-based NotificationDbAdapter.
 *
 * @param db - Your Drizzle database instance (e.g., drizzle(pool))
 * @returns A NotificationDbAdapter implementation backed by Drizzle queries
 *
 * @example
 * ```ts
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { Pool } from 'pg';
 * import { initNotifications } from '@hmc/notifications';
 * import { createDrizzleNotificationsAdapter } from '@hmc/notifications/adapters/drizzle';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const db = drizzle(pool);
 *
 * initNotifications({ db: createDrizzleNotificationsAdapter(db) });
 * ```
 */
export function createDrizzleNotificationsAdapter(db: any): NotificationDbAdapter {
  // Replace 'notifications', 'users', 'tenantMembers' below with your actual
  // imported Drizzle schema table references.

  return {
    /**
     * Persist a new notification to the database.
     * The ID is provided by the caller (generated via crypto.randomUUID()).
     */
    async createNotification(input) {
      // await db.insert(notifications).values({
      //   id: input.id,
      //   userId: input.userId,
      //   tenantId: input.tenantId,
      //   type: input.type,
      //   title: input.title,
      //   message: input.message,
      //   channel: input.channel ?? 'in_app',
      //   relatedEntityType: input.relatedEntityType,
      //   relatedEntityId: input.relatedEntityId,
      //   metadata: input.metadata,
      //   expiresAt: input.expiresAt,
      // });
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Look up a user's email address by their user ID.
     * Used for sending email notifications.
     */
    async getUserEmail(userId: string) {
      // const [user] = await db
      //   .select({ email: users.email })
      //   .from(users)
      //   .where(eq(users.id, userId))
      //   .limit(1);
      // return user?.email ?? null;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Get the user IDs of all admin-role members of a tenant.
     * Used by notifyAdmins() to broadcast to tenant administrators.
     */
    async getAdminUserIds(tenantId: string) {
      // const rows = await db
      //   .select({ userId: tenantMembers.userId })
      //   .from(tenantMembers)
      //   .where(
      //     and(
      //       eq(tenantMembers.tenantId, tenantId),
      //       eq(tenantMembers.role, 'admin'),
      //       eq(tenantMembers.isActive, true),
      //     ),
      //   );
      // return rows.map((r) => r.userId);
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Fetch notifications for a user with pagination and optional unread-only filter.
     * Returns the notification list, total count, and unread count.
     */
    async getNotifications(userId: string, options) {
      // const conditions = [eq(notifications.userId, userId)];
      // if (options.unreadOnly) {
      //   conditions.push(eq(notifications.isRead, false));
      // }
      //
      // const [totalResult] = await db
      //   .select({ value: count() })
      //   .from(notifications)
      //   .where(and(...conditions));
      //
      // const [unreadResult] = await db
      //   .select({ value: count() })
      //   .from(notifications)
      //   .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
      //
      // let query = db
      //   .select()
      //   .from(notifications)
      //   .where(and(...conditions))
      //   .orderBy(desc(notifications.createdAt));
      //
      // if (options.limit) query = query.limit(options.limit);
      // if (options.offset) query = query.offset(options.offset);
      //
      // const rows = await query;
      // return {
      //   notifications: rows,
      //   total: totalResult.value,
      //   unreadCount: unreadResult.value,
      // };
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Mark a single notification as read.
     * Scoped to the owning user for security.
     */
    async markAsRead(notificationId: string, userId: string) {
      // await db
      //   .update(notifications)
      //   .set({ isRead: true })
      //   .where(
      //     and(
      //       eq(notifications.id, notificationId),
      //       eq(notifications.userId, userId),
      //     ),
      //   );
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Mark all of a user's notifications as read.
     * Returns the number of notifications that were updated.
     */
    async markAllAsRead(userId: string) {
      // const result = await db
      //   .update(notifications)
      //   .set({ isRead: true })
      //   .where(
      //     and(
      //       eq(notifications.userId, userId),
      //       eq(notifications.isRead, false),
      //     ),
      //   );
      // return result.rowCount ?? 0;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Delete a notification by ID, scoped to the owning user.
     */
    async deleteNotification(notificationId: string, userId: string) {
      // await db
      //   .delete(notifications)
      //   .where(
      //     and(
      //       eq(notifications.id, notificationId),
      //       eq(notifications.userId, userId),
      //     ),
      //   );
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Remove all notifications whose expiresAt timestamp has passed.
     * Returns the number of expired notifications that were deleted.
     * Typically called on a scheduled interval (e.g., daily cron).
     */
    async cleanupExpired() {
      // const result = await db
      //   .delete(notifications)
      //   .where(lt(notifications.expiresAt, new Date()));
      // return result.rowCount ?? 0;
      throw new Error('Not implemented: replace with your Drizzle query');
    },

    /**
     * Get the count of unread notifications for a user.
     * Used for badge counts in the UI.
     */
    async getUnreadCount(userId: string) {
      // const [result] = await db
      //   .select({ value: count() })
      //   .from(notifications)
      //   .where(
      //     and(
      //       eq(notifications.userId, userId),
      //       eq(notifications.isRead, false),
      //     ),
      //   );
      // return result.value;
      throw new Error('Not implemented: replace with your Drizzle query');
    },
  };
}
