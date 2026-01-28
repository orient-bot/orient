/**
 * @orientbot/core
 *
 * Shared utilities, types, and configuration for the Orient.
 *
 * This package provides:
 * - Configuration loading and validation
 * - Structured logging with Winston
 * - Common type definitions
 * - Utility functions
 */

// Re-export config module (schema types take precedence)
export * from './config/index.js';

// Re-export logger module
export * from './logger/index.js';

// Re-export crypto utilities
export * from './crypto.js';

// Re-export types module (exclude types that conflict with config schema)
export type {
  // JIRA Types
  JiraIssue,
  JiraUser,
  JiraSprint,
  JiraTransition,
  // Standup Types
  StandupResponse,
  StandupSummary,
  StandupMisalignment,
  // Digest Types
  DailyDigest,
  DigestTransition,
  WeeklySummary,
  // Legacy BotConfig
  BotConfig,
  // Agent/Conversation Types
  AgentMessage,
  AgentConversation,
  // WhatsApp Types (legacy - use config schema for new code)
  WhatsAppMediaType,
  WhatsAppAudioType,
  WhatsAppMessage,
  WhatsAppConversation,
  // Poll Types
  PollOption,
  PollContext,
  WhatsAppPoll,
  PollVote,
  PollActionContext,
  PollActionHandler,
  PollVoteResult,
  // Permission Types
  ChatPermissionRecord,
  PermissionAuditEntry,
  DashboardUser,
  ChatWithPermission,
  DashboardStats,
  // System Prompt Types
  PromptPlatform,
  SystemPromptRecord,
  SystemPromptWithInfo,
  // Clarification Types
  ClarificationQuestion,
} from './types/index.js';

// Re-export non-conflicting types/values from types module
export type { ChatPermission, ChatType, SLABreach } from './types/index.js';

// Re-export utils module
export * from './utils/index.js';
