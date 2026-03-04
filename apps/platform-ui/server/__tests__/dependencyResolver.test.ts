import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveDependencies } from '../services/dependencyResolver.js';
import type { Feature } from '../types.js';

// ── Mock Catalog ──────────────────────────────────────────────────────────────

const mockCatalog: Feature[] = [
  {
    id: 'F-001',
    name: 'auth',
    displayName: 'Auth',
    description: 'Authentication',
    tier: 0,
    complexity: 'low',
    package: '@hmc/auth',
    status: 'stable',
    bestSource: 'hmc',
    alsoIn: [],
    dependencies: [],
    configRequired: [],
    tags: ['auth'],
    category: 'security',
  },
  {
    id: 'F-002',
    name: 'session',
    displayName: 'Session',
    description: 'Session management',
    tier: 0,
    complexity: 'low',
    package: '@hmc/session',
    status: 'stable',
    bestSource: 'hmc',
    alsoIn: [],
    dependencies: ['F-001'],
    configRequired: [],
    tags: ['session'],
    category: 'security',
  },
  {
    id: 'F-003',
    name: 'rbac',
    displayName: 'RBAC',
    description: 'Role-based access control',
    tier: 1,
    complexity: 'medium',
    package: '@hmc/rbac',
    status: 'stable',
    bestSource: 'hmc',
    alsoIn: [],
    dependencies: ['F-001'],
    configRequired: [],
    tags: ['rbac'],
    category: 'security',
  },
  {
    id: 'F-004',
    name: 'multi-tenant',
    displayName: 'Multi-Tenant',
    description: 'Multi-tenant isolation',
    tier: 1,
    complexity: 'high',
    package: '@hmc/multi-tenant',
    status: 'stable',
    bestSource: 'hmc',
    alsoIn: [],
    dependencies: ['F-001'],
    configRequired: [],
    tags: ['tenant'],
    category: 'platform',
  },
  {
    id: 'F-010',
    name: 'llm',
    displayName: 'LLM Gateway',
    description: 'LLM Gateway for AI',
    tier: 1,
    complexity: 'high',
    package: '@hmc/llm-gateway',
    status: 'stable',
    bestSource: 'hmc',
    alsoIn: [],
    dependencies: ['F-001'],
    configRequired: [],
    tags: ['ai', 'llm'],
    category: 'ai',
  },
  {
    id: 'F-030',
    name: 'council',
    displayName: 'Council',
    description: 'Multi-agent council',
    tier: 2,
    complexity: 'high',
    package: '@hmc/council',
    status: 'beta',
    bestSource: 'hmc',
    alsoIn: [],
    dependencies: ['F-010', 'F-001', 'F-004'],
    configRequired: [],
    tags: ['ai', 'council'],
    category: 'ai',
  },
  // Circular dependency test pair
  {
    id: 'F-100',
    name: 'circular-a',
    displayName: 'Circular A',
    description: 'Circular dependency test A',
    tier: 0,
    complexity: 'low',
    package: '@hmc/circular-a',
    status: 'stable',
    bestSource: 'hmc',
    alsoIn: [],
    dependencies: ['F-101'],
    configRequired: [],
    tags: ['test'],
    category: 'test',
  },
  {
    id: 'F-101',
    name: 'circular-b',
    displayName: 'Circular B',
    description: 'Circular dependency test B',
    tier: 0,
    complexity: 'low',
    package: '@hmc/circular-b',
    status: 'stable',
    bestSource: 'hmc',
    alsoIn: [],
    dependencies: ['F-100'],
    configRequired: [],
    tags: ['test'],
    category: 'test',
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveDependencies', () => {
  it('resolves direct dependencies correctly', () => {
    const result = resolveDependencies(['F-002'], mockCatalog);

    // F-002 (session) depends on F-001 (auth)
    assert.ok(result.resolved.includes('F-002'), 'should include requested feature F-002');
    assert.ok(result.resolved.includes('F-001'), 'should include dependency F-001');
    assert.strictEqual(result.resolved.length, 2, 'should resolve exactly 2 features');
  });

  it('resolves transitive dependencies (A -> B -> C)', () => {
    // F-030 (council) depends on F-010, F-001, F-004
    // F-010 (llm) depends on F-001
    // F-004 (multi-tenant) depends on F-001
    const result = resolveDependencies(['F-030'], mockCatalog);

    assert.ok(result.resolved.includes('F-030'), 'should include F-030 (council)');
    assert.ok(result.resolved.includes('F-010'), 'should include F-010 (llm)');
    assert.ok(result.resolved.includes('F-001'), 'should include F-001 (auth)');
    assert.ok(result.resolved.includes('F-004'), 'should include F-004 (multi-tenant)');
    assert.strictEqual(result.resolved.length, 4, 'should resolve exactly 4 features');
  });

  it('returns empty resolved list for features with no dependencies', () => {
    const result = resolveDependencies(['F-001'], mockCatalog);

    assert.deepStrictEqual(result.resolved, ['F-001']);
    assert.strictEqual(result.tree.length, 1);
    assert.strictEqual(result.tree[0].id, 'F-001');
    assert.strictEqual(result.tree[0].children.length, 0);
  });

  it('handles features that are already in the selected set', () => {
    // Select both F-002 (depends on F-001) and F-001 directly
    const result = resolveDependencies(['F-001', 'F-002'], mockCatalog);

    assert.ok(result.resolved.includes('F-001'));
    assert.ok(result.resolved.includes('F-002'));
    // F-001 should not be duplicated
    const f001Count = result.resolved.filter((id) => id === 'F-001').length;
    assert.strictEqual(f001Count, 1, 'F-001 should appear exactly once in resolved');
  });

  it('detects circular dependencies and throws', () => {
    assert.throws(
      () => resolveDependencies(['F-100'], mockCatalog),
      (err: Error) => {
        assert.ok(
          err.message.includes('Circular dependency'),
          `Expected "Circular dependency" in message, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('returns proper tree structure', () => {
    const result = resolveDependencies(['F-002'], mockCatalog);

    assert.strictEqual(result.tree.length, 1, 'tree should have one root node');

    const root = result.tree[0];
    assert.strictEqual(root.id, 'F-002');
    assert.strictEqual(root.name, 'session');
    assert.strictEqual(root.displayName, 'Session');

    // F-002 depends on F-001, so it should have one child
    assert.strictEqual(root.children.length, 1);
    assert.strictEqual(root.children[0].id, 'F-001');
    assert.strictEqual(root.children[0].name, 'auth');
    assert.strictEqual(root.children[0].children.length, 0);
  });

  it('handles unknown feature IDs gracefully', () => {
    assert.throws(
      () => resolveDependencies(['F-999'], mockCatalog),
      (err: Error) => {
        assert.ok(
          err.message.includes('not found'),
          `Expected "not found" in message, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('resolves multiple features with overlapping dependencies (deduplication)', () => {
    // F-002 depends on F-001, F-003 depends on F-001
    // F-001 should only appear once in resolved
    const result = resolveDependencies(['F-002', 'F-003'], mockCatalog);

    assert.ok(result.resolved.includes('F-001'));
    assert.ok(result.resolved.includes('F-002'));
    assert.ok(result.resolved.includes('F-003'));
    assert.strictEqual(result.resolved.length, 3, 'should have exactly 3 resolved features');

    // Tree should have two root nodes
    assert.strictEqual(result.tree.length, 2);
    assert.strictEqual(result.tree[0].id, 'F-002');
    assert.strictEqual(result.tree[1].id, 'F-003');
  });
});
