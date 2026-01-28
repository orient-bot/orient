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

import path from 'path';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { WebClient } from '@slack/web-api';
import { createServiceLogger, getRawConfig } from '@orient/core';
import type { ToolContext } from '@orient/mcp-tools';
import { handleGoogleSlidesToolCall } from '@orient/mcp-tools';
import type { SlidesService } from '@orient/integrations/google';
import {
  createMessageDatabase,
  type MessageDatabase,
  type MessageSearchOptions,
  type StoredGroup,
  type StoredMessage,
} from '@orient/database-services';
import {
  AppGeneratorService,
  AppGitService,
  createAppGitService,
  createAppsService,
  type AppsService,
} from '@orient/apps';
import {
  GitHubService,
  GitWorktreeService,
  createGitHubServiceFromEnv,
  createGitWorktreeService,
} from '@orient/integrations';
import { createSkillsService, type SkillsService } from './skillsService.js';

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
  // jira_get_all_issues
  registry.registerTool({
    tool: {
      name: 'jira_get_all_issues',
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

  // jira_get_issue
  registry.registerTool({
    tool: {
      name: 'jira_get_issue',
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

  // jira_get_in_progress
  registry.registerTool({
    tool: {
      name: 'jira_get_in_progress',
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

  // jira_get_board_issues
  registry.registerTool({
    tool: {
      name: 'jira_get_board_issues',
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

  // jira_get_blockers
  registry.registerTool({
    tool: {
      name: 'jira_get_blockers',
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

  // jira_check_sla_breaches
  registry.registerTool({
    tool: {
      name: 'jira_check_sla_breaches',
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

  // jira_get_sprint_issues
  registry.registerTool({
    tool: {
      name: 'jira_get_sprint_issues',
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

  // jira_get_completed_this_week
  registry.registerTool({
    tool: {
      name: 'jira_get_completed_this_week',
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

  // jira_get_created_this_week
  registry.registerTool({
    tool: {
      name: 'jira_get_created_this_week',
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

  // jira_get_daily_digest
  registry.registerTool({
    tool: {
      name: 'jira_get_daily_digest',
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

  // jira_get_weekly_summary
  registry.registerTool({
    tool: {
      name: 'jira_get_weekly_summary',
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

  // jira_create_issue_link
  registry.registerTool({
    tool: {
      name: 'jira_create_issue_link',
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

  // jira_get_issue_links
  registry.registerTool({
    tool: {
      name: 'jira_get_issue_links',
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

  // jira_delete_issue_link
  registry.registerTool({
    tool: {
      name: 'jira_delete_issue_link',
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
  // slack_lookup_user_by_email
  registry.registerTool({
    tool: {
      name: 'slack_lookup_user_by_email',
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

  // slack_send_dm
  registry.registerTool({
    tool: {
      name: 'slack_send_dm',
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

  // slack_send_channel_message
  registry.registerTool({
    tool: {
      name: 'slack_send_channel_message',
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

  // slack_get_channel_messages
  registry.registerTool({
    tool: {
      name: 'slack_get_channel_messages',
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
  // slides_get_presentation
  registry.registerTool({
    tool: {
      name: 'slides_get_presentation',
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

  // slides_get_slide
  registry.registerTool({
    tool: {
      name: 'slides_get_slide',
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

  // slides_update_text
  registry.registerTool({
    tool: {
      name: 'slides_update_text',
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

  // slides_update_slide_text
  registry.registerTool({
    tool: {
      name: 'slides_update_slide_text',
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

  // slides_duplicate_template
  registry.registerTool({
    tool: {
      name: 'slides_duplicate_template',
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

  // slides_update_weekly
  registry.registerTool({
    tool: {
      name: 'slides_update_weekly',
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

  // slides_delete_slide
  registry.registerTool({
    tool: {
      name: 'slides_delete_slide',
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

  // slides_create_table
  registry.registerTool({
    tool: {
      name: 'slides_create_table',
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

  // google_oauth_connect
  registry.registerTool({
    tool: {
      name: 'google_oauth_connect',
      description:
        'Connect a Google account via OAuth. Opens a browser for authorization and returns the connected email.',
      inputSchema: {
        type: 'object',
        properties: {
          scopes: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional OAuth scopes to request (defaults to calendar, gmail, tasks, and drive scopes)',
          },
        },
        required: [],
      },
    },
    category: 'google',
    keywords: ['google', 'oauth', 'connect', 'authorize', 'login', 'account'],
    useCases: ['Connect a Google account', 'Authorize Google access for tools'],
  });

  // google_oauth_list_accounts
  registry.registerTool({
    tool: {
      name: 'google_oauth_list_accounts',
      description: 'List all connected Google accounts.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    category: 'google',
    keywords: ['google', 'oauth', 'accounts', 'list', 'connected'],
    useCases: ['See which Google accounts are connected'],
  });

  // google_oauth_disconnect
  registry.registerTool({
    tool: {
      name: 'google_oauth_disconnect',
      description: 'Disconnect a Google account by email.',
      inputSchema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Google account email to disconnect' },
        },
        required: ['email'],
      },
    },
    category: 'google',
    keywords: ['google', 'oauth', 'disconnect', 'remove', 'account'],
    useCases: ['Disconnect a Google account'],
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
          unreadOnly: { type: 'boolean', description: 'Only include unread messages' },
          from: { type: 'string', description: 'Filter by sender email' },
          after: { type: 'string', description: 'Only include messages after date (ISO 8601)' },
          before: { type: 'string', description: 'Only include messages before date (ISO 8601)' },
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

  // google_gmail_get_message
  registry.registerTool({
    tool: {
      name: 'google_gmail_get_message',
      description: 'Get full details for a specific Gmail message by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'Gmail message ID' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['messageId'],
      },
    },
    category: 'google',
    keywords: ['gmail', 'email', 'message', 'get', 'details', 'read'],
    useCases: ['Read an email in full', 'Fetch details for a specific email'],
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
          htmlBody: { type: 'string', description: 'Optional HTML body' },
          cc: {
            type: 'array',
            items: { type: 'string' },
            description: 'CC email addresses',
          },
          bcc: {
            type: 'array',
            items: { type: 'string' },
            description: 'BCC email addresses',
          },
          replyTo: { type: 'string', description: 'Reply-to message ID' },
          threadId: { type: 'string', description: 'Thread ID to send within' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
    category: 'google',
    keywords: ['gmail', 'email', 'send', 'compose', 'mail'],
    useCases: ['Send an email', 'Compose a message'],
  });

  // google_gmail_create_draft
  registry.registerTool({
    tool: {
      name: 'google_gmail_create_draft',
      description: 'Create a draft email in Gmail.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (plain text)' },
          htmlBody: { type: 'string', description: 'Optional HTML body' },
          cc: {
            type: 'array',
            items: { type: 'string' },
            description: 'CC email addresses',
          },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
    category: 'google',
    keywords: ['gmail', 'draft', 'email', 'compose'],
    useCases: ['Create a draft email', 'Prepare an email without sending'],
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

  // google_tasks_update
  registry.registerTool({
    tool: {
      name: 'google_tasks_update',
      description: 'Update an existing task in Google Tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to update' },
          title: { type: 'string', description: 'Updated task title' },
          notes: { type: 'string', description: 'Updated task notes/description' },
          dueDate: { type: 'string', description: 'Updated due date (ISO 8601 format)' },
          status: {
            type: 'string',
            enum: ['needsAction', 'completed'],
            description: 'Task status',
          },
          taskListId: { type: 'string', description: 'Task list ID (default: @default)' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['taskId'],
      },
    },
    category: 'google',
    keywords: ['tasks', 'update', 'edit', 'modify'],
    useCases: ['Update a task title or notes', 'Change due date', 'Mark a task completed'],
  });

  // google_sheets_read
  registry.registerTool({
    tool: {
      name: 'google_sheets_read',
      description: 'Read a range of cells from a Google Sheet.',
      inputSchema: {
        type: 'object',
        properties: {
          spreadsheetIdOrUrl: {
            type: 'string',
            description: 'Spreadsheet ID or URL',
          },
          range: { type: 'string', description: 'A1 range to read (e.g., Sheet1!A1:C10)' },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['spreadsheetIdOrUrl', 'range'],
      },
    },
    category: 'google',
    keywords: ['sheets', 'spreadsheet', 'read', 'cells', 'range'],
    useCases: ['Read data from a spreadsheet', 'Fetch values from a sheet'],
  });

  // google_sheets_write
  registry.registerTool({
    tool: {
      name: 'google_sheets_write',
      description: 'Write values to a range in a Google Sheet.',
      inputSchema: {
        type: 'object',
        properties: {
          spreadsheetIdOrUrl: {
            type: 'string',
            description: 'Spreadsheet ID or URL',
          },
          range: { type: 'string', description: 'A1 range to write (e.g., Sheet1!A1:C10)' },
          values: {
            type: 'array',
            description: '2D array of values to write',
            items: { type: 'array', items: {} },
          },
          valueInputOption: {
            type: 'string',
            description: 'Value input option (USER_ENTERED or RAW)',
          },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['spreadsheetIdOrUrl', 'range', 'values'],
      },
    },
    category: 'google',
    keywords: ['sheets', 'spreadsheet', 'write', 'update', 'cells'],
    useCases: ['Write data to a spreadsheet', 'Update cells in a sheet'],
  });

  // google_slides_get
  registry.registerTool({
    tool: {
      name: 'google_slides_get',
      description: 'Get presentation metadata from Google Slides via OAuth.',
      inputSchema: {
        type: 'object',
        properties: {
          presentationIdOrUrl: {
            type: 'string',
            description: 'Presentation ID or URL',
          },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['presentationIdOrUrl'],
      },
    },
    category: 'google',
    keywords: ['slides', 'presentation', 'get', 'metadata', 'oauth'],
    useCases: ['Fetch presentation details using OAuth'],
  });

  // google_slides_update
  registry.registerTool({
    tool: {
      name: 'google_slides_update',
      description: 'Replace text in a Google Slides presentation via OAuth.',
      inputSchema: {
        type: 'object',
        properties: {
          presentationIdOrUrl: {
            type: 'string',
            description: 'Presentation ID or URL',
          },
          replacements: {
            type: 'array',
            description: 'Array of placeholder and replacement text pairs',
            items: {
              type: 'object',
              properties: {
                placeholder: { type: 'string', description: 'Text to find' },
                replacement: { type: 'string', description: 'Replacement text' },
              },
              required: ['placeholder', 'replacement'],
            },
          },
          accountEmail: { type: 'string', description: 'Google account email' },
        },
        required: ['presentationIdOrUrl', 'replacements'],
      },
    },
    category: 'google',
    keywords: ['slides', 'presentation', 'update', 'replace', 'oauth'],
    useCases: ['Update text in a presentation using OAuth'],
  });
}

/**
 * Register System tools
 */
function registerSystemTools(registry: ToolRegistry): void {
  // system_health_check
  registry.registerTool({
    tool: {
      name: 'system_health_check',
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

  // system_get_config
  registry.registerTool({
    tool: {
      name: 'system_get_config',
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
  // skills_list
  registry.registerTool({
    tool: {
      name: 'skills_list',
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

  // skills_read
  registry.registerTool({
    tool: {
      name: 'skills_read',
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

  // skills_create_async
  registry.registerTool({
    tool: {
      name: 'skills_create_async',
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

  // skills_edit_async
  registry.registerTool({
    tool: {
      name: 'skills_edit_async',
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

  // skills_list_prs
  registry.registerTool({
    tool: {
      name: 'skills_list_prs',
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

  // skills_reload
  registry.registerTool({
    tool: {
      name: 'skills_reload',
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
  // apps_create
  registry.registerTool({
    tool: {
      name: 'apps_create',
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

  // apps_list
  registry.registerTool({
    tool: {
      name: 'apps_list',
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

  // apps_get
  registry.registerTool({
    tool: {
      name: 'apps_get',
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

  // apps_share
  registry.registerTool({
    tool: {
      name: 'apps_share',
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

  // apps_update
  registry.registerTool({
    tool: {
      name: 'apps_update',
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
  // agents_get_context
  registry.registerTool({
    tool: {
      name: 'agents_get_context',
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

  // agents_list
  registry.registerTool({
    tool: {
      name: 'agents_list',
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

  // agents_handoff
  registry.registerTool({
    tool: {
      name: 'agents_handoff',
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
  // context_read
  registry.registerTool({
    tool: {
      name: 'context_read',
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

  // context_update
  registry.registerTool({
    tool: {
      name: 'context_update',
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
  // media_generate_mascot
  registry.registerTool({
    tool: {
      name: 'media_generate_mascot',
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
    // Register Google tool handlers (Calendar, Gmail, Tasks, OAuth)
    registerGoogleToolHandlers(executorInstance);
    // Register system tool handlers
    registerSystemToolHandlers(executorInstance);
    // Register Jira tool handlers
    registerJiraToolHandlers(executorInstance);
    // Register Slack tool handlers
    registerSlackToolHandlers(executorInstance);
    // Register WhatsApp tool handlers
    registerWhatsAppToolHandlers(executorInstance);
    // Register Slides tool handlers
    registerSlidesToolHandlers(executorInstance);
    // Register Skill tool handlers
    registerSkillToolHandlers(executorInstance);
    // Register App tool handlers
    registerAppToolHandlers(executorInstance);
    // Register Agent tool handlers
    registerAgentToolHandlers(executorInstance);
    // Register Context tool handlers
    registerContextToolHandlers(executorInstance);
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
  registry.registerHandler('media_generate_mascot', async (args: Record<string, unknown>) => {
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

/**
 * Registers Google tool handlers (Calendar, Gmail, Tasks, OAuth)
 * These tools access personal Google accounts via OAuth
 *
 * Uses lazy imports inside each handler to ensure synchronous registration
 * while deferring the actual service loading until the handler is called.
 */
function registerGoogleToolHandlers(registry: ToolExecutorRegistry): void {
  // Google OAuth Status
  registry.registerHandler('google_oauth_status', async () => {
    try {
      const { getGoogleOAuthService } = await import('@orient/integrations/google');
      const oauthService = getGoogleOAuthService();
      const accounts = oauthService.getConnectedAccounts();
      const defaultAccount = oauthService.getDefaultAccount();

      return createToolResult(
        JSON.stringify(
          {
            connected: accounts.length > 0,
            accounts: accounts.map((a) => ({
              email: a.email,
              displayName: a.displayName,
              scopes: a.scopes,
              connectedAt: new Date(a.connectedAt).toISOString(),
            })),
            defaultAccount,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get OAuth status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google OAuth - Connect
  registry.registerHandler('google_oauth_connect', async (args: Record<string, unknown>) => {
    const { scopes } = args as { scopes?: string[] };

    try {
      const { getGoogleOAuthService, DEFAULT_SCOPES } = await import('@orient/integrations/google');
      const oauthService = getGoogleOAuthService();
      const requestedScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : DEFAULT_SCOPES;
      const email = await oauthService.connectAccount(requestedScopes);

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Successfully connected Google account: ${email}`,
            email,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to connect Google account: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google OAuth - List Accounts
  registry.registerHandler('google_oauth_list_accounts', async () => {
    try {
      const { getGoogleOAuthService } = await import('@orient/integrations/google');
      const oauthService = getGoogleOAuthService();
      const accounts = oauthService.getConnectedAccounts();

      return createToolResult(
        JSON.stringify(
          {
            count: accounts.length,
            accounts: accounts.map((a) => ({
              email: a.email,
              displayName: a.displayName,
              connectedAt: new Date(a.connectedAt).toISOString(),
              scopeCount: a.scopes.length,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to list accounts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google OAuth - Disconnect
  registry.registerHandler('google_oauth_disconnect', async (args: Record<string, unknown>) => {
    const { email } = args as { email: string };

    try {
      const { getGoogleOAuthService } = await import('@orient/integrations/google');
      const oauthService = getGoogleOAuthService();
      const success = oauthService.disconnectAccount(email);

      if (!success) {
        return createToolError(`Account not found: ${email}`);
      }

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Disconnected Google account: ${email}`,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to disconnect: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Calendar - List Events
  registry.registerHandler('google_calendar_list_events', async (args: Record<string, unknown>) => {
    const { calendarId, days, maxResults, query, accountEmail } = args as {
      calendarId?: string;
      days?: number;
      maxResults?: number;
      query?: string;
      accountEmail?: string;
    };

    try {
      const { getCalendarService } = await import('@orient/integrations/google');
      const calendar = getCalendarService();
      const daysAhead = days || 7;
      const now = new Date();
      const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      const events = await calendar.listEvents(
        {
          calendarId: calendarId || 'primary',
          timeMin: now,
          timeMax: timeMax,
          maxResults: maxResults || 50,
          query: query,
          singleEvents: true,
        },
        accountEmail
      );

      return createToolResult(
        JSON.stringify(
          {
            count: events.length,
            events: events.map((e) => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime.toISOString(),
              endTime: e.endTime.toISOString(),
              location: e.location,
              isAllDay: e.isAllDay,
              meetingLink: e.meetingLink,
              attendees: e.attendees.length,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to list events: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Gmail - List Messages
  registry.registerHandler('google_gmail_list_messages', async (args: Record<string, unknown>) => {
    const { query, maxResults, unreadOnly, label, from, after, before, accountEmail } = args as {
      query?: string;
      maxResults?: number;
      unreadOnly?: boolean;
      label?: string;
      from?: string;
      after?: string;
      before?: string;
      accountEmail?: string;
    };

    try {
      const { getGmailService } = await import('@orient/integrations/google');
      const gmail = getGmailService();
      const messages = await gmail.listMessages(
        {
          query,
          maxResults,
          unreadOnly,
          label,
          from,
          after: after ? new Date(after) : undefined,
          before: before ? new Date(before) : undefined,
        },
        accountEmail
      );

      return createToolResult(
        JSON.stringify(
          {
            count: messages.length,
            messages: messages.map((m) => ({
              id: m.id,
              subject: m.subject,
              from: m.from,
              date: m.date.toISOString(),
              snippet: m.snippet,
              isUnread: m.isUnread,
              labels: m.labels,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to list messages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Gmail - Get Message
  registry.registerHandler('google_gmail_get_message', async (args: Record<string, unknown>) => {
    const { messageId, accountEmail } = args as { messageId: string; accountEmail?: string };

    try {
      const { getGmailService } = await import('@orient/integrations/google');
      const gmail = getGmailService();
      const message = await gmail.getMessage(messageId, accountEmail);

      return createToolResult(
        JSON.stringify(
          {
            id: message.id,
            subject: message.subject,
            from: message.from,
            to: message.to,
            cc: message.cc,
            date: message.date.toISOString(),
            body: message.body,
            labels: message.labels,
            isUnread: message.isUnread,
            attachments: message.attachments,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Gmail - Send
  registry.registerHandler('google_gmail_send', async (args: Record<string, unknown>) => {
    const { to, subject, body, htmlBody, cc, bcc, replyTo, threadId, accountEmail } = args as {
      to: string;
      subject: string;
      body: string;
      htmlBody?: string;
      cc?: string[] | string;
      bcc?: string[] | string;
      replyTo?: string;
      threadId?: string;
      accountEmail?: string;
    };

    try {
      const { getGmailService } = await import('@orient/integrations/google');
      const gmail = getGmailService();
      const normalizedCc = Array.isArray(cc)
        ? cc
        : typeof cc === 'string' && cc.length > 0
          ? cc.split(',').map((value) => value.trim())
          : undefined;
      const normalizedBcc = Array.isArray(bcc)
        ? bcc
        : typeof bcc === 'string' && bcc.length > 0
          ? bcc.split(',').map((value) => value.trim())
          : undefined;

      const messageId = await gmail.sendMessage(
        {
          to,
          subject,
          body,
          htmlBody,
          cc: normalizedCc,
          bcc: normalizedBcc,
          replyTo,
          threadId,
        },
        accountEmail
      );

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Email sent successfully to ${to}`,
            messageId,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to send email: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Gmail - Create Draft
  registry.registerHandler('google_gmail_create_draft', async (args: Record<string, unknown>) => {
    const { to, subject, body, htmlBody, cc, accountEmail } = args as {
      to: string;
      subject: string;
      body: string;
      htmlBody?: string;
      cc?: string[] | string;
      accountEmail?: string;
    };

    try {
      const { getGmailService } = await import('@orient/integrations/google');
      const gmail = getGmailService();
      const normalizedCc = Array.isArray(cc)
        ? cc
        : typeof cc === 'string' && cc.length > 0
          ? cc.split(',').map((value) => value.trim())
          : undefined;

      const draftId = await gmail.createDraft(
        {
          to,
          subject,
          body,
          htmlBody,
          cc: normalizedCc,
        },
        accountEmail
      );

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: 'Draft created successfully',
            draftId,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to create draft: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Calendar - Create Event
  registry.registerHandler(
    'google_calendar_create_event',
    async (args: Record<string, unknown>) => {
      const {
        title,
        startTime,
        endTime,
        description,
        location,
        attendees,
        createMeetingLink,
        calendarId,
        accountEmail,
      } = args as {
        title: string;
        startTime: string;
        endTime: string;
        description?: string;
        location?: string;
        attendees?: string[];
        createMeetingLink?: boolean;
        calendarId?: string;
        accountEmail?: string;
      };

      try {
        const { getCalendarService } = await import('@orient/integrations/google');
        const calendar = getCalendarService();
        const event = await calendar.createEvent(
          {
            title,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            description,
            location,
            attendees,
            createMeetingLink,
            calendarId,
          },
          accountEmail
        );

        return createToolResult(
          JSON.stringify(
            {
              success: true,
              message: `Event created: ${event.title}`,
              event: {
                id: event.id,
                title: event.title,
                startTime: event.startTime.toISOString(),
                endTime: event.endTime.toISOString(),
                htmlLink: event.htmlLink,
                meetingLink: event.meetingLink,
              },
            },
            null,
            2
          )
        );
      } catch (error) {
        return createToolError(
          `Failed to create event: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Google Calendar - Update Event
  registry.registerHandler(
    'google_calendar_update_event',
    async (args: Record<string, unknown>) => {
      const { eventId, calendarId, accountEmail, ...updates } = args as {
        eventId: string;
        calendarId?: string;
        accountEmail?: string;
        title?: string;
        startTime?: string;
        endTime?: string;
        description?: string;
        location?: string;
      };

      try {
        const { getCalendarService } = await import('@orient/integrations/google');
        const calendar = getCalendarService();
        const updateOptions = {
          eventId,
          calendarId: calendarId || 'primary',
          ...(updates.title && { title: updates.title }),
          ...(updates.startTime && { startTime: new Date(updates.startTime) }),
          ...(updates.endTime && { endTime: new Date(updates.endTime) }),
          ...(updates.description && { description: updates.description }),
          ...(updates.location && { location: updates.location }),
        };

        const event = await calendar.updateEvent(updateOptions, accountEmail);

        return createToolResult(
          JSON.stringify(
            {
              success: true,
              message: `Event updated: ${event.title}`,
              event: {
                id: event.id,
                title: event.title,
                startTime: event.startTime.toISOString(),
                endTime: event.endTime.toISOString(),
              },
            },
            null,
            2
          )
        );
      } catch (error) {
        return createToolError(
          `Failed to update event: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Google Calendar - Delete Event
  registry.registerHandler(
    'google_calendar_delete_event',
    async (args: Record<string, unknown>) => {
      const { eventId, calendarId, accountEmail } = args as {
        eventId: string;
        calendarId?: string;
        accountEmail?: string;
      };

      try {
        const { getCalendarService } = await import('@orient/integrations/google');
        const calendar = getCalendarService();
        await calendar.deleteEvent(eventId, calendarId || 'primary', accountEmail);

        return createToolResult(
          JSON.stringify(
            {
              success: true,
              message: `Event ${eventId} deleted successfully`,
            },
            null,
            2
          )
        );
      } catch (error) {
        return createToolError(
          `Failed to delete event: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Google Tasks - List
  registry.registerHandler('google_tasks_list', async (args: Record<string, unknown>) => {
    const { taskListId, showCompleted, showHidden, maxResults, dueBefore, dueAfter, accountEmail } =
      args as {
        taskListId?: string;
        showCompleted?: boolean;
        showHidden?: boolean;
        maxResults?: number;
        dueBefore?: string;
        dueAfter?: string;
        accountEmail?: string;
      };

    try {
      const { getTasksService } = await import('@orient/integrations/google');
      const tasks = getTasksService();
      const items = await tasks.listTasks(
        {
          taskListId: taskListId || '@default',
          showCompleted,
          showHidden,
          maxResults,
          dueBefore: dueBefore ? new Date(dueBefore) : undefined,
          dueAfter: dueAfter ? new Date(dueAfter) : undefined,
        },
        accountEmail
      );

      return createToolResult(
        JSON.stringify(
          {
            count: items.length,
            tasks: items.map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.due?.toISOString(),
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Tasks - Create
  registry.registerHandler('google_tasks_create', async (args: Record<string, unknown>) => {
    const { title, notes, dueDate, taskListId, accountEmail } = args as {
      title: string;
      notes?: string;
      dueDate?: string;
      taskListId?: string;
      accountEmail?: string;
    };

    try {
      const { getTasksService } = await import('@orient/integrations/google');
      const tasks = getTasksService();
      const task = await tasks.createTask(
        {
          title,
          notes,
          due: dueDate ? new Date(dueDate) : undefined,
          taskListId: taskListId || '@default',
        },
        accountEmail
      );

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Task created: ${task.title}`,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.due?.toISOString(),
            },
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to create task: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Tasks - Complete
  registry.registerHandler('google_tasks_complete', async (args: Record<string, unknown>) => {
    const { taskId, taskListId, accountEmail } = args as {
      taskId: string;
      taskListId?: string;
      accountEmail?: string;
    };

    try {
      const { getTasksService } = await import('@orient/integrations/google');
      const tasks = getTasksService();
      const task = await tasks.completeTask(taskId, taskListId || '@default', accountEmail);

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Task completed: ${task.title}`,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
            },
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Tasks - Update
  registry.registerHandler('google_tasks_update', async (args: Record<string, unknown>) => {
    const { taskId, title, notes, dueDate, status, taskListId, accountEmail } = args as {
      taskId: string;
      title?: string;
      notes?: string;
      dueDate?: string;
      status?: 'needsAction' | 'completed';
      taskListId?: string;
      accountEmail?: string;
    };

    try {
      const { getTasksService } = await import('@orient/integrations/google');
      const tasks = getTasksService();
      const task = await tasks.updateTask(
        {
          taskId,
          title,
          notes,
          due: dueDate ? new Date(dueDate) : undefined,
          status,
          taskListId: taskListId || '@default',
        },
        accountEmail
      );

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Task updated: ${task.title}`,
            task: {
              id: task.id,
              title: task.title,
              notes: task.notes,
              dueDate: task.due?.toISOString(),
            },
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to update task: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Sheets - Read (OAuth)
  registry.registerHandler('google_sheets_read', async (args: Record<string, unknown>) => {
    const { spreadsheetIdOrUrl, range, accountEmail } = args as {
      spreadsheetIdOrUrl: string;
      range: string;
      accountEmail?: string;
    };

    try {
      const { getSheetsOAuthService } = await import('@orient/integrations/google');
      const sheets = getSheetsOAuthService();
      const values = await sheets.readRange(spreadsheetIdOrUrl, range, accountEmail);

      return createToolResult(
        JSON.stringify(
          {
            range,
            rowCount: values.length,
            values,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to read sheet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Sheets - Write (OAuth)
  registry.registerHandler('google_sheets_write', async (args: Record<string, unknown>) => {
    const { spreadsheetIdOrUrl, range, values, valueInputOption, accountEmail } = args as {
      spreadsheetIdOrUrl: string;
      range: string;
      values: unknown[][];
      valueInputOption?: 'USER_ENTERED' | 'RAW';
      accountEmail?: string;
    };

    try {
      const { getSheetsOAuthService } = await import('@orient/integrations/google');
      const sheets = getSheetsOAuthService();
      const updatedCells = await sheets.writeRange(
        spreadsheetIdOrUrl,
        { range, values, valueInputOption },
        accountEmail
      );

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Updated ${updatedCells} cells`,
            range,
            updatedCells,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to write sheet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Slides - Get (OAuth)
  registry.registerHandler('google_slides_get', async (args: Record<string, unknown>) => {
    const { presentationIdOrUrl, accountEmail } = args as {
      presentationIdOrUrl: string;
      accountEmail?: string;
    };

    try {
      const { getSlidesOAuthService, parsePresentationId } =
        await import('@orient/integrations/google');
      const slides = getSlidesOAuthService();
      const presentationId = parsePresentationId(presentationIdOrUrl);
      const presentation = await slides.getPresentation(presentationId, accountEmail);

      return createToolResult(
        JSON.stringify(
          {
            id: presentation.presentationId,
            title: presentation.title,
            url: presentation.url,
            slideCount: presentation.slides.length,
            slides: presentation.slides,
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get presentation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Google Slides - Update (OAuth)
  registry.registerHandler('google_slides_update', async (args: Record<string, unknown>) => {
    const { presentationIdOrUrl, replacements, accountEmail } = args as {
      presentationIdOrUrl: string;
      replacements: Array<{ placeholder: string; replacement: string }>;
      accountEmail?: string;
    };

    try {
      const { getSlidesOAuthService, parsePresentationId } =
        await import('@orient/integrations/google');
      const slides = getSlidesOAuthService();
      const presentationId = parsePresentationId(presentationIdOrUrl);

      await slides.replaceText(presentationId, replacements, accountEmail);

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Applied ${replacements.length} text replacements`,
            slideId: 'all slides',
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to update presentation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  logger.info('Google tool handlers registered synchronously', {
    tools: [
      'google_oauth_status',
      'google_oauth_connect',
      'google_oauth_list_accounts',
      'google_oauth_disconnect',
      'google_gmail_list_messages',
      'google_gmail_get_message',
      'google_gmail_send',
      'google_gmail_create_draft',
      'google_calendar_list_events',
      'google_calendar_create_event',
      'google_calendar_update_event',
      'google_calendar_delete_event',
      'google_tasks_list',
      'google_tasks_create',
      'google_tasks_complete',
      'google_tasks_update',
      'google_sheets_read',
      'google_sheets_write',
      'google_slides_get',
      'google_slides_update',
    ],
  });
}

/**
 * Registers system tool handlers
 */
function registerSystemToolHandlers(registry: ToolExecutorRegistry): void {
  const systemLogger = createServiceLogger('system-tools');

  registry.registerHandler('system_health_check', async () => {
    const op = systemLogger.startOperation('healthCheck');

    try {
      const { testConnection, getIssueCount } = await import('@orient/integrations/jira');
      const config = getRawConfig() as {
        jira?: { host?: string; projectKey?: string; component?: string };
        sla?: unknown;
      };

      const jiraConnected = await testConnection();
      const issueCount = jiraConnected ? await getIssueCount() : 0;

      op.success('Health check completed', { jiraConnected, issueCount });

      return createToolResult(
        JSON.stringify(
          {
            status: 'ok',
            jira: {
              connected: jiraConnected,
              host: config.jira?.host,
              project: config.jira?.projectKey,
              component: config.jira?.component,
              issueCount,
            },
            sla: config.sla,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('system_get_config', async () => {
    const op = systemLogger.startOperation('getConfig');

    try {
      const config = getRawConfig() as {
        jira?: { host?: string; projectKey?: string; component?: string };
        slack?: { channels?: unknown };
        cron?: unknown;
        sla?: unknown;
        timezone?: string;
        googleSlides?: unknown;
      };

      op.success('Config retrieved');

      return createToolResult(
        JSON.stringify(
          {
            jira: {
              host: config.jira?.host,
              projectKey: config.jira?.projectKey,
              component: config.jira?.component,
            },
            slack: {
              channels: config.slack?.channels,
            },
            cron: config.cron,
            sla: config.sla,
            timezone: config.timezone,
            googleSlides: config.googleSlides,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to get config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Registers Jira tool handlers
 */
function registerJiraToolHandlers(registry: ToolExecutorRegistry): void {
  const jiraLogger = createServiceLogger('jira-tools');

  registry.registerHandler('jira_get_all_issues', async (args: Record<string, unknown>) => {
    const { limit } = args as { limit?: number };

    try {
      const { getAllIssues } = await import('@orient/integrations/jira');
      const issues = await getAllIssues();
      const limitedIssues = issues.slice(0, limit || 50);

      return createToolResult(
        JSON.stringify(
          {
            total: issues.length,
            returned: limitedIssues.length,
            issues: limitedIssues.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              status: issue.status,
              statusCategory: issue.statusCategory,
              assignee: issue.assignee?.displayName || 'Unassigned',
              priority: issue.priority,
              storyPoints: issue.storyPoints,
              updated: issue.updated,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get issues: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_issue', async (args: Record<string, unknown>) => {
    const { issueKey } = args as { issueKey: string };

    try {
      const { getIssueByKey } = await import('@orient/integrations/jira');
      const issue = await getIssueByKey(issueKey);

      if (!issue) {
        return createToolError(`Issue ${issueKey} not found`);
      }

      return createToolResult(JSON.stringify(issue, null, 2));
    } catch (error) {
      return createToolError(
        `Failed to get issue: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_in_progress', async () => {
    try {
      const { getInProgressIssues } = await import('@orient/integrations/jira');
      const issues = await getInProgressIssues();

      return createToolResult(
        JSON.stringify(
          {
            count: issues.length,
            issues: issues.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              status: issue.status,
              assignee: issue.assignee?.displayName || 'Unassigned',
              updated: issue.updated,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get in-progress issues: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_board_issues', async () => {
    try {
      const { getBoardIssues } = await import('@orient/integrations/jira');
      const issues = await getBoardIssues();

      return createToolResult(
        JSON.stringify(
          {
            count: issues.length,
            description: 'Issues on the board (excluding backlog)',
            issues: issues.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              status: issue.status,
              statusCategory: issue.statusCategory,
              assignee: issue.assignee?.displayName || 'Unassigned',
              priority: issue.priority,
              storyPoints: issue.storyPoints,
              updated: issue.updated,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get board issues: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_blockers', async () => {
    try {
      const { getBlockerIssues } = await import('@orient/integrations/jira');
      const issues = await getBlockerIssues();

      return createToolResult(
        JSON.stringify(
          {
            count: issues.length,
            issues: issues.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              status: issue.status,
              priority: issue.priority,
              assignee: issue.assignee?.displayName || 'Unassigned',
              labels: issue.labels,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get blockers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_check_sla_breaches', async () => {
    try {
      const { checkSLABreaches } = await import('@orient/integrations/jira');
      const breaches = await checkSLABreaches();

      return createToolResult(
        JSON.stringify(
          {
            count: breaches.length,
            breaches: breaches.map((breach) => ({
              key: breach.issue.key,
              summary: breach.issue.summary,
              status: breach.status,
              daysInStatus: breach.daysInStatus,
              maxAllowedDays: breach.maxAllowedDays,
              assignee: breach.issue.assignee?.displayName || 'Unassigned',
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to check SLA breaches: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_sprint_issues', async () => {
    try {
      const { getActiveSprintIssues } = await import('@orient/integrations/jira');
      const issues = await getActiveSprintIssues();

      return createToolResult(
        JSON.stringify(
          {
            count: issues.length,
            totalPoints: issues.reduce((sum, issue) => sum + (issue.storyPoints || 0), 0),
            issues: issues.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              status: issue.status,
              statusCategory: issue.statusCategory,
              assignee: issue.assignee?.displayName || 'Unassigned',
              storyPoints: issue.storyPoints,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get sprint issues: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_completed_this_week', async () => {
    try {
      const { getCompletedThisWeek } = await import('@orient/integrations/jira');
      const issues = await getCompletedThisWeek();

      return createToolResult(
        JSON.stringify(
          {
            count: issues.length,
            velocityPoints: issues.reduce((sum, issue) => sum + (issue.storyPoints || 0), 0),
            issues: issues.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              assignee: issue.assignee?.displayName || 'Unassigned',
              storyPoints: issue.storyPoints,
              updated: issue.updated,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get completed issues: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_created_this_week', async () => {
    try {
      const { getCreatedThisWeek } = await import('@orient/integrations/jira');
      const issues = await getCreatedThisWeek();

      return createToolResult(
        JSON.stringify(
          {
            count: issues.length,
            issues: issues.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              status: issue.status,
              priority: issue.priority,
              assignee: issue.assignee?.displayName || 'Unassigned',
              created: issue.created,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get created issues: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_daily_digest', async () => {
    try {
      const { getInProgressIssues, getBlockerIssues } = await import('@orient/integrations/jira');
      const [inProgress, blockers] = await Promise.all([getInProgressIssues(), getBlockerIssues()]);

      return createToolResult(
        JSON.stringify(
          {
            date: new Date().toISOString().split('T')[0],
            inProgressToday: inProgress.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              assignee: issue.assignee?.displayName || 'Unassigned',
            })),
            blockers: blockers.map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              assignee: issue.assignee?.displayName || 'Unassigned',
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get daily digest: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_weekly_summary', async () => {
    try {
      const { getCompletedThisWeek, getCreatedThisWeek, checkSLABreaches, getActiveSprintIssues } =
        await import('@orient/integrations/jira');

      const [completed, created, breaches, sprintIssues] = await Promise.all([
        getCompletedThisWeek(),
        getCreatedThisWeek(),
        checkSLABreaches(),
        getActiveSprintIssues(),
      ]);

      const velocityPoints = completed.reduce((sum, issue) => sum + (issue.storyPoints || 0), 0);

      return createToolResult(
        JSON.stringify(
          {
            weekEnding: new Date().toISOString().split('T')[0],
            summary: {
              completedCount: completed.length,
              velocityPoints,
              addedCount: created.length,
              agingCount: breaches.length,
              sprintIssuesCount: sprintIssues.length,
            },
            completed: completed.slice(0, 10).map((issue) => ({
              key: issue.key,
              summary: issue.summary,
              points: issue.storyPoints,
            })),
            aging: breaches.slice(0, 5).map((breach) => ({
              key: breach.issue.key,
              summary: breach.issue.summary,
              status: breach.status,
              daysInStatus: breach.daysInStatus,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      return createToolError(
        `Failed to get weekly summary: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_create_issue_link', async (args: Record<string, unknown>) => {
    const {
      inwardIssueKey,
      outwardIssueKey,
      linkType = 'Blocks',
      comment,
    } = args as {
      inwardIssueKey: string;
      outwardIssueKey: string;
      linkType?: string;
      comment?: string;
    };
    const op = jiraLogger.startOperation('createIssueLink');

    try {
      const { getJiraClient } = await import('@orient/integrations/jira');
      const jiraClient = getJiraClient();
      const linkPayload: Record<string, unknown> = {
        type: { name: linkType },
        inwardIssue: { key: inwardIssueKey },
        outwardIssue: { key: outwardIssueKey },
      };

      if (comment) {
        linkPayload.comment = {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: comment }],
              },
            ],
          },
        };
      }

      await jiraClient.issueLinks.linkIssues(linkPayload as never);

      op.success('Issue link created', { inwardIssueKey, outwardIssueKey, linkType });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Issue link created: ${inwardIssueKey} ${linkType} ${outwardIssueKey}`,
            link: {
              inwardIssue: inwardIssueKey,
              outwardIssue: outwardIssueKey,
              type: linkType,
            },
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to create issue link: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_get_issue_links', async (args: Record<string, unknown>) => {
    const { issueKey } = args as { issueKey: string };
    const op = jiraLogger.startOperation('getIssueLinks');

    try {
      const { getJiraClient } = await import('@orient/integrations/jira');
      const jiraClient = getJiraClient();
      const issue = await jiraClient.issues.getIssue({
        issueIdOrKey: issueKey,
        fields: ['issuelinks'],
      });

      const links = (issue.fields as { issuelinks?: unknown[] }).issuelinks || [];

      op.success('Issue links retrieved', { issueKey, linkCount: links.length });

      return createToolResult(
        JSON.stringify(
          {
            issueKey,
            linkCount: links.length,
            links,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to get issue links: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('jira_delete_issue_link', async (args: Record<string, unknown>) => {
    const { linkId } = args as { linkId: string };
    const op = jiraLogger.startOperation('deleteIssueLink');

    try {
      const { getJiraClient } = await import('@orient/integrations/jira');
      const jiraClient = getJiraClient();
      await jiraClient.issueLinks.deleteIssueLink({ linkId });

      op.success('Issue link deleted', { linkId });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `Issue link ${linkId} deleted successfully`,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to delete issue link: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Registers Slack tool handlers
 */
function registerSlackToolHandlers(registry: ToolExecutorRegistry): void {
  const slackLogger = createServiceLogger('slack-tools');
  let slackClient: WebClient | null = null;

  function getSlackClient(): WebClient {
    if (!slackClient) {
      const config = getRawConfig() as { slack?: { botToken?: string } };
      const token = process.env.SLACK_BOT_TOKEN || config.slack?.botToken;
      if (!token) {
        throw new Error('Slack bot token not configured (SLACK_BOT_TOKEN)');
      }
      slackClient = new WebClient(token);
    }
    return slackClient;
  }

  registry.registerHandler('slack_lookup_user_by_email', async (args: Record<string, unknown>) => {
    const { email } = args as { email: string };
    const op = slackLogger.startOperation('lookupUserByEmail');

    try {
      const client = getSlackClient();
      const result = await client.users.lookupByEmail({ email });

      if (!result.ok || !result.user) {
        throw new Error(`User not found for email: ${email}`);
      }

      const user = result.user;
      op.success('User found', { email, userId: user.id });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            user: {
              id: user.id,
              name: user.name,
              realName: user.real_name,
              displayName: user.profile?.display_name,
              email: user.profile?.email,
              isAdmin: user.is_admin,
              isBot: user.is_bot,
              timezone: user.tz,
            },
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { email });
      return createToolError(
        `Failed to lookup user: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('slack_send_dm', async (args: Record<string, unknown>) => {
    const { userIdOrEmail, message, ccUsers } = args as {
      userIdOrEmail: string;
      message: string;
      ccUsers?: string[];
    };
    const op = slackLogger.startOperation('sendDM');

    const client = getSlackClient();

    const resolveUserId = async (idOrEmail: string): Promise<string> => {
      if (idOrEmail.includes('@')) {
        slackLogger.debug('Looking up user by email', { email: idOrEmail });
        const lookupResult = await client.users.lookupByEmail({ email: idOrEmail });
        if (!lookupResult.ok || !lookupResult.user?.id) {
          throw new Error(`User not found for email: ${idOrEmail}`);
        }
        slackLogger.debug('Found user', { email: idOrEmail, userId: lookupResult.user.id });
        return lookupResult.user.id;
      }
      return idOrEmail;
    };

    try {
      const primaryUserId = await resolveUserId(userIdOrEmail);
      const allUserIds: string[] = [primaryUserId];

      if (ccUsers && ccUsers.length > 0) {
        for (const ccUser of ccUsers) {
          const ccUserId = await resolveUserId(ccUser);
          if (!allUserIds.includes(ccUserId)) {
            allUserIds.push(ccUserId);
          }
        }
      }

      const conversationResult = await client.conversations.open({
        users: allUserIds.join(','),
      });
      if (!conversationResult.ok || !conversationResult.channel?.id) {
        throw new Error('Failed to open DM conversation');
      }

      const channelId = conversationResult.channel.id;
      const isGroupDM = allUserIds.length > 1;

      const sendResult = await client.chat.postMessage({
        channel: channelId,
        text: message,
      });

      if (!sendResult.ok) {
        throw new Error('Failed to send message');
      }

      op.success('DM sent successfully', {
        primaryUserId,
        allUserIds,
        channelId,
        isGroupDM,
        ts: sendResult.ts,
      });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: isGroupDM ? 'Group DM sent successfully' : 'Direct message sent successfully',
            details: {
              primaryUserId,
              ccUsers: allUserIds.slice(1),
              channelId,
              isGroupDM,
              timestamp: sendResult.ts,
            },
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { userIdOrEmail });
      return createToolError(
        `Failed to send DM: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('slack_send_channel_message', async (args: Record<string, unknown>) => {
    const { channel, message } = args as { channel: string; message: string };
    const op = slackLogger.startOperation('sendChannelMessage');

    try {
      const client = getSlackClient();
      const sendResult = await client.chat.postMessage({
        channel,
        text: message,
      });

      if (!sendResult.ok) {
        throw new Error('Failed to send message');
      }

      op.success('Channel message sent', { channel, ts: sendResult.ts });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: 'Message sent to channel successfully',
            details: {
              channel,
              timestamp: sendResult.ts,
            },
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { channel });
      return createToolError(
        `Failed to send channel message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('slack_get_channel_messages', async (args: Record<string, unknown>) => {
    const { channel, limit, oldest, latest, includeReplies } = args as {
      channel: string;
      limit?: number;
      oldest?: string;
      latest?: string;
      includeReplies?: boolean;
    };
    const op = slackLogger.startOperation('getChannelMessages');

    try {
      const client = getSlackClient();
      let channelId = channel;
      const channelName = channel.replace(/^#/, '');

      if (!channel.startsWith('C') && !channel.startsWith('G')) {
        slackLogger.debug('Looking up channel by name', { channelName });
        let cursor: string | undefined;
        let foundChannel = false;

        do {
          const listResult = await client.conversations.list({
            types: 'public_channel,private_channel',
            limit: 200,
            cursor,
          });

          if (listResult.channels) {
            const matchedChannel = listResult.channels.find(
              (ch) => ch.name === channelName || ch.name === channel
            );
            if (matchedChannel && matchedChannel.id) {
              channelId = matchedChannel.id;
              foundChannel = true;
              slackLogger.debug('Found channel', { channelName, channelId });
              break;
            }
          }

          cursor = listResult.response_metadata?.next_cursor;
        } while (cursor);

        if (!foundChannel) {
          throw new Error(
            `Channel not found: ${channel}. Make sure the bot is a member of this channel.`
          );
        }
      }

      const oldestTs = oldest ? (new Date(oldest).getTime() / 1000).toString() : undefined;
      const latestTs = latest ? (new Date(latest).getTime() / 1000).toString() : undefined;

      const historyResult = await client.conversations.history({
        channel: channelId,
        limit: Math.min(limit || 100, 1000),
        oldest: oldestTs,
        latest: latestTs,
        inclusive: true,
      });

      if (!historyResult.ok) {
        throw new Error('Failed to fetch channel history');
      }

      const messages = (historyResult.messages || []).map((msg) => ({
        text: msg.text,
        user: msg.user,
        timestamp: msg.ts,
        datetime: msg.ts ? new Date(parseFloat(msg.ts) * 1000).toISOString() : undefined,
        threadTs: msg.thread_ts,
        replyCount: msg.reply_count,
        reactions: msg.reactions?.map((r) => ({
          name: r.name,
          count: r.count,
        })),
        subtype: msg.subtype,
      }));

      if (includeReplies) {
        for (const msg of messages) {
          if (msg.threadTs && msg.replyCount && msg.replyCount > 0) {
            try {
              const repliesResult = await client.conversations.replies({
                channel: channelId,
                ts: msg.threadTs,
              });

              if (repliesResult.ok && repliesResult.messages) {
                (msg as Record<string, unknown>).replies = repliesResult.messages
                  .slice(1)
                  .map((reply) => ({
                    text: reply.text,
                    user: reply.user,
                    timestamp: reply.ts,
                    datetime: reply.ts
                      ? new Date(parseFloat(reply.ts) * 1000).toISOString()
                      : undefined,
                  }));
              }
            } catch (replyError) {
              slackLogger.debug('Failed to fetch replies for thread', {
                threadTs: msg.threadTs,
                error: replyError,
              });
            }
          }
        }
      }

      op.success('Channel messages retrieved', {
        channel,
        channelId,
        messageCount: messages.length,
        hasMore: historyResult.has_more,
      });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            channel: channelName,
            channelId,
            messageCount: messages.length,
            hasMore: historyResult.has_more,
            messages,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { channel });
      return createToolError(
        `Failed to get channel messages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Registers WhatsApp tool handlers
 */
function registerWhatsAppToolHandlers(registry: ToolExecutorRegistry): void {
  const whatsappLogger = createServiceLogger('whatsapp-tools');
  let messageDb: MessageDatabase | null = null;
  let messageDbInitialized = false;

  async function getMessageDatabase(): Promise<MessageDatabase> {
    if (!messageDb) {
      const op = whatsappLogger.startOperation('initialize');
      const dbUrl =
        process.env.DATABASE_URL || 'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

      whatsappLogger.debug('Initializing message database', {
        dbUrl: dbUrl.replace(/:[^:@]+@/, ':****@'),
      });
      messageDb = createMessageDatabase(dbUrl);
      op.success('Message database pool created');
    }

    if (!messageDbInitialized) {
      await messageDb.initialize();
      messageDbInitialized = true;
      whatsappLogger.info('Message database initialized');
    }

    return messageDb;
  }

  registry.registerHandler('whatsapp_search_messages', async (args: Record<string, unknown>) => {
    const {
      text,
      phone,
      direction,
      isGroup,
      fromDate,
      toDate,
      limit = 50,
    } = args as {
      text?: string;
      phone?: string;
      direction?: 'incoming' | 'outgoing';
      isGroup?: boolean;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    };
    const op = whatsappLogger.startOperation('searchMessages');

    try {
      const db = await getMessageDatabase();
      const searchOptions: MessageSearchOptions = {
        text,
        phone,
        direction,
        isGroup,
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        limit,
      };

      const messages = await db.searchMessages(searchOptions);
      op.success('Search completed', { resultCount: messages.length });

      return createToolResult(
        JSON.stringify(
          {
            count: messages.length,
            messages: messages.map((message) => ({
              id: message.id,
              direction: message.direction,
              phone: message.phone,
              text: message.text,
              isGroup: message.is_group,
              groupId: message.group_id,
              timestamp: message.timestamp,
              mediaType: message.media_type,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Search failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_get_recent', async (args: Record<string, unknown>) => {
    const { limit = 50 } = args as { limit?: number };
    const op = whatsappLogger.startOperation('getRecentMessages');

    try {
      const db = await getMessageDatabase();
      const messages = await db.getRecentMessages(limit);
      op.success('Retrieved recent messages', { count: messages.length });

      return createToolResult(
        JSON.stringify(
          {
            count: messages.length,
            messages: messages.map((message) => ({
              id: message.id,
              direction: message.direction,
              phone: message.phone,
              text: message.text,
              isGroup: message.is_group,
              groupId: message.group_id,
              timestamp: message.timestamp,
              mediaType: message.media_type,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to get recent messages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_get_conversation', async (args: Record<string, unknown>) => {
    const { phone, limit = 100 } = args as { phone: string; limit?: number };
    const op = whatsappLogger.startOperation('getConversation');

    try {
      const db = await getMessageDatabase();
      const messages = await db.getConversationHistory(phone, limit);
      op.success('Retrieved conversation', { phone, count: messages.length });

      return createToolResult(
        JSON.stringify(
          {
            phone,
            count: messages.length,
            messages: messages.map((message) => ({
              id: message.id,
              direction: message.direction,
              text: message.text,
              timestamp: message.timestamp,
              mediaType: message.media_type,
              transcribedText: message.transcribed_text,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { phone });
      return createToolError(
        `Failed to get conversation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_get_group_messages', async (args: Record<string, unknown>) => {
    const { groupId, limit = 100 } = args as { groupId: string; limit?: number };
    const op = whatsappLogger.startOperation('getGroupMessages');

    try {
      const db = await getMessageDatabase();
      let actualGroupId = groupId;

      if (!groupId.includes('@')) {
        const group = await db.findGroupByName(groupId);
        if (group) {
          actualGroupId = group.group_id;
          whatsappLogger.debug('Resolved group name to ID', {
            name: groupId,
            id: actualGroupId,
          });
        }
      }

      const messages = await db.getMessagesByGroup(actualGroupId, limit);
      const groupInfo = await db.getGroup(actualGroupId);

      op.success('Retrieved group messages', { groupId: actualGroupId, count: messages.length });

      return createToolResult(
        JSON.stringify(
          {
            groupId: actualGroupId,
            groupName: groupInfo?.group_name || null,
            groupSubject: groupInfo?.group_subject || null,
            count: messages.length,
            messages: messages.map((message) => ({
              id: message.id,
              direction: message.direction,
              phone: message.phone,
              text: message.text,
              timestamp: message.timestamp,
              mediaType: message.media_type,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error), { groupId });
      return createToolError(
        `Failed to get group messages: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_get_stats', async () => {
    const op = whatsappLogger.startOperation('getStats');

    try {
      const db = await getMessageDatabase();
      const stats = await db.getStats();
      const mediaStats = await db.getMediaStats();

      op.success('Retrieved stats', { totalMessages: stats.totalMessages });

      return createToolResult(
        JSON.stringify(
          {
            ...stats,
            media: mediaStats,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_list_contacts', async () => {
    const op = whatsappLogger.startOperation('listContacts');

    try {
      const db = await getMessageDatabase();
      const contacts = await db.getUniqueContacts();

      op.success('Retrieved contacts', { count: contacts.length });

      return createToolResult(
        JSON.stringify(
          {
            count: contacts.length,
            contacts,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to list contacts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_list_groups', async (args: Record<string, unknown>) => {
    const { search } = args as { search?: string };
    const op = whatsappLogger.startOperation('listGroups');

    try {
      const db = await getMessageDatabase();
      let groups: StoredGroup[];

      if (search) {
        groups = await db.searchGroups(search);
      } else {
        groups = await db.getAllGroups();
      }

      const groupIdsWithoutNames = await db.getGroupsWithoutNames();

      op.success('Retrieved groups', {
        namedGroups: groups.length,
        unnamedGroups: groupIdsWithoutNames.length,
      });

      return createToolResult(
        JSON.stringify(
          {
            namedGroupsCount: groups.length,
            unnamedGroupsCount: groupIdsWithoutNames.length,
            groups: groups.map((group) => ({
              groupId: group.group_id,
              name: group.group_name,
              subject: group.group_subject,
              participantCount: group.participant_count,
              lastUpdated: group.last_updated,
            })),
            groupsWithoutNames: groupIdsWithoutNames,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to list groups: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_get_media', async (args: Record<string, unknown>) => {
    const {
      mediaType,
      groupId,
      limit = 50,
    } = args as {
      mediaType?: 'image' | 'audio' | 'video' | 'document';
      groupId?: string;
      limit?: number;
    };
    const op = whatsappLogger.startOperation('getMedia');

    try {
      const db = await getMessageDatabase();
      let messages: StoredMessage[];

      if (groupId) {
        messages = await db.getMediaMessagesByGroup(groupId, limit, mediaType);
      } else {
        messages = await db.getMediaMessages(limit, mediaType);
      }

      op.success('Retrieved media messages', {
        count: messages.length,
        mediaType: mediaType || 'all',
      });

      return createToolResult(
        JSON.stringify(
          {
            count: messages.length,
            mediaType: mediaType || 'all',
            messages: messages.map((message) => ({
              id: message.id,
              direction: message.direction,
              phone: message.phone,
              text: message.text,
              isGroup: message.is_group,
              groupId: message.group_id,
              timestamp: message.timestamp,
              mediaType: message.media_type,
              mediaPath: message.media_path,
              mediaMimeType: message.media_mime_type,
              transcribedText: message.transcribed_text,
              transcribedLanguage: message.transcribed_language,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to get media: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_send_poll', async (args: Record<string, unknown>) => {
    const {
      question,
      options,
      selectableCount = 1,
      context,
    } = args as {
      question: string;
      options: string[];
      selectableCount?: number;
      context?: string;
    };
    const op = whatsappLogger.startOperation('sendPoll');

    try {
      const response = await fetch('http://127.0.0.1:4097/send-poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, options, selectableCount, context }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        pollId?: string;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send poll');
      }

      op.success('Poll sent', { pollId: result.pollId, optionCount: options.length });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            pollId: result.pollId,
            question,
            options,
            message: 'Poll sent successfully! The user will see it in their WhatsApp chat.',
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to send poll: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('whatsapp_send_message', async (args: Record<string, unknown>) => {
    const { message } = args as { message: string };
    const op = whatsappLogger.startOperation('sendMessage');

    try {
      const response = await fetch('http://127.0.0.1:4097/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const result = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send message');
      }

      op.success('Message sent', { length: message.length });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: 'Message sent successfully!',
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Registers Slides tool handlers
 */
function registerSlidesToolHandlers(registry: ToolExecutorRegistry): void {
  const slidesLogger = createServiceLogger('slides-tools');
  type SlidesServiceConfig = {
    presentationId?: string;
    credentialsPath: string;
    templateSlides?: { weeklyUpdate?: string };
  };
  type SlidesDeps = {
    createSlidesService: (config: SlidesServiceConfig) => SlidesService;
    parsePresentationId: (urlOrId: string) => string;
    parseSlideUrl: (url: string) => { presentationId: string; slideId?: string };
  };
  let slidesService: SlidesService | null = null;
  let slidesDepsLoaded = false;
  let slidesDeps: SlidesDeps | null = null;

  async function loadSlidesDeps() {
    if (!slidesDepsLoaded) {
      slidesDeps = await import('@orient/integrations/google');
      slidesDepsLoaded = true;
    }
    if (!slidesDeps) {
      throw new Error('Failed to load Google Slides dependencies');
    }
    return slidesDeps;
  }

  function getSlidesService(createSlidesService: SlidesDeps['createSlidesService']): SlidesService {
    if (!slidesService) {
      const op = slidesLogger.startOperation('initialize');
      const config = getRawConfig() as {
        googleSlides?: {
          presentationId?: string;
          credentialsPath?: string;
          templateSlides?: { weeklyUpdate?: string };
        };
      };

      if (!config.googleSlides?.credentialsPath) {
        op.failure('Google Slides not configured');
        throw new Error(
          'Google Slides not configured. Add googleSlides section to .mcp.config.local.json with at least a credentialsPath'
        );
      }

      const projectRoot = process.env.PROJECT_ROOT || process.cwd();
      const credentialsPath = path.resolve(projectRoot, config.googleSlides.credentialsPath);

      slidesLogger.debug('Initializing slides service', {
        defaultPresentationId: config.googleSlides.presentationId || '(none)',
        credentialsPath,
      });

      slidesService = createSlidesService({
        presentationId: config.googleSlides.presentationId,
        credentialsPath,
        templateSlides: config.googleSlides.templateSlides,
      });

      op.success('Slides service initialized', {
        defaultPresentationId:
          config.googleSlides.presentationId || '(none - will use per-operation)',
      });
    }
    return slidesService;
  }

  const getCompletedThisWeek = async () => {
    const { getCompletedThisWeek: fetchCompleted } = await import('@orient/integrations/jira');
    return fetchCompleted();
  };

  const getInProgressIssues = async () => {
    const { getInProgressIssues: fetchInProgress } = await import('@orient/integrations/jira');
    return fetchInProgress();
  };

  const getBlockerIssues = async () => {
    const { getBlockerIssues: fetchBlockers } = await import('@orient/integrations/jira');
    return fetchBlockers();
  };

  const buildSlidesHandler =
    (toolName: string) =>
    async (args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const deps = await loadSlidesDeps();
      const resolvePresentationId = (resolveArgs: {
        presentationUrl?: string;
        presentationId?: string;
      }): string | undefined => {
        if (resolveArgs.presentationUrl) {
          return deps.parsePresentationId(resolveArgs.presentationUrl);
        }
        if (resolveArgs.presentationId) {
          return resolveArgs.presentationId;
        }
        return undefined;
      };

      return handleGoogleSlidesToolCall(toolName, args, {
        getSlidesService: () => getSlidesService(deps.createSlidesService),
        resolvePresentationId,
        parseSlideUrl: deps.parseSlideUrl,
        getCompletedThisWeek,
        getInProgressIssues,
        getBlockerIssues,
      });
    };

  registry.registerHandler(
    'slides_get_presentation',
    buildSlidesHandler('slides_get_presentation')
  );
  registry.registerHandler('slides_get_slide', buildSlidesHandler('slides_get_slide'));
  registry.registerHandler('slides_update_text', buildSlidesHandler('slides_update_text'));
  registry.registerHandler(
    'slides_update_slide_text',
    buildSlidesHandler('slides_update_slide_text')
  );
  registry.registerHandler(
    'slides_duplicate_template',
    buildSlidesHandler('slides_duplicate_template')
  );
  registry.registerHandler('slides_update_weekly', buildSlidesHandler('slides_update_weekly'));
  registry.registerHandler('slides_delete_slide', buildSlidesHandler('slides_delete_slide'));
  registry.registerHandler('slides_create_table', buildSlidesHandler('slides_create_table'));
}

/**
 * Registers skill tool handlers
 */
function registerSkillToolHandlers(registry: ToolExecutorRegistry): void {
  const skillLogger = createServiceLogger('skill-tools');
  let skillsService: SkillsService | null = null;
  let githubService: GitHubService | null = null;
  let worktreeService: GitWorktreeService | null = null;

  async function getSkillsService(): Promise<SkillsService> {
    if (!skillsService) {
      const projectRoot = process.env.PROJECT_ROOT || process.cwd();
      skillsService = await createSkillsService(projectRoot);
      skillLogger.info('Skills service initialized', { skillCount: skillsService.skillCount });
    }
    return skillsService;
  }

  function getGitHubService(): GitHubService | null {
    if (!githubService) {
      githubService = createGitHubServiceFromEnv();
    }
    return githubService;
  }

  function getWorktreeService(): GitWorktreeService | null {
    if (!worktreeService) {
      const repoPath = process.env.PROJECT_ROOT || process.cwd();
      const worktreeBase = process.env.SKILL_WORKTREE_BASE;

      if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
        skillLogger.warn('Worktree service not configured (missing GITHUB_TOKEN or GITHUB_REPO)');
        return null;
      }

      worktreeService = createGitWorktreeService({
        repoPath,
        worktreeBase,
      });
    }
    return worktreeService;
  }

  function getSkillAdminPhones(): string[] {
    const adminPhones = process.env.SKILL_ADMIN_PHONES || '';
    return adminPhones
      .split(',')
      .map((phone) => phone.trim())
      .filter(Boolean);
  }

  function getSkillAdminSlackIds(): string[] {
    const adminIds = process.env.SKILL_ADMIN_SLACK_IDS || '';
    return adminIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  function isSkillEditingAdmin(identifier: string, type: 'phone' | 'slack' = 'phone'): boolean {
    if (type === 'slack') {
      const adminSlackIds = getSkillAdminSlackIds();
      if (adminSlackIds.length === 0) {
        skillLogger.warn('No skill admin Slack IDs configured (SKILL_ADMIN_SLACK_IDS)');
        return false;
      }
      return adminSlackIds.includes(identifier);
    }

    const adminPhones = getSkillAdminPhones();
    if (adminPhones.length === 0) {
      skillLogger.warn('No skill admin phones configured (SKILL_ADMIN_PHONES)');
      return false;
    }

    const normalizedPhone = identifier.replace(/^\+/, '');
    return adminPhones.some((admin) => {
      const normalizedAdmin = admin.replace(/^\+/, '');
      return normalizedPhone === normalizedAdmin || normalizedPhone.endsWith(normalizedAdmin);
    });
  }

  interface SkillSpec {
    name: string;
    description: string;
    content: string;
    isEdit: boolean;
  }

  interface SkillNotificationConfig {
    platform: 'whatsapp' | 'slack';
    userJid?: string;
    channelId?: string;
  }

  interface SkillCreationResult {
    prNumber: number;
    prUrl: string;
  }

  async function executeSkillCreationAsync(
    skillSpec: SkillSpec,
    notificationConfig: SkillNotificationConfig
  ): Promise<SkillCreationResult> {
    const op = skillLogger.startOperation('executeSkillCreationAsync', {
      skillName: skillSpec.name,
      isEdit: skillSpec.isEdit,
      platform: notificationConfig.platform,
    });

    try {
      const skills = await getSkillsService();
      const github = getGitHubService();
      const worktree = getWorktreeService();

      if (!github || !worktree) {
        throw new Error('Skill editing services not configured (GitHub or Worktree)');
      }

      const fullContent = skills.generateSkillTemplate(
        skillSpec.name,
        skillSpec.description,
        skillSpec.content
      );

      const validation = skills.validateSkillContent(fullContent);
      if (!validation.valid) {
        throw new Error(`Skill validation failed:\n• ${validation.errors.join('\n• ')}`);
      }

      skillLogger.info('Creating worktree for skill', { skillName: skillSpec.name });
      const worktreeInfo = await worktree.createWorktree(skillSpec.name);

      try {
        await worktree.writeSkillFile(worktreeInfo.worktreePath, skillSpec.name, fullContent);

        const action = skillSpec.isEdit ? 'Update' : 'Add';
        const commitMessage = `${action} skill: ${skillSpec.name}`;
        await worktree.commitAndPush(
          worktreeInfo.worktreePath,
          worktreeInfo.branchName,
          commitMessage
        );

        const prTitle = `${action} skill: ${skillSpec.name}`;
        const prBody = github.generateSkillPRDescription(
          skillSpec.name,
          skillSpec.description,
          skillSpec.isEdit
        );
        const pr = await github.createPullRequest(worktreeInfo.branchName, prTitle, prBody);

        const result = { prNumber: pr.number, prUrl: pr.url };

        op.success('Skill PR created', { ...result, skillName: skillSpec.name });
        return result;
      } finally {
        await worktreeInfo.cleanup();
      }
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  registry.registerHandler('skills_list', async () => {
    const op = skillLogger.startOperation('listSkills');

    try {
      const skills = await getSkillsService();
      const skillList = skills.listSkills();

      op.success('Skills listed', { count: skillList.length });

      return createToolResult(
        JSON.stringify(
          {
            count: skillList.length,
            skills: skillList.map((skill) => ({
              name: skill.name,
              description: skill.description,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to list skills: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('skills_read', async (args: Record<string, unknown>) => {
    const { name: skillName } = args as { name: string };
    const op = skillLogger.startOperation('readSkill', { skillName });

    try {
      const skills = await getSkillsService();
      const skill = skills.readSkill(skillName);

      if (!skill) {
        op.failure(new Error(`Skill not found: ${skillName}`));
        return createToolError(
          `Skill "${skillName}" not found. Use skills_list to see available skills.`
        );
      }

      op.success('Skill read', { skillName, contentLength: skill.content.length });

      return createToolResult(
        JSON.stringify(
          {
            name: skill.name,
            description: skill.description,
            content: skill.content,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to read skill: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('skills_create_async', async (args: Record<string, unknown>) => {
    const {
      name: skillName,
      description,
      content,
      userPhone,
      slackUserId,
      userJid,
      platform = 'whatsapp',
      channelId,
    } = args as {
      name: string;
      description: string;
      content: string;
      userPhone?: string;
      slackUserId?: string;
      userJid?: string;
      platform?: 'whatsapp' | 'slack';
      channelId?: string;
    };

    const op = skillLogger.startOperation('createSkillAsync', { skillName });

    try {
      let isAdmin = false;
      if (slackUserId) {
        isAdmin = isSkillEditingAdmin(slackUserId, 'slack');
      } else if (userPhone) {
        isAdmin = isSkillEditingAdmin(userPhone, 'phone');
      }

      if ((userPhone || slackUserId) && !isAdmin) {
        op.failure(new Error('Permission denied'));
        return createToolError('Permission denied. Skill creation is restricted to admin users.');
      }

      const github = getGitHubService();
      const worktree = getWorktreeService();

      if (!github || !worktree) {
        op.failure(new Error('Skill editing services not configured'));
        return createToolError(
          'Skill editing is not configured. Missing GITHUB_TOKEN or GITHUB_REPO.'
        );
      }

      const skills = await getSkillsService();
      if (skills.hasSkill(skillName)) {
        op.failure(new Error('Skill already exists'));
        return createToolError(
          `Skill "${skillName}" already exists. Use skills_edit_async to modify it.`
        );
      }

      const skillSpec: SkillSpec = {
        name: skillName,
        description,
        content,
        isEdit: false,
      };

      const notificationConfig: SkillNotificationConfig = {
        platform: platform as 'whatsapp' | 'slack',
        userJid,
        channelId,
      };

      const result = await executeSkillCreationAsync(skillSpec, notificationConfig);

      op.success('Skill PR created', { skillName, prNumber: result?.prNumber });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `✅ Skill PR created for "${skillName}"`,
            prNumber: result?.prNumber,
            prUrl: result?.prUrl,
            skillName,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to start skill creation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('skills_edit_async', async (args: Record<string, unknown>) => {
    const {
      name: skillName,
      description,
      content,
      userPhone,
      slackUserId,
      userJid,
      platform = 'whatsapp',
      channelId,
    } = args as {
      name: string;
      description: string;
      content: string;
      userPhone?: string;
      slackUserId?: string;
      userJid?: string;
      platform?: 'whatsapp' | 'slack';
      channelId?: string;
    };

    const op = skillLogger.startOperation('editSkillAsync', { skillName });

    try {
      let isAdmin = false;
      if (slackUserId) {
        isAdmin = isSkillEditingAdmin(slackUserId, 'slack');
      } else if (userPhone) {
        isAdmin = isSkillEditingAdmin(userPhone, 'phone');
      }

      if ((userPhone || slackUserId) && !isAdmin) {
        op.failure(new Error('Permission denied'));
        return createToolError('Permission denied. Skill editing is restricted to admin users.');
      }

      const github = getGitHubService();
      const worktree = getWorktreeService();

      if (!github || !worktree) {
        op.failure(new Error('Skill editing services not configured'));
        return createToolError(
          'Skill editing is not configured. Missing GITHUB_TOKEN or GITHUB_REPO.'
        );
      }

      const skills = await getSkillsService();
      if (!skills.hasSkill(skillName)) {
        op.failure(new Error('Skill not found'));
        return createToolError(
          `Skill "${skillName}" does not exist. Use skills_create_async to create it.`
        );
      }

      const skillSpec: SkillSpec = {
        name: skillName,
        description,
        content,
        isEdit: true,
      };

      const notificationConfig: SkillNotificationConfig = {
        platform: platform as 'whatsapp' | 'slack',
        userJid,
        channelId,
      };

      const result = await executeSkillCreationAsync(skillSpec, notificationConfig);

      op.success('Skill PR created', { skillName, prNumber: result?.prNumber });

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: `✅ Skill PR created for "${skillName}"`,
            prNumber: result?.prNumber,
            prUrl: result?.prUrl,
            skillName,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to start skill edit: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('skills_list_prs', async () => {
    const op = skillLogger.startOperation('listSkillPRs');

    try {
      const github = getGitHubService();

      if (!github) {
        op.failure(new Error('GitHub service not configured'));
        return createToolError(
          'GitHub service is not configured. Missing GITHUB_TOKEN or GITHUB_REPO.'
        );
      }

      const prs = await github.listSkillPRs();

      op.success('Listed skill PRs', { count: prs.length });

      return createToolResult(
        JSON.stringify(
          {
            count: prs.length,
            pullRequests: prs.map((pr) => ({
              number: pr.number,
              title: pr.title,
              url: pr.url,
              branch: pr.headBranch,
              author: pr.author,
              createdAt: pr.createdAt,
            })),
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to list skill PRs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('skills_reload', async () => {
    const op = skillLogger.startOperation('reloadSkills');

    try {
      const skills = await getSkillsService();
      const result = await skills.reload();

      op.success('Skills reloaded', result);

      return createToolResult(
        JSON.stringify(
          {
            success: true,
            message: 'Skills reloaded successfully',
            previous: result.previous,
            current: result.current,
          },
          null,
          2
        )
      );
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to reload skills: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Registers app tool handlers
 */
function registerAppToolHandlers(registry: ToolExecutorRegistry): void {
  const appsLogger = createServiceLogger('apps-tools');
  let appsService: AppsService | null = null;
  let appGenerator: AppGeneratorService | null = null;
  let appGitService: AppGitService | null = null;
  let githubService: GitHubService | null = null;

  async function getAppsService(): Promise<AppsService | null> {
    if (!appsService) {
      try {
        appsService = await createAppsService();
        appsLogger.info('Apps service initialized', { appCount: appsService.listApps().length });
      } catch (error) {
        appsLogger.error('Failed to initialize apps service', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }
    return appsService;
  }

  function getAppGenerator(): AppGeneratorService | null {
    if (!appGenerator) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        appsLogger.warn('App generator not available (missing ANTHROPIC_API_KEY)');
        return null;
      }
      appGenerator = new AppGeneratorService({ apiKey });
      appsLogger.info('App generator initialized');
    }
    return appGenerator;
  }

  function getAppGitService(): AppGitService | null {
    if (!appGitService) {
      const repoPath = process.env.PROJECT_ROOT || process.cwd();
      const worktreeBase = process.env.APP_WORKTREE_BASE;

      if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
        appsLogger.warn('App git service not configured (missing GITHUB_TOKEN or GITHUB_REPO)');
        return null;
      }

      try {
        appGitService = createAppGitService({ repoPath, worktreeBase });
        appsLogger.info('App git service initialized');
      } catch (error) {
        appsLogger.error('Failed to initialize app git service', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }
    return appGitService;
  }

  function getGitHubService(): GitHubService | null {
    if (!githubService) {
      githubService = createGitHubServiceFromEnv();
    }
    return githubService;
  }

  registry.registerHandler('apps_create', async (args: Record<string, unknown>) => {
    const op = appsLogger.startOperation('apps_create', args);

    try {
      const {
        prompt,
        name: appName,
        author,
      } = args as {
        prompt: string;
        name?: string;
        author?: string;
      };

      if (!prompt || prompt.length < 20) {
        throw new Error('Prompt is required and must be at least 20 characters');
      }

      const generator = getAppGenerator();
      if (!generator) {
        throw new Error(
          'App generator service not available. Check ANTHROPIC_API_KEY configuration.'
        );
      }

      appsLogger.info('Creating new app', { promptLength: prompt.length, name: appName });

      const generated = await generator.generateApp({
        prompt,
        name: appName,
        author,
      });

      appsLogger.info('App generated', {
        name: generated.manifest.name,
        title: generated.manifest.title,
      });

      let prUrl: string | undefined;
      const gitService = getAppGitService();
      const github = getGitHubService();

      if (gitService && github) {
        try {
          const { worktreePath, branchName, cleanup } = await gitService.createWorktree(
            generated.manifest.name
          );

          try {
            await gitService.scaffoldApp(
              worktreePath,
              generated.manifest.name,
              generated.manifest,
              generated.componentCode
            );

            await gitService.commitAndPush(
              worktreePath,
              branchName,
              `feat(app): add ${generated.manifest.name}\n\n${generated.manifest.description}`
            );

            const prDescription = gitService.generateAppPRDescription(generated.manifest);
            const pr = await github.createPullRequest(
              branchName,
              `[App] Add ${generated.manifest.title}`,
              prDescription
            );

            prUrl = pr.url;
            appsLogger.info('PR created', { prUrl });
          } finally {
            await cleanup();
          }
        } catch (error) {
          appsLogger.warn('Failed to create PR, app saved locally only', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const baseUrl = process.env.APPS_BASE_URL || 'http://localhost:5173';
      const previewUrl = `${baseUrl}/preview/${generated.manifest.name}`;

      const result = {
        success: true,
        appName: generated.manifest.name,
        title: generated.manifest.title,
        description: generated.manifest.description,
        explanation: generated.explanation,
        prUrl,
        previewUrl,
        message: prUrl
          ? `App "${generated.manifest.title}" created and PR submitted: ${prUrl}`
          : `App "${generated.manifest.title}" generated successfully. Configure git integration to create PRs.`,
      };

      op.success('App created', { appName: generated.manifest.name, hasPR: !!prUrl });
      return createToolResult(JSON.stringify(result, null, 2));
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to create app: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('apps_list', async (args: Record<string, unknown>) => {
    const op = appsLogger.startOperation('apps_list', args);

    try {
      const { status, limit } = args as {
        status?: 'all' | 'draft' | 'published' | 'pending_review';
        limit?: number;
      };

      const service = await getAppsService();
      if (!service) {
        throw new Error('Apps service not available');
      }

      let apps = service.listApps();

      if (status && status !== 'all') {
        apps = apps.filter((app) => app.status === status);
      }

      const maxLimit = limit || 50;
      apps = apps.slice(0, maxLimit);

      const result = {
        total: apps.length,
        apps: apps.map((app) => ({
          name: app.name,
          title: app.title,
          description: app.description,
          version: app.version,
          status: app.status,
          isBuilt: app.isBuilt,
          author: app.author,
        })),
      };

      op.success('Apps listed', { count: apps.length });
      return createToolResult(JSON.stringify(result, null, 2));
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to list apps: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('apps_get', async (args: Record<string, unknown>) => {
    const op = appsLogger.startOperation('apps_get', args);

    try {
      const { name: appName } = args as { name: string };

      if (!appName) {
        throw new Error('App name is required');
      }

      const service = await getAppsService();
      if (!service) {
        throw new Error('Apps service not available');
      }

      const app = service.getApp(appName);

      if (!app) {
        op.success('App not found', { appName });
        return createToolResult(
          JSON.stringify(
            {
              found: false,
              message: `App "${appName}" not found. Use apps_list to see available apps.`,
            },
            null,
            2
          )
        );
      }

      const permissions: Record<string, { read: boolean; write: boolean }> = {};
      for (const [key, value] of Object.entries(app.manifest.permissions)) {
        if (key !== 'tools' && value && typeof value === 'object' && 'read' in value) {
          const perm = value as { read: boolean; write: boolean };
          permissions[key] = { read: perm.read, write: perm.write };
        }
      }

      const result = {
        found: true,
        app: {
          name: app.manifest.name,
          title: app.manifest.title,
          description: app.manifest.description,
          version: app.manifest.version,
          status: app.status,
          isBuilt: app.isBuilt,
          author: app.manifest.author,
          permissions,
          capabilities: {
            scheduler: app.manifest.capabilities.scheduler,
            webhooks: app.manifest.capabilities.webhooks
              ? {
                  enabled: app.manifest.capabilities.webhooks.enabled,
                  max_endpoints: app.manifest.capabilities.webhooks.max_endpoints,
                }
              : undefined,
          },
          sharing: app.manifest.sharing,
          path: app.path,
        },
        message: `Found app "${app.manifest.title}"`,
      };

      op.success('App found', { appName: app.manifest.name });
      return createToolResult(JSON.stringify(result, null, 2));
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to get app: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('apps_share', async (args: Record<string, unknown>) => {
    const op = appsLogger.startOperation('apps_share', args);

    try {
      const {
        name: appName,
        expiryDays,
        maxUses,
      } = args as {
        name: string;
        expiryDays?: number;
        maxUses?: number;
      };

      if (!appName) {
        throw new Error('App name is required');
      }

      const service = await getAppsService();
      if (!service) {
        throw new Error('Apps service not available');
      }

      const app = service.getApp(appName);
      if (!app) {
        throw new Error(`App "${appName}" not found. Use apps_list to see available apps.`);
      }

      const baseUrl = process.env.APPS_BASE_URL || 'http://localhost:5173';
      const token = Buffer.from(Math.random().toString(36).substring(2) + Date.now().toString(36))
        .toString('base64url')
        .substring(0, 32);
      const shareUrl = `${baseUrl}/a/${appName}/${token}`;

      const expiry = expiryDays || 30;

      const result = {
        success: true,
        appName,
        shareUrl,
        expiryDays: expiry,
        maxUses,
        message: `Share link generated for "${app.manifest.title}". Link expires in ${expiry} days.${maxUses ? ` Limited to ${maxUses} uses.` : ''}`,
      };

      op.success('Share link generated', { appName, expiryDays: expiry });
      return createToolResult(JSON.stringify(result, null, 2));
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to share app: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  registry.registerHandler('apps_update', async (args: Record<string, unknown>) => {
    const op = appsLogger.startOperation('apps_update', args);

    try {
      const { name: appName, updateRequest } = args as {
        name: string;
        updateRequest: string;
      };

      if (!appName) {
        throw new Error('App name is required');
      }

      if (!updateRequest || updateRequest.length < 10) {
        throw new Error('Update request is required and must be at least 10 characters');
      }

      const service = await getAppsService();
      if (!service) {
        throw new Error('Apps service not available');
      }

      const generator = getAppGenerator();
      if (!generator) {
        throw new Error(
          'App generator service not available. Check ANTHROPIC_API_KEY configuration.'
        );
      }

      const existingApp = service.getApp(appName);
      if (!existingApp) {
        throw new Error(`App "${appName}" not found. Use apps_list to see available apps.`);
      }

      const fs = await import('fs');
      const appTsxPath = path.join(existingApp.srcPath, 'App.tsx');
      if (!fs.existsSync(appTsxPath)) {
        throw new Error(`App source file not found: ${appTsxPath}`);
      }
      const existingCode = fs.readFileSync(appTsxPath, 'utf-8');

      appsLogger.info('Updating app', { name: appName, requestLength: updateRequest.length });

      const updated = await generator.updateApp(existingApp.manifest, existingCode, updateRequest);

      appsLogger.info('App updated', {
        name: updated.manifest.name,
        version: updated.manifest.version,
      });

      let prUrl: string | undefined;
      const gitService = getAppGitService();
      const github = getGitHubService();

      if (gitService && github) {
        try {
          const { worktreePath, branchName, cleanup } = await gitService.createWorktree(
            updated.manifest.name
          );

          try {
            await gitService.scaffoldApp(
              worktreePath,
              updated.manifest.name,
              updated.manifest,
              updated.componentCode
            );

            await gitService.commitAndPush(
              worktreePath,
              branchName,
              `feat(app): update ${updated.manifest.name} to v${updated.manifest.version}\n\n${updateRequest}`
            );

            const prDescription = gitService.generateAppPRDescription(updated.manifest, true);
            const pr = await github.createPullRequest(
              branchName,
              `[App] Update ${updated.manifest.title} to v${updated.manifest.version}`,
              prDescription
            );

            prUrl = pr.url;
            appsLogger.info('Update PR created', { prUrl });
          } finally {
            await cleanup();
          }
        } catch (error) {
          appsLogger.warn('Failed to create PR for update', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const result = {
        success: true,
        appName: updated.manifest.name,
        version: updated.manifest.version,
        explanation: updated.explanation,
        prUrl,
        message: prUrl
          ? `App "${updated.manifest.title}" updated to v${updated.manifest.version}. PR: ${prUrl}`
          : `App "${updated.manifest.title}" updated to v${updated.manifest.version}.`,
      };

      op.success('App updated', {
        appName: updated.manifest.name,
        version: updated.manifest.version,
      });
      return createToolResult(JSON.stringify(result, null, 2));
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return createToolError(
        `Failed to update app: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Registers agent tool handlers
 */
function registerAgentToolHandlers(registry: ToolExecutorRegistry): void {
  registry.registerHandler('agents_get_context', async (args: Record<string, unknown>) => {
    const { getAgentContextTool } = await import('@orient/mcp-tools');
    const minContext = {
      correlationId: '',
      config: getRawConfig() as unknown as import('@orient/core').AppConfig,
    };
    const result = await getAgentContextTool.run(args, minContext);
    return {
      content: [
        {
          type: 'text',
          text: result.success
            ? JSON.stringify(result.data, null, 2)
            : JSON.stringify({ error: result.error }),
        },
      ],
      isError: !result.success,
    };
  });

  registry.registerHandler('agents_list', async (args: Record<string, unknown>) => {
    const { listAgentsTool } = await import('@orient/mcp-tools');
    const minContext = {
      correlationId: '',
      config: getRawConfig() as unknown as import('@orient/core').AppConfig,
    };
    const result = await listAgentsTool.run(args, minContext);
    return {
      content: [
        {
          type: 'text',
          text: result.success
            ? JSON.stringify(result.data, null, 2)
            : JSON.stringify({ error: result.error }),
        },
      ],
      isError: !result.success,
    };
  });

  registry.registerHandler('agents_handoff', async (args: Record<string, unknown>) => {
    const { handoffToAgentTool } = await import('@orient/mcp-tools');
    const minContext = {
      correlationId: '',
      config: getRawConfig() as unknown as import('@orient/core').AppConfig,
    };
    const result = await handoffToAgentTool.run(args, minContext);
    return {
      content: [
        {
          type: 'text',
          text: result.success
            ? JSON.stringify(result.data, null, 2)
            : JSON.stringify({ error: result.error }),
        },
      ],
      isError: !result.success,
    };
  });
}

/**
 * Registers context tool handlers
 */
function registerContextToolHandlers(registry: ToolExecutorRegistry): void {
  registry.registerHandler('context_read', async (args: Record<string, unknown>) => {
    const { readContextTool } = await import('@orient/mcp-tools');
    const minContext = {
      correlationId: '',
      config: getRawConfig() as unknown as import('@orient/core').AppConfig,
      platform: (args as Record<string, unknown>).platform as
        | 'whatsapp'
        | 'slack'
        | 'opencode'
        | 'cursor'
        | undefined,
      chatId: (args as Record<string, unknown>).chatId as string | undefined,
    };
    const result = await readContextTool.run(args, minContext);
    return {
      content: [
        {
          type: 'text',
          text: result.success
            ? JSON.stringify(result.data, null, 2)
            : JSON.stringify({ error: result.error }),
        },
      ],
      isError: !result.success,
    };
  });

  registry.registerHandler('context_update', async (args: Record<string, unknown>) => {
    const { updateContextTool } = await import('@orient/mcp-tools');
    const minContext = {
      correlationId: '',
      config: getRawConfig() as unknown as import('@orient/core').AppConfig,
      platform: (args as Record<string, unknown>).platform as
        | 'whatsapp'
        | 'slack'
        | 'opencode'
        | 'cursor'
        | undefined,
      chatId: (args as Record<string, unknown>).chatId as string | undefined,
    };
    const result = await updateContextTool.run(args, minContext);
    return {
      content: [
        {
          type: 'text',
          text: result.success
            ? JSON.stringify(result.data, null, 2)
            : JSON.stringify({ error: result.error }),
        },
      ],
      isError: !result.success,
    };
  });
}
