/**
 * Drizzle ORM Schema Definitions
 *
 * This file defines all database tables using Drizzle ORM.
 * The schema matches the existing PostgreSQL tables.
 */

import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

// ============================================
// ENUMS
// ============================================

export const messageDirectionEnum = pgEnum('message_direction', ['incoming', 'outgoing']);
export const chatTypeEnum = pgEnum('chat_type', ['individual', 'group']);
export const chatPermissionEnum = pgEnum('chat_permission', ['ignored', 'read_only', 'read_write']);
export const promptPlatformEnum = pgEnum('prompt_platform', ['whatsapp', 'slack']);
export const slackChannelTypeEnum = pgEnum('slack_channel_type', [
  'channel',
  'dm',
  'group_dm',
  'private',
]);

// ============================================
// WHATSAPP TABLES
// ============================================

/**
 * WhatsApp messages table
 */
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    messageId: text('message_id').unique(),
    direction: text('direction').notNull(), // 'incoming' | 'outgoing'
    jid: text('jid').notNull(),
    phone: text('phone').notNull(),
    text: text('text').notNull(),
    isGroup: boolean('is_group').notNull().default(false),
    groupId: text('group_id'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
export const groups = pgTable(
  'groups',
  {
    groupId: text('group_id').primaryKey(),
    groupName: text('group_name'),
    groupSubject: text('group_subject'),
    participantCount: integer('participant_count'),
    lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_groups_name').on(table.groupName),
    index('idx_groups_subject').on(table.groupSubject),
  ]
);

/**
 * Chat permissions table (WhatsApp)
 */
export const chatPermissions = pgTable(
  'chat_permissions',
  {
    chatId: text('chat_id').primaryKey(),
    chatType: text('chat_type').notNull(), // 'individual' | 'group'
    permission: text('permission').notNull().default('read_only'), // 'ignored' | 'read_only' | 'read_write'
    displayName: text('display_name'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_chat_permissions_type').on(table.chatType),
    index('idx_chat_permissions_permission').on(table.permission),
  ]
);

/**
 * Permission audit log
 */
export const permissionAuditLog = pgTable(
  'permission_audit_log',
  {
    id: serial('id').primaryKey(),
    chatId: text('chat_id').notNull(),
    oldPermission: text('old_permission'),
    newPermission: text('new_permission').notNull(),
    changedBy: text('changed_by'),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_permission_audit_chat').on(table.chatId),
    index('idx_permission_audit_time').on(table.changedAt),
  ]
);

/**
 * Dashboard users table
 */
export const dashboardUsers = pgTable('dashboard_users', {
  id: serial('id').primaryKey(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash'), // Nullable for Google-only users
  googleId: text('google_id').unique(),
  googleEmail: text('google_email'),
  authMethod: text('auth_method').notNull().default('password'), // 'password' | 'google' | 'both'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * User version notification preferences
 * Stores per-user settings for version update notifications
 */
export const userVersionPreferences = pgTable(
  'user_version_preferences',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => dashboardUsers.id, { onDelete: 'cascade' })
      .unique(),
    notificationsEnabled: boolean('notifications_enabled').default(true),
    dismissedVersions: text('dismissed_versions').array().default([]),
    remindLaterUntil: timestamp('remind_later_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_user_version_prefs_user').on(table.userId)]
);

/**
 * System prompts table (shared between WhatsApp and Slack)
 */
export const systemPrompts = pgTable(
  'system_prompts',
  {
    id: serial('id').primaryKey(),
    chatId: text('chat_id').notNull(),
    platform: text('platform').notNull(), // 'whatsapp' | 'slack'
    promptText: text('prompt_text').notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
export const slackMessages = pgTable(
  'slack_messages',
  {
    id: serial('id').primaryKey(),
    messageId: text('message_id').unique(),
    channelId: text('channel_id').notNull(),
    threadTs: text('thread_ts'),
    userId: text('user_id').notNull(),
    userName: text('user_name'),
    text: text('text').notNull(),
    direction: text('direction').notNull(), // 'incoming' | 'outgoing'
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    hasFiles: boolean('has_files').default(false),
    fileTypes: text('file_types').array(),
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
export const slackChannels = pgTable(
  'slack_channels',
  {
    channelId: text('channel_id').primaryKey(),
    channelName: text('channel_name'),
    channelType: text('channel_type'), // 'channel' | 'dm' | 'group_dm' | 'private'
    isMember: boolean('is_member').default(true),
    lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_slack_channels_name').on(table.channelName),
    index('idx_slack_channels_type').on(table.channelType),
  ]
);

/**
 * Slack channel permissions table
 */
export const slackChannelPermissions = pgTable(
  'slack_channel_permissions',
  {
    channelId: text('channel_id').primaryKey(),
    permission: text('permission').notNull().default('read_only'), // 'ignored' | 'read_only' | 'read_write'
    respondToMentions: boolean('respond_to_mentions').default(true),
    respondToDMs: boolean('respond_to_dms').default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_slack_permissions_permission').on(table.permission)]
);

/**
 * Slack permission audit log
 */
export const slackPermissionAuditLog = pgTable(
  'slack_permission_audit_log',
  {
    id: serial('id').primaryKey(),
    channelId: text('channel_id').notNull(),
    oldPermission: text('old_permission'),
    newPermission: text('new_permission').notNull(),
    changedBy: text('changed_by'),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
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
 * Scheduled messages table
 */
export const scheduledMessages = pgTable(
  'scheduled_messages',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    cronExpression: text('cron_expression').notNull(),
    targetType: text('target_type').notNull(), // 'whatsapp' | 'slack'
    targetId: text('target_id').notNull(),
    message: text('message').notNull(),
    isActive: boolean('is_active').default(true),
    lastRun: timestamp('last_run', { withTimezone: true }),
    nextRun: timestamp('next_run', { withTimezone: true }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
export const demoMeetings = pgTable(
  'demo_meetings',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    attendees: text('attendees'),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    sendReminder: boolean('send_reminder').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_demo_meetings_start_time').on(table.startTime)]
);

/**
 * Demo GitHub changelog monitor configs (localhost demo)
 */
export const demoGithubMonitors = pgTable(
  'demo_github_monitors',
  {
    id: serial('id').primaryKey(),
    repoUrl: text('repo_url').notNull(),
    slackChannel: text('slack_channel').notNull(),
    scheduleTime: text('schedule_time').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastChecked: timestamp('last_checked', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
export const webhookForwards = pgTable(
  'webhook_forwards',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    sourcePathPrefix: text('source_path_prefix').notNull(),
    targetUrl: text('target_url').notNull(),
    isActive: boolean('is_active').default(true),
    verifySignature: boolean('verify_signature').default(false),
    signatureHeader: text('signature_header'),
    signatureSecret: text('signature_secret'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_webhook_forwards_active').on(table.isActive),
    index('idx_webhook_forwards_path').on(table.sourcePathPrefix),
  ]
);

// ============================================
// AGENT REGISTRY TABLES
// ============================================

/**
 * Agent definitions
 * Stores the configuration for each AI agent (pm-assistant, communicator, etc.)
 */
export const agents = pgTable('agents', {
  id: text('id').primaryKey(), // 'pm-assistant', 'communicator', etc.
  name: text('name').notNull(),
  description: text('description'),
  mode: text('mode').default('primary'), // 'primary' | 'specialized'
  modelDefault: text('model_default'), // 'anthropic/claude-sonnet-4-20250514'
  modelFallback: text('model_fallback'),
  basePrompt: text('base_prompt'),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * Skills available to each agent
 * Links agents to their allowed skills
 */
export const agentSkills = pgTable(
  'agent_skills',
  {
    id: serial('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillName: text('skill_name').notNull(),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
export const agentTools = pgTable(
  'agent_tools',
  {
    id: serial('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    pattern: text('pattern').notNull(), // 'ai_first_*', 'write', 'bash'
    type: text('type').notNull(), // 'allow' | 'deny'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
export const contextRules = pgTable(
  'context_rules',
  {
    id: serial('id').primaryKey(),
    contextType: text('context_type').notNull(), // 'default' | 'platform' | 'chat' | 'channel' | 'environment'
    contextId: text('context_id'), // chat_id, channel_id, 'prod', 'local', null for defaults
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    skillOverrides: text('skill_overrides'), // JSON array: '["disable:skill-name", "enable:skill-name"]'
    priority: integer('priority').default(0), // Higher priority wins
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
export const permissionPolicies = pgTable(
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
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
export const approvalRequests = pgTable(
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
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
export const approvalGrants = pgTable(
  'approval_grants',
  {
    id: serial('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    userId: text('user_id').notNull(),
    grantType: text('grant_type').notNull(), // 'tool' | 'category' | 'policy'
    grantValue: text('grant_value').notNull(), // tool name, category, or policy id
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
export const chatContext = pgTable(
  'chat_context',
  {
    id: serial('id').primaryKey(),
    chatId: text('chat_id').notNull(), // WhatsApp chat ID or Slack channel ID
    platform: text('platform').notNull(), // 'whatsapp' | 'slack' | 'opencode' | 'cursor'
    contextJson: text('context_json').notNull(), // JSON: identity, userProfile, recentActivity, currentState
    version: integer('version').default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_chat_context_lookup').on(table.platform, table.chatId)]
);

// ============================================
// FEATURE FLAGS TABLES
// ============================================

/**
 * Global feature flags with hierarchical IDs via naming convention
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: text('id').primaryKey(), // e.g., 'mini_apps.edit_with_ai'
    name: text('name').notNull(),
    description: text('description'),
    enabled: boolean('enabled').default(true),
    category: text('category').default('ui'),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_feature_flags_category').on(table.category),
    index('idx_feature_flags_sort_order').on(table.sortOrder),
  ]
);

/**
 * Per-user feature flag overrides
 */
export const userFeatureFlagOverrides = pgTable(
  'user_feature_flag_overrides',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => dashboardUsers.id, { onDelete: 'cascade' }),
    flagId: text('flag_id')
      .notNull()
      .references(() => featureFlags.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_user_flag_overrides_user').on(table.userId),
    index('idx_user_flag_overrides_flag').on(table.flagId),
  ]
);

export { secrets, secretsAuditLog } from './secrets.js';
