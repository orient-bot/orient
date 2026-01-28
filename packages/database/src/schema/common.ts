/**
 * Shared Schema Types
 *
 * Enum values and TypeScript types shared between PostgreSQL and SQLite schemas.
 * Using const arrays allows both dialects to use the same type definitions.
 */

// ============================================
// ENUM VALUE ARRAYS
// ============================================

/** Message direction values */
export const MESSAGE_DIRECTION_VALUES = ['incoming', 'outgoing'] as const;

/** Chat type values */
export const CHAT_TYPE_VALUES = ['individual', 'group'] as const;

/** Chat permission level values */
export const CHAT_PERMISSION_VALUES = ['ignored', 'read_only', 'read_write'] as const;

/** Platform values for prompts */
export const PROMPT_PLATFORM_VALUES = ['whatsapp', 'slack'] as const;

/** Slack channel type values */
export const SLACK_CHANNEL_TYPE_VALUES = ['channel', 'dm', 'group_dm', 'private'] as const;

/** Authentication method values */
export const AUTH_METHOD_VALUES = ['password', 'google', 'both'] as const;

/** Agent mode values */
export const AGENT_MODE_VALUES = ['primary', 'specialized'] as const;

/** Tool access type values */
export const TOOL_ACCESS_TYPE_VALUES = ['allow', 'deny'] as const;

/** Permission action values */
export const PERMISSION_ACTION_VALUES = ['allow', 'deny', 'ask'] as const;

/** Permission granularity values */
export const PERMISSION_GRANULARITY_VALUES = ['per_call', 'per_session', 'per_category'] as const;

/** Risk level values */
export const RISK_LEVEL_VALUES = ['low', 'medium', 'high', 'critical'] as const;

/** Approval status values */
export const APPROVAL_STATUS_VALUES = ['pending', 'approved', 'denied', 'expired'] as const;

/** Grant type values */
export const GRANT_TYPE_VALUES = ['tool', 'category', 'policy'] as const;

/** Context type values */
export const CONTEXT_TYPE_VALUES = [
  'default',
  'platform',
  'chat',
  'channel',
  'environment',
] as const;

/** Media type values */
export const MEDIA_TYPE_VALUES = ['image', 'audio', 'video', 'document'] as const;

/** Target type values for scheduled messages */
export const TARGET_TYPE_VALUES = ['whatsapp', 'slack'] as const;

/** Secret action values */
export const SECRET_ACTION_VALUES = ['created', 'updated', 'deleted', 'accessed'] as const;

// ============================================
// TYPESCRIPT TYPES
// ============================================

/** Message direction type */
export type MessageDirection = (typeof MESSAGE_DIRECTION_VALUES)[number];

/** Chat type */
export type ChatType = (typeof CHAT_TYPE_VALUES)[number];

/** Chat permission level */
export type ChatPermission = (typeof CHAT_PERMISSION_VALUES)[number];

/** Platform type */
export type PromptPlatform = (typeof PROMPT_PLATFORM_VALUES)[number];

/** Slack channel type */
export type SlackChannelType = (typeof SLACK_CHANNEL_TYPE_VALUES)[number];

/** Authentication method */
export type AuthMethod = (typeof AUTH_METHOD_VALUES)[number];

/** Agent mode */
export type AgentMode = (typeof AGENT_MODE_VALUES)[number];

/** Tool access type */
export type ToolAccessType = (typeof TOOL_ACCESS_TYPE_VALUES)[number];

/** Permission action */
export type PermissionAction = (typeof PERMISSION_ACTION_VALUES)[number];

/** Permission granularity */
export type PermissionGranularity = (typeof PERMISSION_GRANULARITY_VALUES)[number];

/** Risk level */
export type RiskLevel = (typeof RISK_LEVEL_VALUES)[number];

/** Approval status */
export type ApprovalStatus = (typeof APPROVAL_STATUS_VALUES)[number];

/** Grant type */
export type GrantType = (typeof GRANT_TYPE_VALUES)[number];

/** Context type */
export type ContextType = (typeof CONTEXT_TYPE_VALUES)[number];

/** Media type */
export type MediaType = (typeof MEDIA_TYPE_VALUES)[number];

/** Target type */
export type TargetType = (typeof TARGET_TYPE_VALUES)[number];

/** Secret action */
export type SecretAction = (typeof SECRET_ACTION_VALUES)[number];
