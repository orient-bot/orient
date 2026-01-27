/**
 * SQLite Schema Definitions
 *
 * This file defines all database tables using Drizzle ORM for SQLite.
 * Key differences from PostgreSQL:
 * - Uses integer timestamps instead of timestamp with timezone
 * - Uses JSON-serialized text for array columns
 * - No enum types (uses text with TypeScript types for validation)
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Note: Common types (enum value arrays and TypeScript types) are re-exported
// from '../schema/index.ts', NOT from here. This file only contains table
// definitions, which is what drizzle-kit needs for schema processing.

// ============================================
// WHATSAPP TABLES
// ============================================

/**
 * WhatsApp messages table
 */
export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id').unique(),
    direction: text('direction').notNull(), // 'incoming' | 'outgoing'
    jid: text('jid').notNull(),
    phone: text('phone').notNull(),
    text: text('text').notNull(),
    isGroup: integer('is_group', { mode: 'boolean' }).notNull().default(false),
    groupId: text('group_id'),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    mediaType: text('media_type'), // 'image' | 'audio' | 'video' | 'document'
    mediaPath: text('media_path'),
    mediaMimeType: text('media_mime_type'),
    transcribedText: text('transcribed_text'),
    transcribedLanguage: text('transcribed_language'),
  },
  (table) => [
    index('idx_messages_phone').on(table.phone),
    index('idx_messages_timestamp').on(table.timestamp),
    index('idx_messages_direction').on(table.direction),
    index('idx_messages_is_group').on(table.isGroup),
    index('idx_messages_group_id').on(table.groupId),
    index('idx_messages_media_type').on(table.mediaType),
  ]
);

/**
 * WhatsApp groups metadata table
 */
export const groups = sqliteTable(
  'groups',
  {
    groupId: text('group_id').primaryKey(),
    groupName: text('group_name'),
    groupSubject: text('group_subject'),
    participantCount: integer('participant_count'),
    lastUpdated: integer('last_updated', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_groups_name').on(table.groupName),
    index('idx_groups_subject').on(table.groupSubject),
  ]
);

/**
 * Chat permissions table (WhatsApp)
 */
export const chatPermissions = sqliteTable(
  'chat_permissions',
  {
    chatId: text('chat_id').primaryKey(),
    chatType: text('chat_type').notNull(), // 'individual' | 'group'
    permission: text('permission').notNull().default('read_only'), // 'ignored' | 'read_only' | 'read_write'
    displayName: text('display_name'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_chat_permissions_type').on(table.chatType),
    index('idx_chat_permissions_permission').on(table.permission),
  ]
);

/**
 * Permission audit log
 */
export const permissionAuditLog = sqliteTable(
  'permission_audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chatId: text('chat_id').notNull(),
    oldPermission: text('old_permission'),
    newPermission: text('new_permission').notNull(),
    changedBy: text('changed_by'),
    changedAt: integer('changed_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_permission_audit_chat').on(table.chatId),
    index('idx_permission_audit_time').on(table.changedAt),
  ]
);

/**
 * Dashboard users table
 */
export const dashboardUsers = sqliteTable('dashboard_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash'), // Nullable for Google-only users
  googleId: text('google_id').unique(),
  googleEmail: text('google_email'),
  authMethod: text('auth_method').notNull().default('password'), // 'password' | 'google' | 'both'
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

/**
 * User version notification preferences
 * Stores per-user settings for version update notifications
 */
export const userVersionPreferences = sqliteTable(
  'user_version_preferences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => dashboardUsers.id, { onDelete: 'cascade' })
      .unique(),
    notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
    dismissedVersions: text('dismissed_versions').default('[]'), // JSON array
    remindLaterUntil: integer('remind_later_until', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [index('idx_user_version_prefs_user').on(table.userId)]
);

/**
 * System prompts table (shared between WhatsApp and Slack)
 */
export const systemPrompts = sqliteTable(
  'system_prompts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chatId: text('chat_id').notNull(),
    platform: text('platform').notNull(), // 'whatsapp' | 'slack'
    promptText: text('prompt_text').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_system_prompts_lookup').on(table.platform, table.chatId),
    index('idx_system_prompts_platform').on(table.platform),
  ]
);

// ============================================
// SLACK TABLES
// ============================================

/**
 * Slack messages table
 */
export const slackMessages = sqliteTable(
  'slack_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id').unique(),
    channelId: text('channel_id').notNull(),
    threadTs: text('thread_ts'),
    userId: text('user_id').notNull(),
    userName: text('user_name'),
    text: text('text').notNull(),
    direction: text('direction').notNull(), // 'incoming' | 'outgoing'
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    hasFiles: integer('has_files', { mode: 'boolean' }).default(false),
    fileTypes: text('file_types'), // JSON array
  },
  (table) => [
    index('idx_slack_messages_channel').on(table.channelId),
    index('idx_slack_messages_timestamp').on(table.timestamp),
    index('idx_slack_messages_direction').on(table.direction),
    index('idx_slack_messages_thread').on(table.threadTs),
    index('idx_slack_messages_user').on(table.userId),
  ]
);

/**
 * Slack channels table
 */
export const slackChannels = sqliteTable(
  'slack_channels',
  {
    channelId: text('channel_id').primaryKey(),
    channelName: text('channel_name'),
    channelType: text('channel_type'), // 'channel' | 'dm' | 'group_dm' | 'private'
    isMember: integer('is_member', { mode: 'boolean' }).default(true),
    lastUpdated: integer('last_updated', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_slack_channels_name').on(table.channelName),
    index('idx_slack_channels_type').on(table.channelType),
  ]
);

/**
 * Slack channel permissions table
 */
export const slackChannelPermissions = sqliteTable(
  'slack_channel_permissions',
  {
    channelId: text('channel_id').primaryKey(),
    permission: text('permission').notNull().default('read_only'), // 'ignored' | 'read_only' | 'read_write'
    respondToMentions: integer('respond_to_mentions', { mode: 'boolean' }).default(true),
    respondToDMs: integer('respond_to_dms', { mode: 'boolean' }).default(true),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [index('idx_slack_permissions_permission').on(table.permission)]
);

/**
 * Slack permission audit log
 */
export const slackPermissionAuditLog = sqliteTable(
  'slack_permission_audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    channelId: text('channel_id').notNull(),
    oldPermission: text('old_permission'),
    newPermission: text('new_permission').notNull(),
    changedBy: text('changed_by'),
    changedAt: integer('changed_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_slack_audit_channel').on(table.channelId),
    index('idx_slack_audit_time').on(table.changedAt),
  ]
);

// ============================================
// SCHEDULER TABLES
// ============================================

/**
 * Scheduled jobs table (advanced scheduler)
 * Supports cron, recurring, and one-time schedules with timezone support
 */
export const scheduledJobs = sqliteTable(
  'scheduled_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),

    // Schedule configuration
    scheduleType: text('schedule_type').notNull(), // 'once' | 'recurring' | 'cron'
    cronExpression: text('cron_expression'),
    runAt: integer('run_at', { mode: 'timestamp' }),
    intervalMinutes: integer('interval_minutes'),
    timezone: text('timezone').default('UTC'),

    // Delivery configuration
    provider: text('provider').notNull(), // 'whatsapp' | 'slack'
    target: text('target').notNull(),
    messageTemplate: text('message_template').notNull(),

    // Job metadata
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
    nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
    runCount: integer('run_count').default(0),
    lastError: text('last_error'),

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_scheduled_jobs_enabled').on(table.enabled),
    index('idx_scheduled_jobs_next_run').on(table.nextRunAt),
    index('idx_scheduled_jobs_provider').on(table.provider),
  ]
);

/**
 * Scheduled job runs history table
 */
export const scheduledJobRuns = sqliteTable(
  'scheduled_job_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id')
      .notNull()
      .references(() => scheduledJobs.id, { onDelete: 'cascade' }),
    startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    status: text('status'), // 'running' | 'success' | 'failed'
    error: text('error'),
    messageSent: text('message_sent'),
  },
  (table) => [
    index('idx_scheduled_job_runs_job_id').on(table.jobId),
    index('idx_scheduled_job_runs_started_at').on(table.startedAt),
    index('idx_scheduled_job_runs_status').on(table.status),
  ]
);

/**
 * Scheduled messages table (simple scheduler - legacy)
 */
export const scheduledMessages = sqliteTable(
  'scheduled_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    cronExpression: text('cron_expression').notNull(),
    targetType: text('target_type').notNull(), // 'whatsapp' | 'slack'
    targetId: text('target_id').notNull(),
    message: text('message').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    lastRun: integer('last_run', { mode: 'timestamp' }),
    nextRun: integer('next_run', { mode: 'timestamp' }),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_scheduled_messages_active').on(table.isActive),
    index('idx_scheduled_messages_next_run').on(table.nextRun),
  ]
);

// ============================================
// DEMO TABLES
// ============================================

/**
 * Demo meeting scheduler entries (localhost demo)
 */
export const demoMeetings = sqliteTable(
  'demo_meetings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    attendees: text('attendees'),
    startTime: integer('start_time', { mode: 'timestamp' }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    sendReminder: integer('send_reminder', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [index('idx_demo_meetings_start_time').on(table.startTime)]
);

/**
 * Demo GitHub changelog monitor configs (localhost demo)
 */
export const demoGithubMonitors = sqliteTable(
  'demo_github_monitors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repoUrl: text('repo_url').notNull(),
    slackChannel: text('slack_channel').notNull(),
    scheduleTime: text('schedule_time').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastChecked: integer('last_checked', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_demo_github_monitors_repo').on(table.repoUrl),
    index('idx_demo_github_monitors_active').on(table.isActive),
  ]
);

// ============================================
// WEBHOOK TABLES
// ============================================

/**
 * Webhook forwards table
 */
export const webhookForwards = sqliteTable(
  'webhook_forwards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    sourcePathPrefix: text('source_path_prefix').notNull(),
    targetUrl: text('target_url').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    verifySignature: integer('verify_signature', { mode: 'boolean' }).default(false),
    signatureHeader: text('signature_header'),
    signatureSecret: text('signature_secret'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_webhook_forwards_active').on(table.isActive),
    index('idx_webhook_forwards_path').on(table.sourcePathPrefix),
  ]
);

/**
 * Webhooks configuration table
 * Stores webhook configurations for various source types (github, calendar, jira, custom)
 */
export const webhooks = sqliteTable(
  'webhooks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    description: text('description'),
    // Authentication
    token: text('token').notNull(),
    signatureHeader: text('signature_header'),
    // Source configuration
    sourceType: text('source_type').notNull(), // 'github' | 'calendar' | 'jira' | 'custom'
    eventFilter: text('event_filter'), // JSON array of event types to filter
    // Delivery configuration
    provider: text('provider').notNull(), // 'whatsapp' | 'slack'
    target: text('target').notNull(),
    messageTemplate: text('message_template'),
    // Status
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    lastTriggeredAt: integer('last_triggered_at', { mode: 'timestamp' }),
    triggerCount: integer('trigger_count').default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_webhooks_name').on(table.name),
    index('idx_webhooks_enabled').on(table.enabled),
    index('idx_webhooks_source_type').on(table.sourceType),
  ]
);

/**
 * Webhook events table
 * Stores history of webhook events received and processed
 */
export const webhookEvents = sqliteTable(
  'webhook_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    webhookId: integer('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    receivedAt: integer('received_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    eventType: text('event_type'),
    payload: text('payload'), // JSON string
    status: text('status').notNull().default('pending'), // 'processed' | 'filtered' | 'failed' | 'pending'
    error: text('error'),
    messageSent: text('message_sent'),
    processingTimeMs: integer('processing_time_ms'),
  },
  (table) => [
    index('idx_webhook_events_webhook_id').on(table.webhookId),
    index('idx_webhook_events_received_at').on(table.receivedAt),
    index('idx_webhook_events_status').on(table.status),
  ]
);

// ============================================
// AGENT REGISTRY TABLES
// ============================================

/**
 * Agent definitions
 * Stores the configuration for each AI agent (pm-assistant, communicator, etc.)
 */
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(), // 'pm-assistant', 'communicator', etc.
  name: text('name').notNull(),
  description: text('description'),
  mode: text('mode').default('primary'), // 'primary' | 'specialized'
  modelDefault: text('model_default'), // 'anthropic/claude-sonnet-4-20250514'
  modelFallback: text('model_fallback'),
  basePrompt: text('base_prompt'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

/**
 * Skills available to each agent
 * Links agents to their allowed skills
 */
export const agentSkills = sqliteTable(
  'agent_skills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillName: text('skill_name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_agent_skills_agent').on(table.agentId),
    index('idx_agent_skills_skill').on(table.skillName),
  ]
);

/**
 * Tool access patterns per agent
 * Defines which tools are allowed or denied for each agent
 */
export const agentTools = sqliteTable(
  'agent_tools',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    pattern: text('pattern').notNull(), // 'ai_first_*', 'write', 'bash'
    type: text('type').notNull(), // 'allow' | 'deny'
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_agent_tools_agent').on(table.agentId),
    index('idx_agent_tools_type').on(table.type),
  ]
);

/**
 * Context-based agent selection rules
 * Determines which agent to use based on platform, chat, or environment
 */
export const contextRules = sqliteTable(
  'context_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contextType: text('context_type').notNull(), // 'default' | 'platform' | 'chat' | 'channel' | 'environment'
    contextId: text('context_id'), // chat_id, channel_id, 'prod', 'local', null for defaults
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    skillOverrides: text('skill_overrides'), // JSON array: '["disable:skill-name", "enable:skill-name"]'
    priority: integer('priority').default(0), // Higher priority wins
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_context_rules_type').on(table.contextType),
    index('idx_context_rules_context').on(table.contextType, table.contextId),
    index('idx_context_rules_agent').on(table.agentId),
    index('idx_context_rules_priority').on(table.priority),
  ]
);

/**
 * Permission policies for agent tool execution
 */
export const permissionPolicies = sqliteTable(
  'permission_policies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    toolPatterns: text('tool_patterns').notNull(), // JSON array
    agentIds: text('agent_ids'), // JSON array or null
    platforms: text('platforms'), // JSON array or null
    action: text('action').notNull(), // 'allow' | 'deny' | 'ask'
    granularity: text('granularity').notNull(), // 'per_call' | 'per_session' | 'per_category'
    timeout: integer('timeout'),
    promptTemplate: text('prompt_template'),
    riskLevel: text('risk_level').notNull(), // 'low' | 'medium' | 'high' | 'critical'
    priority: integer('priority').default(0),
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_permission_policies_action').on(table.action),
    index('idx_permission_policies_priority').on(table.priority),
    index('idx_permission_policies_enabled').on(table.enabled),
  ]
);

/**
 * Approval requests for tool execution
 */
export const approvalRequests = sqliteTable(
  'approval_requests',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    platform: text('platform').notNull(),
    userId: text('user_id').notNull(),
    agentId: text('agent_id').notNull(),
    policyId: text('policy_id').references(() => permissionPolicies.id),
    toolName: text('tool_name').notNull(),
    toolInput: text('tool_input').notNull(), // JSON
    status: text('status').notNull(), // 'pending' | 'approved' | 'denied' | 'expired'
    platformMessageId: text('platform_message_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    resolvedBy: text('resolved_by'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('idx_approval_requests_status').on(table.status),
    index('idx_approval_requests_platform').on(table.platform),
    index('idx_approval_requests_session').on(table.sessionId),
    index('idx_approval_requests_policy').on(table.policyId),
  ]
);

/**
 * Approval grants for session or category-level approvals
 */
export const approvalGrants = sqliteTable(
  'approval_grants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').notNull(),
    userId: text('user_id').notNull(),
    grantType: text('grant_type').notNull(), // 'tool' | 'category' | 'policy'
    grantValue: text('grant_value').notNull(), // tool name, category, or policy id
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_approval_grants_session').on(table.sessionId),
    index('idx_approval_grants_user').on(table.userId),
    index('idx_approval_grants_type').on(table.grantType),
  ]
);

// ============================================
// CONTEXT PERSISTENCE TABLES
// ============================================

/**
 * Persistent chat context storage
 * Stores agent memory, user preferences, and activity history per chat/channel
 */
export const chatContext = sqliteTable(
  'chat_context',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chatId: text('chat_id').notNull(), // WhatsApp chat ID or Slack channel ID
    platform: text('platform').notNull(), // 'whatsapp' | 'slack' | 'opencode' | 'cursor'
    contextJson: text('context_json').notNull(), // JSON: identity, userProfile, recentActivity, currentState
    version: integer('version').default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [index('idx_chat_context_lookup').on(table.platform, table.chatId)]
);

// ============================================
// APP STORAGE TABLES
// ============================================

/**
 * App storage table
 * Key-value storage for mini-apps that declare the storage capability
 */
export const appStorage = sqliteTable(
  'app_storage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    appName: text('app_name').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(), // JSON string
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_app_storage_app_name').on(table.appName),
    uniqueIndex('idx_app_storage_unique').on(table.appName, table.key),
  ]
);

// ============================================
// FEATURE FLAGS TABLES
// ============================================

/**
 * Global feature flags with hierarchical IDs via naming convention
 */
export const featureFlags = sqliteTable(
  'feature_flags',
  {
    id: text('id').primaryKey(), // e.g., 'mini_apps.edit_with_ai'
    name: text('name').notNull(),
    description: text('description'),
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    category: text('category').default('ui'),
    sortOrder: integer('sort_order').default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_feature_flags_category').on(table.category),
    index('idx_feature_flags_sort_order').on(table.sortOrder),
  ]
);

/**
 * Per-user feature flag overrides
 */
export const userFeatureFlagOverrides = sqliteTable(
  'user_feature_flag_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => dashboardUsers.id, { onDelete: 'cascade' }),
    flagId: text('flag_id')
      .notNull()
      .references(() => featureFlags.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('idx_user_flag_overrides_user_flag').on(table.userId, table.flagId),
    index('idx_user_flag_overrides_user').on(table.userId),
    index('idx_user_flag_overrides_flag').on(table.flagId),
  ]
);

export { secrets, secretsAuditLog } from './secrets.js';

// ============================================
// ONBOARDER SESSIONS
// ============================================

/**
 * Onboarder (Ori) assistant sessions
 * Stores session state for the onboarding assistant
 */
export const onboarderSessions = sqliteTable(
  'onboarder_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => dashboardUsers.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull().unique(),
    title: text('title').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastActiveAt: integer('last_active_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_onboarder_sessions_user').on(table.userId),
    index('idx_onboarder_sessions_active').on(table.userId, table.isActive),
  ]
);

/**
 * OAuth Proxy Sessions
 * Stores temporary OAuth sessions for external instance authentication
 */
export const oauthProxySessions = sqliteTable(
  'oauth_proxy_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').notNull().unique(),
    codeChallenge: text('code_challenge').notNull(),
    scopes: text('scopes').notNull(), // JSON array
    status: text('status').notNull().default('pending'), // 'pending' | 'completed' | 'retrieved' | 'expired'
    userEmail: text('user_email'),
    encryptedTokens: text('encrypted_tokens'),
    tokensIv: text('tokens_iv'),
    tokensAuthTag: text('tokens_auth_tag'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_oauth_proxy_session_id').on(table.sessionId),
    index('idx_oauth_proxy_status').on(table.status),
    index('idx_oauth_proxy_expires').on(table.expiresAt),
  ]
);
