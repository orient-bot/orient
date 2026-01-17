/**
 * Core Types Module
 *
 * Shared type definitions used across all packages.
 */

// =============================================================================
// JIRA Types
// =============================================================================

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

// =============================================================================
// SLA Types
// =============================================================================

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

// =============================================================================
// Standup Types
// =============================================================================

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

// =============================================================================
// Digest Types
// =============================================================================

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

// =============================================================================
// Config Types (Legacy - for backward compatibility)
// =============================================================================

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

export interface BoardConfig {
  kanbanBacklogStatuses: string[];
}

// =============================================================================
// Agent/Conversation Types
// =============================================================================

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

// =============================================================================
// WhatsApp Types
// =============================================================================

export interface WhatsAppConfig {
  adminPhone: string;
  sessionPath: string;
  autoReconnect: boolean;
  messageRateLimit?: number;
  allowedGroupIds?: string[];
}

// Simple media type names used across the codebase
export type WhatsAppMediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';
export type WhatsAppAudioType = 'voice' | 'audio';

export interface WhatsAppMessage {
  id: string;
  from: string;
  fromPhone: string;
  text: string;
  timestamp: Date;
  isGroup: boolean;
  groupId?: string;
  mediaType?: WhatsAppMediaType;
  mediaBuffer?: Buffer;
  mediaCaption?: string;
  isAudio?: boolean;
  audioType?: WhatsAppAudioType;
  audioBuffer?: Buffer;
  audioDuration?: number;
  transcribedText?: string;
  transcribedLanguage?: string;
}

export interface WhatsAppConversation {
  phone: string;
  messages: AgentMessage[];
  lastActivity: Date;
}

// =============================================================================
// Message Database Types
// =============================================================================

export interface MessageDatabaseConfig {
  dbPath?: string;
  retentionDays?: number;
}

// =============================================================================
// Poll Types
// =============================================================================

export interface PollOption {
  text: string;
  id?: string;
}

export interface PollContext {
  originalQuery?: string;
  purposeId?: string;
  sessionId?: string;
  actionId?: string;
  actionPayload?: Record<string, unknown>;
}

export interface WhatsAppPoll {
  id: string;
  jid: string;
  question: string;
  options: string[];
  selectableCount: number;
  createdAt: Date;
  messageSecret?: Uint8Array;
  context?: PollContext;
}

export interface PollVote {
  pollId: string;
  voterJid: string;
  voterPhone: string;
  selectedOptions: string[];
  timestamp: Date;
}

export interface PollActionContext {
  vote: PollVote;
  poll: WhatsAppPoll;
  sessionId?: string;
  actionPayload?: Record<string, unknown>;
}

export type PollActionHandler = (context: PollActionContext) => Promise<string | null>;

export interface PollVoteResult {
  text: string;
  sessionId?: string;
  cost?: number;
  handledByAction: boolean;
}

// =============================================================================
// Chat Permissions Types
// =============================================================================

export type ChatPermission = 'ignored' | 'read_only' | 'read_write';
export type ChatType = 'individual' | 'group';

export interface ChatPermissionRecord {
  chatId: string;
  chatType: ChatType;
  permission: ChatPermission;
  displayName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionAuditEntry {
  id: number;
  chatId: string;
  oldPermission: ChatPermission | null;
  newPermission: ChatPermission;
  changedBy?: string;
  changedAt: string;
}

export interface DashboardUser {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface DashboardConfig {
  enabled: boolean;
  port: number;
  jwtSecret: string;
  defaultPermission: ChatPermission;
}

export interface ChatWithPermission {
  chatId: string;
  chatType: ChatType;
  permission: ChatPermission;
  displayName?: string;
  notes?: string;
  messageCount?: number;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  effectivePermission?: ChatPermission;
  isSmartDefaultWritable?: boolean;
}

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

// =============================================================================
// System Prompts Types
// =============================================================================

export type PromptPlatform = 'whatsapp' | 'slack';

export interface SystemPromptRecord {
  id: number;
  chatId: string;
  platform: PromptPlatform;
  promptText: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemPromptWithInfo extends SystemPromptRecord {
  displayName?: string;
  isDefault: boolean;
}

// =============================================================================
// Clarification Question Types
// =============================================================================

export interface ClarificationQuestion {
  type: 'text' | 'poll';
  question: string;
  options?: string[];
  context?: string;
}
