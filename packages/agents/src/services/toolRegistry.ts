/**
 * Tool Registry Service
 *
 * Central registry for all MCP tools with metadata, categories, and search capabilities.
 * Implements the "Tool Search Tool" pattern from Anthropic's advanced tool use guide.
 *
 * Exported via @orient/mcp-tools package.
 *
 * @see https://www.anthropic.com/engineering/advanced-tool-use
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createServiceLogger } from '@orient/core';
import type { ToolContext } from '@orient/mcp-tools';

const logger = createServiceLogger('tool-registry');

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
  | 'apps'
  | 'agents'
  | 'context'
  | 'media';

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
  /** Use cases - natural language descriptions of when to use this tool */
  useCases: string[];
  /** Usage examples following Anthropic's Tool Use Examples pattern */
  examples?: Array<{
    description: string;
    input: Record<string, unknown>;
  }>;
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
 * Tool Registry - Central store for all tool definitions with rich metadata
 */
export class ToolRegistry {
  private tools: Map<string, ToolMetadata> = new Map();
  private categoryIndex: Map<ToolCategory, Set<string>> = new Map();
  private initialized = false;

  constructor() {
    // Initialize category index
    const categories: ToolCategory[] = [
      'jira',
      'messaging',
      'whatsapp',
      'docs',
      'google',
      'system',
      'apps',
      'agents',
      'context',
      'media',
    ];
    for (const cat of categories) {
      this.categoryIndex.set(cat, new Set());
    }
  }

  /**
   * Register a tool with its metadata
   */
  registerTool(metadata: ToolMetadata): void {
    const name = metadata.tool.name;
    this.tools.set(name, metadata);

    // Add to category index
    const categorySet = this.categoryIndex.get(metadata.category);
    if (categorySet) {
      categorySet.add(name);
    }

    logger.debug('Registered tool', { name, category: metadata.category });
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): ToolMetadata | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools in a category
   */
  getToolsByCategory(category: ToolCategory): ToolMetadata[] {
    const toolNames = this.categoryIndex.get(category);
    if (!toolNames) return [];

    return Array.from(toolNames)
      .map((name) => this.tools.get(name))
      .filter((t): t is ToolMetadata => t !== undefined);
  }

  /**
   * Get all tool names in a category
   */
  getToolNamesByCategory(category: ToolCategory): string[] {
    const toolNames = this.categoryIndex.get(category);
    return toolNames ? Array.from(toolNames) : [];
  }

  /**
   * Get all categories with their metadata
   */
  getCategories(): CategoryInfo[] {
    const categoryDescriptions: Record<ToolCategory, { description: string; keywords: string[] }> =
      {
        jira: {
          description:
            'JIRA issue management - create, update, query issues, sprints, blockers, and SLA tracking',
          keywords: [
            'issue',
            'ticket',
            'sprint',
            'blocker',
            'backlog',
            'kanban',
            'story',
            'task',
            'bug',
            'epic',
          ],
        },
        messaging: {
          description: 'Slack messaging - send DMs, channel messages, and lookup users',
          keywords: ['slack', 'message', 'dm', 'channel', 'notify', 'alert', 'communication'],
        },
        whatsapp: {
          description: 'WhatsApp message history - search messages, contacts, groups, and media',
          keywords: ['whatsapp', 'chat', 'contact', 'group', 'message', 'history', 'conversation'],
        },
        docs: {
          description: 'Google Docs - Slides presentations and Sheets spreadsheets management',
          keywords: ['slides', 'presentation', 'sheets', 'spreadsheet', 'document'],
        },
        google: {
          description:
            'Google personal account - Calendar events, Gmail inbox, Tasks, connected via OAuth',
          keywords: [
            'calendar',
            'gmail',
            'email',
            'tasks',
            'todo',
            'events',
            'schedule',
            'inbox',
            'mail',
            'appointment',
            'meeting',
          ],
        },
        system: {
          description: 'System tools - health checks and configuration',
          keywords: ['health', 'config', 'status', 'system', 'check'],
        },
        apps: {
          description:
            'Mini-Apps - AI-generated React applications that can be shared and run standalone',
          keywords: [
            'app',
            'mini-app',
            'artifact',
            'create',
            'generate',
            'build',
            'share',
            'calendly',
            'scheduler',
            'form',
          ],
        },
        agents: {
          description:
            'Agent orchestration - Self-discovery, context resolution, and task delegation between agents',
          keywords: [
            'agent',
            'handoff',
            'delegate',
            'orchestrate',
            'context',
            'capabilities',
            'switch',
            'subagent',
          ],
        },
        context: {
          description:
            'Context persistence - Read and update persistent memory, user preferences, activity history across sessions',
          keywords: [
            'memory',
            'preferences',
            'remember',
            'persistent',
            'state',
            'history',
            'profile',
            'identity',
          ],
        },
        media: {
          description:
            'Media generation - Generate mascot variations, images, and visual assets using AI',
          keywords: [
            'mascot',
            'avatar',
            'image',
            'generate',
            'variation',
            'picture',
            'visual',
            'art',
          ],
        },
      };

    return Array.from(this.categoryIndex.entries()).map(([category, toolNames]) => ({
      name: category,
      description: categoryDescriptions[category].description,
      toolCount: toolNames.size,
      keywords: categoryDescriptions[category].keywords,
    }));
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolMetadata[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool definitions (MCP Tool objects only)
   */
  getAllToolDefinitions(): Tool[] {
    return Array.from(this.tools.values()).map((m) => m.tool);
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Mark registry as initialized
   */
  markInitialized(): void {
    this.initialized = true;
    logger.info('Tool registry initialized', { toolCount: this.tools.size });
  }
}

/**
 * Create and populate the tool registry with all available tools
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Register all tools with their metadata
  registerJiraTools(registry);
  registerMessagingTools(registry);
  registerWhatsAppTools(registry);
  registerDocsTools(registry);
  registerGoogleTools(registry);
  registerSystemTools(registry);
  registerSkillTools(registry);
  registerAppsTools(registry);
  registerAgentsTools(registry);
  registerContextTools(registry);
  registerMediaTools(registry);
  registerConfigTools(registry);

  registry.markInitialized();
  return registry;
}

/**
 * Register JIRA tools
 */
function registerJiraTools(registry: ToolRegistry): void {
  // ai_first_get_all_issues
  registry.registerTool({
    tool: {
      name: 'ai_first_get_all_issues',
      description:
        'Get all Jira issues for the YOUR_COMPONENT component. Returns issue key, summary, status, assignee, and priority.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of issues to return (default: 50)',
          },
        },
        required: [],
      },
    },
    category: 'jira',
    keywords: ['issues', 'all', 'list', 'jira', 'tickets', 'query'],
    useCases: [
      'Get a list of all issues in the project',
      'See all tickets assigned to the team',
      'Review the full backlog',
    ],
    examples: [
      { description: 'Get first 50 issues', input: {} },
      { description: 'Get first 10 issues', input: { limit: 10 } },
    ],
  });

  // ai_first_get_issue
  registry.registerTool({
    tool: {
      name: 'ai_first_get_issue',
      description: 'Get details of a specific Jira issue by its key (e.g., PROJ-123).',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: {
            type: 'string',
            description: 'The Jira issue key (e.g., PROJ-123)',
          },
        },
        required: ['issueKey'],
      },
    },
    category: 'jira',
    keywords: ['issue', 'get', 'details', 'ticket', 'specific', 'lookup', 'find'],
    useCases: [
      'Get details of a specific ticket',
      'Look up an issue by its key',
      'Check the status of a particular issue',
    ],
    examples: [{ description: 'Get issue PROJ-123', input: { issueKey: 'PROJ-123' } }],
  });

  // ai_first_get_in_progress
  registry.registerTool({
    tool: {
      name: 'ai_first_get_in_progress',
      description: 'Get all issues currently in progress for the YOUR_COMPONENT component.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['in progress', 'wip', 'working', 'active', 'current', 'ongoing'],
    useCases: [
      'See what the team is currently working on',
      'Check work in progress',
      'Review active issues',
    ],
  });

  // ai_first_get_board_issues
  registry.registerTool({
    tool: {
      name: 'ai_first_get_board_issues',
      description:
        'Get all issues currently visible on the Kanban board (excluding Kanban backlog). Returns issues in columns like TO DO, IN PROGRESS, and DONE - but NOT issues in the Kanban backlog section.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['board', 'kanban', 'visible', 'open', 'active', 'columns'],
    useCases: [
      'See what is on the board right now',
      'Check open issues',
      'Review the kanban board state',
    ],
  });

  // ai_first_get_blockers
  registry.registerTool({
    tool: {
      name: 'ai_first_get_blockers',
      description: 'Get all blocker issues or issues with blocked label for YOUR_COMPONENT.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['blocker', 'blocked', 'impediment', 'stuck', 'obstacle'],
    useCases: ['Check for blockers', 'Find issues that are stuck', 'Identify impediments'],
  });

  // ai_first_check_sla_breaches
  registry.registerTool({
    tool: {
      name: 'ai_first_check_sla_breaches',
      description:
        'Check for SLA breaches - tickets that have been in a status longer than allowed.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['sla', 'breach', 'overdue', 'aging', 'stale', 'stuck'],
    useCases: ['Check for SLA violations', 'Find stale tickets', 'Identify aging issues'],
  });

  // ai_first_get_sprint_issues
  registry.registerTool({
    tool: {
      name: 'ai_first_get_sprint_issues',
      description: 'Get all issues in the current active sprint for YOUR_COMPONENT.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['sprint', 'iteration', 'current', 'active', 'cycle'],
    useCases: ['See sprint issues', 'Check current sprint progress', 'Review sprint backlog'],
  });

  // ai_first_get_completed_this_week
  registry.registerTool({
    tool: {
      name: 'ai_first_get_completed_this_week',
      description:
        'Get all issues completed (moved to Done) in the last 7 days for YOUR_COMPONENT.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['completed', 'done', 'finished', 'weekly', 'velocity'],
    useCases: [
      'Check what was completed this week',
      'Prepare weekly summary',
      'Calculate velocity',
    ],
  });

  // ai_first_get_created_this_week
  registry.registerTool({
    tool: {
      name: 'ai_first_get_created_this_week',
      description: 'Get all issues created in the last 7 days for YOUR_COMPONENT.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['created', 'new', 'added', 'weekly', 'incoming'],
    useCases: ['See new issues this week', 'Check incoming work', 'Review new tickets'],
  });

  // ai_first_get_daily_digest
  registry.registerTool({
    tool: {
      name: 'ai_first_get_daily_digest',
      description: "Get a daily digest including today's in-progress issues and blockers.",
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['daily', 'digest', 'summary', 'today', 'standup'],
    useCases: ['Get daily status update', 'Prepare for standup', "Check today's priorities"],
  });

  // ai_first_get_weekly_summary
  registry.registerTool({
    tool: {
      name: 'ai_first_get_weekly_summary',
      description:
        'Get a weekly summary including completed issues, velocity points, newly added issues, and aging tickets.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'jira',
    keywords: ['weekly', 'summary', 'report', 'velocity', 'metrics'],
    useCases: ['Prepare weekly report', 'Check team velocity', 'Review weekly progress'],
  });

  // ai_first_jira_create_issue_link
  registry.registerTool({
    tool: {
      name: 'ai_first_jira_create_issue_link',
      description: 'Create an issue link between two JIRA issues (e.g., blocks, relates to).',
      inputSchema: {
        type: 'object',
        properties: {
          inwardIssueKey: {
            type: 'string',
            description: 'The key of the inward issue (e.g., the blocking issue)',
          },
          outwardIssueKey: {
            type: 'string',
            description: 'The key of the outward issue (e.g., the blocked issue)',
          },
          linkType: {
            type: 'string',
            description:
              'The type of link (default: "Blocks"). Common types: "Blocks", "Relates to", "Duplicates"',
            default: 'Blocks',
          },
          comment: {
            type: 'string',
            description: 'Optional comment to add to the link',
          },
        },
        required: ['inwardIssueKey', 'outwardIssueKey'],
      },
    },
    category: 'jira',
    keywords: ['link', 'blocks', 'relates', 'dependency', 'connect'],
    useCases: [
      'Link two issues together',
      'Mark an issue as blocking another',
      'Create a dependency relationship',
    ],
    examples: [
      {
        description: 'Link PROJ-100 blocks PROJ-101',
        input: { inwardIssueKey: 'PROJ-100', outwardIssueKey: 'PROJ-101', linkType: 'Blocks' },
      },
    ],
  });

  // ai_first_jira_get_issue_links
  registry.registerTool({
    tool: {
      name: 'ai_first_jira_get_issue_links',
      description: 'Get all issue links for a given JIRA issue.',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: {
            type: 'string',
            description: 'The key of the issue to get links for',
          },
        },
        required: ['issueKey'],
      },
    },
    category: 'jira',
    keywords: ['links', 'dependencies', 'related', 'connections'],
    useCases: ['Check issue dependencies', 'See related issues', 'Find blocking relationships'],
  });

  // ai_first_jira_delete_issue_link
  registry.registerTool({
    tool: {
      name: 'ai_first_jira_delete_issue_link',
      description: 'Delete an issue link between two JIRA issues.',
      inputSchema: {
        type: 'object',
        properties: {
          linkId: {
            type: 'string',
            description: 'The ID of the issue link to delete',
          },
        },
        required: ['linkId'],
      },
    },
    category: 'jira',
    keywords: ['delete', 'remove', 'link', 'unlink'],
    useCases: ['Remove a link between issues', 'Delete a dependency'],
  });
}

/**
 * Register Messaging (Slack) tools
 */
function registerMessagingTools(registry: ToolRegistry): void {
  // ai_first_slack_lookup_user_by_email
  registry.registerTool({
    tool: {
      name: 'ai_first_slack_lookup_user_by_email',
      description:
        'Look up a Slack user by their email address. Returns user ID and profile information.',
      inputSchema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'The email address of the user to look up',
          },
        },
        required: ['email'],
      },
    },
    category: 'messaging',
    keywords: ['slack', 'user', 'lookup', 'find', 'email'],
    useCases: ['Find a Slack user by email', 'Look up someone on Slack'],
  });

  // ai_first_slack_send_dm
  registry.registerTool({
    tool: {
      name: 'ai_first_slack_send_dm',
      description:
        'Send a direct message to a Slack user. Can use either user ID or email address.',
      inputSchema: {
        type: 'object',
        properties: {
          userIdOrEmail: {
            type: 'string',
            description: 'The Slack user ID (e.g., U12345) or email address of the recipient',
          },
          message: {
            type: 'string',
            description: 'The message text to send (supports Slack markdown/mrkdwn)',
          },
          ccUsers: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional list of user IDs or emails to include in a group DM conversation',
          },
        },
        required: ['userIdOrEmail', 'message'],
      },
    },
    category: 'messaging',
    keywords: ['slack', 'dm', 'message', 'send', 'direct', 'private'],
    useCases: ['Send a Slack DM to someone', 'Message a user on Slack', 'Send a private message'],
  });

  // ai_first_slack_send_channel_message
  registry.registerTool({
    tool: {
      name: 'ai_first_slack_send_channel_message',
      description: 'Send a message to a Slack channel.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'The channel name (e.g., #general) or channel ID',
          },
          message: {
            type: 'string',
            description: 'The message text to send (supports Slack markdown/mrkdwn)',
          },
        },
        required: ['channel', 'message'],
      },
    },
    category: 'messaging',
    keywords: ['slack', 'channel', 'message', 'send', 'post', 'announce'],
    useCases: ['Post a message to a Slack channel', 'Send an announcement', 'Notify the team'],
  });

  // ai_first_slack_get_channel_messages
  registry.registerTool({
    tool: {
      name: 'ai_first_slack_get_channel_messages',
      description:
        'Get messages from a Slack channel. Can filter by date range and limit the number of messages returned.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'The channel name (e.g., #quotes, quotes) or channel ID',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default: 100, max: 1000)',
          },
          oldest: {
            type: 'string',
            description: 'Only messages after this date (ISO 8601 format)',
          },
          latest: {
            type: 'string',
            description: 'Only messages before this date (ISO 8601 format)',
          },
          includeReplies: {
            type: 'boolean',
            description: 'Whether to include thread replies in the results (default: false)',
          },
        },
        required: ['channel'],
      },
    },
    category: 'messaging',
    keywords: ['slack', 'channel', 'messages', 'read', 'history', 'quotes'],
    useCases: [
      'Read messages from a channel',
      'Check channel history',
      'Find quotes from a channel',
    ],
  });
}

/**
 * Register WhatsApp tools
 */
function registerWhatsAppTools(registry: ToolRegistry): void {
  // whatsapp_search_messages
  registry.registerTool({
    tool: {
      name: 'whatsapp_search_messages',
      description: 'Search WhatsApp messages using full-text search with optional filters.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text to search for (full-text search)',
          },
          phone: {
            type: 'string',
            description: 'Filter by phone number',
          },
          direction: {
            type: 'string',
            enum: ['incoming', 'outgoing'],
            description: 'Filter by message direction',
          },
          isGroup: {
            type: 'boolean',
            description: 'Filter for group messages only',
          },
          fromDate: {
            type: 'string',
            description: 'Start date for search range (ISO 8601 format)',
          },
          toDate: {
            type: 'string',
            description: 'End date for search range (ISO 8601 format)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 50)',
          },
        },
        required: [],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'search', 'messages', 'find', 'text'],
    useCases: [
      'Search WhatsApp messages',
      'Find a conversation about something',
      'Look up what someone said',
    ],
  });

  // whatsapp_get_recent
  registry.registerTool({
    tool: {
      name: 'whatsapp_get_recent',
      description: 'Get the most recent WhatsApp messages from the database.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default: 50)',
          },
        },
        required: [],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'recent', 'messages', 'latest'],
    useCases: ['Get recent WhatsApp messages', 'See latest messages'],
  });

  // whatsapp_get_conversation
  registry.registerTool({
    tool: {
      name: 'whatsapp_get_conversation',
      description: 'Get conversation history with a specific contact.',
      inputSchema: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'The phone number of the contact',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default: 100)',
          },
        },
        required: ['phone'],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'conversation', 'chat', 'history', 'contact'],
    useCases: ['Get chat history with someone', 'Read conversation with a contact'],
  });

  // whatsapp_get_group_messages
  registry.registerTool({
    tool: {
      name: 'whatsapp_get_group_messages',
      description: 'Get messages from a specific WhatsApp group.',
      inputSchema: {
        type: 'object',
        properties: {
          groupId: {
            type: 'string',
            description: 'The group ID (JID) or group name to search for',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default: 100)',
          },
        },
        required: ['groupId'],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'group', 'messages', 'chat'],
    useCases: ['Get messages from a WhatsApp group', 'Read group chat history'],
  });

  // whatsapp_get_stats
  registry.registerTool({
    tool: {
      name: 'whatsapp_get_stats',
      description:
        'Get WhatsApp message database statistics including total counts, unique contacts, groups, and date ranges.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'stats', 'statistics', 'counts'],
    useCases: ['Get WhatsApp statistics', 'See message counts'],
  });

  // whatsapp_list_contacts
  registry.registerTool({
    tool: {
      name: 'whatsapp_list_contacts',
      description: 'List all unique contacts (phone numbers) in the WhatsApp message database.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'contacts', 'list', 'phone'],
    useCases: ['List WhatsApp contacts', "See who I've messaged"],
  });

  // whatsapp_list_groups
  registry.registerTool({
    tool: {
      name: 'whatsapp_list_groups',
      description: 'List WhatsApp groups with their names and metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Optional search term to filter groups by name',
          },
        },
        required: [],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'groups', 'list'],
    useCases: ['List WhatsApp groups', 'Find a group'],
  });

  // whatsapp_get_media
  registry.registerTool({
    tool: {
      name: 'whatsapp_get_media',
      description:
        'Get media messages (images, audio, video, documents) from the WhatsApp database.',
      inputSchema: {
        type: 'object',
        properties: {
          mediaType: {
            type: 'string',
            enum: ['image', 'audio', 'video', 'document'],
            description: 'Filter by media type (optional)',
          },
          groupId: {
            type: 'string',
            description: 'Optional group ID to filter media from a specific group',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 50)',
          },
        },
        required: [],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'media', 'images', 'photos', 'documents'],
    useCases: ['Get media from WhatsApp', 'Find photos or documents'],
  });

  // whatsapp_send_poll
  registry.registerTool({
    tool: {
      name: 'whatsapp_send_poll',
      description:
        'Send a WhatsApp poll to ask questions. The poll will be sent to the current active chat (the user you are talking to). Use this to gather structured feedback or ask clarifying questions with predefined options. WhatsApp polls support 2-12 options and can allow single or multiple selections.',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The poll question to ask (e.g., "Which feature should we prioritize?")',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array of poll options (2-12 options). Each option should be a short, clear choice.',
          },
          selectableCount: {
            type: 'number',
            description:
              'How many options the user can select (default: 1 for single choice, set higher for multi-select)',
          },
          context: {
            type: 'string',
            description:
              'Optional context about why this poll is being asked (for logging/tracking)',
          },
        },
        required: ['question', 'options'],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'poll', 'question', 'survey', 'vote', 'choice', 'ask', 'clarify'],
    useCases: [
      'Ask a clarifying question with multiple choice answers',
      'Let the user pick from options',
      'Gather structured feedback',
      'Create a poll for voting',
    ],
  });

  // whatsapp_send_message
  registry.registerTool({
    tool: {
      name: 'whatsapp_send_message',
      description:
        'Send a WhatsApp message to the current active chat. Use this when you need to send an immediate message without waiting for the normal response flow.',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message text to send',
          },
        },
        required: ['message'],
      },
    },
    category: 'whatsapp',
    keywords: ['whatsapp', 'send', 'message', 'reply', 'respond'],
    useCases: ['Send an immediate message', 'Reply to the user directly'],
  });
}

/**
 * Register Google Docs (Slides/Sheets) tools
 */
function registerDocsTools(registry: ToolRegistry): void {
  // ai_first_slides_get_presentation
  registry.registerTool({
    tool: {
      name: 'ai_first_slides_get_presentation',
      description: 'Get presentation metadata and list of all slides with their titles.',
      inputSchema: {
        type: 'object',
        properties: {
          presentationUrl: {
            type: 'string',
            description: 'The Google Slides URL or presentation ID',
          },
        },
        required: [],
      },
    },
    category: 'docs',
    keywords: ['slides', 'presentation', 'google', 'get', 'list'],
    useCases: ['Get information about a presentation', 'List slides in a deck'],
  });

  // ai_first_slides_get_slide
  registry.registerTool({
    tool: {
      name: 'ai_first_slides_get_slide',
      description: 'Get the content of a specific slide by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          slideId: {
            type: 'string',
            description: 'The unique ID of the slide to retrieve',
          },
          presentationUrl: {
            type: 'string',
            description: 'The Google Slides URL or presentation ID',
          },
        },
        required: [],
      },
    },
    category: 'docs',
    keywords: ['slide', 'content', 'read', 'get'],
    useCases: ['Read a specific slide', 'Get slide content'],
  });

  // ai_first_slides_update_text
  registry.registerTool({
    tool: {
      name: 'ai_first_slides_update_text',
      description:
        'Update text placeholders on ALL slides globally. Placeholders should be in format {{PLACEHOLDER_NAME}}.',
      inputSchema: {
        type: 'object',
        properties: {
          presentationUrl: {
            type: 'string',
            description: 'The Google Slides URL or presentation ID',
          },
          replacements: {
            type: 'array',
            description: 'Array of placeholder-replacement pairs',
            items: {
              type: 'object',
              properties: {
                placeholder: { type: 'string' },
                replacement: { type: 'string' },
              },
              required: ['placeholder', 'replacement'],
            },
          },
        },
        required: ['replacements'],
      },
    },
    category: 'docs',
    keywords: ['slides', 'update', 'text', 'replace', 'placeholder'],
    useCases: ['Update placeholders in a presentation', 'Replace text in slides'],
  });

  // ai_first_slides_update_slide_text
  registry.registerTool({
    tool: {
      name: 'ai_first_slides_update_slide_text',
      description: 'Update text on a SPECIFIC slide only (not globally).',
      inputSchema: {
        type: 'object',
        properties: {
          slideId: {
            type: 'string',
            description: 'The ID of the slide to update',
          },
          presentationUrl: {
            type: 'string',
            description: 'The Google Slides URL or presentation ID',
          },
          replacements: {
            type: 'array',
            description: 'Array of text replacement pairs',
            items: {
              type: 'object',
              properties: {
                placeholder: { type: 'string' },
                replacement: { type: 'string' },
              },
              required: ['placeholder', 'replacement'],
            },
          },
        },
        required: ['replacements'],
      },
    },
    category: 'docs',
    keywords: ['slide', 'update', 'text', 'specific'],
    useCases: ['Update text on a specific slide', 'Modify slide content'],
  });

  // ai_first_slides_duplicate_template
  registry.registerTool({
    tool: {
      name: 'ai_first_slides_duplicate_template',
      description: 'Duplicate a template slide and optionally apply text replacements.',
      inputSchema: {
        type: 'object',
        properties: {
          templateSlideId: {
            type: 'string',
            description: 'The ID of the slide to duplicate',
          },
          presentationUrl: {
            type: 'string',
            description: 'The Google Slides URL or presentation ID',
          },
          replacements: {
            type: 'array',
            description: 'Optional array of placeholder-replacement pairs',
            items: {
              type: 'object',
              properties: {
                placeholder: { type: 'string' },
                replacement: { type: 'string' },
              },
              required: ['placeholder', 'replacement'],
            },
          },
          insertAtIndex: {
            type: 'number',
            description: 'Optional position to insert the new slide',
          },
        },
        required: ['templateSlideId'],
      },
    },
    category: 'docs',
    keywords: ['slide', 'duplicate', 'template', 'copy', 'clone'],
    useCases: ['Create a new slide from a template', 'Duplicate a slide'],
  });

  // ai_first_slides_update_weekly
  registry.registerTool({
    tool: {
      name: 'ai_first_slides_update_weekly',
      description: 'Update or create the weekly status slide with current Jira data.',
      inputSchema: {
        type: 'object',
        properties: {
          presentationUrl: {
            type: 'string',
            description: 'The Google Slides URL or presentation ID',
          },
          templateSlideId: {
            type: 'string',
            description: 'Optional: The ID of a template slide to duplicate',
          },
          insertAtIndex: {
            type: 'number',
            description: 'Optional: Position to insert the new slide',
          },
        },
        required: [],
      },
    },
    category: 'docs',
    keywords: ['weekly', 'update', 'slides', 'status', 'jira'],
    useCases: ['Update the weekly status slide', 'Create weekly presentation'],
  });

  // ai_first_slides_delete_slide
  registry.registerTool({
    tool: {
      name: 'ai_first_slides_delete_slide',
      description: 'Delete a slide from the presentation.',
      inputSchema: {
        type: 'object',
        properties: {
          slideId: {
            type: 'string',
            description: 'The ID of the slide to delete',
          },
          presentationUrl: {
            type: 'string',
            description: 'The Google Slides URL or presentation ID',
          },
        },
        required: ['slideId'],
      },
    },
    category: 'docs',
    keywords: ['slide', 'delete', 'remove'],
    useCases: ['Delete a slide', 'Remove a slide from presentation'],
  });

  // ai_first_slides_create_table
  registry.registerTool({
    tool: {
      name: 'ai_first_slides_create_table',
      description:
        'Create an actual table on a slide with data. Use this instead of text-based pseudo-tables for proper formatting.',
      inputSchema: {
        type: 'object',
        properties: {
          slideId: {
            type: 'string',
            description: 'The ID of the slide to add the table to',
          },
          presentationUrl: {
            type: 'string',
            description: 'The Google Slides URL or presentation ID',
          },
          data: {
            type: 'array',
            description: 'A 2D array of strings representing table data. First row can be headers.',
            items: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          headerRow: {
            type: 'boolean',
            description: 'Whether to style the first row as a header',
          },
        },
        required: ['slideId', 'data'],
      },
    },
    category: 'docs',
    keywords: ['table', 'slides', 'create', 'data', 'grid'],
    useCases: [
      'Create a data table on a slide',
      'Add tabular data to presentation',
      'Create a formatted table with headers',
    ],
  });
}

/**
 * Register Google OAuth tools (Calendar, Gmail, Tasks)
 */
function registerGoogleTools(registry: ToolRegistry): void {
  // google_oauth_status
  registry.registerTool({
    tool: {
      name: 'google_oauth_status',
      description: 'Check the status of connected Google accounts and available services.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'google',
    keywords: ['google', 'oauth', 'account', 'status', 'connected'],
    useCases: ['Check if Google account is connected', 'See which Google services are available'],
  });

  // google_calendar_list_events
  registry.registerTool({
    tool: {
      name: 'google_calendar_list_events',
      description:
        'Get upcoming calendar events for the next N days. Use this to check schedule, find meetings, or see what events are coming up.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to look ahead (default: 7)' },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
          accountEmail: {
            type: 'string',
            description: 'Google account email (uses default if not specified)',
          },
        },
        required: [],
      },
    },
    category: 'google',
    keywords: ['calendar', 'events', 'schedule', 'meetings', 'agenda', 'upcoming', 'week'],
    useCases: [
      'What events do I have this week?',
      'Show my calendar for today',
      'What meetings are coming up?',
      'Check my schedule',
      'Any major events this week?',
    ],
    examples: [
      { description: 'Get events for next 7 days', input: {} },
      { description: 'Get events for next 3 days', input: { days: 3 } },
    ],
  });

  // google_calendar_create_event
  registry.registerTool({
    tool: {
      name: 'google_calendar_create_event',
      description: 'Create a new calendar event.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          startTime: { type: 'string', description: 'Start time (ISO 8601 format)' },
          endTime: { type: 'string', description: 'End time (ISO 8601 format)' },
          description: { type: 'string', description: 'Event description' },
          location: { type: 'string', description: 'Event location' },
          attendees: {
            type: 'array',
            items: { type: 'string' },
            description: 'Attendee email addresses',
          },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['title', 'startTime', 'endTime'],
      },
    },
    category: 'google',
    keywords: ['calendar', 'create', 'event', 'meeting', 'schedule', 'book'],
    useCases: ['Schedule a meeting', 'Create a calendar event', 'Book a time slot'],
  });

  // google_gmail_list_messages
  registry.registerTool({
    tool: {
      name: 'google_gmail_list_messages',
      description:
        'List recent emails from Gmail inbox. Use this to check emails, find messages, or get inbox summary.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (Gmail search syntax)' },
          maxResults: { type: 'number', description: 'Maximum messages to return (default: 10)' },
          label: { type: 'string', description: 'Label filter (e.g., INBOX, UNREAD)' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: [],
      },
    },
    category: 'google',
    keywords: ['gmail', 'email', 'inbox', 'messages', 'mail', 'unread'],
    useCases: [
      'Check my emails',
      'Do I have any unread emails?',
      'Show my inbox',
      'Find emails from someone',
    ],
    examples: [
      { description: 'Get recent inbox messages', input: {} },
      { description: 'Get unread emails', input: { label: 'UNREAD' } },
    ],
  });

  // google_gmail_send
  registry.registerTool({
    tool: {
      name: 'google_gmail_send',
      description: 'Send an email from Gmail.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (plain text or HTML)' },
          cc: { type: 'string', description: 'CC email addresses (comma-separated)' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
    category: 'google',
    keywords: ['gmail', 'email', 'send', 'compose', 'mail'],
    useCases: ['Send an email', 'Compose a message'],
  });

  // google_tasks_list
  registry.registerTool({
    tool: {
      name: 'google_tasks_list',
      description:
        'List tasks from Google Tasks. Use this to see pending tasks, to-dos, or check task status.',
      inputSchema: {
        type: 'object',
        properties: {
          taskListId: { type: 'string', description: 'Task list ID (default: @default)' },
          showCompleted: {
            type: 'boolean',
            description: 'Include completed tasks (default: false)',
          },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: [],
      },
    },
    category: 'google',
    keywords: ['tasks', 'todo', 'list', 'pending', 'checklist'],
    useCases: ['What are my pending tasks?', 'Show my to-do list', 'What tasks do I have?'],
  });

  // google_tasks_create
  registry.registerTool({
    tool: {
      name: 'google_tasks_create',
      description: 'Create a new task in Google Tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          notes: { type: 'string', description: 'Task notes/description' },
          dueDate: { type: 'string', description: 'Due date (ISO 8601 format)' },
          taskListId: { type: 'string', description: 'Task list ID (default: @default)' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['title'],
      },
    },
    category: 'google',
    keywords: ['tasks', 'create', 'todo', 'add', 'new'],
    useCases: ['Create a new task', 'Add to my to-do list', 'Remind me to do something'],
  });

  // google_tasks_complete
  registry.registerTool({
    tool: {
      name: 'google_tasks_complete',
      description: 'Mark a task as completed in Google Tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to complete' },
          taskListId: { type: 'string', description: 'Task list ID (default: @default)' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['taskId'],
      },
    },
    category: 'google',
    keywords: ['tasks', 'complete', 'done', 'finish', 'check'],
    useCases: ['Mark task as done', 'Complete a task'],
  });
}

/**
 * Register System tools
 */
function registerSystemTools(registry: ToolRegistry): void {
  // ai_first_health_check
  registry.registerTool({
    tool: {
      name: 'ai_first_health_check',
      description:
        'Check the health and connectivity of the Orient, including Jira connection status and issue count.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'system',
    keywords: ['health', 'check', 'status', 'connectivity', 'test'],
    useCases: ['Check if the bot is working', 'Verify connections are healthy'],
  });

  // ai_first_get_config
  registry.registerTool({
    tool: {
      name: 'ai_first_get_config',
      description:
        'Get the current configuration for the Orient (excluding sensitive credentials).',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'system',
    keywords: ['config', 'configuration', 'settings'],
    useCases: ['Get bot configuration', 'Check settings'],
  });
}

/**
 * Register Skill Management tools
 */
function registerSkillTools(registry: ToolRegistry): void {
  // ai_first_list_skills
  registry.registerTool({
    tool: {
      name: 'ai_first_list_skills',
      description:
        'List all available skills with their names and descriptions. Skills provide specialized knowledge modules for domain-specific guidance.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'system',
    keywords: ['skills', 'list', 'available', 'capabilities', 'knowledge'],
    useCases: [
      'List all skills',
      'What skills are available',
      'Show me the skills',
      'What can you help with',
    ],
  });

  // ai_first_read_skill
  registry.registerTool({
    tool: {
      name: 'ai_first_read_skill',
      description:
        'Read the full content of a specific skill by name. Returns the skill body content for detailed guidance.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'The name of the skill to read (e.g., "personal-jira-project-management", "slack-formatting")',
          },
        },
        required: ['name'],
      },
    },
    category: 'system',
    keywords: ['skill', 'read', 'load', 'content', 'guidance'],
    useCases: [
      'Load the personal-jira-project-management skill',
      'Read skill content',
      'Get skill guidance',
    ],
  });

  // ai_first_create_skill_async
  registry.registerTool({
    tool: {
      name: 'ai_first_create_skill_async',
      description:
        'Create a new skill and submit it as a GitHub PR. This is an ASYNC operation - it starts a background job and returns immediately. The PR link will be sent via the messaging channel when ready. ADMIN ONLY.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The skill name in lowercase with hyphens (e.g., "billing-api")',
          },
          description: {
            type: 'string',
            description:
              'Comprehensive description of what the skill does and when to use it (min 50 chars)',
          },
          content: {
            type: 'string',
            description:
              'The full skill body content in Markdown. Do NOT include the YAML frontmatter.',
          },
          userPhone: {
            type: 'string',
            description:
              'The phone number of the user requesting the skill (for admin verification)',
          },
          platform: {
            type: 'string',
            description: 'The platform to send the notification to (whatsapp or slack)',
          },
        },
        required: ['name', 'description', 'content'],
      },
    },
    category: 'system',
    keywords: ['skill', 'create', 'new', 'add', 'github', 'pr', 'async'],
    useCases: ['Create a new skill', 'Add a skill for X', 'Submit skill as PR'],
  });

  // ai_first_edit_skill_async
  registry.registerTool({
    tool: {
      name: 'ai_first_edit_skill_async',
      description:
        'Edit an existing skill and submit changes as a GitHub PR. This is an ASYNC operation. ADMIN ONLY.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the existing skill to edit',
          },
          description: {
            type: 'string',
            description: 'Updated description',
          },
          content: {
            type: 'string',
            description:
              'The updated skill body content in Markdown. Do NOT include the YAML frontmatter.',
          },
          userPhone: {
            type: 'string',
            description:
              'The phone number of the user requesting the edit (for admin verification)',
          },
          platform: {
            type: 'string',
            description: 'The platform to send the notification to (whatsapp or slack)',
          },
        },
        required: ['name', 'description', 'content'],
      },
    },
    category: 'system',
    keywords: ['skill', 'edit', 'update', 'modify', 'github', 'pr', 'async'],
    useCases: ['Edit an existing skill', 'Update skill content', 'Modify skill'],
  });

  // ai_first_list_skill_prs
  registry.registerTool({
    tool: {
      name: 'ai_first_list_skill_prs',
      description:
        'List all pending GitHub PRs for skill changes that are awaiting review. ADMIN ONLY.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'system',
    keywords: ['skill', 'prs', 'pull requests', 'pending', 'review', 'github'],
    useCases: [
      'List pending skill PRs',
      'Show skill pull requests',
      'What skill changes are waiting for review',
    ],
  });

  // ai_first_reload_skills
  registry.registerTool({
    tool: {
      name: 'ai_first_reload_skills',
      description:
        'Reload all skills from disk. Use after a skill PR is merged and deployed to refresh the skill cache. ADMIN ONLY.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'system',
    keywords: ['skill', 'reload', 'refresh', 'update', 'cache'],
    useCases: ['Reload skills', 'Refresh skill cache', 'Update skills after merge'],
  });
}

/**
 * Register Mini-Apps tools
 */
function registerAppsTools(registry: ToolRegistry): void {
  // ai_first_create_app
  registry.registerTool({
    tool: {
      name: 'ai_first_create_app',
      description:
        'Create a new Mini-App from a description. The AI generates a React application that can access calendar, Slack, scheduler, and other tools. The app is created via a PR for review.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Description of what the app should do. Be specific about functionality and any integrations needed. (min 20 characters)',
          },
          name: {
            type: 'string',
            description:
              'Optional app name (lowercase with hyphens). Will be generated if not provided.',
          },
          author: {
            type: 'string',
            description: 'Author email address (optional)',
          },
        },
        required: ['prompt'],
      },
    },
    category: 'apps',
    keywords: [
      'app',
      'create',
      'generate',
      'build',
      'mini-app',
      'artifact',
      'component',
      'calendly',
    ],
    useCases: [
      'Create an app to schedule meetings (like Calendly)',
      'Build a form to collect feedback',
      'Generate a dashboard to display data',
      'Create a poll or survey app',
    ],
    examples: [
      {
        description: 'Create a meeting scheduler app',
        input: {
          prompt:
            'Create an app that lets users select a date and time from a calendar and schedule a meeting. Include fields for meeting title, description, and attendees.',
          name: 'meeting-scheduler',
        },
      },
    ],
  });

  // ai_first_list_apps
  registry.registerTool({
    tool: {
      name: 'ai_first_list_apps',
      description:
        'List all available Mini-Apps. Shows app name, title, description, status, and whether it has been built.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'draft', 'published', 'pending_review'],
            description: 'Filter apps by status (default: all)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of apps to return (default: 50)',
          },
        },
        required: [],
      },
    },
    category: 'apps',
    keywords: ['apps', 'list', 'all', 'mini-apps', 'artifacts'],
    useCases: ['See all available apps', 'Find apps by status', 'Check which apps are published'],
    examples: [
      { description: 'List all apps', input: {} },
      { description: 'List only published apps', input: { status: 'published' } },
    ],
  });

  // ai_first_get_app
  registry.registerTool({
    tool: {
      name: 'ai_first_get_app',
      description:
        'Get detailed information about a specific Mini-App including permissions, capabilities, and sharing configuration.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The app name (e.g., "meeting-scheduler")',
          },
        },
        required: ['name'],
      },
    },
    category: 'apps',
    keywords: ['app', 'get', 'details', 'info', 'specific'],
    useCases: ['Get details of a specific app', 'Check app permissions', 'View app configuration'],
  });

  // ai_first_share_app
  registry.registerTool({
    tool: {
      name: 'ai_first_share_app',
      description:
        'Generate a shareable link for a Mini-App. The link can have an expiry time and maximum use count.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The app name to share',
          },
          expiryDays: {
            type: 'number',
            description: 'Days until the link expires (default: 30)',
          },
          maxUses: {
            type: 'number',
            description: 'Maximum number of times the link can be used',
          },
        },
        required: ['name'],
      },
    },
    category: 'apps',
    keywords: ['app', 'share', 'link', 'url', 'distribute'],
    useCases: [
      'Share an app with colleagues',
      'Generate a temporary access link',
      'Create a limited-use share link',
    ],
  });

  // ai_first_update_app
  registry.registerTool({
    tool: {
      name: 'ai_first_update_app',
      description:
        'Update an existing Mini-App based on a change request. Creates a new version via PR.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The app name to update',
          },
          updateRequest: {
            type: 'string',
            description: 'Description of the changes to make (min 10 characters)',
          },
        },
        required: ['name', 'updateRequest'],
      },
    },
    category: 'apps',
    keywords: ['app', 'update', 'modify', 'change', 'edit'],
    useCases: [
      'Add features to an existing app',
      'Fix bugs in an app',
      'Modify app appearance or behavior',
    ],
  });
}

/**
 * Register Agent tools
 */
function registerAgentsTools(registry: ToolRegistry): void {
  // ai_first_get_agent_context
  registry.registerTool({
    tool: {
      name: 'ai_first_get_agent_context',
      description:
        'Discover your current agent role, skills, and tool permissions. Call this at the start of a session to understand your capabilities.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description: 'Current platform (whatsapp, slack, opencode, cursor)',
          },
          chatId: {
            type: 'string',
            description: 'Chat or conversation ID',
          },
          channelId: {
            type: 'string',
            description: 'Slack channel ID',
          },
          environment: {
            type: 'string',
            description: 'Deployment environment (local, prod)',
          },
        },
        required: [],
      },
    },
    category: 'agents',
    keywords: [
      'agent',
      'context',
      'capabilities',
      'role',
      'skills',
      'tools',
      'permissions',
      'discover',
    ],
    useCases: [
      'Understand what agent role you are assigned',
      'Discover which skills are available',
      'Check which tools you can use',
      'Get your system prompt/instructions',
    ],
  });

  // ai_first_list_agents
  registry.registerTool({
    tool: {
      name: 'ai_first_list_agents',
      description:
        'List all available agents in the registry. See which specialized agents are available for handoffs.',
      inputSchema: {
        type: 'object',
        properties: {
          enabledOnly: {
            type: 'boolean',
            description: 'Only return enabled agents (default: true)',
          },
          includeDetails: {
            type: 'boolean',
            description: 'Include skills and tools for each agent',
          },
        },
        required: [],
      },
    },
    category: 'agents',
    keywords: ['agents', 'list', 'available', 'roles', 'specialists', 'handoff'],
    useCases: [
      'See all available agents',
      'Find specialized agents for specific tasks',
      'Check which agents are enabled',
      'Plan agent handoffs',
    ],
  });

  // ai_first_handoff_to_agent
  registry.registerTool({
    tool: {
      name: 'ai_first_handoff_to_agent',
      description:
        'Delegate a task to a specialized agent. Creates a sub-session with the target agent and returns the result. Use this for complex tasks that require specialized capabilities.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            description: 'Target agent ID to hand off to (e.g., "app-builder", "explorer")',
          },
          task: {
            type: 'string',
            description: 'Task description to pass to the agent',
          },
          context: {
            type: 'string',
            description: 'Additional context about the task (e.g., user preferences, constraints)',
          },
          waitForCompletion: {
            type: 'boolean',
            description:
              'Wait for the agent to complete (default: true). If false, returns immediately with session ID.',
          },
        },
        required: ['agent', 'task'],
      },
    },
    category: 'agents',
    keywords: ['handoff', 'delegate', 'agent', 'specialized', 'orchestrate', 'switch', 'sub-agent'],
    useCases: [
      'Delegate app creation to app-builder agent',
      'Delegate code exploration to explorer agent',
      'Orchestrate multi-agent workflows',
      'Handle specialized tasks with focused agents',
    ],
    examples: [
      {
        description: 'Delegate app creation to app-builder',
        input: {
          agent: 'app-builder',
          task: 'Create a Calendly-type scheduling app for booking meetings',
        },
      },
      {
        description: 'Delegate with context',
        input: {
          agent: 'app-builder',
          task: 'Create a feedback form app',
          context: 'The user wants a simple star rating system with optional comments',
        },
      },
    ],
  });
}

/**
 * Register Context Persistence tools
 */
function registerContextTools(registry: ToolRegistry): void {
  // ai_first_read_context
  registry.registerTool({
    tool: {
      name: 'ai_first_read_context',
      description:
        'Read persistent context for the current chat/channel. Retrieve user preferences, past interactions, activity history, and current working state.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description:
              'Platform to read context for (whatsapp, slack, opencode, cursor). Uses tool invocation context if not provided.',
          },
          chatId: {
            type: 'string',
            description: 'Chat/channel ID. Uses tool invocation context if not provided.',
          },
          section: {
            type: 'string',
            description:
              'Which section to read: all, identity, userProfile, recentActivity, currentState (default: all)',
          },
        },
        required: [],
      },
    },
    category: 'context',
    keywords: [
      'context',
      'memory',
      'preferences',
      'history',
      'recall',
      'remember',
      'user',
      'state',
      'persistent',
    ],
    useCases: [
      "Recall user's name or preferences",
      'Check what topics were discussed recently',
      "Get user's communication style preference",
      'See what project the user is working on',
      'Review recent activity history',
    ],
    examples: [
      { description: 'Read all context for current chat', input: {} },
      { description: 'Read only user identity info', input: { section: 'identity' } },
      { description: 'Read recent activity history', input: { section: 'recentActivity' } },
    ],
  });

  // ai_first_update_context
  registry.registerTool({
    tool: {
      name: 'ai_first_update_context',
      description:
        'Update persistent context for the current chat/channel. Save user preferences, record activity, and update current working state. Updates are deep-merged with existing context.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            description:
              'Platform to update context for (whatsapp, slack, opencode, cursor). Uses tool invocation context if not provided.',
          },
          chatId: {
            type: 'string',
            description: 'Chat/channel ID. Uses tool invocation context if not provided.',
          },
          updates: {
            type: 'object',
            description:
              'Context updates to apply. Can include identity, userProfile, currentState fields. Deep-merged with existing context.',
          },
          addActivity: {
            type: 'object',
            description:
              'Optional activity to record. Requires type (user_action, agent_action, task_completed, preference_updated, custom) and description.',
          },
        },
        required: [],
      },
    },
    category: 'context',
    keywords: [
      'context',
      'memory',
      'save',
      'update',
      'preferences',
      'remember',
      'store',
      'state',
      'persistent',
      'activity',
    ],
    useCases: [
      "Save user's name when they introduce themselves",
      'Record communication style preference',
      'Update the active project being discussed',
      'Log completed tasks in activity history',
      "Remember user's timezone for scheduling",
    ],
    examples: [
      {
        description: "Save user's name and role",
        input: { updates: { identity: { name: 'John', role: 'Product Manager' } } },
      },
      {
        description: 'Update current project and record activity',
        input: {
          updates: { currentState: { activeProject: 'YOUR_COMPONENT' } },
          addActivity: {
            type: 'user_action',
            description: 'Started working on YOUR_COMPONENT project',
          },
        },
      },
      {
        description: 'Set communication preference',
        input: {
          updates: { userProfile: { communicationStyle: 'casual', responseLength: 'brief' } },
        },
      },
    ],
  });
}

/**
 * Register Configuration tools (permissions, prompts, secrets, agents, schedules)
 */
function registerConfigTools(registry: ToolRegistry): void {
  // Confirmation tools
  registry.registerTool({
    tool: {
      name: 'config_confirm_action',
      description:
        'Confirm and execute a pending configuration action. Use this after the user has reviewed and approved the proposed change.',
      inputSchema: {
        type: 'object',
        properties: {
          action_id: {
            type: 'string',
            description: 'The ID of the pending action to confirm (starts with cfg_)',
          },
        },
        required: ['action_id'],
      },
    },
    category: 'system',
    keywords: ['confirm', 'approve', 'execute', 'apply', 'configuration', 'pending'],
    useCases: [
      'Execute a configuration change after user approval',
      'Apply a pending permission change',
      'Complete a configuration workflow',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_list_pending',
      description:
        'List all pending configuration actions awaiting confirmation. Shows what changes are queued and when they expire.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'system',
    keywords: ['list', 'pending', 'queue', 'configuration', 'waiting'],
    useCases: [
      'See what configuration changes are waiting for approval',
      'Check if there are any pending actions before making new changes',
      'Review all queued changes',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_cancel_action',
      description:
        'Cancel a pending configuration action. Use this if the user decides not to proceed with a proposed change.',
      inputSchema: {
        type: 'object',
        properties: {
          action_id: {
            type: 'string',
            description: 'The ID of the pending action to cancel (starts with cfg_)',
          },
        },
        required: ['action_id'],
      },
    },
    category: 'system',
    keywords: ['cancel', 'abort', 'discard', 'reject', 'configuration', 'pending'],
    useCases: [
      'Cancel a configuration change the user no longer wants',
      'Abort a pending permission change',
      'Discard a proposed setting change',
    ],
  });

  // Permission tools
  registry.registerTool({
    tool: {
      name: 'config_set_permission',
      description:
        'Set permission for a WhatsApp chat or group. Creates a pending action that requires user confirmation. Permissions: read_write (bot can respond), read_only (messages stored only), ignored (messages not stored).',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: {
            type: 'string',
            description:
              'WhatsApp chat ID (e.g., 1234567890@s.whatsapp.net for private chat, 120363123456789@g.us for group)',
          },
          permission: {
            type: 'string',
            enum: ['read_write', 'read_only', 'ignored'],
            description: 'Permission level: read_write, read_only, or ignored',
          },
          chat_type: {
            type: 'string',
            enum: ['group', 'private'],
            description: 'Chat type: group or private (auto-detected if not provided)',
          },
          display_name: {
            type: 'string',
            description: 'Human-readable name for the chat',
          },
          notes: {
            type: 'string',
            description: 'Optional notes about this permission setting',
          },
        },
        required: ['chat_id', 'permission'],
      },
    },
    category: 'system',
    keywords: ['permission', 'access', 'whatsapp', 'chat', 'group', 'configure', 'allow'],
    useCases: [
      'Allow the bot to respond in a WhatsApp group',
      'Set a chat to read-only mode',
      'Ignore messages from a specific chat',
      'Configure permissions for discovered chats',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_get_permission',
      description:
        'Get the current permission setting for a WhatsApp chat. Shows whether the bot can respond, and any configured notes.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: {
            type: 'string',
            description:
              'WhatsApp chat ID (e.g., 1234567890@s.whatsapp.net or 120363123456789@g.us)',
          },
        },
        required: ['chat_id'],
      },
    },
    category: 'system',
    keywords: ['permission', 'check', 'get', 'status', 'whatsapp', 'chat'],
    useCases: [
      'Check if bot can respond in a chat',
      'Verify current permission settings',
      'Get permission status before making changes',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_list_permissions',
      description:
        'List all explicitly configured chat permissions. Shows which chats have custom permission settings.',
      inputSchema: {
        type: 'object',
        properties: {
          permission_filter: {
            type: 'string',
            enum: ['read_write', 'read_only', 'ignored'],
            description: 'Optional filter: only show chats with this permission level',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 50)',
          },
        },
        required: [],
      },
    },
    category: 'system',
    keywords: ['permission', 'list', 'all', 'configured', 'whatsapp', 'chats'],
    useCases: [
      'See all chats where bot can respond',
      'List all read-only chats',
      'Review permission configuration',
    ],
  });

  // Prompt tools
  registry.registerTool({
    tool: {
      name: 'config_set_prompt',
      description:
        'Set a custom system prompt for a WhatsApp chat/group or platform default. Creates a pending action that requires user confirmation. The prompt defines how the AI assistant behaves in that context.',
      inputSchema: {
        type: 'object',
        properties: {
          target_type: {
            type: 'string',
            enum: ['chat', 'platform'],
            description:
              'What to configure: "chat" for specific chat/group, "platform" for platform-wide default',
          },
          target_id: {
            type: 'string',
            description:
              'Target identifier: chat ID for "chat" type, platform name (whatsapp/slack) for "platform" type',
          },
          prompt_text: {
            type: 'string',
            description: 'The custom system prompt text',
          },
          display_name: {
            type: 'string',
            description: 'Human-readable name for this prompt',
          },
        },
        required: ['target_type', 'target_id', 'prompt_text'],
      },
    },
    category: 'system',
    keywords: ['prompt', 'system', 'instruction', 'behavior', 'ai', 'customize', 'configure'],
    useCases: [
      'Set a custom prompt for a specific WhatsApp group',
      'Configure how the bot behaves in a particular chat',
      'Update the default platform prompt for all chats',
      'Customize AI behavior for different contexts',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_get_prompt',
      description:
        'Get the current system prompt for a WhatsApp chat or platform default. Shows what instructions the AI follows in that context.',
      inputSchema: {
        type: 'object',
        properties: {
          target_type: {
            type: 'string',
            enum: ['chat', 'platform'],
            description: '"chat" for specific chat/group, "platform" for platform default',
          },
          target_id: {
            type: 'string',
            description:
              'Chat ID for "chat" type, platform name (whatsapp/slack) for "platform" type',
          },
        },
        required: ['target_type', 'target_id'],
      },
    },
    category: 'system',
    keywords: ['prompt', 'get', 'check', 'system', 'instruction'],
    useCases: [
      'Check what prompt is configured for a chat',
      'View the current platform default prompt',
      'Verify prompt settings before making changes',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_list_prompts',
      description:
        'List all custom system prompts that have been configured. Shows chat-specific and platform-wide prompts.',
      inputSchema: {
        type: 'object',
        properties: {
          platform_filter: {
            type: 'string',
            enum: ['whatsapp', 'slack'],
            description: 'Optional filter: only show prompts for this platform',
          },
        },
        required: [],
      },
    },
    category: 'system',
    keywords: ['prompt', 'list', 'all', 'configured', 'custom'],
    useCases: [
      'See all custom prompts configured',
      'Review prompt settings across chats',
      'Find which chats have custom prompts',
    ],
  });

  // Secret tools
  registry.registerTool({
    tool: {
      name: 'config_set_secret',
      description:
        'Set a secret value (API key, token, password). Creates a pending action that requires user confirmation. Secrets are stored encrypted in the database and used by integrations.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'Secret key name (e.g., JIRA_API_TOKEN, SLACK_BOT_TOKEN, OPENAI_API_KEY). Use UPPERCASE_WITH_UNDERSCORES convention.',
          },
          value: {
            type: 'string',
            description: 'The secret value to store (will be encrypted)',
          },
          category: {
            type: 'string',
            description: 'Category for organization (e.g., jira, slack, openai, google)',
          },
          description: {
            type: 'string',
            description: 'Human-readable description of this secret',
          },
        },
        required: ['key', 'value'],
      },
    },
    category: 'system',
    keywords: ['secret', 'api', 'key', 'token', 'password', 'credential', 'configure'],
    useCases: [
      'Store JIRA API token for integration',
      'Configure Slack bot token',
      'Add OpenAI API key',
      'Store Google OAuth credentials',
      'Update an existing secret value',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_list_secrets',
      description:
        'List all configured secret keys. Shows secret names, categories, and descriptions but NOT the actual secret values for security.',
      inputSchema: {
        type: 'object',
        properties: {
          category_filter: {
            type: 'string',
            description: 'Optional filter: only show secrets in this category',
          },
        },
        required: [],
      },
    },
    category: 'system',
    keywords: ['secret', 'list', 'keys', 'api', 'token', 'configured'],
    useCases: [
      'See what secrets are configured',
      'Check if a secret key exists',
      'Review secrets by category',
      'Find which API keys are stored',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_delete_secret',
      description:
        'Delete a secret from storage. Creates a pending action that requires user confirmation. Use this to remove old or unused API keys.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Secret key name to delete (e.g., JIRA_API_TOKEN)',
          },
        },
        required: ['key'],
      },
    },
    category: 'system',
    keywords: ['secret', 'delete', 'remove', 'api', 'key', 'revoke'],
    useCases: [
      'Remove an old API key',
      'Delete unused secrets',
      'Clean up revoked tokens',
      'Remove expired credentials',
    ],
  });

  // Agent tools
  registry.registerTool({
    tool: {
      name: 'config_update_agent',
      description:
        'Update agent configuration settings (enabled status, base prompt, model selection). Creates a pending action that requires user confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'Agent ID (e.g., pm-assistant, communicator, onboarder, explorer)',
          },
          enabled: {
            type: 'boolean',
            description: 'Enable or disable the agent',
          },
          base_prompt: {
            type: 'string',
            description: 'Update the base system prompt for the agent',
          },
          model_default: {
            type: 'string',
            description: 'Default model ID (e.g., opencode/grok-code, anthropic/claude-sonnet-4)',
          },
          model_fallback: {
            type: 'string',
            description: 'Fallback model if default fails',
          },
        },
        required: ['agent_id'],
      },
    },
    category: 'system',
    keywords: ['agent', 'configure', 'update', 'enable', 'disable', 'model', 'prompt'],
    useCases: [
      'Enable or disable an agent',
      'Update an agent base prompt',
      'Change which AI model an agent uses',
      'Configure agent behavior',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_get_agent',
      description:
        'Get detailed configuration for a specific agent. Shows enabled status, prompt, models, skills, and tool permissions.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'Agent ID (e.g., pm-assistant, communicator, onboarder, explorer)',
          },
        },
        required: ['agent_id'],
      },
    },
    category: 'system',
    keywords: ['agent', 'get', 'check', 'config', 'details'],
    useCases: [
      'View agent configuration details',
      'Check which skills an agent has',
      'See what tools an agent can use',
      'Verify agent settings',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_list_agents',
      description:
        'List all configured agents. Shows agent names, modes, enabled status, and brief descriptions.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled_only: {
            type: 'boolean',
            description: 'Only return enabled agents (default: false)',
          },
        },
        required: [],
      },
    },
    category: 'system',
    keywords: ['agent', 'list', 'all', 'configured', 'available'],
    useCases: [
      'See all available agents',
      'Check which agents are enabled',
      'Review agent configuration',
    ],
  });

  // Schedule tools
  registry.registerTool({
    tool: {
      name: 'config_create_schedule',
      description:
        'Create a new scheduled message or job. Creates a pending action that requires user confirmation. Uses cron expressions for scheduling.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Human-readable name for the schedule',
          },
          cron_expression: {
            type: 'string',
            description: 'Cron expression (e.g., "0 9 * * 1-5" for 9am weekdays)',
          },
          target_type: {
            type: 'string',
            enum: ['whatsapp', 'slack'],
            description: 'Destination platform: whatsapp or slack',
          },
          target_id: {
            type: 'string',
            description: 'Target identifier: chat ID for WhatsApp, channel ID for Slack',
          },
          message: {
            type: 'string',
            description: 'The message to send',
          },
          enabled: {
            type: 'boolean',
            description: 'Whether the schedule is active (default: true)',
          },
        },
        required: ['name', 'cron_expression', 'target_type', 'target_id', 'message'],
      },
    },
    category: 'system',
    keywords: ['schedule', 'create', 'recurring', 'cron', 'reminder', 'message'],
    useCases: [
      'Create a daily standup reminder',
      'Schedule weekly reports',
      'Set up recurring notifications',
      'Create automated messages',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_update_schedule',
      description:
        'Update an existing scheduled message. Creates a pending action that requires user confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          schedule_id: {
            type: 'number',
            description: 'Schedule ID to update',
          },
          name: {
            type: 'string',
            description: 'Update the schedule name',
          },
          cron_expression: {
            type: 'string',
            description: 'Update the cron expression',
          },
          message: {
            type: 'string',
            description: 'Update the message text',
          },
          enabled: {
            type: 'boolean',
            description: 'Enable or disable the schedule',
          },
        },
        required: ['schedule_id'],
      },
    },
    category: 'system',
    keywords: ['schedule', 'update', 'modify', 'change', 'recurring'],
    useCases: [
      'Change schedule timing',
      'Update scheduled message text',
      'Enable or disable a schedule',
      'Modify recurring notification',
    ],
  });

  registry.registerTool({
    tool: {
      name: 'config_delete_schedule',
      description:
        'Delete a scheduled message or job. Creates a pending action that requires user confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          schedule_id: {
            type: 'number',
            description: 'Schedule ID to delete',
          },
        },
        required: ['schedule_id'],
      },
    },
    category: 'system',
    keywords: ['schedule', 'delete', 'remove', 'cancel', 'recurring'],
    useCases: ['Remove an old schedule', 'Cancel a recurring message', 'Delete unused schedules'],
  });

  registry.registerTool({
    tool: {
      name: 'config_list_schedules',
      description:
        'List all scheduled messages and jobs. Shows schedule names, timing, targets, and enabled status.',
      inputSchema: {
        type: 'object',
        properties: {
          active_only: {
            type: 'boolean',
            description: 'If true, only show active schedules (default: false)',
          },
        },
        required: [],
      },
    },
    category: 'system',
    keywords: ['schedule', 'list', 'all', 'recurring', 'messages'],
    useCases: [
      'See all scheduled messages',
      'Check active schedules',
      'Review recurring notifications',
    ],
  });
}

/**
 * Register Media tools (image generation, mascot variations)
 */
function registerMediaTools(registry: ToolRegistry): void {
  // ai_first_generate_mascot
  registry.registerTool({
    tool: {
      name: 'ai_first_generate_mascot',
      description:
        'Generate a variation of the Orient mascot (border collie dog with blue bandana). Supports different poses, expressions, backgrounds, seasonal themes, accessories, and art styles. Use transparent=true for web/UI images with transparent backgrounds (uses OpenAI).',
      inputSchema: {
        type: 'object',
        properties: {
          variation_type: {
            type: 'string',
            description:
              'Type of variation: pose (sitting, running, waving), expression (happy, thinking, excited), background (office, outdoors, abstract), seasonal (holiday themes), accessory (hats, glasses, tools), style (pixel art, watercolor, minimalist), or custom',
            enum: ['pose', 'expression', 'background', 'seasonal', 'accessory', 'style', 'custom'],
          },
          prompt: {
            type: 'string',
            description:
              'Detailed description of the desired variation (e.g., "sitting and waving happily", "wearing a Santa hat with snowy background")',
          },
          output_name: {
            type: 'string',
            description:
              'Optional filename for the generated image (without extension). If not provided, uses variation_type-timestamp.png',
          },
          transparent: {
            type: 'boolean',
            description:
              'Generate with transparent background using OpenAI gpt-image-1 (requires OPENAI_API_KEY). Recommended for web/UI use. Default: false',
          },
        },
        required: ['variation_type', 'prompt'],
      },
    },
    category: 'media',
    keywords: [
      'mascot',
      'avatar',
      'image',
      'generate',
      'variation',
      'dog',
      'picture',
      'art',
      'visual',
      'transparent',
      'openai',
    ],
    useCases: [
      'Generate a mascot variation for a specific feature or page',
      'Create seasonal mascot images (holiday themes)',
      'Generate mascot with different expressions for UI states (loading, error, success)',
      'Create mascot variations for marketing materials or announcements',
      'Generate custom mascot poses for documentation or presentations',
      'Generate mascot with transparent background for web/UI integration',
    ],
    examples: [
      {
        description: 'Generate a celebrating mascot for release announcements',
        input: {
          variation_type: 'accessory',
          prompt: 'wearing a party hat, celebrating with confetti',
          output_name: 'celebration',
        },
      },
      {
        description: 'Generate a thinking mascot for loading states',
        input: {
          variation_type: 'expression',
          prompt: 'thinking deeply, with a thought bubble',
          output_name: 'thinking',
        },
      },
      {
        description: 'Generate a mascot with transparent background for web use',
        input: {
          variation_type: 'pose',
          prompt: 'friendly waving pose, clean cartoon style',
          output_name: 'waving-transparent',
          transparent: true,
        },
      },
      {
        description: 'Generate a winter holiday mascot',
        input: {
          variation_type: 'seasonal',
          prompt: 'wearing a Santa hat, snowy background, festive mood',
          output_name: 'winter-holiday',
        },
      },
    ],
  });
}

// ============================================
// TOOL EXECUTION REGISTRY
// ============================================

/**
 * Tool execution result format (MCP compatible)
 * Uses a flexible type to match MCP SDK expectations
 */
export interface ToolExecutionResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolExecutionResult>;

/**
 * Tool Executor Registry - Maps tool names to their execution handlers
 *
 * This allows for gradual migration of tool implementations from the
 * monolithic mcp-server.ts switch statement to individual handlers.
 */
export class ToolExecutorRegistry {
  private handlers: Map<string, ToolHandler> = new Map();

  /**
   * Register a tool execution handler
   */
  registerHandler(toolName: string, handler: ToolHandler): void {
    this.handlers.set(toolName, handler);
    logger.debug('Registered tool handler', { toolName });
  }

  /**
   * Check if a handler exists for a tool
   */
  hasHandler(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  /**
   * Execute a tool by name
   * Returns null if no handler is registered (caller should fall back to switch statement)
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult | null> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
      return null; // No handler registered, fall back to switch statement
    }
    return handler(args);
  }

  /**
   * Get list of registered handler names
   */
  getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Export singleton instances
let registryInstance: ToolRegistry | null = null;
let executorInstance: ToolExecutorRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = createToolRegistry();
  }
  return registryInstance;
}

export function getToolExecutorRegistry(): ToolExecutorRegistry {
  if (!executorInstance) {
    executorInstance = new ToolExecutorRegistry();
    // Register media tool handlers
    registerMediaToolHandlers(executorInstance);
    // Register config tool handlers
    registerConfigToolHandlers(executorInstance);
  }
  return executorInstance;
}

/**
 * Registers configuration tool handlers
 */
function registerConfigToolHandlers(registry: ToolExecutorRegistry): void {
  // Import config tools and register their handlers
  const registerHandlers = async () => {
    try {
      const mcpToolsModule = await import('@orient/mcp-tools');

      const {
        confirmationTools,
        permissionTools,
        promptTools,
        secretTools,
        agentTools,
        scheduleTools,
      } = mcpToolsModule;

      const allConfigTools = [
        ...confirmationTools,
        ...permissionTools,
        ...promptTools,
        ...secretTools,
        ...agentTools,
        ...scheduleTools,
      ];

      for (const tool of allConfigTools) {
        registry.registerHandler(tool.name, async (args: Record<string, unknown>) => {
          // Config tools use a minimal context (they don't need full AppConfig)
          // Cast to ToolContext since config tools only use correlationId
          const context = {
            config: {} as ToolContext['config'],
            correlationId: `cfg-${Date.now()}`,
          } as ToolContext;
          const result = await tool.run(args, context);

          if (result.success) {
            return createToolResult(JSON.stringify(result.data, null, 2));
          } else {
            return createToolError(result.error || 'Unknown error');
          }
        });
      }

      logger.info('Config tool handlers registered', { count: allConfigTools.length });
    } catch (error) {
      logger.error('Failed to register config tool handlers', { error });
    }
  };

  // Register asynchronously (tools will be available after initialization)
  void registerHandlers();
}

/**
 * Registers media tool handlers (mascot generation, etc.)
 */
function registerMediaToolHandlers(registry: ToolExecutorRegistry): void {
  registry.registerHandler('ai_first_generate_mascot', async (args: Record<string, unknown>) => {
    const {
      variation_type,
      prompt,
      output_name,
      transparent = false,
    } = args as {
      variation_type:
        | 'pose'
        | 'expression'
        | 'background'
        | 'seasonal'
        | 'accessory'
        | 'style'
        | 'custom';
      prompt: string;
      output_name?: string;
      transparent?: boolean;
    };

    if (!prompt || prompt.length < 5) {
      return createToolError('Prompt is required and must be at least 5 characters');
    }

    try {
      const fs = await import('fs');
      const pathMod = await import('path');

      // Load base mascot image
      const baseMascotPath = pathMod.join(
        process.cwd(),
        'packages/dashboard-frontend/public/mascot/base.png'
      );

      if (!fs.existsSync(baseMascotPath)) {
        return createToolError(
          'Base mascot image not found. Please place base.png in packages/dashboard-frontend/public/mascot/'
        );
      }

      const baseImageBuffer = fs.readFileSync(baseMascotPath);

      logger.info('Generating mascot variation', { variation_type, prompt, transparent });

      let imageBuffer: Buffer;

      if (transparent) {
        // Use OpenAI for transparent backgrounds
        const { getEnvWithSecrets } = await import('@orient/core');
        const apiKey = getEnvWithSecrets('OPENAI_API_KEY');
        if (!apiKey) {
          return createToolError(
            'OPENAI_API_KEY not set. Required for transparent background generation.'
          );
        }

        const OpenAI = await import('openai');
        const client = new OpenAI.default({ apiKey });

        // Use OpenAI's toFile utility for proper File handling
        const imageFile = await OpenAI.toFile(baseImageBuffer, 'mascot.png', { type: 'image/png' });

        // Build the prompt with mascot reference
        const fullPrompt = `Using this cartoon border collie dog mascot with blue bandana as the style reference: ${prompt}

CRITICAL: Generate PNG with TRANSPARENT background. Keep same cartoon style with clean lines and flat colors. No background elements.`;

        logger.info('Generating mascot with OpenAI (transparent)', { variation_type, prompt });

        const response = await client.images.edit({
          model: 'gpt-image-1',
          image: imageFile,
          prompt: fullPrompt,
          n: 1,
          size: '1024x1024',
          background: 'transparent',
        });

        const imageData = response.data?.[0];
        if (!imageData?.b64_json) {
          return createToolError('No image data returned from OpenAI');
        }

        imageBuffer = Buffer.from(imageData.b64_json, 'base64');
      } else {
        // Use Gemini for regular images
        const { createGeminiService, initializeGeminiClient, isGeminiInitialized } =
          await import('@orient/integrations/gemini');

        if (!isGeminiInitialized()) {
          const geminiKey = process.env.GEMINI_API_KEY;
          if (!geminiKey) {
            return createToolError(
              'GEMINI_API_KEY environment variable is not set. Add it to your .env file.'
            );
          }
          initializeGeminiClient({ apiKey: geminiKey });
        }

        const geminiService = createGeminiService();

        const result = await geminiService.generateMascotVariation(baseImageBuffer, {
          variationType: variation_type,
          prompt,
        });

        if (!result.success || !result.imageBase64) {
          return createToolError(result.error || 'Failed to generate mascot variation');
        }

        imageBuffer = Buffer.from(result.imageBase64, 'base64');
      }

      // Save the generated image
      const filename = output_name || `${variation_type}-${Date.now()}`;
      const outputPath = pathMod.join(
        process.cwd(),
        'packages/dashboard-frontend/public/mascot/variations',
        `${filename}.png`
      );

      // Ensure variations directory exists
      const variationsDir = pathMod.dirname(outputPath);
      if (!fs.existsSync(variationsDir)) {
        fs.mkdirSync(variationsDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, imageBuffer);
      logger.info('Mascot variation saved', { path: outputPath, transparent });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Mascot variation "${filename}" generated successfully${transparent ? ' (transparent background)' : ''}`,
            path: `/mascot/variations/${filename}.png`,
            fullPath: outputPath,
            variationType: variation_type,
            prompt,
            transparent,
          },
          null,
          2
        )
      );
    } catch (error) {
      logger.error('Failed to generate mascot', { error });
      return createToolError(
        `Failed to generate mascot: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Helper to create a successful tool result
 */
export function createToolResult(text: string): ToolExecutionResult {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Helper to create an error tool result
 */
export function createToolError(error: string | Error): ToolExecutionResult {
  const errorMessage = error instanceof Error ? error.message : error;
  return {
    content: [{ type: 'text', text: `Error: ${errorMessage}` }],
    isError: true,
  };
}
