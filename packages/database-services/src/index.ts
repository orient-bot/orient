/**
 * @orient/database-services
 *
 * Database service implementations for the Orient.
 * Provides unified access to message, Slack, scheduler, and webhook databases.
 *
 * @example
 * import {
 *   MessageDatabase,
 *   SlackDatabase,
 *   SchedulerDatabase,
 *   WebhookDatabase,
 * } from '@orient/database-services';
 */

// Export database services and factory functions (Drizzle/SQLite implementations)
export { MessageDatabase, createMessageDatabase } from './services/messageDatabaseDrizzle.js';
export type {
  StoredMessage,
  StoredGroup,
  StoreMessageOptions,
  MessageSearchOptions,
  MessageStats,
} from './services/messageDatabaseDrizzle.js';

export { SlackDatabase, createSlackDatabase } from './services/slackDatabaseDrizzle.js';
export type {
  ChatPermissionRecord,
  PermissionAuditEntry,
  DashboardUser,
  SystemPromptRecord,
  SystemPromptWithInfo,
  ChatWithPermission,
  DemoMeeting,
  CreateDemoMeetingInput,
  DemoGithubMonitor,
  CreateDemoGithubMonitorInput,
  UnifiedChat,
  OnboarderSession,
} from './services/messageDatabaseDrizzle.js';

export { SchedulerDatabase, createSchedulerDatabase } from './schedulerDatabase.js';

export { WebhookDatabase, createWebhookDatabase } from './webhookDatabase.js';

export { StorageDatabase, createStorageDatabase } from './storageDatabase.js';
export type { StorageEntry } from './storageDatabase.js';

export { ChatPermissionService, createChatPermissionService } from './chatPermissionService.js';
export type {
  PermissionCheckResult,
  WritePermissionCheckResult,
  ChatPermissionServiceConfig,
  ChatPermissionDatabaseInterface,
} from './chatPermissionService.js';

export { seedAgents, ensureAgentsSeeded } from './agentSeedService.js';
export type { AgentSeedOptions, AgentSeedResult } from './agentSeedService.js';

export { SecretsService, createSecretsService } from './secretsService.js';
export type { SecretMetadata } from './secretsService.js';

export {
  VersionPreferencesService,
  createVersionPreferencesService,
} from './versionPreferencesService.js';
export type {
  UserVersionPreferences,
  UpdatePreferencesInput,
} from './versionPreferencesService.js';

// Prompt service (single source of truth for all packages)
export {
  PromptService,
  createPromptService,
  getPromptService,
  initializePromptService,
  isPromptServiceInitialized,
} from './promptService.js';
export type { PromptServiceConfig, PromptDatabaseInterface } from './promptService.js';
export { EMBEDDED_DEFAULT_PROMPTS, getEmbeddedDefaultPrompt } from './embeddedDefaultPrompts.js';

export { FeatureFlagsService, createFeatureFlagsService } from './featureFlagsService.js';
export type {
  FeatureFlag,
  FeatureFlagWithOverride,
  SetOverrideInput,
} from './featureFlagsService.js';

// Re-export all types
export * from './types/index.js';
