/**
 * Tool System Type Definitions
 *
 * Central type definitions for the modular MCP tool system.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Version3Client } from 'jira.js';
import type { AppConfig } from '@orient/core';

/**
 * Tool categories for organizing tools by domain
 */
export type ToolCategory =
  | 'jira'
  | 'messaging'
  | 'whatsapp'
  | 'docs'
  | 'google'
  | 'system'
  | 'media';

/**
 * Slack service interface for tools
 */
export interface SlackServiceInterface {
  lookupUserByEmail: (
    email: string
  ) => Promise<{ id: string; name: string; displayName?: string; email?: string } | null>;
  sendDirectMessage: (userId: string, text: string) => Promise<{ ts: string; channel: string }>;
  postMessage: (channel: string, text: string) => Promise<{ ts: string; channel: string }>;
  getUserInfo: (
    userId: string
  ) => Promise<{ id: string; name: string; displayName?: string } | null>;
  uploadAndShareImage: (
    channel: string,
    imageSource: string,
    options?: { filename?: string; caption?: string }
  ) => Promise<{ ts: string; channel: string }>;
}

/**
 * WhatsApp service interface for tools
 */
export interface WhatsAppServiceInterface {
  sendText: (jid: string, text: string) => Promise<{ key: { id: string } }>;
  sendPoll: (jid: string, question: string, options: string[]) => Promise<{ key: { id: string } }>;
  sendImage: (
    jid: string,
    image: Buffer | string,
    options?: { caption?: string }
  ) => Promise<{ key: { id: string } } | null>;
}

/**
 * Services available to tools
 */
export interface ToolServices {
  slack?: SlackServiceInterface;
  whatsapp?: WhatsAppServiceInterface;
}

/**
 * Context passed to tool execution
 * Contains all shared services and configuration
 */
export interface ToolContext {
  /** Application configuration */
  config: AppConfig;

  /** Correlation ID for request tracing */
  correlationId: string;

  /** JIRA client (optional - may not be initialized) */
  jiraClient?: Version3Client;

  /** Slack client (optional - may not be initialized) */
  slackClient?: unknown; // Use unknown to avoid requiring @slack/web-api

  /** Typed services for tool access */
  services?: ToolServices;

  /** Google Slides service (lazy-loaded) */
  getSlidesService?: () => Promise<unknown>;

  /** Message database for WhatsApp (lazy-loaded) */
  getMessageDatabase?: () => Promise<unknown>;

  /** Gemini service for image generation (lazy-loaded) */
  getGeminiService?: () => Promise<unknown>;

  /** Base mascot image buffer for variations */
  getMascotBaseImage?: () => Promise<Buffer>;
}

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  /** Whether the execution was successful */
  success: boolean;

  /** Result data (if successful) */
  data?: T;

  /** Error message (if failed) */
  error?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Extended tool metadata for discovery and search
 */
export interface ToolMetadata {
  /** The MCP tool definition */
  tool: Tool;

  /** Category this tool belongs to */
  category: ToolCategory;

  /** Keywords for search matching */
  keywords: string[];

  /** Use cases - natural language descriptions */
  useCases: string[];

  /** Usage examples */
  examples?: Array<{
    description: string;
    input: Record<string, unknown>;
  }>;
}

/**
 * Tool handler function signature
 */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ToolContext
) => Promise<TOutput>;

/**
 * Tool registration entry
 */
export interface ToolRegistration {
  /** Tool metadata for discovery */
  metadata: ToolMetadata;

  /** Handler function */
  handler: ToolHandler;
}

/**
 * Category metadata for browsing
 */
export interface CategoryInfo {
  name: ToolCategory;
  description: string;
  toolCount: number;
  keywords: string[];
}

/**
 * Search result from tool discovery
 */
export interface ToolSearchResult {
  tool: ToolMetadata;
  score: number;
  matchedKeywords?: string[];
}
