/**
 * AI Agent Service - Conversational AI for Slack
 *
 * This service enables natural language conversations in Slack,
 * using Claude to understand requests and execute Slack-focused operations.
 *
 * Exported via @orientbot/agents package.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceLogger } from '@orientbot/core';
import { executeToolLoop, ToolResult, ToolCallingConfig } from './toolCallingService.js';

const agentLogger = createServiceLogger('agent');

// Types for the agent
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationContext {
  messages: Message[];
  userId: string;
  channelId: string;
  threadTs?: string;
  lastActivity: Date;
}

const TOOL_DEFINITIONS: Anthropic.Tool[] = [];

// System prompt for the agent
const SYSTEM_PROMPT = `You are the Orient Task Force Assistant, a helpful bot for the Orient project team at Genoox.

CRITICAL FORMATTING RULES FOR SLACK:
You are responding in Slack, so use Slack's mrkdwn format, NOT standard markdown:
- Bold text: Use *single asterisks* (not **double**)
- Italic text: Use _underscores_ (not *asterisks*)
- Code/monospace: Use \`backticks\` (same as markdown)
- DO NOT use markdown headers like ## or ###. Instead, use bold text or section dividers
- Lists: Use bullet points with • or - 
- Links: Use <url|text> format
- Emoji: Use Slack emoji codes like :white_check_mark: :warning: :rocket: :fire:

Guidelines:
1. Be conversational and helpful. You can chat naturally, not just answer commands.
2. When presenting issue data, format it nicely using bullet points and *bold text* (single asterisks).
3. Use Slack emoji like :white_check_mark: :warning: :rocket: :fire: where appropriate.
4. For issue keys, format them as code with backticks: \`PROJ-123\`
5. If you're unsure what the user wants, ask clarifying questions.
6. Summarize large result sets - don't dump raw JSON.
7. You can discuss the issues, provide insights, and help with project management questions.
8. Structure responses with clear sections using *bold headers* and line breaks, NOT markdown headers.

Example of good Slack formatting:
*In Progress (2 issues):*
• \`PROJ-25519\` - Create analytics events (Tom Guterman)
• \`PROJ-26838\` - Export Case Details for Maccabi Megalab (Unassigned)

*Ready for Deployment (2 issues):*
• \`PROJ-25731\` - HPO term appearing twice fix (Daniel Yamin)
• \`PROJ-25607\` - Fix text breaking during highlight (Amitai Nevo)

Remember: You're part of the team! Be friendly and proactive.`;

export class AgentService {
  private anthropic: Anthropic;
  private conversations: Map<string, ConversationContext> = new Map();
  private readonly MAX_CONVERSATION_AGE_MS = 30 * 60 * 1000; // 30 minutes

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required for the agent service');
    }

    this.anthropic = new Anthropic({ apiKey: key });
    agentLogger.info('Agent service initialized');

    // Periodically clean up old conversations
    setInterval(() => this.cleanupOldConversations(), 5 * 60 * 1000);
  }

  /**
   * Process a message from Slack and generate a response
   */
  async processMessage(
    userMessage: string,
    userId: string,
    channelId: string,
    threadTs?: string
  ): Promise<string> {
    const op = agentLogger.startOperation('processMessage', { userId, channelId });

    try {
      // Get or create conversation context
      const contextKey = threadTs ? `${channelId}:${threadTs}` : `${channelId}:${userId}`;
      let context = this.conversations.get(contextKey);

      if (!context) {
        context = {
          messages: [],
          userId,
          channelId,
          threadTs,
          lastActivity: new Date(),
        };
        this.conversations.set(contextKey, context);
        agentLogger.debug('Created new conversation context', { contextKey });
      }

      // Add user message to context
      context.messages.push({ role: 'user', content: userMessage });
      context.lastActivity = new Date();

      // Trim conversation history if too long
      if (context.messages.length > 20) {
        context.messages = context.messages.slice(-20);
      }

      // Call Claude with tools
      const response = await this.callClaudeWithTools(context.messages);

      // Add assistant response to context
      context.messages.push({ role: 'assistant', content: response });

      op.success('Message processed', {
        responseLength: response.length,
        conversationLength: context.messages.length,
      });

      return response;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return "I'm sorry, I encountered an error processing your request. Please try again or contact support if the issue persists.";
    }
  }

  /**
   * Call Claude with tool use capability
   * Uses the shared executeToolLoop from toolCallingService
   */
  private async callClaudeWithTools(messages: Message[]): Promise<string> {
    // Convert our messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const config: ToolCallingConfig = {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      model: 'claude-sonnet-4-20250514',
    };

    const result = await executeToolLoop(
      this.anthropic,
      anthropicMessages,
      TOOL_DEFINITIONS,
      (toolName, input) => this.executeTool(toolName, input),
      config
    );

    return result.response;
  }

  /**
   * Execute a tool and return the result
   */
  private async executeTool(
    toolName: string,
    _input: Record<string, unknown>
  ): Promise<ToolResult> {
    const op = agentLogger.startOperation('executeTool', { toolName });

    try {
      op.failure(`Tool ${toolName} is not available`);
      return { success: false, error: `Tool ${toolName} is not available` };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { toolName });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Clean up old conversation contexts
   */
  private cleanupOldConversations(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, context] of this.conversations.entries()) {
      if (now.getTime() - context.lastActivity.getTime() > this.MAX_CONVERSATION_AGE_MS) {
        this.conversations.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      agentLogger.debug('Cleaned up old conversations', { count: cleaned });
    }
  }

  /**
   * Clear conversation for a specific context
   */
  clearConversation(channelId: string, threadTs?: string, userId?: string): void {
    const contextKey = threadTs ? `${channelId}:${threadTs}` : `${channelId}:${userId}`;

    if (this.conversations.delete(contextKey)) {
      agentLogger.debug('Cleared conversation', { contextKey });
    }
  }
}

// Singleton instance
let agentInstance: AgentService | null = null;

export function getAgentService(): AgentService {
  if (!agentInstance) {
    agentInstance = new AgentService();
  }
  return agentInstance;
}

export function initializeAgentService(apiKey?: string): AgentService {
  agentInstance = new AgentService(apiKey);
  return agentInstance;
}
