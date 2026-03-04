import fs from 'fs';
import path from 'path';
import type { Feature, CatalogStats } from '../types.js';

// Use process.cwd() for stable path resolution in both dev (tsx) and prod (compiled)
const CATALOG_PATH = path.resolve(process.cwd(), '../../catalog/features.json');

let cachedCatalog: Feature[] | null = null;

/**
 * Loads the feature catalog from the JSON file.
 * Caches the result in memory after first read.
 */
export function loadCatalog(): Feature[] {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Feature catalog not found at ${CATALOG_PATH}`);
  }

  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Feature catalog must be a JSON array');
  }

  cachedCatalog = parsed as Feature[];
  return cachedCatalog;
}

/**
 * Force-reloads the catalog from disk (clears cache).
 */
export function reloadCatalog(): Feature[] {
  cachedCatalog = null;
  return loadCatalog();
}

/**
 * Returns all features in the catalog.
 */
export function getAllFeatures(): Feature[] {
  return loadCatalog();
}

/**
 * Finds a feature by its ID.
 */
export function getFeatureById(id: string): Feature | undefined {
  return loadCatalog().find((f) => f.id === id);
}

/**
 * Returns all features at a given tier level.
 */
export function getFeaturesByTier(tier: number): Feature[] {
  return loadCatalog().filter((f) => f.tier === tier);
}

/**
 * Searches features by matching against name, displayName, description, and tags.
 * Case-insensitive partial match.
 */
export function searchFeatures(query: string): Feature[] {
  const lower = query.toLowerCase();
  return loadCatalog().filter((f) => {
    return (
      f.name.toLowerCase().includes(lower) ||
      f.displayName.toLowerCase().includes(lower) ||
      f.description.toLowerCase().includes(lower) ||
      f.tags.some((tag) => tag.toLowerCase().includes(lower))
    );
  });
}

/**
 * Returns aggregate statistics about the catalog.
 */
export function getCatalogStats(): CatalogStats {
  const features = loadCatalog();

  const byTier: Record<number, number> = {};
  const byStatus: Record<string, number> = {};
  const byComplexity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const f of features) {
    byTier[f.tier] = (byTier[f.tier] ?? 0) + 1;
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    byComplexity[f.complexity] = (byComplexity[f.complexity] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }

  return {
    totalFeatures: features.length,
    byTier,
    byStatus,
    byComplexity,
    byCategory,
  };
}
