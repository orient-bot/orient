/**
 * @orient/database
 *
 * Database schemas, migrations, and clients for the Orient.
 *
 * This package provides:
 * - Drizzle ORM schema definitions
 * - Database client with connection pooling
 * - Type-safe database operations
 */

// Export client functions
export {
  getDatabase,
  getSqlClient,
  closeDatabase,
  resetDatabaseInstance,
  checkDatabaseConnection,
  executeRawSql,
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
  ilike,
  inArray,
  isNull,
  isNotNull,
} from './client.js';

// Export schema tables directly for convenience
export {
  messages,
  groups,
  chatPermissions,
  permissionAuditLog,
  dashboardUsers,
  systemPrompts,
  slackMessages,
  slackChannels,
  slackChannelPermissions,
  slackPermissionAuditLog,
  scheduledMessages,
  webhookForwards,
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
  // Enums
  messageDirectionEnum,
  chatTypeEnum,
  chatPermissionEnum,
  promptPlatformEnum,
  slackChannelTypeEnum,
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
export type { DatabaseConfig } from './client.js';
