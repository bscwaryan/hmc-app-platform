/**
 * @hmc/rbac - Role-based access control (F-003)
 *
 * Provides:
 * - Custom roles with CRUD permissions per resource
 * - Permission checking across multiple roles
 * - Express-style middleware factory for route protection
 * - System role defaults (super_admin, admin, user, viewer)
 *
 * Uses adapter pattern for database storage (database-agnostic).
 */

// ── Types ───────────────────────────────────────────────────────

export interface Permission {
  resource: string;
  actions: Array<'create' | 'read' | 'update' | 'delete'>;
}

export interface RoleDefinition {
  id: string;
  name: string;
  permissions: Permission[];
  isSystem: boolean;
}

export interface UserRole {
  userId: string;
  roleId: string;
  assignedAt: Date;
  assignedBy: string;
}

export interface RoleAssignment {
  userId: string;
  roleId: string;
  assignedBy: string;
}

// ── Adapter ─────────────────────────────────────────────────────

export interface RbacDbAdapter {
  getRoles(): Promise<RoleDefinition[]>;
  getRoleById(id: string): Promise<RoleDefinition | null>;
  createRole(role: Omit<RoleDefinition, 'id'>): Promise<RoleDefinition>;
  updateRole(id: string, role: Partial<RoleDefinition>): Promise<RoleDefinition>;
  deleteRole(id: string): Promise<void>;
  getUserRoles(userId: string): Promise<RoleDefinition[]>;
  assignRole(userId: string, roleId: string, assignedBy: string): Promise<UserRole>;
  removeRole(userId: string, roleId: string): Promise<void>;
  getRolePermissions(roleId: string): Promise<Permission[]>;
}

// ── System Roles ────────────────────────────────────────────────

export const SYSTEM_ROLES: readonly RoleDefinition[] = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    permissions: [
      { resource: '*', actions: ['create', 'read', 'update', 'delete'] },
    ],
    isSystem: true,
  },
  {
    id: 'admin',
    name: 'Admin',
    permissions: [
      { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'settings', actions: ['read', 'update'] },
      { resource: 'content', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'reports', actions: ['read'] },
    ],
    isSystem: true,
  },
  {
    id: 'user',
    name: 'User',
    permissions: [
      { resource: 'content', actions: ['create', 'read', 'update'] },
      { resource: 'profile', actions: ['read', 'update'] },
    ],
    isSystem: true,
  },
  {
    id: 'viewer',
    name: 'Viewer',
    permissions: [
      { resource: 'content', actions: ['read'] },
      { resource: 'profile', actions: ['read'] },
      { resource: 'reports', actions: ['read'] },
    ],
    isSystem: true,
  },
] as const;

// ── Business Logic ──────────────────────────────────────────────

/**
 * Check if any of the given roles grants the specified action on the resource.
 * Supports wildcard resource '*' for super admin roles.
 */
export function checkPermission(
  userRoles: RoleDefinition[],
  resource: string,
  action: string,
): boolean {
  for (const role of userRoles) {
    for (const permission of role.permissions) {
      if (permission.resource === '*' || permission.resource === resource) {
        if ((permission.actions as string[]).includes(action)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Creates an Express-style middleware factory for permission enforcement.
 * Usage: app.get('/users', requirePermission('users', 'read'))
 */
export function createPermissionMiddleware(
  adapter: RbacDbAdapter,
): (resource: string, action: string) => (req: { userId?: string }, res: { status(code: number): { json(body: unknown): void } }, next: () => void) => Promise<void> {
  return (resource: string, action: string) => {
    return async (
      req: { userId?: string },
      res: { status(code: number): { json(body: unknown): void } },
      next: () => void,
    ): Promise<void> => {
      if (!req.userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const userRoles = await adapter.getUserRoles(req.userId);
      const hasPermission = checkPermission(userRoles, resource, action);

      if (!hasPermission) {
        res.status(403).json({
          error: 'Insufficient permissions',
          required: { resource, action },
        });
        return;
      }

      next();
    };
  };
}

/**
 * Resolve all permissions for a user across all their assigned roles.
 * Merges permissions, deduplicating by resource.
 */
export async function resolveUserPermissions(
  adapter: RbacDbAdapter,
  userId: string,
): Promise<Permission[]> {
  const roles = await adapter.getUserRoles(userId);
  const permissionMap = new Map<string, Set<string>>();

  for (const role of roles) {
    for (const permission of role.permissions) {
      const existing = permissionMap.get(permission.resource);
      if (existing) {
        for (const action of permission.actions) {
          existing.add(action);
        }
      } else {
        permissionMap.set(permission.resource, new Set(permission.actions));
      }
    }
  }

  const merged: Permission[] = [];
  for (const [resource, actions] of permissionMap) {
    merged.push({
      resource,
      actions: Array.from(actions) as Permission['actions'],
    });
  }

  return merged;
}

/**
 * Check if a user has any of the specified role names.
 */
export async function hasAnyRole(
  adapter: RbacDbAdapter,
  userId: string,
  roleNames: string[],
): Promise<boolean> {
  const userRoles = await adapter.getUserRoles(userId);
  return userRoles.some((role) => roleNames.includes(role.name));
}
