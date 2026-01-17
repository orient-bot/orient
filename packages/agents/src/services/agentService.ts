/**
 * AI Agent Service - Conversational AI for Slack
 *
 * This service enables natural language conversations in Slack,
 * using Claude to understand requests and execute Jira operations.
 *
 * Exported via @orient/agents package.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceLogger } from '@orient/core';
import type { JiraIssue, SLABreach } from '@orient/core';
import {
  getAllIssues,
  getIssueByKey,
  getInProgressIssues,
  getBoardIssues,
  getBlockerIssues,
  checkSLABreaches,
  getActiveSprintIssues,
  getCompletedThisWeek,
  getCreatedThisWeek,
  getIssuesByStatus,
} from '@orient/integrations';

// Namespace alias for compatibility
const jiraService = {
  getAllIssues,
  getIssueByKey,
  getInProgressIssues,
  getBoardIssues,
  getBlockerIssues,
  checkSLABreaches,
  getActiveSprintIssues,
  getCompletedThisWeek,
  getCreatedThisWeek,
  getIssuesByStatus,
};
import { executeToolLoop, ToolResult, ToolCallingConfig } from './toolCallingService.js';
import * as mcpTools from '@orient/mcp-tools';

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

// Tool definitions are now imported from shared definitions
const resolveSlackJiraTools =
  mcpTools.getSlackJiraTools ||
  (mcpTools as { default?: { getSlackJiraTools?: () => unknown } }).default?.getSlackJiraTools;

if (!resolveSlackJiraTools) {
  throw new Error('getSlackJiraTools is not available from @orient/mcp-tools');
}

const TOOL_DEFINITIONS = resolveSlackJiraTools();

// System prompt for the agent
const SYSTEM_PROMPT = `You are the Orient Task Force Assistant, a helpful bot that manages and reports on Jira issues for the Orient project team at Genoox.

Your capabilities:
- Query Jira issues (all, by status, in progress, blockers, sprint, etc.)
- Check for SLA breaches and stale tickets
- Report on weekly progress and velocity
- Look up specific issue details

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
  private async executeTool(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
    const op = agentLogger.startOperation('executeTool', { toolName });

    try {
      let data: unknown;

      switch (toolName) {
        case 'get_all_issues': {
          const limit = (input.limit as number) || 50;
          const issues = await jiraService.getAllIssues();
          data = this.formatIssueList(issues.slice(0, limit), issues.length);
          break;
        }

        case 'get_issue_details': {
          const issueKey = input.issueKey as string;
          const issue = await jiraService.getIssueByKey(issueKey);
          if (!issue) {
            return { success: false, error: `Issue ${issueKey} not found` };
          }
          data = this.formatIssueDetails(issue);
          break;
        }

        case 'get_in_progress_issues': {
          const issues = await jiraService.getInProgressIssues();
          data = this.formatIssueList(issues, issues.length);
          break;
        }

        case 'get_board_issues': {
          const issues = await jiraService.getBoardIssues();
          data = this.formatIssueList(issues, issues.length);
          break;
        }

        case 'get_blocker_issues': {
          const issues = await jiraService.getBlockerIssues();
          data = this.formatIssueList(issues, issues.length);
          break;
        }

        case 'check_sla_breaches': {
          const breaches = await jiraService.checkSLABreaches();
          data = this.formatSLABreaches(breaches);
          break;
        }

        case 'get_sprint_issues': {
          const issues = await jiraService.getActiveSprintIssues();
          data = this.formatSprintSummary(issues);
          break;
        }

        case 'get_completed_this_week': {
          const issues = await jiraService.getCompletedThisWeek();
          data = this.formatCompletedSummary(issues);
          break;
        }

        case 'get_created_this_week': {
          const issues = await jiraService.getCreatedThisWeek();
          data = this.formatIssueList(issues, issues.length);
          break;
        }

        case 'get_issues_by_status': {
          const status = input.status as string;
          const issues = await jiraService.getIssuesByStatus(status);
          data = this.formatIssueList(issues, issues.length);
          break;
        }

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }

      op.success('Tool executed', { toolName, resultSize: JSON.stringify(data).length });
      return { success: true, data };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { toolName });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Format issue list for the LLM
   */
  private formatIssueList(issues: JiraIssue[], total: number): object {
    return {
      total,
      returned: issues.length,
      issues: issues.map((i) => ({
        key: i.key,
        summary: i.summary,
        status: i.status,
        statusCategory: i.statusCategory,
        assignee: i.assignee?.displayName || 'Unassigned',
        priority: i.priority,
        storyPoints: i.storyPoints,
        labels: i.labels,
      })),
    };
  }

  /**
   * Format single issue details
   */
  private formatIssueDetails(issue: JiraIssue): object {
    return {
      key: issue.key,
      summary: issue.summary,
      description: issue.description,
      status: issue.status,
      statusCategory: issue.statusCategory,
      assignee: issue.assignee?.displayName || 'Unassigned',
      reporter: issue.reporter?.displayName || 'Unknown',
      priority: issue.priority,
      storyPoints: issue.storyPoints,
      labels: issue.labels,
      created: issue.created,
      updated: issue.updated,
    };
  }

  /**
   * Format SLA breaches
   */
  private formatSLABreaches(breaches: SLABreach[]): object {
    return {
      total: breaches.length,
      breaches: breaches.map((b) => ({
        key: b.issue.key,
        summary: b.issue.summary,
        status: b.status,
        daysInStatus: b.daysInStatus,
        maxAllowedDays: b.maxAllowedDays,
        assignee: b.issue.assignee?.displayName || 'Unassigned',
        overdueDays: b.daysInStatus - b.maxAllowedDays,
      })),
    };
  }

  /**
   * Format sprint summary
   */
  private formatSprintSummary(issues: JiraIssue[]): object {
    const byStatus = {
      todo: issues.filter((i) => i.statusCategory === 'To Do'),
      inProgress: issues.filter((i) => i.statusCategory === 'In Progress'),
      done: issues.filter((i) => i.statusCategory === 'Done'),
    };

    return {
      total: issues.length,
      totalPoints: issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0),
      completedPoints: byStatus.done.reduce((sum, i) => sum + (i.storyPoints || 0), 0),
      summary: {
        todoCount: byStatus.todo.length,
        inProgressCount: byStatus.inProgress.length,
        doneCount: byStatus.done.length,
      },
      issues: issues.map((i) => ({
        key: i.key,
        summary: i.summary,
        status: i.status,
        statusCategory: i.statusCategory,
        assignee: i.assignee?.displayName || 'Unassigned',
        storyPoints: i.storyPoints,
      })),
    };
  }

  /**
   * Format completed issues summary
   */
  private formatCompletedSummary(issues: JiraIssue[]): object {
    const velocityPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);

    return {
      count: issues.length,
      velocityPoints,
      issues: issues.map((i) => ({
        key: i.key,
        summary: i.summary,
        assignee: i.assignee?.displayName || 'Unassigned',
        storyPoints: i.storyPoints,
      })),
    };
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
