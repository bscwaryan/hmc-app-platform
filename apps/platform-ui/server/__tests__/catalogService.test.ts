import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import {
  getAllFeatures,
  getFeatureById,
  getFeaturesByTier,
  searchFeatures,
  getCatalogStats,
  reloadCatalog,
} from '../services/catalogService.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('catalogService', () => {
  before(() => {
    // Force a fresh reload of the catalog for each test suite run
    reloadCatalog();
  });

  describe('getAllFeatures()', () => {
    it('returns all features as an array', () => {
      const features = getAllFeatures();

      assert.ok(Array.isArray(features), 'should return an array');
      assert.ok(features.length > 0, 'should have at least one feature');
    });

    it('each feature has required fields', () => {
      const features = getAllFeatures();

      for (const feature of features) {
        assert.ok(typeof feature.id === 'string', `feature.id should be string, got ${typeof feature.id}`);
        assert.ok(typeof feature.name === 'string', `feature.name should be string`);
        assert.ok(typeof feature.displayName === 'string', `feature.displayName should be string`);
        assert.ok(typeof feature.description === 'string', `feature.description should be string`);
        assert.ok(typeof feature.tier === 'number', `feature.tier should be number`);
        assert.ok(Array.isArray(feature.dependencies), `feature.dependencies should be array`);
        assert.ok(Array.isArray(feature.tags), `feature.tags should be array`);
        assert.ok(typeof feature.category === 'string', `feature.category should be string`);
      }
    });
  });

  describe('getFeatureById()', () => {
    it('returns the correct feature for a known ID', () => {
      const features = getAllFeatures();
      const firstFeature = features[0];

      const found = getFeatureById(firstFeature.id);
      assert.ok(found, 'should find the feature');
      assert.strictEqual(found.id, firstFeature.id);
      assert.strictEqual(found.name, firstFeature.name);
    });

    it('returns undefined for an unknown ID', () => {
      const found = getFeatureById('F-DOES-NOT-EXIST-999');
      assert.strictEqual(found, undefined, 'should return undefined for unknown ID');
    });
  });

  describe('getFeaturesByTier()', () => {
    it('filters correctly by tier', () => {
      const allFeatures = getAllFeatures();

      // Find tiers that exist in the catalog
      const tiers = [...new Set(allFeatures.map((f) => f.tier))];
      assert.ok(tiers.length > 0, 'catalog should have at least one tier');

      for (const tier of tiers) {
        const filtered = getFeaturesByTier(tier);
        const expectedCount = allFeatures.filter((f) => f.tier === tier).length;

        assert.strictEqual(
          filtered.length,
          expectedCount,
          `tier ${tier} should have ${expectedCount} features`,
        );

        for (const feature of filtered) {
          assert.strictEqual(feature.tier, tier, `all features should be tier ${tier}`);
        }
      }
    });

    it('returns empty array for non-existent tier', () => {
      const filtered = getFeaturesByTier(999);
      assert.strictEqual(filtered.length, 0, 'should return empty array for non-existent tier');
    });
  });

  describe('searchFeatures()', () => {
    it('matches by name', () => {
      const allFeatures = getAllFeatures();
      const target = allFeatures[0];

      const results = searchFeatures(target.name);
      assert.ok(results.length >= 1, 'should find at least one result');
      assert.ok(
        results.some((f) => f.id === target.id),
        `should include ${target.id} in results`,
      );
    });

    it('matches by description', () => {
      const allFeatures = getAllFeatures();
      // Find a feature with a non-empty description
      const target = allFeatures.find((f) => f.description.length > 5);
      assert.ok(target, 'should have a feature with a description');

      // Use a substring of the description
      const searchTerm = target.description.slice(0, 8);
      const results = searchFeatures(searchTerm);
      assert.ok(results.length >= 1, 'should find at least one result by description');
    });

    it('matches by tags', () => {
      const allFeatures = getAllFeatures();
      // Find a feature with at least one tag
      const target = allFeatures.find((f) => f.tags.length > 0);
      assert.ok(target, 'should have a feature with tags');

      const tag = target.tags[0];
      const results = searchFeatures(tag);
      assert.ok(results.length >= 1, 'should find at least one result by tag');
      assert.ok(
        results.some((f) => f.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))),
        'results should contain matching tag',
      );
    });

    it('is case-insensitive', () => {
      const allFeatures = getAllFeatures();
      const target = allFeatures[0];

      const lowerResults = searchFeatures(target.name.toLowerCase());
      const upperResults = searchFeatures(target.name.toUpperCase());

      assert.strictEqual(
        lowerResults.length,
        upperResults.length,
        'case should not affect search results count',
      );
    });
  });

  describe('getCatalogStats()', () => {
    it('returns correct total count', () => {
      const stats = getCatalogStats();
      const allFeatures = getAllFeatures();

      assert.strictEqual(stats.totalFeatures, allFeatures.length);
    });

    it('byTier counts sum to totalFeatures', () => {
      const stats = getCatalogStats();
      const tierSum = Object.values(stats.byTier).reduce((sum, count) => sum + count, 0);

      assert.strictEqual(tierSum, stats.totalFeatures, 'tier counts should sum to total');
    });

    it('byStatus counts sum to totalFeatures', () => {
      const stats = getCatalogStats();
      const statusSum = Object.values(stats.byStatus).reduce((sum, count) => sum + count, 0);

      assert.strictEqual(statusSum, stats.totalFeatures, 'status counts should sum to total');
    });

    it('byComplexity counts sum to totalFeatures', () => {
      const stats = getCatalogStats();
      const complexitySum = Object.values(stats.byComplexity).reduce(
        (sum, count) => sum + count,
        0,
      );

      assert.strictEqual(
        complexitySum,
        stats.totalFeatures,
        'complexity counts should sum to total',
      );
    });

    it('byCategory counts sum to totalFeatures', () => {
      const stats = getCatalogStats();
      const categorySum = Object.values(stats.byCategory).reduce(
        (sum, count) => sum + count,
        0,
      );

      assert.strictEqual(
        categorySum,
        stats.totalFeatures,
        'category counts should sum to total',
      );
    });
  });
});
