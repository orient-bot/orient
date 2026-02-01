/**
 * Database Schema Exports
 *
 * Exports the SQLite schema. SQLite is used for both development and production.
 */

// Export common types
export * from './common.js';

// Export SQLite schema tables and types
export {
  // WhatsApp tables
  messages,
  groups,
  chatPermissions,
  permissionAuditLog,
  // Users and preferences
  dashboardUsers,
  userVersionPreferences,
  systemPrompts,
  // Slack tables
  slackMessages,
  slackChannels,
  slackChannelPermissions,
  slackPermissionAuditLog,
  // Scheduler
  scheduledJobs,
  scheduledJobRuns,
  scheduledMessages,
  // Demo
  demoMeetings,
  demoGithubMonitors,
  // Webhooks
  webhookForwards,
  webhooks,
  webhookEvents,
  // App Storage
  appStorage,
  // OAuth Proxy
  oauthProxySessions,
  // Agent registry
  agents,
  agentSkills,
  agentTools,
  contextRules,
  // Permissions
  permissionPolicies,
  approvalRequests,
  approvalGrants,
  // Context
  chatContext,
  // Feature flags
  featureFlags,
  userFeatureFlagOverrides,
  // Secrets
  secrets,
  secretsAuditLog,
  // Onboarder
  onboarderSessions,
} from './sqlite/index.js';
