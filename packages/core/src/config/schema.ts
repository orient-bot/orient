/**
 * Configuration Schema Definitions
 *
 * This module defines Zod schemas for all configuration sections.
 * These schemas provide:
 * - Type safety at compile time
 * - Runtime validation
 * - Auto-generated TypeScript types
 * - Clear documentation of required vs optional fields
 */

import { z } from 'zod';

// =============================================================================
// Organization Configuration
// =============================================================================

/**
 * Organization-specific configuration
 * This is what makes the bot work for YOUR organization
 */
export const OrganizationSchema = z.object({
  /** Human-readable organization name */
  name: z.string().min(1, 'Organization name is required'),
  /** JIRA project key (e.g., "PROJ", "PROJ") */
  jiraProjectKey: z.string().min(1, 'JIRA project key is required'),
  /** JIRA component to filter issues (optional) */
  jiraComponent: z.string().optional(),
});

export type OrganizationConfig = z.infer<typeof OrganizationSchema>;

// =============================================================================
// JIRA Configuration
// =============================================================================

export const JiraConfigSchema = z.object({
  /** JIRA host (e.g., "yourorg.atlassian.net") */
  host: z.string().min(1, 'JIRA host is required'),
  /** Email for JIRA API authentication */
  email: z.string().email('Valid email required for JIRA'),
  /** JIRA API token (keep secret!) */
  apiToken: z.string().min(1, 'JIRA API token is required'),
});

export type JiraConfig = z.infer<typeof JiraConfigSchema>;

// =============================================================================
// Slack Configuration
// =============================================================================

/** Slack bot mode configuration */
export const SlackBotModeConfigSchema = z.object({
  /** Slack bot OAuth token */
  token: z.string().min(1, 'Slack bot token is required'),
  /** Slack signing secret for request verification */
  signingSecret: z.string().min(1, 'Slack signing secret is required'),
  /** Slack app-level token for socket mode */
  appToken: z.string().min(1, 'Slack app token is required'),
});

export type SlackBotModeConfig = z.infer<typeof SlackBotModeConfigSchema>;

/** Slack user mode configuration (posting as user) */
export const SlackUserModeConfigSchema = z.object({
  /** Enable user mode */
  enabled: z.boolean().default(false),
  /** User OAuth token (obtained via OAuth flow) */
  token: z.string().optional(),
  /** OAuth client ID (for token refresh) */
  clientId: z.string().optional(),
  /** OAuth client secret (for token refresh) */
  clientSecret: z.string().optional(),
});

export type SlackUserModeConfig = z.infer<typeof SlackUserModeConfigSchema>;

export const SlackConfigSchema = z.object({
  /** Bot mode configuration */
  bot: SlackBotModeConfigSchema.optional(),
  /** User mode configuration (posting as user) */
  user: SlackUserModeConfigSchema.optional(),
  /** Default channel for standup messages */
  standupChannel: z.string().default('#standup'),
  /** Default posting mode */
  defaultMode: z.enum(['bot', 'user']).default('bot'),
  /** Per-channel mode overrides */
  channelModeOverrides: z.record(z.string(), z.enum(['bot', 'user'])).optional(),
});

export type SlackConfig = z.infer<typeof SlackConfigSchema>;

/** Legacy flat Slack config for backward compatibility */
export const SlackLegacyConfigSchema = z.object({
  botToken: z.string().min(1, 'Slack bot token is required'),
  signingSecret: z.string().min(1, 'Slack signing secret is required'),
  appToken: z.string().min(1, 'Slack app token is required'),
  standupChannel: z.string().default('#standup'),
});

export type SlackLegacyConfig = z.infer<typeof SlackLegacyConfigSchema>;

// =============================================================================
// WhatsApp Configuration (Personal Mode - Baileys)
// =============================================================================

export const WhatsAppPersonalConfigSchema = z.object({
  /** Enable personal mode (Baileys) */
  enabled: z.boolean().default(true),
  /** Admin phone number with country code (e.g., "972501234567") */
  adminPhone: z.string().min(1, 'Admin phone is required'),
  /** Path to store auth session files */
  sessionPath: z.string().default('./data/whatsapp-auth'),
  /** Whether to auto-reconnect on disconnect */
  autoReconnect: z.boolean().default(true),
  /** Max messages per minute rate limit */
  messageRateLimit: z.number().positive().default(10),
  /** Group JIDs where bot can respond (empty = DMs only) */
  allowedGroupIds: z.array(z.string()).default([]),
  /** Health monitor configuration */
  healthMonitor: z
    .object({
      /** Enable health monitoring */
      enabled: z.boolean().default(false),
      /** Health check interval in milliseconds (default: 5 minutes) */
      intervalMs: z.number().positive().default(300000),
      /** Number of consecutive failures before triggering pairing (default: 2) */
      failureThreshold: z.number().positive().default(2),
      /** Slack user ID to send DM notifications to */
      slackUserId: z.string().optional(),
    })
    .optional(),
});

export type WhatsAppPersonalConfig = z.infer<typeof WhatsAppPersonalConfigSchema>;

// =============================================================================
// WhatsApp Cloud API Configuration (Bot Mode)
// =============================================================================

export const WhatsAppCloudApiConfigSchema = z.object({
  /** Enable Cloud API bot mode */
  enabled: z.boolean().default(false),
  /** Phone Number ID from Meta Business Manager */
  phoneNumberId: z.string().optional(),
  /** Permanent access token with whatsapp_business_messaging permission */
  accessToken: z.string().optional(),
  /** WhatsApp Business Account ID */
  businessAccountId: z.string().optional(),
  /** Webhook verify token (you create this) */
  webhookVerifyToken: z.string().optional(),
  /** App secret for webhook signature verification */
  appSecret: z.string().optional(),
  /** Pre-approved message templates */
  templates: z
    .object({
      reminder: z.string().default('daily_reminder'),
      slaAlert: z.string().default('sla_alert'),
      dailyDigest: z.string().default('daily_digest'),
    })
    .default({
      reminder: 'daily_reminder',
      slaAlert: 'sla_alert',
      dailyDigest: 'daily_digest',
    }),
  /** API version to use */
  apiVersion: z.string().default('v21.0'),
});

export type WhatsAppCloudApiConfig = z.infer<typeof WhatsAppCloudApiConfigSchema>;

// =============================================================================
// WhatsApp Dual-Mode Configuration
// =============================================================================

export const WhatsAppConfigSchema = z.object({
  /** Personal mode configuration (Baileys - operates as your phone) */
  personal: WhatsAppPersonalConfigSchema.optional(),
  /** Bot mode configuration (Cloud API - separate bot number) */
  bot: WhatsAppCloudApiConfigSchema.optional(),
  /** Default mode for conversations */
  defaultMode: z.enum(['personal', 'bot']).default('personal'),
  /** Mode for sending notifications (reminders, alerts) */
  notificationMode: z.enum(['personal', 'bot']).default('bot'),
});

export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

/** Legacy flat WhatsApp config for backward compatibility */
export const WhatsAppLegacyConfigSchema = z.object({
  adminPhone: z.string().min(1, 'Admin phone is required'),
  sessionPath: z.string().default('./data/whatsapp-auth'),
  autoReconnect: z.boolean().default(true),
  messageRateLimit: z.number().positive().default(10),
  allowedGroupIds: z.array(z.string()).default([]),
});

export type WhatsAppLegacyConfig = z.infer<typeof WhatsAppLegacyConfigSchema>;

// =============================================================================
// Google Docs/Slides Configuration (Service Account)
// =============================================================================

export const GoogleDocsConfigSchema = z.object({
  /** Path to service account credentials JSON */
  credentialsPath: z.string().default('./credentials/service-account.json'),
  /** Google Slides presentation ID for weekly updates */
  presentationId: z.string().optional(),
  /** Template slide IDs for various content types */
  templateSlides: z
    .object({
      weeklyUpdate: z.string().optional(),
      sprintSummary: z.string().optional(),
    })
    .optional(),
});

export type GoogleDocsConfig = z.infer<typeof GoogleDocsConfigSchema>;

// =============================================================================
// Google OAuth Configuration (Personal Accounts)
// =============================================================================

export const GoogleOAuthConfigSchema = z.object({
  /** OAuth 2.0 Client ID from Google Cloud Console */
  clientId: z.string().optional(),
  /** OAuth 2.0 Client Secret from Google Cloud Console */
  clientSecret: z.string().optional(),
  /** Port for local OAuth callback server (default: 8766) */
  callbackPort: z.number().default(8766),
  /** Production callback URL (overrides local callback server) */
  callbackUrl: z.string().optional(),
});

export type GoogleOAuthConfig = z.infer<typeof GoogleOAuthConfigSchema>;

// =============================================================================
// SLA Configuration
// =============================================================================

export const SLAThresholdSchema = z.object({
  /** Status name to monitor */
  status: z.string(),
  /** Maximum days allowed in this status */
  maxDays: z.number().positive(),
});

export const SLAConfigSchema = z.object({
  /** Enable SLA monitoring */
  enabled: z.boolean().default(true),
  /** SLA thresholds per status */
  thresholds: z.array(SLAThresholdSchema).default([
    { status: 'In Progress', maxDays: 3 },
    { status: 'In Review', maxDays: 2 },
    { status: 'To Do', maxDays: 5 },
  ]),
});

export type SLAConfig = z.infer<typeof SLAConfigSchema>;

// =============================================================================
// Board Configuration
// =============================================================================

export const BoardConfigSchema = z.object({
  /** Statuses that are in Kanban backlog (not visible on board) */
  kanbanBacklogStatuses: z
    .array(z.string())
    .default(['IN BACKLOG', 'BACKLOG- NEXT IN LINE', 'BACKLOG']),
});

export type BoardConfig = z.infer<typeof BoardConfigSchema>;

// =============================================================================
// Cron Schedule Configuration
// =============================================================================

export const CronConfigSchema = z.object({
  /** Cron expression for standup reminder */
  standup: z.string().default('30 9 * * 1-5'),
  /** Cron expression for pre-standup data gathering */
  preStandup: z.string().default('15 9 * * 1-5'),
  /** Cron expression for stale issue check */
  staleCheck: z.string().default('0 17 * * 1-5'),
  /** Cron expression for weekly summary */
  weeklySummary: z.string().default('0 16 * * 5'),
});

export type CronConfig = z.infer<typeof CronConfigSchema>;

// =============================================================================
// Agent Configuration
// =============================================================================

export const AgentConfigSchema = z.object({
  /** Enable AI agent */
  enabled: z.boolean().default(false),
  /** Anthropic API key */
  anthropicApiKey: z.string().optional(),
  /** Model to use (e.g., "claude-sonnet-4-20250514") */
  model: z.string().default('claude-sonnet-4-20250514'),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// =============================================================================
// GitHub Configuration (for skill editing via PRs)
// =============================================================================

export const GitHubConfigSchema = z.object({
  /** GitHub personal access token with repo scope */
  token: z.string().optional(),
  /** Repository in format "owner/repo" */
  repo: z.string().optional(),
  /** Base branch for PRs (default: main) */
  baseBranch: z.string().default('main'),
  /** Path to skills directory within the repo */
  skillsPath: z.string().default('.claude/skills'),
});

export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

// =============================================================================
// Skills Configuration
// =============================================================================

export const SkillsConfigSchema = z.object({
  /** Enable skill editing via WhatsApp */
  editingEnabled: z.boolean().default(false),
  /** Secret token for skill reload endpoint */
  reloadToken: z.string().optional(),
  /** Base directory for git worktrees (default: $HOME/skill-worktrees) */
  worktreeBase: z.string().optional(),
  /** Path to the main repository for worktree operations */
  repoPath: z.string().optional(),
});

export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

// =============================================================================
// Dashboard Configuration
// =============================================================================

export const DashboardConfigSchema = z.object({
  /** Enable the admin dashboard */
  enabled: z.boolean().default(true),
  /** Port to serve dashboard */
  port: z.number().default(4098),
  /** Secret for JWT signing (required if enabled) */
  jwtSecret: z.string().optional(),
  /** Default permission for new chats */
  defaultPermission: z.enum(['ignored', 'read_only', 'read_write']).default('read_only'),
});

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;

// =============================================================================
// Feature Flags
// =============================================================================

/**
 * Feature flag definition with UI visibility controls
 * Supports hierarchical relationships and per-feature hide/notify strategies
 */
export const FeatureFlagDefinitionSchema = z.object({
  /** Whether the feature is enabled */
  enabled: z.boolean().default(false),
  /** UI strategy when disabled: 'hide' (remove from UI) or 'notify' (show with overlay) */
  uiStrategy: z.enum(['hide', 'notify']).default('hide'),
  /** Route to control (e.g., /apps, /automation) */
  route: z.string().optional(),
  /** Navigation section where this feature appears */
  navSection: z.enum(['SERVICES', 'MANAGEMENT', 'TOOLS']).optional(),
  /** Parent flag ID for hierarchical relationships */
  parentFlag: z.string().optional(),
});

export type FeatureFlagDefinition = z.infer<typeof FeatureFlagDefinitionSchema>;

/**
 * Feature Flags Configuration Schema
 *
 * IMPORTANT: All features are DISABLED by default for pre-launch safety.
 * To enable features, use one of these methods (in priority order):
 *
 * 1. Environment variables: FEATURE_FLAG_<FLAG_ID>=true
 *    e.g., FEATURE_FLAG_MINI_APPS=true
 *
 * 2. Config file (config.yml):
 *    features:
 *      miniApps:
 *        enabled: true
 *
 * See packages/core/src/config/featureFlags.ts for the resolution logic.
 */
export const FeaturesConfigSchema = z.object({
  /** Enable SLA monitoring and alerts */
  slaMonitoring: FeatureFlagDefinitionSchema.default({ enabled: false, uiStrategy: 'hide' }),
  /** Enable weekly reports/summaries */
  weeklyReports: FeatureFlagDefinitionSchema.default({ enabled: false, uiStrategy: 'hide' }),

  // Dashboard features with UI visibility - ALL DISABLED BY DEFAULT
  /** Mini-Apps feature */
  miniApps: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    route: '/apps',
    navSection: 'MANAGEMENT',
  }),
  /** Mini-Apps: Create new app */
  miniApps_create: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'miniApps',
  }),
  /** Mini-Apps: Edit with AI */
  miniApps_editWithAI: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'miniApps',
  }),
  /** Mini-Apps: Share apps */
  miniApps_share: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'miniApps',
  }),

  /** Automation feature */
  automation: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    route: '/automation',
    navSection: 'MANAGEMENT',
  }),
  /** Automation: Schedules */
  automation_schedules: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'automation',
  }),
  /** Automation: Webhooks */
  automation_webhooks: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'automation',
  }),

  /** Agent Registry feature */
  agentRegistry: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    route: '/agents',
    navSection: 'MANAGEMENT',
  }),
  /** Agent Registry: Edit agents */
  agentRegistry_edit: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'agentRegistry',
  }),

  /** Operations feature */
  operations: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    route: '/operations',
    navSection: 'MANAGEMENT',
  }),
  /** Operations: Monitoring */
  operations_monitoring: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'operations',
  }),
  /** Operations: Storage */
  operations_storage: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'operations',
  }),
  /** Operations: Billing */
  operations_billing: FeatureFlagDefinitionSchema.default({
    enabled: false,
    uiStrategy: 'hide',
    parentFlag: 'operations',
  }),

  // Integration flags - ALL DISABLED BY DEFAULT
  /** Enable WhatsApp bot */
  whatsappBot: FeatureFlagDefinitionSchema.default({ enabled: false, uiStrategy: 'hide' }),
  /** Enable Slack bot */
  slackBot: FeatureFlagDefinitionSchema.default({ enabled: false, uiStrategy: 'hide' }),
  /** Enable Google Slides integration */
  googleSlides: FeatureFlagDefinitionSchema.default({ enabled: false, uiStrategy: 'hide' }),
  /** Enable MCP server */
  mcpServer: FeatureFlagDefinitionSchema.default({ enabled: false, uiStrategy: 'hide' }),
});

export type FeaturesConfig = z.infer<typeof FeaturesConfigSchema>;

// =============================================================================
// Message Database Configuration
// =============================================================================

export const MessageDatabaseConfigSchema = z.object({
  /** Path to SQLite database file */
  dbPath: z.string().default('./data/messages.db'),
  /** How many days to keep messages (optional, null = forever) */
  retentionDays: z.number().positive().optional(),
});

export type MessageDatabaseConfig = z.infer<typeof MessageDatabaseConfigSchema>;

// =============================================================================
// Notification Configuration
// =============================================================================

export const NotificationConfigSchema = z.object({
  /** Enable proactive notifications */
  enabled: z.boolean().default(true),
  /** Preferred channel for notifications */
  preferredChannel: z.enum(['whatsapp', 'slack']).default('whatsapp'),
  /** Daily digest settings */
  dailyDigest: z
    .object({
      enabled: z.boolean().default(true),
      /** Cron expression for daily digest (default: 9am weekdays) */
      schedule: z.string().default('0 9 * * 1-5'),
    })
    .default({
      enabled: true,
      schedule: '0 9 * * 1-5',
    }),
  /** SLA alert settings */
  slaAlerts: z
    .object({
      enabled: z.boolean().default(true),
      /** How often to check for SLA breaches (cron) */
      schedule: z.string().default('0 */4 * * 1-5'),
    })
    .default({
      enabled: true,
      schedule: '0 */4 * * 1-5',
    }),
  /** Reminder settings */
  reminders: z
    .object({
      enabled: z.boolean().default(true),
      /** Default reminder lead time in minutes */
      defaultLeadTimeMinutes: z.number().default(15),
    })
    .default({
      enabled: true,
      defaultLeadTimeMinutes: 15,
    }),
});

export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

// =============================================================================
// Root Application Configuration
// =============================================================================

export const AppConfigSchema = z.object({
  /** Organization-specific settings */
  organization: OrganizationSchema.optional(),

  /** Integration credentials and settings */
  integrations: z
    .object({
      jira: JiraConfigSchema.optional(),
      slack: SlackConfigSchema.optional(),
      whatsapp: WhatsAppConfigSchema.optional(),
      googleDocs: GoogleDocsConfigSchema.optional(),
      googleOAuth: GoogleOAuthConfigSchema.optional(),
    })
    .default({}),

  /** Feature flags - ALL DISABLED BY DEFAULT for pre-launch safety */
  features: FeaturesConfigSchema.optional().default({
    slaMonitoring: { enabled: false, uiStrategy: 'hide' },
    weeklyReports: { enabled: false, uiStrategy: 'hide' },
    miniApps: { enabled: false, uiStrategy: 'hide', route: '/apps', navSection: 'MANAGEMENT' },
    miniApps_create: { enabled: false, uiStrategy: 'hide', parentFlag: 'miniApps' },
    miniApps_editWithAI: { enabled: false, uiStrategy: 'hide', parentFlag: 'miniApps' },
    miniApps_share: { enabled: false, uiStrategy: 'hide', parentFlag: 'miniApps' },
    automation: {
      enabled: false,
      uiStrategy: 'hide',
      route: '/automation',
      navSection: 'MANAGEMENT',
    },
    automation_schedules: { enabled: false, uiStrategy: 'hide', parentFlag: 'automation' },
    automation_webhooks: { enabled: false, uiStrategy: 'hide', parentFlag: 'automation' },
    agentRegistry: {
      enabled: false,
      uiStrategy: 'hide',
      route: '/agents',
      navSection: 'MANAGEMENT',
    },
    agentRegistry_edit: { enabled: false, uiStrategy: 'hide', parentFlag: 'agentRegistry' },
    operations: {
      enabled: false,
      uiStrategy: 'hide',
      route: '/operations',
      navSection: 'MANAGEMENT',
    },
    operations_monitoring: { enabled: false, uiStrategy: 'hide', parentFlag: 'operations' },
    operations_storage: { enabled: false, uiStrategy: 'hide', parentFlag: 'operations' },
    operations_billing: { enabled: false, uiStrategy: 'hide', parentFlag: 'operations' },
    whatsappBot: { enabled: false, uiStrategy: 'hide' },
    slackBot: { enabled: false, uiStrategy: 'hide' },
    googleSlides: { enabled: false, uiStrategy: 'hide' },
    mcpServer: { enabled: false, uiStrategy: 'hide' },
  }),

  /** SLA configuration */
  sla: SLAConfigSchema.optional().default({
    enabled: true,
    thresholds: [
      { status: 'In Progress', maxDays: 3 },
      { status: 'In Review', maxDays: 2 },
      { status: 'To Do', maxDays: 5 },
    ],
  }),

  /** Board/Kanban configuration */
  board: BoardConfigSchema.optional().default({
    kanbanBacklogStatuses: ['IN BACKLOG', 'BACKLOG- NEXT IN LINE', 'BACKLOG'],
  }),

  /** Cron schedules */
  cron: CronConfigSchema.optional().default({
    standup: '30 9 * * 1-5',
    preStandup: '15 9 * * 1-5',
    staleCheck: '0 17 * * 1-5',
    weeklySummary: '0 16 * * 5',
  }),

  /** AI Agent configuration */
  agent: AgentConfigSchema.optional().default({
    enabled: false,
    model: 'claude-sonnet-4-20250514',
  }),

  /** GitHub configuration for skill editing */
  github: GitHubConfigSchema.optional(),

  /** Skills configuration */
  skills: SkillsConfigSchema.optional().default({
    editingEnabled: false,
  }),

  /** Dashboard configuration */
  dashboard: DashboardConfigSchema.optional().default({
    enabled: true,
    port: 4098,
    defaultPermission: 'read_only',
  }),

  /** Message database configuration */
  messageDatabase: MessageDatabaseConfigSchema.optional().default({
    dbPath: './data/messages.db',
  }),

  /** Notification configuration (proactive alerts, reminders, digests) */
  notifications: NotificationConfigSchema.optional().default({
    enabled: true,
    preferredChannel: 'whatsapp',
    dailyDigest: { enabled: true, schedule: '0 9 * * 1-5' },
    slaAlerts: { enabled: true, schedule: '0 */4 * * 1-5' },
    reminders: { enabled: true, defaultLeadTimeMinutes: 15 },
  }),

  /** Timezone for cron jobs and reports */
  timezone: z.string().default('UTC'),

  /** Log level */
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

// =============================================================================
// Legacy BotConfig Compatibility
// =============================================================================

/**
 * Helper to extract Slack bot config from new or legacy format
 */
function extractSlackBotConfig(
  slack: SlackConfig | SlackLegacyConfig | undefined
): SlackLegacyConfig {
  if (!slack) {
    return { botToken: '', signingSecret: '', appToken: '', standupChannel: '#standup' };
  }

  // Check if it's the new format (has 'bot' property)
  if ('bot' in slack && slack.bot) {
    return {
      botToken: slack.bot.token,
      signingSecret: slack.bot.signingSecret,
      appToken: slack.bot.appToken,
      standupChannel: slack.standupChannel || '#standup',
    };
  }

  // Legacy format - has botToken directly
  if ('botToken' in slack) {
    return slack as SlackLegacyConfig;
  }

  return { botToken: '', signingSecret: '', appToken: '', standupChannel: '#standup' };
}

/**
 * Convert the new AppConfig to the legacy BotConfig format
 * This ensures backward compatibility during migration
 */
export function toLegacyBotConfig(config: AppConfig) {
  const slackConfig = extractSlackBotConfig(
    config.integrations.slack as SlackConfig | SlackLegacyConfig | undefined
  );

  return {
    slack: slackConfig,
    jira: {
      host: config.integrations.jira?.host || '',
      email: config.integrations.jira?.email || '',
      apiToken: config.integrations.jira?.apiToken || '',
      projectKey: config.organization?.jiraProjectKey || '',
      component: config.organization?.jiraComponent || '',
    },
    cron: config.cron,
    sla: config.sla?.thresholds || [],
    enableSLAChecking: config.sla?.enabled ?? true,
    board: config.board,
    agent: config.agent,
  };
}

/**
 * Normalize WhatsApp config to always use the new dual-mode format
 */
export function normalizeWhatsAppConfig(
  config: WhatsAppConfig | WhatsAppLegacyConfig | undefined
): WhatsAppConfig | null {
  if (!config) {
    return null;
  }

  // Already new format
  if ('personal' in config || 'bot' in config) {
    return config as WhatsAppConfig;
  }

  // Convert legacy format to new format
  const legacy = config as WhatsAppLegacyConfig;
  return {
    personal: {
      enabled: true,
      adminPhone: legacy.adminPhone,
      sessionPath: legacy.sessionPath || './data/whatsapp-auth',
      autoReconnect: legacy.autoReconnect ?? true,
      messageRateLimit: legacy.messageRateLimit || 10,
      allowedGroupIds: legacy.allowedGroupIds || [],
    },
    defaultMode: 'personal',
    notificationMode: 'bot',
  };
}

/**
 * Normalize Slack config to always use the new dual-mode format
 */
export function normalizeSlackConfig(
  config: SlackConfig | SlackLegacyConfig | undefined
): SlackConfig | null {
  if (!config) {
    return null;
  }

  // Already new format
  if ('bot' in config) {
    return config as SlackConfig;
  }

  // Convert legacy format to new format
  const legacy = config as SlackLegacyConfig;
  return {
    bot: {
      token: legacy.botToken,
      signingSecret: legacy.signingSecret,
      appToken: legacy.appToken,
    },
    standupChannel: legacy.standupChannel || '#standup',
    defaultMode: 'bot',
  };
}
