/**
 * @orient/apps
 *
 * Mini-apps system for the Orient.
 *
 * This package provides:
 * - App manifest schemas and validation
 * - App entity types
 * - Sharing and permission types
 * - Edit session management types
 *
 * @example
 * import {
 *   AppManifest,
 *   App,
 *   AppSummary,
 *   validateAppManifest,
 * } from '@orient/apps';
 */

// Export schemas
export {
  ToolPermissionSchema,
  AppPermissionsSchema,
  SchedulerCapabilitySchema,
  WebhookEndpointSchema,
  WebhookCapabilitySchema,
  AppCapabilitiesSchema,
  SharingModeSchema,
  AppSharingConfigSchema,
  AppBuildConfigSchema,
  AppManifestSchema,
} from './types.js';

// Export types
export type {
  ToolPermission,
  AppPermissions,
  SchedulerCapability,
  WebhookEndpoint,
  WebhookCapability,
  AppCapabilities,
  SharingMode,
  AppSharingConfig,
  AppBuildConfig,
  AppManifest,
  AppStatus,
  App,
  AppSummary,
  AppExecution,
  AppShareToken,
  EditSession,
  EditCommit,
} from './types.js';

// Export validation helpers
export { validateAppManifest, generateAppManifestTemplate } from './types.js';

// Export services
export * from './services/index.js';

/**
 * Migration Status
 *
 * This package is being populated with services from src/services/:
 * - appsService.ts
 * - appGeneratorService.ts
 * - appGitService.ts
 * - appRuntimeService.ts
 * - miniappEditService.ts
 * - miniappEditDatabase.ts
 * - skillsService.ts
 *
 * Types are available now, services will be migrated incrementally.
 */
export const APPS_MIGRATION_STATUS = {
  types: 'migrated',
  appsService: 're-exported',
  appGeneratorService: 're-exported',
  appGitService: 're-exported',
  appRuntimeService: 're-exported',
  miniappEditService: 're-exported',
  miniappEditDatabase: 're-exported',
  skillsService: 'pending',
  sourceLocation: 'src/services/ (re-exported)',
} as const;
