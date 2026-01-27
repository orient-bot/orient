/**
 * @orientbot/database
 *
 * Database schemas and client for the Orient.
 * Uses SQLite for both development and production.
 *
 * This package provides:
 * - Drizzle ORM schema definitions
 * - Database client with connection management
 * - Type-safe database operations
 */

// Export client functions
export {
  getDatabase,
  getDatabaseClient,
  closeDatabase,
  resetDatabaseInstance,
  checkDatabaseConnection,
  executeRawSql,
  getRawSqliteDb,
  getDefaultSqlitePath,
  schema,
  // Drizzle query helpers
  eq,
  and,
  or,
  desc,
  asc,
  sql,
  count,
  sum,
  avg,
  min,
  max,
  like,
  inArray,
  isNull,
  isNotNull,
  lt,
  lte,
  gte,
  gt,
} from './client.js';

// Export schema tables directly for convenience
export {
  messages,
  groups,
  chatPermissions,
  permissionAuditLog,
  dashboardUsers,
  userVersionPreferences,
  systemPrompts,
  slackMessages,
  slackChannels,
  slackChannelPermissions,
  slackPermissionAuditLog,
  scheduledJobs,
  scheduledJobRuns,
  scheduledMessages,
  webhookForwards,
  webhooks,
  webhookEvents,
  // App Storage
  appStorage,
  // OAuth Proxy
  oauthProxySessions,
  // Agent Registry tables
  agents,
  agentSkills,
  agentTools,
  contextRules,
  permissionPolicies,
  approvalRequests,
  approvalGrants,
  // Context Persistence tables
  chatContext,
  // Feature Flags tables
  featureFlags,
  userFeatureFlagOverrides,
  // Secrets
  secrets,
  secretsAuditLog,
} from './schema/index.js';

// Export all types
export type {
  // WhatsApp
  Message,
  NewMessage,
  MessageDirection,
  MediaType,
  Group,
  NewGroup,
  ChatPermissionRecord,
  NewChatPermission,
  ChatType,
  ChatPermission,
  PermissionAuditEntry,
  NewPermissionAuditEntry,
  DashboardUser,
  NewDashboardUser,
  SystemPrompt,
  NewSystemPrompt,
  PromptPlatform,
  // Slack
  SlackMessage,
  NewSlackMessage,
  SlackChannel,
  NewSlackChannel,
  SlackChannelType,
  SlackChannelPermissionRecord,
  NewSlackChannelPermission,
  SlackChannelPermission,
  SlackPermissionAuditEntry,
  NewSlackPermissionAuditEntry,
  // Scheduler
  ScheduledMessage,
  NewScheduledMessage,
  // Webhooks
  WebhookForward,
  NewWebhookForward,
  // Query options
  MessageSearchOptions,
  SlackMessageSearchOptions,
  StoreMessageOptions,
  StoreSlackMessageOptions,
  // Permission policies
  PermissionPolicyRecord,
  NewPermissionPolicy,
  ApprovalRequestRecord,
  NewApprovalRequest,
  ApprovalGrantRecord,
  NewApprovalGrant,
  // Statistics
  MessageStats,
  SlackMessageStats,
  DashboardStats,
  SlackDashboardStats,
  MediaStats,
} from './types.js';

// Export database config type
export type { DatabaseConfig, Database } from './client.js';
