import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  checkPermission,
  SYSTEM_ROLES,
  resolveUserPermissions,
  type RoleDefinition,
  type RbacDbAdapter,
  type Permission,
} from '../index.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RBAC', () => {
  describe('SYSTEM_ROLES', () => {
    it('has expected system roles', () => {
      const roleIds = SYSTEM_ROLES.map((r) => r.id);

      assert.ok(roleIds.includes('super_admin'), 'should have super_admin role');
      assert.ok(roleIds.includes('admin'), 'should have admin role');
      assert.ok(roleIds.includes('user'), 'should have user role');
      assert.ok(roleIds.includes('viewer'), 'should have viewer role');
      assert.strictEqual(SYSTEM_ROLES.length, 4, 'should have exactly 4 system roles');
    });

    it('all system roles have isSystem set to true', () => {
      for (const role of SYSTEM_ROLES) {
        assert.strictEqual(role.isSystem, true, `${role.id} should have isSystem=true`);
      }
    });

    it('super_admin has wildcard resource permission', () => {
      const superAdmin = SYSTEM_ROLES.find((r) => r.id === 'super_admin');
      assert.ok(superAdmin, 'super_admin role should exist');
      assert.ok(
        superAdmin.permissions.some((p) => p.resource === '*'),
        'super_admin should have wildcard resource',
      );
    });
  });

  describe('checkPermission()', () => {
    it('returns true when role has matching permission', () => {
      const roles: RoleDefinition[] = [
        {
          id: 'test-role',
          name: 'Test Role',
          permissions: [{ resource: 'users', actions: ['read', 'update'] }],
          isSystem: false,
        },
      ];

      assert.strictEqual(checkPermission(roles, 'users', 'read'), true);
      assert.strictEqual(checkPermission(roles, 'users', 'update'), true);
    });

    it('returns false when role does not have matching permission', () => {
      const roles: RoleDefinition[] = [
        {
          id: 'test-role',
          name: 'Test Role',
          permissions: [{ resource: 'users', actions: ['read'] }],
          isSystem: false,
        },
      ];

      assert.strictEqual(checkPermission(roles, 'users', 'delete'), false);
      assert.strictEqual(checkPermission(roles, 'settings', 'read'), false);
    });

    it('returns true for wildcard resource (*)', () => {
      const superAdminRoles: RoleDefinition[] = [
        {
          id: 'super',
          name: 'Super',
          permissions: [{ resource: '*', actions: ['create', 'read', 'update', 'delete'] }],
          isSystem: true,
        },
      ];

      assert.strictEqual(checkPermission(superAdminRoles, 'anything', 'read'), true);
      assert.strictEqual(checkPermission(superAdminRoles, 'other-resource', 'delete'), true);
    });

    it('returns false for empty roles array', () => {
      assert.strictEqual(checkPermission([], 'users', 'read'), false);
    });

    it('checks across multiple roles', () => {
      const roles: RoleDefinition[] = [
        {
          id: 'role-a',
          name: 'Role A',
          permissions: [{ resource: 'users', actions: ['read'] }],
          isSystem: false,
        },
        {
          id: 'role-b',
          name: 'Role B',
          permissions: [{ resource: 'settings', actions: ['update'] }],
          isSystem: false,
        },
      ];

      assert.strictEqual(checkPermission(roles, 'users', 'read'), true);
      assert.strictEqual(checkPermission(roles, 'settings', 'update'), true);
      assert.strictEqual(checkPermission(roles, 'users', 'delete'), false);
    });
  });

  describe('resolveUserPermissions()', () => {
    it('merges permissions across multiple roles', async () => {
      const mockRoles: RoleDefinition[] = [
        {
          id: 'role-a',
          name: 'Role A',
          permissions: [
            { resource: 'users', actions: ['read'] },
            { resource: 'reports', actions: ['read'] },
          ],
          isSystem: false,
        },
        {
          id: 'role-b',
          name: 'Role B',
          permissions: [
            { resource: 'users', actions: ['create', 'update'] },
            { resource: 'settings', actions: ['read'] },
          ],
          isSystem: false,
        },
      ];

      const mockAdapter: Partial<RbacDbAdapter> = {
        getUserRoles: async (_userId: string) => mockRoles,
      };

      const permissions = await resolveUserPermissions(
        mockAdapter as RbacDbAdapter,
        'user-123',
      );

      // Users resource should have merged actions from both roles
      const usersPerm = permissions.find((p) => p.resource === 'users');
      assert.ok(usersPerm, 'should have users permission');
      assert.ok(usersPerm.actions.includes('read'), 'users should include read');
      assert.ok(usersPerm.actions.includes('create'), 'users should include create');
      assert.ok(usersPerm.actions.includes('update'), 'users should include update');

      // Reports and settings should each have their own permissions
      const reportsPerm = permissions.find((p) => p.resource === 'reports');
      assert.ok(reportsPerm, 'should have reports permission');
      assert.ok(reportsPerm.actions.includes('read'), 'reports should include read');

      const settingsPerm = permissions.find((p) => p.resource === 'settings');
      assert.ok(settingsPerm, 'should have settings permission');
      assert.ok(settingsPerm.actions.includes('read'), 'settings should include read');
    });

    it('deduplicates actions within the same resource', async () => {
      const mockRoles: RoleDefinition[] = [
        {
          id: 'role-a',
          name: 'Role A',
          permissions: [{ resource: 'users', actions: ['read', 'update'] }],
          isSystem: false,
        },
        {
          id: 'role-b',
          name: 'Role B',
          permissions: [{ resource: 'users', actions: ['read', 'delete'] }],
          isSystem: false,
        },
      ];

      const mockAdapter: Partial<RbacDbAdapter> = {
        getUserRoles: async () => mockRoles,
      };

      const permissions = await resolveUserPermissions(
        mockAdapter as RbacDbAdapter,
        'user-123',
      );

      const usersPerm = permissions.find((p) => p.resource === 'users');
      assert.ok(usersPerm, 'should have users permission');

      // 'read' appears in both roles, but should only appear once in the merged result
      const readCount = usersPerm.actions.filter((a) => a === 'read').length;
      assert.strictEqual(readCount, 1, 'read action should not be duplicated');

      // Should have read, update, delete
      assert.strictEqual(usersPerm.actions.length, 3, 'should have exactly 3 unique actions');
    });

    it('returns empty permissions for user with no roles', async () => {
      const mockAdapter: Partial<RbacDbAdapter> = {
        getUserRoles: async () => [],
      };

      const permissions = await resolveUserPermissions(
        mockAdapter as RbacDbAdapter,
        'user-no-roles',
      );

      assert.strictEqual(permissions.length, 0, 'should return empty permissions');
    });
  });
});
