/**
 * HTTP Wrapper Types
 *
 * Request/response types for the eval HTTP API.
 */

import { EvalMocks, EvalPlatform, ExecutionTrace } from '../types.js';

/**
 * Request to invoke an agent
 */
export interface AgentInvokeRequest {
  /** Agent ID to invoke */
  agentId: string;

  /** User prompt */
  prompt: string;

  /** Platform context */
  context?: {
    platform?: EvalPlatform;
    chatId?: string;
    channelId?: string;
  };

  /** Model override */
  model?: string;

  /** Mock responses to configure */
  mocks?: EvalMocks;

  /** Whether to include full trace */
  includeTrace?: boolean;
}

/**
 * Response from agent invocation
 */
export interface AgentInvokeResponse {
  /** Request ID for tracking */
  requestId: string;

  /** Agent that processed the request */
  agentId: string;

  /** Model used */
  model: string;

  /** Whether invocation succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Execution trace */
  trace: ExecutionTrace;
}

/**
 * Request to execute a single tool
 */
export interface ToolExecuteRequest {
  /** Tool name */
  toolName: string;

  /** Tool arguments */
  arguments: Record<string, unknown>;

  /** Mock configuration */
  mocks?: EvalMocks;
}

/**
 * Response from tool execution
 */
export interface ToolExecuteResponse {
  /** Whether execution succeeded */
  success: boolean;

  /** Tool result */
  result?: unknown;

  /** Error message if failed */
  error?: string;

  /** Execution duration */
  durationMs: number;
}

/**
 * Agent summary for listing
 */
export interface AgentListItem {
  id: string;
  name: string;
  description?: string;
  mode?: string;
  enabled: boolean;
  skills?: string[];
  allowedTools?: string[];
  deniedTools?: string[];
}

/**
 * Tool summary for listing
 */
export interface ToolListItem {
  name: string;
  description: string;
  category: string;
  keywords: string[];
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  service: string;
  version?: string;
  uptime?: number;
  checks?: Record<string, boolean>;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}
