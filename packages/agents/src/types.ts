/**
 * Agent Types
 *
 * Type definitions for AI agent services.
 */

import type { MessageParam, Tool, ContentBlock } from '@anthropic-ai/sdk/resources/messages.js';

/**
 * Agent message in a conversation
 */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Agent conversation state
 */
export interface AgentConversation {
  id: string;
  userId: string;
  channelId: string;
  messages: AgentMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * Tool executor function signature
 */
export type ToolExecutor = (
  toolName: string,
  toolInput: Record<string, unknown>,
  context?: unknown
) => Promise<ToolResult>;

/**
 * Tool calling configuration
 */
export interface ToolCallingConfig {
  /** Maximum tool calls per request */
  maxToolCalls?: number;
  /** Timeout per tool call in ms */
  toolTimeout?: number;
  /** Model to use */
  model?: string;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** System prompt */
  systemPrompt?: string;
}

/**
 * Tool calling result
 */
export interface ToolCallingResult {
  /** Final response text */
  response: string;
  /** Tool calls made during execution */
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: ToolResult;
  }>;
  /** Token usage */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Stop reason */
  stopReason: string;
}

/**
 * Agent configuration from registry
 */
export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  mode: 'primary' | 'specialized';
  enabled: boolean;
  systemPrompt?: string;
  skills: string[];
  tools: {
    allow: string[];
    deny: string[];
  };
  metadata?: Record<string, unknown>;
}

/**
 * Agent context for a specific platform/chat
 */
export interface AgentContext {
  agentId: string;
  agentName: string;
  platform: 'slack' | 'whatsapp' | 'opencode' | 'cursor';
  environment: 'local' | 'prod';
  chatId?: string;
  userId?: string;
  skills: string[];
  tools: {
    allow: string[];
    deny: string[];
  };
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Context rule for agent assignment
 */
export interface ContextRule {
  id: string;
  agentId: string;
  platform?: string;
  environment?: string;
  chatId?: string;
  priority: number;
}

/**
 * Progressive responder configuration
 */
export interface ProgressiveResponderConfig {
  /** Minimum delay between updates in ms */
  minDelay?: number;
  /** Maximum delay between updates in ms */
  maxDelay?: number;
  /** Whether to show thinking indicators */
  showThinking?: boolean;
}

/**
 * Progressive response update
 */
export interface ProgressiveUpdate {
  type: 'thinking' | 'partial' | 'complete' | 'error';
  content: string;
  timestamp: Date;
}

// Re-export Anthropic types for convenience
export type { MessageParam, Tool, ContentBlock };

// ============================================
// PROMPT TYPES
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

/**
 * Prompt service configuration
 */
export interface PromptServiceConfig {
  cacheEnabled?: boolean;
  cacheTtlMs?: number;
}

/**
 * Prompt database interface
 * This is what the PromptService needs from the database
 */
export interface PromptDatabaseInterface {
  getSystemPromptText(platform: PromptPlatform, chatId: string): Promise<string | undefined>;
  getSystemPrompt(
    platform: PromptPlatform,
    chatId: string
  ): Promise<SystemPromptRecord | undefined>;
  setSystemPrompt(
    platform: PromptPlatform,
    chatId: string,
    promptText: string
  ): Promise<SystemPromptRecord>;
  deleteSystemPrompt(platform: PromptPlatform, chatId: string): Promise<boolean>;
  getDefaultPrompt(platform: PromptPlatform): Promise<SystemPromptRecord | undefined>;
  // Note: Returns null for missing prompts (compatible with MessageDatabase)
  getDefaultPrompts(): Promise<Partial<Record<PromptPlatform, SystemPromptRecord | null>>>;
  listSystemPrompts(platform?: PromptPlatform): Promise<SystemPromptWithInfo[]>;
  seedDefaultPrompts(): Promise<void>;
}
