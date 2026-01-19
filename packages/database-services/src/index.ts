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

// Export database services and factory functions
export { MessageDatabase, createMessageDatabase } from './messageDatabase.js';
export type {
  StoredMessage,
  StoredGroup,
  StoreMessageOptions,
  MessageSearchOptions,
  MessageStats,
} from './messageDatabase.js';

export { SlackDatabase, createSlackDatabase } from './slackDatabase.js';

export { SchedulerDatabase, createSchedulerDatabase } from './schedulerDatabase.js';

export { WebhookDatabase, createWebhookDatabase } from './webhookDatabase.js';
export type { WebhookDatabaseConfig } from './webhookDatabase.js';

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

// Re-export all types
export * from './types/index.js';
