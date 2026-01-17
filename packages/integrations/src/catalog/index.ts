/**
 * Integration Catalog
 *
 * Re-exports all integrations from the catalog.
 * Note: Google and Atlassian are available via MCP Servers (existing implementation).
 */

// GitHub integration (new catalog-based)
export * as github from './github/index.js';

// Linear integration (new catalog-based)
export * as linear from './linear/index.js';
