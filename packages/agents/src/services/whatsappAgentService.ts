/**
 * WhatsApp Agent Service - Conversational AI for WhatsApp
 *
 * This service enables natural language conversations via WhatsApp,
 * using Claude to understand requests and execute Jira operations.
 * Formatting is adapted for WhatsApp's text rendering.
 *
 * Exported via @orient/bot-whatsapp package.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createDedicatedServiceLogger } from '@orient/core';
import {
  JiraIssue,
  SLABreach,
  AgentMessage,
  WhatsAppMediaType,
  ClarificationQuestion,
} from '@orient/core';
import * as jiraService from '@orient/integrations/jira';
import { MessageDatabase, type StoredMessage } from '@orient/database-services';
import {
  SkillsService,
  PolicyEngine,
  PlatformAdapterRegistry,
  DrizzlePermissionStore,
  WhatsAppApprovalAdapter,
  DashboardApprovalAdapter,
  type PlatformContext,
} from './index.js';
// Note: WhatsAppService is conditionally imported to avoid circular dependency
import { MCPClientManager, MCPTool } from './mcpClientManager.js';
import {
  executeToolLoop,
  ToolResult,
  ToolCallingConfig,
  successResult,
  failureResult,
} from './toolCallingService.js';
import { getWhatsAppJiraTools } from '@orient/mcp-tools';

// Use dedicated WhatsApp logger - logs go to logs/whatsapp-debug-*.log and logs/whatsapp-error-*.log
const logger = createDedicatedServiceLogger('whatsapp', {
  maxSize: '20m', // 20MB per log file before rotation
  maxDays: '14d', // Keep logs for 14 days
  compress: true, // Compress rotated logs
});

// Extended message type that can include image data
interface MultimodalMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlockParam[];
  timestamp: Date;
}

interface ConversationContext {
  messages: MultimodalMessage[];
  phone: string;
  jid?: string; // Current chat JID for sending messages/polls
  lastActivity: Date;
}

// Input for processing a message with optional image
export interface MessageInput {
  text: string;
  image?: {
    data: Buffer;
    mediaType: WhatsAppMediaType;
  };
}

// JIRA tool definitions are imported from shared definitions
const JIRA_TOOLS = getWhatsAppJiraTools();

// Additional WhatsApp-specific tool definitions (message history, media, clarification, skills)
const WHATSAPP_SPECIFIC_TOOLS: Anthropic.Tool[] = [
  // WhatsApp Message History Tools
  {
    name: 'list_whatsapp_groups',
    description:
      'List all WhatsApp groups that have stored messages. Use this to discover what groups are available before querying messages.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_group_messages',
    description:
      'Get messages from a specific WhatsApp group by its ID or name. Use list_whatsapp_groups first to find available groups. Group names like "NFTom" can be matched to group IDs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        groupId: {
          type: 'string',
          description:
            'The group ID (e.g., "120363422821405641@g.us") or partial name to search for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 50)',
        },
      },
      required: ['groupId'],
    },
  },
  {
    name: 'search_whatsapp_messages',
    description:
      'Search all stored WhatsApp messages by text content. Use for finding specific conversations or topics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        searchText: {
          type: 'string',
          description: 'Text to search for in messages',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 30)',
        },
      },
      required: ['searchText'],
    },
  },
  {
    name: 'get_recent_messages',
    description: 'Get the most recent WhatsApp messages across all conversations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_message_stats',
    description:
      'Get statistics about stored WhatsApp messages (total counts, groups, date range).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  // Group lookup tools
  {
    name: 'search_groups_by_name',
    description:
      'Search for WhatsApp groups by name or subject. Use this when the user mentions a group by name (e.g., "NFTom group", "family chat"). Returns matching groups with their IDs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        searchTerm: {
          type: 'string',
          description: 'The group name or partial name to search for (case-insensitive)',
        },
      },
      required: ['searchTerm'],
    },
  },
  {
    name: 'get_all_groups_with_names',
    description:
      'Get all known WhatsApp groups with their names, subjects, and message counts. Use this to discover what groups are available.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  // Media retrieval tools
  {
    name: 'get_media_messages',
    description:
      'Get messages that contain media (images, voice messages, videos, documents). Can filter by type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'audio', 'video', 'document'],
          description: 'Filter by specific media type (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_group_media',
    description:
      'Get media messages from a specific group. Great for finding images, voice messages, or files shared in a group.',
    input_schema: {
      type: 'object' as const,
      properties: {
        groupIdOrName: {
          type: 'string',
          description: 'The group ID or name to search in',
        },
        mediaType: {
          type: 'string',
          enum: ['image', 'audio', 'video', 'document'],
          description: 'Filter by specific media type (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 30)',
        },
      },
      required: ['groupIdOrName'],
    },
  },
  {
    name: 'get_voice_messages',
    description:
      'Get voice messages with their transcriptions. Great for finding what was said in voice notes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        groupIdOrName: {
          type: 'string',
          description: 'Optional: filter to a specific group',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_media_stats',
    description: 'Get statistics about stored media (images, voice messages, videos, documents).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  // Clarification Tools - for asking follow-up questions
  {
    name: 'ask_clarifying_question',
    description:
      'Ask the user a clarifying question when their request is ambiguous or needs more information. Use this when you need to understand: which issue they mean, what time period, which team member, what priority level, etc. This sends a text question that the user can reply to freely.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The clarifying question to ask the user',
        },
        context: {
          type: 'string',
          description: 'Optional brief context about why you are asking (shown in italics)',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'send_poll_question',
    description:
      'Send an interactive poll to the user when there are specific options to choose from. Better than text questions when: choosing between specific issues, selecting a priority level, picking a team member, yes/no questions, or any scenario with 2-12 discrete options. The user taps their choice instead of typing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The poll question (will be shown as the poll title)',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of options for the user to choose from (2-12 options). Keep options short and clear.',
        },
        allowMultipleAnswers: {
          type: 'boolean',
          description:
            'Whether the user can select multiple options. Default is false (single choice).',
        },
        purposeId: {
          type: 'string',
          description:
            'Optional ID to track what this poll is for (e.g., "select_issue", "choose_priority")',
        },
      },
      required: ['question', 'options'],
    },
  },
  // Skills Tools - for accessing domain-specific knowledge
  {
    name: 'list_available_skills',
    description:
      'List all available skills that provide specialized domain knowledge. Skills contain detailed guidance on specific topics like JIRA management, Slack formatting, workflow management, etc. Use this to discover what specialized knowledge is available.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_skill',
    description:
      'Read a specific skill to get detailed domain knowledge. Use this when you need specialized guidance on topics like: JIRA issue management, Slack message formatting, weekly workflows, presentation updates, or debugging. The skill content provides step-by-step instructions, best practices, and specific rules to follow.',
    input_schema: {
      type: 'object' as const,
      properties: {
        skillName: {
          type: 'string',
          description:
            'The name of the skill to read (e.g., "personal-jira-project-management", "slack-formatting", "personal-weekly-workflow")',
        },
      },
      required: ['skillName'],
    },
  },
];

// Combined tool definitions for the WhatsApp agent
const TOOL_DEFINITIONS: Anthropic.Tool[] = [...JIRA_TOOLS, ...WHATSAPP_SPECIFIC_TOOLS];

// Default system prompt for WhatsApp (adapted formatting)
const DEFAULT_SYSTEM_PROMPT = `You are the Orient Task Force Assistant, a helpful bot that manages and reports on Jira issues for the Orient project team at Genoox. You communicate via WhatsApp.

Your capabilities:
- Query Jira issues (all, by status, in progress, blockers, sprint, etc.)
- Check for SLA breaches and stale tickets
- Report on weekly progress and velocity
- Look up specific issue details
- Provide daily digests and weekly summaries
- *Analyze images* - You can see and understand images sent to you! Users may send screenshots, diagrams, photos of whiteboards, or any visual content for analysis.
- *Access WhatsApp message history* - You can read and search past messages from WhatsApp groups! Use search_groups_by_name or get_all_groups_with_names to find groups by name (e.g., "NFTom"), then get_group_messages to retrieve conversations. Great for summarizing discussions, finding past decisions, or catching up on group activity.
- *Access saved media* - Images and voice messages are saved! Use get_media_messages, get_group_media, or get_voice_messages to find media shared in chats. Voice messages include their transcriptions so you can reference what was said.
- *Ask clarifying questions* - If the user's request is ambiguous or you need more information, you can ask questions!
  • Use \`ask_clarifying_question\` for open-ended questions where the user should type a response
  • Use \`send_poll_question\` when there are specific options to choose from (2-12 choices) - this is more convenient for mobile users who can just tap!
- *Access specialized skills* - You have access to domain-specific knowledge through skills! Use \`list_available_skills\` to see what's available, then \`read_skill\` to load detailed guidance on topics like:
  • JIRA management (issue types, hierarchy rules, required fields, linking)
  • Slack message formatting (mrkdwn syntax differences from Markdown)
  • Workflow management (weekly planning, meeting notes, action items)
  • Presentation updates (updating Google Slides with JIRA data)
  • MCP debugging (log analysis, troubleshooting)
- *External MCP Tools* - You may have access to external MCP (Model Context Protocol) servers! These are powerful tools from external services like Atlassian (Jira/Confluence), databases, and more. MCP tools are prefixed with \`mcp_ServerName_\` (e.g., \`mcp_Atlassian-MCP-Server_searchJiraIssuesUsingJql\`). Use these for:
  • Advanced Jira queries and operations via the Atlassian MCP
  • Confluence page access and editing
  • Database queries via PostgreSQL MCP
  • Any other connected MCP services

WHEN TO USE EXTERNAL MCP TOOLS:
- When you need more advanced Jira capabilities than built-in tools provide
- When asked to search or edit Confluence pages
- When database queries are needed
- The MCP tools provide direct access to external services with full API capabilities

WHEN TO USE SKILLS:
- When asked about JIRA best practices, issue creation rules, or field requirements → read_skill("personal-jira-project-management")
- When formatting messages for Slack → read_skill("slack-formatting")
- When managing weekly workflows or meeting notes → read_skill("personal-weekly-workflow")
- When updating presentations → read_skill("example-presentation-automation")
- When debugging MCP server issues → read_skill("mcp-debugging")

CRITICAL - AVOID TOOL LOOPS:
- **NEVER call the same tool with the same parameters more than once!** If a search returns no results or insufficient data, DO NOT retry with the same query.
- Limit yourself to 3-5 tool calls maximum per user request. More than that indicates you're stuck.
- If searches aren't finding what you need after 2-3 attempts with different queries, STOP and provide a best-effort answer with what you found.
- When the user provides a correction (e.g., "not X, but Y"), DON'T re-search everything. Just acknowledge the correction and adjust your previous answer.
- If you can't find specific information, say "I couldn't find that" rather than endlessly searching.

WHEN TO ASK FOR CLARIFICATION:
- When the user asks about "the issue" but hasn't specified which one
- When a request could apply to multiple time periods (this week, this month, etc.)
- When you need to know which team member or assignee
- When priority or severity is unclear
- When the user's intent is ambiguous between multiple possible actions
- When additional context would significantly improve your response

CLARIFICATION BEST PRACTICES:
1. Use polls for discrete choices (e.g., "Which issue?", "What priority?", "Which team member?")
2. Use text questions for open-ended info (e.g., "What would you like the description to say?")
3. Keep poll options short (ideally < 30 characters each)
4. Limit polls to 2-6 options when possible - too many options is overwhelming
5. After receiving a poll response or answer, proceed with the action

CRITICAL FORMATTING RULES FOR WHATSAPP:
- Bold text: Use *asterisks*
- Italic text: Use _underscores_
- Strikethrough: Use ~tildes~
- Monospace: Use \`\`\`triple backticks\`\`\` for code blocks, single backticks don't work
- Keep messages concise - WhatsApp has character limits and mobile screens are small
- Use bullet points with • or - for lists
- Use emojis liberally to make messages scannable 📊 ✅ ⚠️ 🚧 🔥

Guidelines:
1. Be conversational but concise. WhatsApp users expect quick responses.
2. When presenting issue data, keep it scannable:
   • \`PROJ-123\` - Brief summary _(Status)_
3. Use emojis to indicate status: ✅ Done, 🔄 In Progress, 📋 To Do, 🚧 Blocked
4. For large result sets, summarize counts and show top items only.
5. If you're unsure what the user wants, use the clarification tools to ask.
6. Group related issues by status or assignee for better readability.
7. Include action items or recommendations when relevant.

Example good formatting:
*🔄 In Progress (3 issues):*
• \`\`\`PROJ-123\`\`\` Analytics events _(Tom)_
• \`\`\`PROJ-456\`\`\` Export feature _(Unassigned)_
• \`\`\`PROJ-789\`\`\` Bug fix _(Daniel)_

*🚧 Blockers:*
• \`\`\`PROJ-321\`\`\` Waiting on API access

Remember: Keep it brief, actionable, and easy to read on a phone!`;

// Get the system prompt, using environment variable if set, otherwise default
function getSystemPrompt(): string {
  return process.env.WHATSAPP_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
}

export class WhatsAppAgentService {
  private anthropic: Anthropic;
  private conversations: Map<string, ConversationContext> = new Map();
  private readonly MAX_CONVERSATION_AGE_MS = 60 * 60 * 1000; // 1 hour for WhatsApp
  private messageDb: MessageDatabase | null = null;
  private whatsappService: WhatsAppService | null = null;
  private skillsService: SkillsService | null = null;
  private mcpClientManager: MCPClientManager | null = null;
  private permissionEngine: PolicyEngine | null = null;
  // Cache for group names (groupId -> groupName)
  private groupNameCache: Map<string, string> = new Map();
  // Cache for MCP tools (updated when MCPClientManager changes)
  private mcpToolsCache: MCPTool[] = [];

  constructor(
    apiKey?: string,
    messageDb?: MessageDatabase,
    whatsappService?: WhatsAppService,
    skillsService?: SkillsService,
    mcpClientManager?: MCPClientManager
  ) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required for the agent service');
    }

    this.anthropic = new Anthropic({ apiKey: key });
    this.messageDb = messageDb || null;
    this.whatsappService = whatsappService || null;
    this.skillsService = skillsService || null;
    this.mcpClientManager = mcpClientManager || null;

    if (this.whatsappService) {
      const adapterRegistry = new PlatformAdapterRegistry();
      adapterRegistry.register(
        new WhatsAppApprovalAdapter({
          sendMessage: (jid, text) => this.whatsappService!.sendBotResponse(jid, text),
        })
      );
      adapterRegistry.register(new DashboardApprovalAdapter());

      this.permissionEngine = new PolicyEngine({
        store: new DrizzlePermissionStore(),
        adapterRegistry,
        fallbackPlatform: 'dashboard',
      });
    }

    // Load MCP tools if manager is provided
    if (this.mcpClientManager) {
      this.mcpToolsCache = this.mcpClientManager.getAllTools();
    }

    logger.info('WhatsApp agent service initialized', {
      hasMessageDb: !!messageDb,
      hasWhatsAppService: !!whatsappService,
      hasSkillsService: !!skillsService,
      hasMCPClientManager: !!mcpClientManager,
      mcpToolCount: this.mcpToolsCache.length,
    });

    // Periodically clean up old conversations
    setInterval(() => this.cleanupOldConversations(), 10 * 60 * 1000);
  }

  /**
   * Set the message database (can be set after construction)
   */
  setMessageDatabase(db: MessageDatabase): void {
    this.messageDb = db;
    logger.info('Message database attached to agent service');
  }

  /**
   * Set the WhatsApp service (can be set after construction)
   */
  setWhatsAppService(service: WhatsAppService): void {
    this.whatsappService = service;
    logger.info('WhatsApp service attached to agent service');
  }

  /**
   * Set the skills service (can be set after construction)
   */
  setSkillsService(service: SkillsService): void {
    this.skillsService = service;
    logger.info('Skills service attached to agent service');
  }

  /**
   * Set the MCP Client Manager (can be set after construction)
   */
  setMCPClientManager(manager: MCPClientManager): void {
    this.mcpClientManager = manager;
    this.mcpToolsCache = manager.getAllTools();
    logger.info('MCP Client Manager attached to agent service', {
      mcpToolCount: this.mcpToolsCache.length,
      servers: manager.getConnectedServers(),
    });
  }

  /**
   * Refresh MCP tools cache (call after MCP servers connect/reconnect)
   */
  refreshMCPTools(): void {
    if (this.mcpClientManager) {
      this.mcpToolsCache = this.mcpClientManager.getAllTools();
      logger.info('Refreshed MCP tools cache', { mcpToolCount: this.mcpToolsCache.length });
    }
  }

  /**
   * Send a WhatsApp message directly (for background job results)
   */
  private async sendWhatsAppMessage(jid: string, message: string): Promise<void> {
    if (!this.whatsappService) {
      logger.warn('Cannot send message - WhatsApp service not available');
      return;
    }

    try {
      await this.whatsappService.sendMessage(jid, message);
      logger.debug('Sent background job result message', { jid });
    } catch (error) {
      logger.error('Failed to send WhatsApp message', {
        error: error instanceof Error ? error.message : String(error),
        jid,
      });
      throw error;
    }
  }

  /**
   * Get combined tool definitions (built-in + MCP tools)
   */
  private getCombinedToolDefinitions(): Anthropic.Tool[] {
    // Start with built-in tools
    const tools: Anthropic.Tool[] = [...TOOL_DEFINITIONS];

    // Add MCP tools with prefixed names
    for (const mcpTool of this.mcpToolsCache) {
      tools.push({
        name: mcpTool.prefixedName,
        description: mcpTool.description || `Tool from ${mcpTool.serverName}: ${mcpTool.name}`,
        input_schema: mcpTool.inputSchema,
      });
    }

    return tools;
  }

  /**
   * Check if a tool name is an MCP tool
   */
  private isMCPTool(toolName: string): boolean {
    return toolName.startsWith('mcp_');
  }

  /**
   * Get group name from cache, database, or fetch from WhatsApp
   */
  private async getGroupName(groupId: string): Promise<string | null> {
    // Check cache first
    if (this.groupNameCache.has(groupId)) {
      return this.groupNameCache.get(groupId) || null;
    }

    // Check database for stored group metadata
    if (this.messageDb) {
      const storedGroup = await this.messageDb.getGroup(groupId);
      if (storedGroup && (storedGroup.group_name || storedGroup.group_subject)) {
        const name = storedGroup.group_name || storedGroup.group_subject || null;
        if (name) {
          this.groupNameCache.set(groupId, name);
          return name;
        }
      }
    }

    // Try to fetch from WhatsApp
    if (this.whatsappService) {
      const metadata = await this.whatsappService.getGroupMetadata(groupId);
      if (metadata) {
        this.groupNameCache.set(groupId, metadata.subject);
        // Also store in database for future lookups
        if (this.messageDb) {
          await this.messageDb.upsertGroup(
            groupId,
            metadata.subject,
            metadata.subject,
            metadata.participants
          );
        }
        return metadata.subject;
      }
    }

    return null;
  }

  /**
   * Find group by name (partial match)
   */
  private async findGroupByName(searchName: string): Promise<string | null> {
    if (!this.messageDb) return null;

    const searchLower = searchName.toLowerCase();

    // First check stored groups in database
    const storedGroups = await this.messageDb.searchGroups(searchName);
    if (storedGroups.length > 0) {
      const match = storedGroups[0];
      const name = match.group_name || match.group_subject;
      if (name) {
        this.groupNameCache.set(match.group_id, name);
      }
      return match.group_id;
    }

    // Fallback: check all groups and fetch names from WhatsApp
    const groups = await this.messageDb.getUniqueGroups();
    for (const groupId of groups) {
      const groupName = await this.getGroupName(groupId);
      if (groupName && groupName.toLowerCase().includes(searchLower)) {
        return groupId;
      }
    }

    return null;
  }

  /**
   * Process a message from WhatsApp and generate a response
   * Supports both text-only and multimodal (text + image) messages
   * @param userMessage - The text message from the user
   * @param phone - The user's phone number
   * @param image - Optional image data
   * @param jid - The JID (chat identifier) to send responses to
   */
  async processMessage(
    userMessage: string,
    phone: string,
    image?: { data: Buffer; mediaType: WhatsAppMediaType },
    jid?: string
  ): Promise<string> {
    const op = logger.startOperation('processMessage', { phone, hasImage: !!image });

    try {
      // Get or create conversation context
      let context = this.conversations.get(phone);

      if (!context) {
        context = {
          messages: [],
          phone,
          jid,
          lastActivity: new Date(),
        };
        this.conversations.set(phone, context);
        logger.debug('Created new conversation context', { phone });
      } else if (jid) {
        // Update JID in case it changed (e.g., switched from DM to group)
        context.jid = jid;
      }

      const approvalHandled = await this.tryHandleApprovalMessage(userMessage, context);
      if (approvalHandled) {
        return approvalHandled;
      }

      // Build the message content - can be string or multimodal blocks
      let messageContent: string | Anthropic.ContentBlockParam[];

      if (image) {
        // Multimodal message with image
        const contentBlocks: Anthropic.ContentBlockParam[] = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mediaType,
              data: image.data.toString('base64'),
            },
          },
        ];

        // Add text if present
        if (userMessage && userMessage.trim()) {
          contentBlocks.push({
            type: 'text',
            text: userMessage,
          });
        } else {
          // Default prompt for images without text
          contentBlocks.push({
            type: 'text',
            text: 'Please analyze this image and tell me what you see.',
          });
        }

        messageContent = contentBlocks;
        logger.info('Processing multimodal message with image', {
          phone,
          imageSize: image.data.length,
          hasCaption: !!userMessage?.trim(),
        });
      } else {
        messageContent = userMessage;
      }

      // Add user message to context
      context.messages.push({
        role: 'user',
        content: messageContent,
        timestamp: new Date(),
      });
      context.lastActivity = new Date();

      // Trim conversation history if too long (WhatsApp conversations can be longer)
      // Note: We keep fewer messages when images are involved to manage token limits
      const maxMessages = image ? 20 : 30;
      if (context.messages.length > maxMessages) {
        context.messages = context.messages.slice(-maxMessages);
      }

      // Call Claude with tools
      const response = await this.callClaudeWithTools(context.messages, context);

      // Add assistant response to context
      context.messages.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      });

      op.success('Message processed', {
        responseLength: response.length,
        conversationLength: context.messages.length,
        hadImage: !!image,
      });

      return response;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return '❌ Sorry, I encountered an error. Please try again in a moment.';
    }
  }

  /**
   * Call Claude with tool use capability
   * Uses the shared executeToolLoop from toolCallingService
   * @param messages - The conversation messages
   * @param jid - Optional JID for sending polls/questions
   */
  private async callClaudeWithTools(
    messages: MultimodalMessage[],
    conversation: ConversationContext
  ): Promise<string> {
    // Get combined tool definitions (built-in + MCP)
    const allTools = this.getCombinedToolDefinitions();

    logger.debug('Tool definitions', {
      builtInTools: TOOL_DEFINITIONS.length,
      mcpTools: this.mcpToolsCache.length,
      totalTools: allTools.length,
    });

    // Convert our messages to Anthropic format
    // Content can be either string or ContentBlockParam[]
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content as string | Anthropic.ContentBlockParam[],
    }));

    const config: ToolCallingConfig = {
      systemPrompt: getSystemPrompt(),
      maxTokens: 2048, // Shorter for WhatsApp
      model: 'claude-sonnet-4-20250514',
    };

    if (this.permissionEngine && conversation.jid) {
      const permissionContext: PlatformContext = {
        platform: 'whatsapp',
        userId: conversation.phone,
        sessionId: conversation.jid,
        chatId: conversation.jid,
        metadata: { phone: conversation.phone },
      };

      config.permission = {
        engine: this.permissionEngine,
        context: permissionContext,
        agentId: 'whatsapp-agent',
      };
    }

    const result = await executeToolLoop(
      this.anthropic,
      anthropicMessages,
      allTools,
      (toolName, input) => this.executeTool(toolName, input, conversation.jid),
      config,
      conversation.jid // Pass jid as context
    );

    return result.response;
  }

  private async tryHandleApprovalMessage(
    userMessage: string,
    context: ConversationContext
  ): Promise<string | null> {
    if (!this.permissionEngine) return null;

    const normalized = userMessage.trim().toLowerCase();
    if (
      !normalized.includes('approve') &&
      !normalized.includes('deny') &&
      !normalized.includes('yes') &&
      !normalized.includes('no')
    ) {
      return null;
    }

    const hasRequestId = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(
      userMessage
    );
    if (!hasRequestId) {
      return null;
    }

    const result = await this.permissionEngine.handlePlatformResponse('whatsapp', {
      body: userMessage,
      from: context.phone,
      senderId: context.phone,
    });

    if (!result) {
      return null;
    }

    return `Approval ${result.status}.`;
  }

  /**
   * Execute a tool and return the result
   * @param toolName - Name of the tool to execute
   * @param input - Tool input parameters
   * @param jid - Optional JID for sending messages/polls
   */
  private async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    jid?: string
  ): Promise<ToolResult> {
    const op = logger.startOperation('executeTool', { toolName });

    try {
      // Handle MCP tools (prefixed with "mcp_")
      if (this.isMCPTool(toolName)) {
        return await this.executeMCPTool(toolName, input);
      }

      let data: unknown;

      switch (toolName) {
        case 'get_all_issues': {
          const limit = (input.limit as number) || 20; // Lower default for WhatsApp
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

        case 'get_weekly_summary': {
          const [completed, created, breaches, sprintIssues, inProgress, blockers] =
            await Promise.all([
              jiraService.getCompletedThisWeek(),
              jiraService.getCreatedThisWeek(),
              jiraService.checkSLABreaches(),
              jiraService.getActiveSprintIssues(),
              jiraService.getInProgressIssues(),
              jiraService.getBlockerIssues(),
            ]);

          data = {
            weekEnding: new Date().toISOString().split('T')[0],
            completed: {
              count: completed.length,
              points: completed.reduce((sum, i) => sum + (i.storyPoints || 0), 0),
              issues: completed.slice(0, 5).map((i) => ({
                key: i.key,
                summary: i.summary,
                assignee: i.assignee?.displayName || 'Unassigned',
              })),
            },
            inProgress: {
              count: inProgress.length,
              issues: inProgress.map((i) => ({
                key: i.key,
                summary: i.summary,
                assignee: i.assignee?.displayName || 'Unassigned',
              })),
            },
            blockers: {
              count: blockers.length,
              issues: blockers.map((b) => ({
                key: b.key,
                summary: b.summary,
              })),
            },
            slaBreaches: {
              count: breaches.length,
              issues: breaches.slice(0, 3).map((b) => ({
                key: b.issue.key,
                status: b.status,
                daysOverdue: b.daysInStatus - b.maxAllowedDays,
              })),
            },
            created: {
              count: created.length,
            },
            sprint: {
              count: sprintIssues.length,
              points: sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0),
            },
          };
          break;
        }

        case 'get_daily_digest': {
          const [inProgress, blockers] = await Promise.all([
            jiraService.getInProgressIssues(),
            jiraService.getBlockerIssues(),
          ]);

          data = {
            date: new Date().toISOString().split('T')[0],
            inProgress: {
              count: inProgress.length,
              issues: inProgress.map((i) => ({
                key: i.key,
                summary: i.summary,
                assignee: i.assignee?.displayName || 'Unassigned',
              })),
            },
            blockers: {
              count: blockers.length,
              issues: blockers.map((b) => ({
                key: b.key,
                summary: b.summary,
                assignee: b.assignee?.displayName || 'Unassigned',
              })),
            },
          };
          break;
        }

        // WhatsApp Message History Tools
        case 'list_whatsapp_groups': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const groups = await this.messageDb.getUniqueGroups();
          // Get group names and sample messages for each group
          const groupInfo = await Promise.all(
            groups.map(async (groupId) => {
              const messages = await this.messageDb!.getMessagesByGroup(groupId, 5);
              const latestMessage = messages[0];
              const groupName = await this.getGroupName(groupId);
              return {
                groupId,
                groupName: groupName || 'Unknown Group',
                messageCount: messages.length,
                latestMessage: latestMessage
                  ? {
                      text: latestMessage.text.substring(0, 100),
                      timestamp: latestMessage.timestamp,
                    }
                  : null,
              };
            })
          );
          data = {
            totalGroups: groups.length,
            groups: groupInfo,
          };
          break;
        }

        case 'get_group_messages': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const groupIdInput = input.groupId as string;
          const limit = (input.limit as number) || 50;

          // Try to find the group - either exact match or search by name
          let targetGroupId = groupIdInput;
          let groupName: string | null = null;

          if (!groupIdInput.includes('@g.us')) {
            // User provided a name, try to find matching group
            const foundGroupId = await this.findGroupByName(groupIdInput);
            if (foundGroupId) {
              targetGroupId = foundGroupId;
              groupName = await this.getGroupName(foundGroupId);
              logger.info('Found group by name', {
                searchName: groupIdInput,
                foundGroupId,
                groupName,
              });
            } else {
              return {
                success: false,
                error: `No group found matching "${groupIdInput}". Use list_whatsapp_groups to see available groups.`,
              };
            }
          } else {
            groupName = await this.getGroupName(targetGroupId);
          }

          const messages = await this.messageDb.getMessagesByGroup(targetGroupId, limit);
          if (messages.length === 0) {
            return {
              success: false,
              error: `No messages found for group "${groupName || targetGroupId}"`,
            };
          }

          const formatted = this.formatWhatsAppMessages(messages, targetGroupId);
          data = {
            ...formatted,
            groupName: groupName || 'Unknown Group',
          };
          break;
        }

        case 'search_whatsapp_messages': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const searchText = input.searchText as string;
          const limit = (input.limit as number) || 30;

          const messages = await this.messageDb.fullTextSearch(searchText, limit);
          data = {
            searchTerm: searchText,
            resultCount: messages.length,
            messages: messages.map((m) => ({
              text: m.text,
              direction: m.direction,
              phone: m.phone,
              isGroup: !!m.is_group,
              groupId: m.group_id,
              timestamp: m.timestamp,
            })),
          };
          break;
        }

        case 'get_recent_messages': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const limit = (input.limit as number) || 30;

          const messages = await this.messageDb.getRecentMessages(limit);
          data = {
            count: messages.length,
            messages: messages.map((m) => ({
              text: m.text.substring(0, 200),
              direction: m.direction,
              phone: m.phone,
              isGroup: !!m.is_group,
              groupId: m.group_id,
              timestamp: m.timestamp,
            })),
          };
          break;
        }

        case 'get_message_stats': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const stats = await this.messageDb.getStats();
          const groups = await this.messageDb.getUniqueGroups();
          data = {
            ...stats,
            groupIds: groups,
          };
          break;
        }

        // Clarification Tools
        case 'ask_clarifying_question': {
          if (!this.whatsappService || !jid) {
            // Fallback: Return a message that Claude should display to the user
            const question = input.question as string;
            const context = input.context as string | undefined;
            data = {
              action: 'ask_question',
              sent: false,
              fallbackMessage: context
                ? `❓ *Clarification Needed*\n\n${question}\n\n_${context}_`
                : `❓ *Clarification Needed*\n\n${question}`,
              note: 'WhatsApp service not available - please include this question in your response text',
            };
            break;
          }

          const question = input.question as string;
          const context = input.context as string | undefined;

          await this.whatsappService.sendQuestion(jid, question, context);

          data = {
            action: 'asked_question',
            sent: true,
            question,
            context,
            note: 'Question sent to user. Wait for their response before proceeding.',
          };

          logger.info('Sent clarifying question', { jid, question });
          break;
        }

        case 'send_poll_question': {
          if (!this.whatsappService || !jid) {
            // Fallback: Format as numbered list for user to respond to
            const question = input.question as string;
            const options = input.options as string[];
            const numberedOptions = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
            data = {
              action: 'send_poll',
              sent: false,
              fallbackMessage: `📊 *${question}*\n\n${numberedOptions}\n\n_Reply with the number of your choice_`,
              note: 'WhatsApp service not available - please include this poll as text in your response',
            };
            break;
          }

          const question = input.question as string;
          const options = input.options as string[];
          const allowMultiple = (input.allowMultipleAnswers as boolean) || false;
          const purposeId = input.purposeId as string | undefined;

          // Validate options
          if (!options || options.length < 2) {
            return { success: false, error: 'Poll must have at least 2 options' };
          }
          if (options.length > 12) {
            return { success: false, error: 'Poll can have at most 12 options' };
          }

          const poll = await this.whatsappService.sendPoll(
            jid,
            question,
            options,
            allowMultiple ? options.length : 1,
            { originalQuery: undefined, purposeId }
          );

          data = {
            action: 'poll_sent',
            sent: true,
            pollId: poll.id,
            question,
            options,
            allowMultiple,
            note: 'Poll sent to user. Wait for their response (poll vote) before proceeding. The user will tap on their choice.',
          };

          logger.info('Sent poll question', {
            jid,
            pollId: poll.id,
            question,
            optionCount: options.length,
          });
          break;
        }

        // Group Lookup Tools
        case 'search_groups_by_name': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const searchTerm = input.searchTerm as string;
          const groups = await this.messageDb.searchGroups(searchTerm);

          data = {
            searchTerm,
            resultCount: groups.length,
            groups: groups.map((g) => ({
              groupId: g.group_id,
              groupName: g.group_name || g.group_subject || 'Unknown',
              subject: g.group_subject,
              participantCount: g.participant_count,
              lastUpdated: g.last_updated,
            })),
          };
          break;
        }

        case 'get_all_groups_with_names': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const allGroups = await this.messageDb.getAllGroups();
          const groupsWithStats = await Promise.all(
            allGroups.map(async (g) => {
              const messages = await this.messageDb!.getMessagesByGroup(g.group_id, 1);
              const mediaMessages = await this.messageDb!.getMediaMessagesByGroup(g.group_id, 1000);
              const mediaCount = mediaMessages.length;
              let messageCount = 0;
              if (messages.length > 0) {
                const allMessages = await this.messageDb!.getMessagesByGroup(g.group_id, 10000);
                messageCount = allMessages.length;
              }
              return {
                groupId: g.group_id,
                groupName: g.group_name || g.group_subject || 'Unknown',
                subject: g.group_subject,
                participantCount: g.participant_count,
                messageCount,
                mediaCount,
                lastUpdated: g.last_updated,
              };
            })
          );

          data = {
            totalGroups: allGroups.length,
            groups: groupsWithStats,
          };
          break;
        }

        // Media Retrieval Tools
        case 'get_media_messages': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const mediaType = input.mediaType as string | undefined;
          const limit = (input.limit as number) || 30;

          const messages = await this.messageDb.getMediaMessages(limit, mediaType);
          data = {
            count: messages.length,
            mediaType: mediaType || 'all',
            messages: messages.map((m) => ({
              text: m.text.substring(0, 200),
              mediaType: m.media_type,
              mediaPath: m.media_path,
              mimeType: m.media_mime_type,
              transcribedText: m.transcribed_text,
              direction: m.direction,
              phone: m.phone,
              isGroup: !!m.is_group,
              groupId: m.group_id,
              timestamp: m.timestamp,
            })),
          };
          break;
        }

        case 'get_group_media': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const groupIdOrName = input.groupIdOrName as string;
          const mediaType = input.mediaType as string | undefined;
          const limit = (input.limit as number) || 30;

          // Resolve group ID from name if needed
          let targetGroupId = groupIdOrName;
          let groupName: string | null = null;

          if (!groupIdOrName.includes('@g.us')) {
            const foundGroupId = await this.findGroupByName(groupIdOrName);
            if (foundGroupId) {
              targetGroupId = foundGroupId;
              groupName = await this.getGroupName(foundGroupId);
            } else {
              return {
                success: false,
                error: `No group found matching "${groupIdOrName}"`,
              };
            }
          } else {
            groupName = await this.getGroupName(targetGroupId);
          }

          const messages = await this.messageDb.getMediaMessagesByGroup(
            targetGroupId,
            limit,
            mediaType
          );
          data = {
            groupId: targetGroupId,
            groupName: groupName || 'Unknown Group',
            count: messages.length,
            mediaType: mediaType || 'all',
            messages: messages.map((m) => ({
              text: m.text.substring(0, 200),
              mediaType: m.media_type,
              mediaPath: m.media_path,
              mimeType: m.media_mime_type,
              transcribedText: m.transcribed_text,
              direction: m.direction,
              timestamp: m.timestamp,
            })),
          };
          break;
        }

        case 'get_voice_messages': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const groupIdOrName = input.groupIdOrName as string | undefined;
          const limit = (input.limit as number) || 30;

          let messages;
          let groupName: string | null = null;

          if (groupIdOrName) {
            // Resolve group ID from name if needed
            let targetGroupId = groupIdOrName;

            if (!groupIdOrName.includes('@g.us')) {
              const foundGroupId = await this.findGroupByName(groupIdOrName);
              if (foundGroupId) {
                targetGroupId = foundGroupId;
                groupName = await this.getGroupName(foundGroupId);
              } else {
                return {
                  success: false,
                  error: `No group found matching "${groupIdOrName}"`,
                };
              }
            } else {
              groupName = await this.getGroupName(targetGroupId);
            }

            messages = await this.messageDb.getMediaMessagesByGroup(targetGroupId, limit, 'audio');
          } else {
            messages = await this.messageDb.getVoiceMessages(limit);
          }

          // Format voice messages with transcription info
          const voiceData = messages.map((m) => ({
            text: m.text,
            transcribedText: m.transcribed_text,
            language: m.transcribed_language,
            mediaPath: m.media_path,
            direction: m.direction,
            phone: m.phone,
            isGroup: !!m.is_group,
            groupId: m.group_id,
            timestamp: m.timestamp,
          }));

          data = {
            count: messages.length,
            groupName: groupName,
            voiceMessages: voiceData,
          };
          break;
        }

        case 'get_media_stats': {
          if (!this.messageDb) {
            return { success: false, error: 'Message database not available' };
          }
          const mediaStats = await this.messageDb.getMediaStats();
          const messageStats = await this.messageDb.getStats();

          data = {
            images: mediaStats.imageCount,
            voiceMessages: mediaStats.audioCount,
            videos: mediaStats.videoCount,
            documents: mediaStats.documentCount,
            totalMedia:
              mediaStats.imageCount +
              mediaStats.audioCount +
              mediaStats.videoCount +
              mediaStats.documentCount,
            totalMessages: messageStats.totalMessages,
            groups: messageStats.uniqueGroups,
          };
          break;
        }

        // Skills Tools
        case 'list_available_skills': {
          if (!this.skillsService) {
            return { success: false, error: 'Skills service not available' };
          }
          const skills = this.skillsService.listSkills();
          data = {
            count: skills.length,
            skills: skills.map((s: { name: string; description: string }) => ({
              name: s.name,
              description: s.description,
            })),
            note: 'Use read_skill with a skill name to get detailed guidance on that topic.',
          };
          break;
        }

        case 'read_skill': {
          if (!this.skillsService) {
            return { success: false, error: 'Skills service not available' };
          }
          const skillName = input.skillName as string;
          const skill = this.skillsService.readSkill(skillName);

          if (!skill) {
            const availableSkills = this.skillsService.listSkills();
            return {
              success: false,
              error: `Skill "${skillName}" not found. Available skills: ${availableSkills
                .map((s: { name: string }) => s.name)
                .join(', ')}`,
            };
          }

          data = {
            name: skill.name,
            description: skill.description,
            content: skill.content,
            note: 'Use this knowledge to guide your response. Follow the instructions and best practices provided.',
          };

          logger.info('Loaded skill for agent', { skillName: skill.name });
          break;
        }

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }

      op.success('Tool executed', { toolName });
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
   * Execute an MCP tool by its prefixed name
   * @param prefixedToolName - The prefixed tool name (e.g., "mcp_Atlassian-MCP-Server_searchJiraIssuesUsingJql")
   * @param input - Tool input parameters
   */
  private async executeMCPTool(
    prefixedToolName: string,
    input: Record<string, unknown>
  ): Promise<ToolResult> {
    const op = logger.startOperation('executeMCPTool', { prefixedToolName });

    if (!this.mcpClientManager) {
      op.failure(new Error('MCP Client Manager not available'));
      return {
        success: false,
        error: 'MCP Client Manager not available. External MCP servers are not connected.',
      };
    }

    try {
      const result = await this.mcpClientManager.callToolByPrefixedName(prefixedToolName, input);

      if (result.success) {
        op.success('MCP tool executed', { prefixedToolName });
        return { success: true, data: result.content };
      } else {
        op.failure(new Error(result.error || 'Unknown error'));
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      op.failure(error instanceof Error ? error : new Error(errorMessage));
      return { success: false, error: errorMessage };
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
      description: issue.description?.substring(0, 500) || 'No description', // Truncate for WhatsApp
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
        overdueDays: b.daysInStatus - b.maxAllowedDays,
        assignee: b.issue.assignee?.displayName || 'Unassigned',
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
      issues: issues.slice(0, 15).map((i) => ({
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
      issues: issues.slice(0, 10).map((i) => ({
        key: i.key,
        summary: i.summary,
        assignee: i.assignee?.displayName || 'Unassigned',
        storyPoints: i.storyPoints,
      })),
    };
  }

  /**
   * Format WhatsApp messages for display
   */
  private formatWhatsAppMessages(messages: StoredMessage[], groupId: string): object {
    // Sort messages chronologically (oldest first) for conversation flow
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      groupId,
      messageCount: messages.length,
      timeRange:
        messages.length > 0
          ? {
              oldest: sortedMessages[0]?.timestamp,
              newest: sortedMessages[sortedMessages.length - 1]?.timestamp,
            }
          : null,
      conversation: sortedMessages.map((m) => ({
        text: m.text,
        direction: m.direction, // 'incoming' = from user, 'outgoing' = from bot
        phone: m.phone,
        timestamp: m.timestamp,
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
      logger.debug('Cleaned up old conversations', { count: cleaned });
    }
  }

  /**
   * Clear conversation for a specific phone
   */
  clearConversation(phone: string): void {
    if (this.conversations.delete(phone)) {
      logger.debug('Cleared conversation', { phone });
    }
  }

  /**
   * Handle a poll vote response
   * This injects the user's poll selection into the conversation and processes it
   * @param phone - The user's phone number
   * @param pollQuestion - The poll question
   * @param selectedOptions - The options the user selected
   * @param jid - The JID to send responses to
   * @returns The bot's response
   */
  async handlePollVote(
    phone: string,
    pollQuestion: string,
    selectedOptions: string[],
    jid: string
  ): Promise<string> {
    const op = logger.startOperation('handlePollVote', { phone, selectedOptions });

    try {
      // Format the poll response as a user message
      const formattedResponse =
        selectedOptions.length === 1
          ? `[Poll answer] I selected: "${selectedOptions[0]}" for the question: "${pollQuestion}"`
          : `[Poll answer] I selected: ${selectedOptions.map((o) => `"${o}"`).join(', ')} for the question: "${pollQuestion}"`;

      // Process this as a regular message
      const response = await this.processMessage(formattedResponse, phone, undefined, jid);

      op.success('Poll vote processed', { responseLength: response.length });
      return response;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return '❌ Sorry, I had trouble processing your poll response. Please try again.';
    }
  }
}
