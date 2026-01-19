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
// PROMPT TYPES (re-exported from database-services)
// ============================================

export type {
  PromptPlatform,
  SystemPromptRecord,
  SystemPromptWithInfo,
} from '@orient/database-services';

// PromptServiceConfig and PromptDatabaseInterface are exported from the promptService.ts file
