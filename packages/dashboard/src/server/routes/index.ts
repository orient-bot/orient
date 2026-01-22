/**
 * Route Modules Index
 *
 * Export all route module factories for use by the main server.
 */

export { createSlackRoutes } from './slack.routes.js';
export { createSchedulerRoutes } from './scheduler.routes.js';
export { createWebhookRoutes } from './webhook.routes.js';
export { createPromptsRoutes } from './prompts.routes.js';
export { createAgentsRoutes } from './agents.routes.js';
export { createBillingRoutes } from './billing.routes.js';
export { createMcpRoutes } from './mcp.routes.js';
export { createAppsRoutes } from './apps.routes.js';
export { createSecretsRoutes } from './secrets.routes.js';
export { createProvidersRoutes } from './providers.routes.js';
export { createOnboarderRoutes } from './onboarder.routes.js';
export { createIntegrationsRoutes } from './integrations.routes.js';
export { createStorageRoutes } from './storage.routes.js';
export { createVersionRoutes } from './version.routes.js';
export { createFeatureFlagsRoutes } from './featureFlags.routes.js';
