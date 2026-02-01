// Jira Types
export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  status: string;
  statusCategory: 'To Do' | 'In Progress' | 'Done';
  assignee: JiraUser | null;
  reporter: JiraUser | null;
  priority: string;
  created: string;
  updated: string;
  storyPoints: number | null;
  labels: string[];
  sprint: JiraSprint | null;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate: string | null;
  endDate: string | null;
}

export interface JiraTransition {
  yesterday: JiraIssue[];
  today: JiraIssue[];
  blockers: JiraIssue[];
}

// Standup Types
export interface StandupResponse {
  userId: string;
  userName: string;
  yesterday: string;
  today: string;
  blockers: string;
  timestamp: Date;
  mentionedTickets: string[];
}

export interface StandupSummary {
  date: Date;
  responses: StandupResponse[];
  misalignments: StandupMisalignment[];
  totalResponses: number;
  totalBlockers: number;
}

export interface StandupMisalignment {
  userId: string;
  userName: string;
  mentionedTicket: string;
  expectedStatus: string;
  actualStatus: string;
}

// SLA Types
export interface SLAConfig {
  status: string;
  maxDays: number;
}

export interface SLABreach {
  issue: JiraIssue;
  status: string;
  daysInStatus: number;
  maxAllowedDays: number;
}

// Digest Types
export interface DailyDigest {
  date: Date;
  transitionsYesterday: DigestTransition[];
  inProgressToday: JiraIssue[];
  blockers: JiraIssue[];
}

export interface DigestTransition {
  issue: JiraIssue;
  fromStatus: string;
  toStatus: string;
}

export interface WeeklySummary {
  weekStart: Date;
  weekEnd: Date;
  completed: JiraIssue[];
  added: JiraIssue[];
  removed: JiraIssue[];
  agingIssues: SLABreach[];
  velocityPoints: number;
}

// Config Types
export interface BotConfig {
  slack: {
    botToken: string;
    signingSecret: string;
    appToken: string;
    standupChannel: string;
  };
  jira: {
    host: string;
    email: string;
    apiToken: string;
    projectKey: string;
    component: string;
  };
  cron: {
    standup: string;
    preStandup: string;
    staleCheck: string;
    weeklySummary: string;
  };
  sla: SLAConfig[];
  enableSLAChecking: boolean;
  agent?: {
    enabled: boolean;
    anthropicApiKey?: string;
    model?: string;
  };
  board: BoardConfig;
}

// Board configuration for Kanban board structure
// Based on: https://your-domain.atlassian.net/jira/software/c/projects/YOUR_PROJECT/boards/571/settings/columns
export interface BoardConfig {
  // Statuses that are in the Kanban backlog (not visible on the board)
  // These are excluded when asking for "issues on the board" or "open issues"
  kanbanBacklogStatuses: string[];
}

// Agent/Conversation Types
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AgentConversation {
  id: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  messages: AgentMessage[];
  createdAt: Date;
  lastActivity: Date;
}

// WhatsApp Types
export interface WhatsAppConfig {
  adminPhone: string; // Admin phone number with country code (e.g., "972501234567")
  sessionPath: string; // Path to store auth session files
  autoReconnect: boolean; // Whether to auto-reconnect on disconnect
  messageRateLimit?: number; // Max messages per minute (default: 10)
  allowedGroupIds?: string[]; // Group JIDs where bot can respond (default: none - read-only for all groups)
  // Format: "[groupId]@g.us" - leave empty to only respond to DMs
}

export type WhatsAppMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
export type WhatsAppAudioType =
  | 'audio/ogg'
  | 'audio/ogg; codecs=opus'
  | 'audio/mpeg'
  | 'audio/mp4'
  | 'audio/wav'
  | 'audio/webm';

export interface WhatsAppMessage {
  id: string;
  from: string; // Sender phone number (JID format)
  fromPhone: string; // Clean phone number
  text: string;
  timestamp: Date;
  isGroup: boolean;
  groupId?: string;
  // Image/media fields (optional)
  mediaType?: WhatsAppMediaType;
  mediaBuffer?: Buffer; // Raw image buffer for vision processing
  mediaCaption?: string; // Caption sent with the image
  // Audio/voice message fields (optional)
  isAudio?: boolean; // True if this was transcribed from voice
  audioType?: WhatsAppAudioType;
  audioBuffer?: Buffer; // Raw audio data for transcription
  audioDuration?: number; // Duration in seconds
  transcribedText?: string; // Text transcribed from voice (if audio)
  transcribedLanguage?: string; // Detected language from transcription (e.g., 'he', 'en')
}

export interface WhatsAppConversation {
  phone: string;
  messages: AgentMessage[];
  lastActivity: Date;
}

// Message Database Types
export interface MessageDatabaseConfig {
  dbPath?: string; // Path to SQLite database file
  retentionDays?: number; // How many days to keep messages (optional)
}

// Poll Types for Interactive Questions
export interface PollOption {
  text: string;
  id?: string; // Optional ID for programmatic matching
}

// Poll context for tracking conversation state and actions
export interface PollContext {
  originalQuery?: string; // What the user originally asked
  purposeId?: string; // ID to track which clarification this is for
  sessionId?: string; // OpenCode session ID to continue when vote received
  actionId?: string; // Structured action to execute on vote (e.g., 'prepare-examples')
  actionPayload?: Record<string, unknown>; // Data for the action handler
}

export interface WhatsAppPoll {
  id: string; // Unique poll ID (messageKey.id)
  jid: string; // Chat JID where poll was sent
  question: string; // The poll question
  options: string[]; // Available options
  selectableCount: number; // How many options can be selected (1 = single choice)
  createdAt: Date;
  messageSecret?: Uint8Array; // Secret for decrypting votes
  context?: PollContext; // Tracking context for session continuity and actions
}

// Poll action handler interface for structured poll responses
export interface PollActionContext {
  vote: PollVote; // The vote that triggered this action
  poll: WhatsAppPoll; // The poll that was voted on
  sessionId?: string; // OpenCode session to continue (if provided)
  actionPayload?: Record<string, unknown>; // Custom data passed when poll was created
}

export type PollActionHandler = (context: PollActionContext) => Promise<string | null>;

// Result from processing a poll vote
export interface PollVoteResult {
  text: string; // Response text to send
  sessionId?: string; // Session that was used
  cost?: number; // API cost if applicable
  handledByAction: boolean; // Whether an action handler processed this
}

export interface PollVote {
  pollId: string; // The poll message ID
  voterJid: string; // Who voted
  voterPhone: string; // Clean phone number
  selectedOptions: string[]; // Options the user selected
  timestamp: Date;
}

// Clarification Question Types
export interface ClarificationQuestion {
  type: 'text' | 'poll'; // Text question or poll
  question: string; // The question to ask
  options?: string[]; // Options if poll type
  context?: string; // Context about why asking
}

// ============================================
// CHAT PERMISSIONS TYPES
// ============================================

/**
 * Permission levels for WhatsApp chats/groups
 * - ignored: Messages dropped, not stored
 * - read_only: Messages stored, bot does not respond
 * - read_write: Messages stored AND bot can respond
 */
export type ChatPermission = 'ignored' | 'read_only' | 'read_write';

/**
 * Type of WhatsApp chat
 */
export type ChatType = 'individual' | 'group';

/**
 * Chat permission record stored in the database
 */
export interface ChatPermissionRecord {
  chatId: string; // JID (phone@s.whatsapp.net or group@g.us)
  chatType: ChatType; // 'individual' or 'group'
  permission: ChatPermission; // Permission level
  displayName?: string; // Human-readable name
  notes?: string; // Admin notes
  createdAt: string;
  updatedAt: string;
}

/**
 * Audit log entry for permission changes
 */
export interface PermissionAuditEntry {
  id: number;
  chatId: string;
  oldPermission: ChatPermission | null;
  newPermission: ChatPermission;
  changedBy?: string; // Username who made the change
  changedAt: string;
}

/**
 * Dashboard user for authentication
 */
export interface DashboardUser {
  id: number;
  username: string;
  passwordHash: string | null;
  googleId?: string | null;
  googleEmail?: string | null;
  authMethod?: 'password' | 'google' | 'both';
  createdAt: string;
}

/**
 * Dashboard configuration
 */
export interface DashboardConfig {
  enabled: boolean; // Whether dashboard is enabled
  port: number; // Port to serve dashboard (default: 4098)
  jwtSecret: string; // Secret for JWT signing
  defaultPermission: ChatPermission; // Default permission for new chats
}

/**
 * Chat with permission info for dashboard display
 */
export interface ChatWithPermission {
  chatId: string;
  chatType: ChatType;
  permission: ChatPermission;
  displayName?: string;
  notes?: string;
  messageCount?: number; // Number of stored messages
  lastMessageAt?: string; // Timestamp of last message
  createdAt: string;
  updatedAt: string;
  // Smart default fields (for discovered chats without explicit permissions)
  effectivePermission?: ChatPermission; // Permission that will apply (smart-default or fallback)
  isSmartDefaultWritable?: boolean; // True if this chat has smart-default write access
}

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  totalChats: number;
  byPermission: {
    ignored: number;
    read_only: number;
    read_write: number;
  };
  byType: {
    individual: number;
    group: number;
  };
  totalMessages: number;
  chatsWithoutPermissions: number;
}

// ============================================
// SYSTEM PROMPTS TYPES
// ============================================

/**
 * Platform for system prompts
 */
export type PromptPlatform = 'whatsapp' | 'slack';

/**
 * System prompt record stored in the database
 * chat_id = '*' means platform default
 */
export interface SystemPromptRecord {
  id: number;
  chatId: string; // JID/channel ID or '*' for default
  platform: PromptPlatform;
  promptText: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * System prompt with display info for dashboard
 */
export interface SystemPromptWithInfo extends SystemPromptRecord {
  displayName?: string; // Human-readable name of chat/channel
  isDefault: boolean; // True if this is the platform default (chatId = '*')
}

// ============================================
// SLACK TYPES (re-exported from slack.ts)
// ============================================

export * from './slack.js';

// ============================================
// SCHEDULER TYPES (re-exported from scheduler.ts)
// ============================================

export * from './scheduler.js';
export * from './webhook.js';

// ============================================
// PACKAGE RE-EXPORTS
// For new code, prefer importing from packages directly.
// These re-exports are commented out until tsconfig paths are configured.
// ============================================

// TODO: Add tsconfig path mappings for packages, then uncomment:
// export type { AppConfig } from '@orient-bot/core';
// export type { ToolCategory, ToolContext, ToolResult, ToolMetadata } from '@orient-bot/mcp-tools';
// export type { SchedulerJobInfo, SystemHealth } from '@orient-bot/api-gateway';
// export type { MessageStats, PlatformStats, ChatListItem } from '@orient-bot/dashboard';
