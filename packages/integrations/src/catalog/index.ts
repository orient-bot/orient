/**
 * Integration Catalog
 *
 * Re-exports all integrations from the catalog and the manifest loader.
 */

// Manifest loader for dynamic INTEGRATION.yaml loading
export * from './loader.js';

// GitHub integration (catalog-based)
export * as github from './github/index.js';

// Linear integration (catalog-based)
export * as linear from './linear/index.js';

// Google integration (catalog-based)
export * as google from './google/index.js';
