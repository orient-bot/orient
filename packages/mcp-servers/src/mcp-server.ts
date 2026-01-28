#!/usr/bin/env node
/**
 * Orient - MCP Server
 *
 * This exposes the bot's functionality as MCP tools that can be used
 * directly from Cursor or other MCP-compatible clients.
 *
 * Tool Organization:
 * - Slack tools: send_dm, send_channel_message, etc.
 * - WhatsApp tools: send_whatsapp_message, send_poll, etc.
 * - Google tools: calendar, gmail, sheets, slides, tasks
 * - Apps tools: create_app, list_apps, share_app, etc.
 * - System tools: discover_tools, get_agent_context, etc.
 *
 * Migration Status:
 * - Tools are progressively migrating to packages/mcp-tools/
 * - New tools should be added to the appropriate package
 * - This file remains the entry point and tool registration
 *
 * @see packages/mcp-tools/src/tools/ for migrated tool implementations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();
import { WebClient } from '@slack/web-api';
import { getRawConfig } from '@orientbot/core';
import {
  SlidesService,
  createSlidesService,
  TextReplacement,
  parsePresentationId,
  parseSlideUrl,
  SheetsService,
  createSheetsService,
  getGoogleOAuthService,
  DEFAULT_SCOPES as GOOGLE_DEFAULT_SCOPES,
  getGmailService,
  getCalendarService,
  getTasksService,
  getSheetsOAuthService,
  getSlidesOAuthService,
} from '@orientbot/integrations/google';
// Import from @orienter packages
import {
  MessageDatabase,
  createMessageDatabase,
  type StoredMessage,
  type MessageSearchOptions,
  type MessageStats,
  type StoredGroup,
} from '@orientbot/database-services';
import { SkillsService, createSkillsService } from '@orientbot/agents';
import {
  googleSlidesTools,
  isGoogleSlidesTool,
  handleGoogleSlidesToolCall,
} from '@orientbot/mcp-tools';
// Services still in src/services/
import {
  createServiceLogger,
  generateCorrelationId,
  mcpToolLogger,
  clearCorrelationId,
} from '@orientbot/core';
import { ToolDiscoveryService, formatDiscoveryResult, DiscoveryInput } from '@orientbot/agents';
import { getToolRegistry, getToolExecutorRegistry } from '@orientbot/agents';
import { GitHubService, createGitHubServiceFromEnv } from '@orientbot/integrations';
import { GitWorktreeService, createGitWorktreeService } from '@orientbot/integrations';
// Google integrations now provided via @orientbot/integrations
import { AppsService, createAppsService } from '@orientbot/apps';
import { AppGeneratorService } from '@orientbot/apps';
import { AppGitService, createAppGitService } from '@orientbot/apps';
import { filterToolsByConnection } from './tool-filter.js';

// Create loggers for different components
const serverLogger = createServiceLogger('mcp-server');
const DEFAULT_MAX_CONTENT_CHARS = 200_000;

function getMaxContentChars(): number {
  const raw = process.env.ORIENT_MCP_MAX_CONTENT_CHARS;
  if (!raw) return DEFAULT_MAX_CONTENT_CHARS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CONTENT_CHARS;
}

function truncateToolResult(result: {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  truncated?: boolean;
}): {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  truncated?: boolean;
} {
  if (!result?.content?.length) return result;

  const maxChars = getMaxContentChars();
  let truncated = false;

  const content = result.content.map((item) => {
    if (item?.type !== 'text' || typeof item.text !== 'string') return item;
    if (item.text.length <= maxChars) return item;

    truncated = true;
    const trimmed = item.text.slice(0, maxChars);
    return {
      ...item,
      text: `${trimmed}\n\n[truncated ${item.text.length - maxChars} chars]`,
    };
  });

  if (!truncated) return result;
  return { ...result, content, truncated: true };
}
const configLogger = createServiceLogger('config');
const skillLogger = createServiceLogger('skill-tools');
const googleLogger = createServiceLogger('google-tools');

// Load configuration from config.json
interface Config {
  slack: {
    botToken: string;
    signingSecret: string;
    appToken: string;
    channels: {
      standup: string;
      alerts: string;
    };
  };
  cron: {
    standup: string;
    preStandup: string;
    staleCheck: string;
    weeklySummary: string;
  };
  sla: {
    inProgressDays: number;
    inReviewDays: number;
    todoDays: number;
  };
  timezone: string;
  logLevel: string;
  googleSlides?: {
    presentationId: string;
    credentialsPath: string;
    templateSlides?: {
      weeklyUpdate?: string;
    };
  };
  googleSheets?: {
    credentialsPath: string;
  };
}

/**
 * Load configuration using the shared config loader.
 * This provides environment variable substitution and multi-file support.
 */
function loadConfig(): Config {
  const op = configLogger.startOperation('loadConfig');

  try {
    const config = getRawConfig() as unknown as Config;

    op.success('Config loaded successfully', {
      hasGoogleSlides: !!config.googleSlides,
      envVarsSubstituted: true,
    });
    return config;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

const config = loadConfig();

// Initialize Slack client
let slackClient: WebClient;
let slackInitialized = false;
const slackLogger = createServiceLogger('slack');

function ensureSlackInitialized() {
  if (!slackInitialized) {
    const op = slackLogger.startOperation('initialize');
    try {
      slackClient = new WebClient(config.slack.botToken);
      slackInitialized = true;
      op.success('Slack client initialized');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }
}

// Initialize Google Slides service
let slidesService: SlidesService | null = null;
const slidesLogger = createServiceLogger('slides');

function getSlidesService(): SlidesService {
  if (!slidesService) {
    const op = slidesLogger.startOperation('initialize');

    if (!config.googleSlides) {
      op.failure('Google Slides not configured');
      throw new Error(
        'Google Slides not configured. Add googleSlides section to .mcp.config.local.json with at least a credentialsPath'
      );
    }

    const scriptDir = path.dirname(__filename);
    const projectDir = path.resolve(scriptDir, '..');
    const credentialsPath = path.resolve(projectDir, config.googleSlides.credentialsPath);

    slidesLogger.debug('Initializing slides service', {
      defaultPresentationId: config.googleSlides.presentationId || '(none)',
      credentialsPath,
    });

    slidesService = createSlidesService({
      presentationId: config.googleSlides.presentationId, // Can be undefined - will be provided per-operation
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

/**
 * Resolve a presentation URL or ID from tool arguments
 * Falls back to config default if not provided
 */
function resolvePresentationId(args: {
  presentationUrl?: string;
  presentationId?: string;
}): string | undefined {
  if (args.presentationUrl) {
    return parsePresentationId(args.presentationUrl);
  }
  if (args.presentationId) {
    return args.presentationId;
  }
  return undefined; // Let the service use its default
}

// Jira integration removed; these provide empty data for slides tools that expect issue summaries.
async function getCompletedThisWeek(): Promise<
  Array<{ key: string; summary: string; storyPoints?: number | null }>
> {
  return [];
}

async function getInProgressIssues(): Promise<
  Array<{ key: string; summary: string; assignee?: { displayName?: string | null } | null }>
> {
  return [];
}

async function getBlockerIssues(): Promise<
  Array<{ key: string; summary: string; assignee?: { displayName?: string | null } | null }>
> {
  return [];
}

// Initialize Google Sheets service
let sheetsService: SheetsService | null = null;

function getSheetsService(): SheetsService {
  if (!sheetsService) {
    const op = slidesLogger.startOperation('initialize-sheets');

    if (!config.googleSheets) {
      op.failure('Google Sheets not configured');
      throw new Error(
        'Google Sheets not configured. Add googleSheets section to .mcp.config.local.json'
      );
    }

    const scriptDir = path.dirname(__filename);
    const projectDir = path.resolve(scriptDir, '..');
    const credentialsPath = path.resolve(projectDir, config.googleSheets.credentialsPath);

    slidesLogger.debug('Initializing sheets service', {
      credentialsPath,
    });

    sheetsService = createSheetsService({
      credentialsPath,
    });

    op.success('Sheets service initialized');
  }
  return sheetsService;
}

// Initialize WhatsApp Message Database
let messageDb: MessageDatabase | null = null;
let messageDbInitialized = false;
const whatsappLogger = createServiceLogger('whatsapp');

async function getMessageDatabase(): Promise<MessageDatabase> {
  if (!messageDb) {
    const op = whatsappLogger.startOperation('initialize');
    whatsappLogger.debug('Initializing message database (SQLite)');
    messageDb = createMessageDatabase();
    op.success('Message database pool created');
  }

  if (!messageDbInitialized) {
    await messageDb.initialize();
    messageDbInitialized = true;
    whatsappLogger.info('Message database initialized');
  }

  return messageDb;
}

// Initialize Skills Service
let skillsService: SkillsService | null = null;
let skillsInitialized = false;

async function getSkillsService(): Promise<SkillsService> {
  if (!skillsService) {
    const projectRoot = process.env.PROJECT_ROOT || process.cwd();
    skillsService = new SkillsService(projectRoot);
  }

  if (!skillsInitialized) {
    await skillsService.initialize();
    skillsInitialized = true;
    skillLogger.info('Skills service initialized', { skillCount: skillsService.skillCount });
  }

  return skillsService;
}

// Initialize GitHub and Worktree services for skill editing
let githubService: GitHubService | null = null;
let worktreeService: GitWorktreeService | null = null;

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

// ============================================
// Mini-Apps Services
// ============================================
const appsLogger = createServiceLogger('apps-tools');
let appsService: AppsService | null = null;
let appGenerator: AppGeneratorService | null = null;
let appGitService: AppGitService | null = null;

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

// Admin identifiers for skill editing (from environment)
function getSkillAdminPhones(): string[] {
  const adminPhones = process.env.SKILL_ADMIN_PHONES || '';
  return adminPhones
    .split(',')
    .map((p) => p.trim())
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

  // Phone-based check
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

// Background skill creation job
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

    // Generate full skill content with frontmatter
    const fullContent = skills.generateSkillTemplate(
      skillSpec.name,
      skillSpec.description,
      skillSpec.content
    );

    // Validate the skill content
    const validation = skills.validateSkillContent(fullContent);
    if (!validation.valid) {
      throw new Error(`Skill validation failed:\n• ${validation.errors.join('\n• ')}`);
    }

    // Create worktree
    skillLogger.info('Creating worktree for skill', { skillName: skillSpec.name });
    const wt = await worktree.createWorktree(skillSpec.name);

    try {
      // Write skill file
      await worktree.writeSkillFile(wt.worktreePath, skillSpec.name, fullContent);

      // Commit and push
      const action = skillSpec.isEdit ? 'Update' : 'Add';
      const commitMessage = `${action} skill: ${skillSpec.name}`;
      await worktree.commitAndPush(wt.worktreePath, wt.branchName, commitMessage);

      // Create PR
      const prTitle = `${action} skill: ${skillSpec.name}`;
      const prBody = github.generateSkillPRDescription(
        skillSpec.name,
        skillSpec.description,
        skillSpec.isEdit
      );

      const pr = await github.createPullRequest(wt.branchName, prTitle, prBody);

      // Format success message
      const successMessage = `✅ *Skill PR Created!*

📝 *Skill:* \`\`\`${skillSpec.name}\`\`\`
🔗 *PR #${pr.number}:* ${pr.url}

Please review and merge the PR to deploy the skill.

_The skill will be available after merge and automatic deployment._`;

      // Send notification based on platform
      // Note: For now, we log the message. Integration with messaging services
      // will be done via the WhatsApp API server or Slack client
      skillLogger.info('Skill PR created - notification pending', {
        prNumber: pr.number,
        prUrl: pr.url,
        platform: notificationConfig.platform,
        message: successMessage,
      });

      op.success('Skill PR created', { prNumber: pr.number, prUrl: pr.url });

      // Return the PR result
      return { prNumber: pr.number, prUrl: pr.url };
    } finally {
      // Always cleanup worktree
      await wt.cleanup();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    skillLogger.error('Skill creation failed', { error: errorMessage, skillName: skillSpec.name });

    // Format error message
    const failureMessage = `❌ *Skill Creation Failed*

📝 *Skill:* \`\`\`${skillSpec.name}\`\`\`
❗ *Error:* ${errorMessage}

Please fix the issues and try again.`;

    skillLogger.info('Skill creation failed - notification pending', {
      platform: notificationConfig.platform,
      message: failureMessage,
    });

    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'system_health_check',
    description: 'Check the health and connectivity of the Orient.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'system_get_config',
    description: 'Get the current configuration for the Orient (excluding sensitive credentials).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  ...googleSlidesTools,
  // Slack tools
  {
    name: 'slack_lookup_user',
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
  {
    name: 'slack_send_dm',
    description:
      'Send a direct message to a Slack user. Can use either user ID or email address. Optionally include additional users to create a group DM.',
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
            'Optional list of user IDs or emails to include in a group DM conversation (e.g., to CC yourself on replies)',
        },
      },
      required: ['userIdOrEmail', 'message'],
    },
  },
  {
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
  {
    name: 'slack_get_channel_messages',
    description:
      'Get messages from a Slack channel. Can filter by date range and limit the number of messages returned. Useful for reading channel history, finding quotes, or reviewing discussions.',
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
          description:
            'Only messages after this date (ISO 8601 format, e.g., "2024-01-01" or "2024-01-01T00:00:00Z")',
        },
        latest: {
          type: 'string',
          description:
            'Only messages before this date (ISO 8601 format, e.g., "2024-12-31" or "2024-12-31T23:59:59Z")',
        },
        includeReplies: {
          type: 'boolean',
          description: 'Whether to include thread replies in the results (default: false)',
        },
      },
      required: ['channel'],
    },
  },
  // WhatsApp Message Database tools
  {
    name: 'whatsapp_search_messages',
    description:
      'Search WhatsApp messages using full-text search with optional filters. Supports searching by text content, phone number, direction, date range, and group messages.',
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
  {
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
  {
    name: 'whatsapp_get_conversation',
    description:
      'Get conversation history with a specific contact. Returns messages in chronological order.',
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
  {
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
  {
    name: 'whatsapp_get_stats',
    description:
      'Get WhatsApp message database statistics including total counts, unique contacts, groups, and date ranges.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'whatsapp_list_contacts',
    description: 'List all unique contacts (phone numbers) in the WhatsApp message database.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'whatsapp_list_groups',
    description:
      'List WhatsApp groups with their names and metadata. Can optionally search for groups by name.',
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
  {
    name: 'whatsapp_get_media',
    description: 'Get media messages (images, audio, video, documents) from the WhatsApp database.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaType: {
          type: 'string',
          enum: ['image', 'audio', 'video', 'document'],
          description: 'Filter by media type (optional, returns all media if not specified)',
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
  {
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
          description: 'Optional context about why this poll is being asked (for logging/tracking)',
        },
      },
      required: ['question', 'options'],
    },
  },
  {
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
  {
    name: 'orient_whatsapp_send_image',
    description:
      'Send an image to the current WhatsApp chat. Provide either a URL or local file path to the image.',
    inputSchema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description: 'URL of the image to send',
        },
        imagePath: {
          type: 'string',
          description: 'Local file path of the image to send',
        },
        caption: {
          type: 'string',
          description: 'Optional caption for the image',
        },
        jid: {
          type: 'string',
          description: 'Optional: specific JID to send to (defaults to current chat)',
        },
      },
      required: [],
    },
  },
  {
    name: 'orient_slack_send_image',
    description:
      'Upload and send an image to a Slack channel or DM. Provide either a URL or local file path.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel name (e.g., #general) or channel ID',
        },
        imageUrl: {
          type: 'string',
          description: 'URL of the image to send',
        },
        imagePath: {
          type: 'string',
          description: 'Local file path of the image to send',
        },
        caption: {
          type: 'string',
          description: 'Optional message to accompany the image',
        },
        filename: {
          type: 'string',
          description: 'Optional filename for the uploaded image',
        },
      },
      required: ['channel'],
    },
  },
  // Skill Management Tools - for creating/editing skills via GitHub PRs
  {
    name: 'skills_list',
    description:
      'List all available skills with their names and descriptions. Skills provide specialized knowledge modules for domain-specific guidance.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
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
  {
    name: 'skills_create_async',
    description:
      'Create a new skill and submit it as a GitHub PR. This is an ASYNC operation - it starts a background job and returns immediately. The PR link will be sent via the messaging channel when ready. ADMIN ONLY - requires loading the skill-creator skill first for guidance on creating effective skills.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'The skill name in lowercase with hyphens (e.g., "billing-api", "customer-support")',
        },
        description: {
          type: 'string',
          description:
            'Comprehensive description of what the skill does and when to use it (min 50 chars). Include trigger words/phrases.',
        },
        content: {
          type: 'string',
          description:
            'The full skill body content in Markdown. Should include sections, examples, and guidance. Do NOT include the YAML frontmatter - it will be generated automatically.',
        },
        userPhone: {
          type: 'string',
          description:
            'The phone number of the user requesting the skill (for WhatsApp admin verification)',
        },
        slackUserId: {
          type: 'string',
          description:
            'The Slack user ID of the user requesting the skill (for Slack admin verification, e.g., UFXSVR0JK)',
        },
        userJid: {
          type: 'string',
          description: 'The WhatsApp JID to send the PR notification to',
        },
        platform: {
          type: 'string',
          enum: ['whatsapp', 'slack'],
          description: 'The platform to send the notification to (default: whatsapp)',
        },
        channelId: {
          type: 'string',
          description: 'For Slack: the channel or DM ID to send the notification to',
        },
      },
      required: ['name', 'description', 'content'],
    },
  },
  {
    name: 'skills_edit_async',
    description:
      'Edit an existing skill and submit changes as a GitHub PR. This is an ASYNC operation - it starts a background job and returns immediately. The PR link will be sent via the messaging channel when ready. ADMIN ONLY. Read the existing skill first to see current content.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the existing skill to edit',
        },
        description: {
          type: 'string',
          description: 'Updated description (or same as original if not changing)',
        },
        content: {
          type: 'string',
          description:
            'The updated skill body content in Markdown. Do NOT include the YAML frontmatter.',
        },
        userPhone: {
          type: 'string',
          description:
            'The phone number of the user requesting the edit (for WhatsApp admin verification)',
        },
        slackUserId: {
          type: 'string',
          description:
            'The Slack user ID of the user requesting the edit (for Slack admin verification, e.g., UFXSVR0JK)',
        },
        userJid: {
          type: 'string',
          description: 'The WhatsApp JID to send the PR notification to',
        },
        platform: {
          type: 'string',
          enum: ['whatsapp', 'slack'],
          description: 'The platform to send the notification to (default: whatsapp)',
        },
        channelId: {
          type: 'string',
          description: 'For Slack: the channel or DM ID to send the notification to',
        },
      },
      required: ['name', 'description', 'content'],
    },
  },
  {
    name: 'skills_list_prs',
    description:
      'List all pending GitHub PRs for skill changes that are awaiting review. ADMIN ONLY.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'skills_reload',
    description:
      'Reload all skills from disk. Use after a skill PR is merged and deployed to refresh the skill cache. ADMIN ONLY.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // =============================================================================
  // Google OAuth Tools
  // =============================================================================
  {
    name: 'google_oauth_connect',
    description:
      'Connect a personal Google account to access Gmail, Calendar, Tasks, Sheets, and Slides. Opens a browser window for authorization. Returns the connected account email on success.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'google_oauth_list_accounts',
    description: 'List all connected Google accounts with their email addresses and scopes.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'google_oauth_disconnect',
    description: 'Disconnect a Google account by email address.',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'The email address of the Google account to disconnect',
        },
      },
      required: ['email'],
    },
  },
  // Gmail Tools
  {
    name: 'google_gmail_list_messages',
    description:
      'List or search Gmail messages. Supports Gmail search syntax for advanced queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Gmail search query (e.g., "from:john@example.com", "is:unread", "subject:meeting")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 20)',
        },
        unreadOnly: {
          type: 'boolean',
          description: 'Only return unread messages',
        },
        label: {
          type: 'string',
          description: 'Filter by label (e.g., "INBOX", "SENT", "IMPORTANT")',
        },
        accountEmail: {
          type: 'string',
          description:
            'Email of the Google account to use (optional, uses default if not specified)',
        },
      },
      required: [],
    },
  },
  {
    name: 'google_gmail_get_message',
    description: 'Get full details of a specific Gmail message including body and attachments.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The Gmail message ID',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'google_gmail_send',
    description: 'Send an email via Gmail.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text)',
        },
        cc: {
          type: 'array',
          description: 'CC email addresses',
        },
        bcc: {
          type: 'array',
          description: 'BCC email addresses',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'google_gmail_create_draft',
    description: 'Create an email draft in Gmail.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text)',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  // Calendar Tools
  {
    name: 'google_calendar_list_events',
    description: 'List upcoming calendar events. Defaults to next 7 days.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: "primary")',
        },
        days: {
          type: 'number',
          description: 'Number of days to look ahead (default: 7)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of events to return (default: 50)',
        },
        query: {
          type: 'string',
          description: 'Search query to filter events',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: [],
    },
  },
  {
    name: 'google_calendar_create_event',
    description: 'Create a new calendar event.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Event title/summary',
        },
        startTime: {
          type: 'string',
          description: 'Start time in ISO 8601 format (e.g., "2024-01-15T14:00:00")',
        },
        endTime: {
          type: 'string',
          description: 'End time in ISO 8601 format',
        },
        description: {
          type: 'string',
          description: 'Event description',
        },
        location: {
          type: 'string',
          description: 'Event location',
        },
        attendees: {
          type: 'array',
          description: 'List of attendee email addresses',
        },
        createMeetingLink: {
          type: 'boolean',
          description: 'Add a Google Meet link to the event',
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: "primary")',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['title', 'startTime', 'endTime'],
    },
  },
  {
    name: 'google_calendar_update_event',
    description: 'Update an existing calendar event.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The event ID to update',
        },
        title: {
          type: 'string',
          description: 'New event title',
        },
        startTime: {
          type: 'string',
          description: 'New start time in ISO 8601 format',
        },
        endTime: {
          type: 'string',
          description: 'New end time in ISO 8601 format',
        },
        description: {
          type: 'string',
          description: 'New event description',
        },
        location: {
          type: 'string',
          description: 'New event location',
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: "primary")',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'google_calendar_delete_event',
    description: 'Delete a calendar event.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The event ID to delete',
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID (default: "primary")',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['eventId'],
    },
  },
  // Tasks Tools
  {
    name: 'google_tasks_list',
    description: 'List Google Tasks from a task list.',
    inputSchema: {
      type: 'object',
      properties: {
        taskListId: {
          type: 'string',
          description: 'Task list ID (default: "@default" for the default list)',
        },
        showCompleted: {
          type: 'boolean',
          description: 'Include completed tasks (default: true)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of tasks to return (default: 100)',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: [],
    },
  },
  {
    name: 'google_tasks_create',
    description: 'Create a new Google Task.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Task title',
        },
        notes: {
          type: 'string',
          description: 'Task notes/description',
        },
        dueDate: {
          type: 'string',
          description: 'Due date in ISO 8601 format',
        },
        taskListId: {
          type: 'string',
          description: 'Task list ID (default: "@default")',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'google_tasks_complete',
    description: 'Mark a Google Task as completed.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to complete',
        },
        taskListId: {
          type: 'string',
          description: 'Task list ID (default: "@default")',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'google_tasks_update',
    description: 'Update a Google Task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to update',
        },
        title: {
          type: 'string',
          description: 'New task title',
        },
        notes: {
          type: 'string',
          description: 'New task notes',
        },
        dueDate: {
          type: 'string',
          description: 'New due date in ISO 8601 format',
        },
        taskListId: {
          type: 'string',
          description: 'Task list ID (default: "@default")',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['taskId'],
    },
  },
  // Sheets Tools (OAuth-based)
  {
    name: 'google_sheets_read',
    description: 'Read data from a Google Sheets spreadsheet using your personal account.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'Spreadsheet ID or URL',
        },
        range: {
          type: 'string',
          description: 'Range in A1 notation (e.g., "Sheet1!A1:B10")',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'google_sheets_write',
    description: 'Write data to a Google Sheets spreadsheet using your personal account.',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'Spreadsheet ID or URL',
        },
        range: {
          type: 'string',
          description: 'Range in A1 notation (e.g., "Sheet1!A1:B10")',
        },
        values: {
          type: 'array',
          description: '2D array of values to write (rows of columns)',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  // Slides Tools (OAuth-based)
  {
    name: 'google_slides_get',
    description: 'Get information about a Google Slides presentation using your personal account.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'Presentation ID or URL',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['presentationId'],
    },
  },
  {
    name: 'google_slides_update',
    description:
      'Update text in a Google Slides presentation using your personal account. Replaces placeholder text.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'Presentation ID or URL',
        },
        replacements: {
          type: 'array',
          description:
            'Array of {placeholder, replacement} objects. Use placeholders like {{TITLE}}.',
        },
        slideId: {
          type: 'string',
          description: 'Optional: specific slide ID to update (otherwise updates all slides)',
        },
        accountEmail: {
          type: 'string',
          description: 'Email of the Google account to use (optional)',
        },
      },
      required: ['presentationId', 'replacements'],
    },
  },
];

// Create the MCP server
const server = new Server(
  {
    name: 'orienter',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

serverLogger.info('MCP Server created', { name: 'orienter', version: '1.0.0' });

// Initialize tool discovery service
const toolDiscoveryService = new ToolDiscoveryService();
const discoveryLogger = createServiceLogger('tool-discovery');

// Handle list tools request - return ALL tools so they can be called
// Note: Originally we only exposed discover_tools for reduced context, but MCP requires
// tools to be listed in ListTools before they can be called. Without listing all tools,
// discovered tools would be rejected as "invalid tool" by the MCP client.
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const discoveryTool = ToolDiscoveryService.getDiscoveryToolDefinition();
  const allRegisteredTools = await filterToolsByConnection({
    categories: 'all',
    includeDiscovery: false,
  });
  const allTools = [discoveryTool, ...allRegisteredTools];

  serverLogger.debug('ListTools request received', {
    mode: 'all-tools',
    totalToolsAvailable: getToolRegistry().size,
    exposedTools: allTools.length,
  });
  return { tools: allTools };
});

// Handle tool calls with comprehensive logging
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  // Log tool invocation
  mcpToolLogger.toolStart(name, (args as Record<string, unknown>) || {}, correlationId);

  try {
    const result = await executeToolCall(name, args as Record<string, unknown>);
    const duration = Date.now() - startTime;

    // Log successful completion
    mcpToolLogger.toolSuccess(name, result, duration);
    clearCorrelationId();

    return truncateToolResult(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error
    mcpToolLogger.toolError(name, error instanceof Error ? error : String(error), duration);
    clearCorrelationId();

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
      isError: true,
    };
  }
});

// Execute tool call - separated for cleaner logging
async function executeToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  // First, check if there's a registered handler in the executor registry
  // This allows for gradual migration of tools from the switch statement
  const executorRegistry = getToolExecutorRegistry();
  const registeredResult = await executorRegistry.execute(name, args);
  if (registeredResult !== null) {
    return registeredResult;
  }

  if (isGoogleSlidesTool(name)) {
    return handleGoogleSlidesToolCall(name, args, {
      getSlidesService,
      resolvePresentationId,
      parseSlideUrl,
      getCompletedThisWeek,
      getInProgressIssues,
      getBlockerIssues,
    });
  }

  // Fall back to the legacy switch statement for tools not yet migrated
  switch (name) {
    // Tool Discovery - the primary entry point for agents to find tools
    case 'discover_tools': {
      const op = discoveryLogger.startOperation('discover', args);

      try {
        const input = args as unknown as DiscoveryInput;
        const result = await toolDiscoveryService.discover(input);
        const formattedResult = formatDiscoveryResult(result, {
          includeTools: Boolean(input.includeTools),
        });

        op.success('Discovery completed', {
          mode: input.mode,
          toolsFound: result.tools?.length || result.categories?.length || 0,
        });

        return {
          content: [
            {
              type: 'text',
              text: formattedResult,
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: `Discovery failed: ${error instanceof Error ? error.message : String(error)}`,
                hint: 'Use mode: "list_categories" to see available categories, or mode: "search" with a query.',
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'system_health_check': {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'ok',
                sla: config.sla,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'system_get_config': {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                slack: {
                  channels: config.slack.channels,
                },
                cron: config.cron,
                sla: config.sla,
                timezone: config.timezone,
                googleSlides: config.googleSlides
                  ? {
                      presentationId: config.googleSlides.presentationId,
                      templateSlides: config.googleSlides.templateSlides,
                    }
                  : null,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Google Slides tool handlers
    case 'slides_get_presentation': {
      const { presentationUrl } = args as { presentationUrl?: string };
      const slides = getSlidesService();
      const presentationId = resolvePresentationId({ presentationUrl });
      const presentation = await slides.getPresentation(presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(presentation, null, 2),
          },
        ],
      };
    }

    case 'slides_get_slide': {
      const { slideId: providedSlideId, presentationUrl } = args as {
        slideId?: string;
        presentationUrl?: string;
      };
      const slides = getSlidesService();

      // Try to extract slide ID from URL if not provided directly
      let slideId = providedSlideId;
      let presentationId: string | undefined;

      if (presentationUrl) {
        const parsed = parseSlideUrl(presentationUrl);
        presentationId = parsed.presentationId;
        if (!slideId && parsed.slideId) {
          slideId = parsed.slideId;
        }
      }

      if (!slideId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'slideId is required. Provide it directly or in the URL fragment (#slide=id.XXX)',
              }),
            },
          ],
          isError: true,
        };
      }

      const slideContent = await slides.getSlideContent(slideId, presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(slideContent, null, 2),
          },
        ],
      };
    }

    case 'slides_update_text': {
      const { replacements, presentationUrl } = args as {
        replacements: TextReplacement[];
        presentationUrl?: string;
      };
      const slides = getSlidesService();
      const presentationId = resolvePresentationId({ presentationUrl });
      await slides.updateSlideText(replacements, presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                message: `Updated ${replacements.length} placeholder(s)`,
                replacements: replacements.map((r) => r.placeholder),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_update_slide_text': {
      const {
        slideId: providedSlideId,
        replacements,
        presentationUrl,
      } = args as {
        slideId?: string;
        replacements: TextReplacement[];
        presentationUrl?: string;
      };
      const slides = getSlidesService();

      // Try to extract slide ID from URL if not provided directly
      let slideId = providedSlideId;
      let presentationId: string | undefined;

      if (presentationUrl) {
        const parsed = parseSlideUrl(presentationUrl);
        presentationId = parsed.presentationId;
        if (!slideId && parsed.slideId) {
          slideId = parsed.slideId;
        }
      }

      if (!slideId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'slideId is required. Provide it directly or in the URL fragment (#slide=id.XXX)',
              }),
            },
          ],
          isError: true,
        };
      }

      await slides.updateSlideTextOnSlide(slideId, replacements, presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                slideId,
                message: `Updated ${replacements.length} text replacement(s) on slide`,
                replacements: replacements.map((r) => ({ from: r.placeholder, to: r.replacement })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_duplicate_template': {
      const { templateSlideId, replacements, insertAtIndex, presentationUrl } = args as {
        templateSlideId: string;
        replacements?: TextReplacement[];
        insertAtIndex?: number;
        presentationUrl?: string;
      };
      const slides = getSlidesService();
      const presentationId = resolvePresentationId({ presentationUrl });
      const newSlideId = await slides.addSlideFromTemplate(
        templateSlideId,
        replacements || [],
        insertAtIndex,
        presentationId
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                newSlideId,
                message: 'Slide duplicated successfully',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_update_weekly': {
      const { templateSlideId, insertAtIndex, presentationUrl } = args as {
        templateSlideId?: string;
        insertAtIndex?: number;
        presentationUrl?: string;
      };

      // Fetch weekly data
      const [completed, inProgress, blockers] = await Promise.all([
        getCompletedThisWeek(),
        getInProgressIssues(),
        getBlockerIssues(),
      ]);

      const velocityPoints = completed.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const weekEnding = new Date().toISOString().split('T')[0];

      const slides = getSlidesService();
      const presentationId = resolvePresentationId({ presentationUrl });
      const replacements = slides.formatWeeklyUpdate({
        weekEnding,
        completed: completed.map((i) => ({
          key: i.key,
          summary: i.summary,
          points: i.storyPoints,
        })),
        inProgress: inProgress.map((i) => ({
          key: i.key,
          summary: i.summary,
          assignee: i.assignee?.displayName || 'Unassigned',
        })),
        blockers: blockers.map((b) => ({
          key: b.key,
          summary: b.summary,
          assignee: b.assignee?.displayName || 'Unassigned',
        })),
        velocityPoints,
      });

      let newSlideId: string | undefined;

      if (templateSlideId) {
        // Create new slide from template
        newSlideId = await slides.addSlideFromTemplate(
          templateSlideId,
          replacements,
          insertAtIndex,
          presentationId
        );
      } else {
        // Update existing placeholders in the presentation
        await slides.updateSlideText(replacements, presentationId);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                weekEnding,
                newSlideId,
                stats: {
                  completedCount: completed.length,
                  inProgressCount: inProgress.length,
                  blockersCount: blockers.length,
                  velocityPoints,
                },
                message: templateSlideId
                  ? 'Created new weekly update slide from template'
                  : 'Updated weekly placeholders in presentation',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_delete_slide': {
      const { slideId, presentationUrl } = args as { slideId: string; presentationUrl?: string };
      const slides = getSlidesService();
      const presentationId = resolvePresentationId({ presentationUrl });
      await slides.deleteSlide(slideId, presentationId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                message: `Slide ${slideId} deleted successfully`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'slides_create_table': {
      const {
        slideId,
        presentationUrl,
        data,
        headerRow = true,
        position,
        size,
      } = args as {
        slideId: string;
        presentationUrl?: string;
        data: string[][];
        headerRow?: boolean;
        position?: { x: number; y: number };
        size?: { width: number; height: number };
      };
      const slides = getSlidesService();
      const presentationId = resolvePresentationId({ presentationUrl });

      const tableId = await slides.createTable(
        slideId,
        data,
        { position, size, headerRow },
        presentationId
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                presentationId: presentationId || slides.getPresentationId(),
                slideId,
                tableId,
                rows: data.length,
                columns: data[0]?.length || 0,
                message: 'Table created successfully',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Slack tool handlers
    case 'slack_lookup_user': {
      const { email } = args as { email: string };
      const op = slackLogger.startOperation('lookupUserByEmail');

      try {
        ensureSlackInitialized();
        const result = await slackClient.users.lookupByEmail({ email });

        if (!result.ok || !result.user) {
          throw new Error(`User not found for email: ${email}`);
        }

        const user = result.user;
        op.success('User found', { email, userId: user.id });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error), { email });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `Failed to lookup user: ${error instanceof Error ? error.message : String(error)}`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }

    case 'slack_send_dm': {
      const { userIdOrEmail, message, ccUsers } = args as {
        userIdOrEmail: string;
        message: string;
        ccUsers?: string[];
      };
      const op = slackLogger.startOperation('sendDM');

      // Helper function to resolve email to user ID
      const resolveUserId = async (idOrEmail: string): Promise<string> => {
        if (idOrEmail.includes('@')) {
          slackLogger.debug('Looking up user by email', { email: idOrEmail });
          const lookupResult = await slackClient.users.lookupByEmail({ email: idOrEmail });
          if (!lookupResult.ok || !lookupResult.user?.id) {
            throw new Error(`User not found for email: ${idOrEmail}`);
          }
          slackLogger.debug('Found user', { email: idOrEmail, userId: lookupResult.user.id });
          return lookupResult.user.id;
        }
        return idOrEmail;
      };

      try {
        ensureSlackInitialized();

        // Resolve primary recipient
        const primaryUserId = await resolveUserId(userIdOrEmail);

        // Resolve CC users if provided
        const allUserIds: string[] = [primaryUserId];
        if (ccUsers && ccUsers.length > 0) {
          for (const ccUser of ccUsers) {
            const ccUserId = await resolveUserId(ccUser);
            if (!allUserIds.includes(ccUserId)) {
              allUserIds.push(ccUserId);
            }
          }
        }

        // Open a DM or group DM conversation
        const conversationResult = await slackClient.conversations.open({
          users: allUserIds.join(','),
        });
        if (!conversationResult.ok || !conversationResult.channel?.id) {
          throw new Error('Failed to open DM conversation');
        }

        const channelId = conversationResult.channel.id;
        const isGroupDM = allUserIds.length > 1;

        // Send the message
        const sendResult = await slackClient.chat.postMessage({
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: isGroupDM
                    ? 'Group DM sent successfully'
                    : 'Direct message sent successfully',
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error), { userIdOrEmail });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `Failed to send DM: ${error instanceof Error ? error.message : String(error)}`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }

    case 'slack_send_channel_message': {
      const { channel, message } = args as { channel: string; message: string };
      const op = slackLogger.startOperation('sendChannelMessage');

      try {
        ensureSlackInitialized();

        // Send the message to the channel
        const sendResult = await slackClient.chat.postMessage({
          channel,
          text: message,
        });

        if (!sendResult.ok) {
          throw new Error('Failed to send message');
        }

        op.success('Channel message sent', { channel, ts: sendResult.ts });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error), { channel });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `Failed to send channel message: ${error instanceof Error ? error.message : String(error)}`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }

    case 'slack_get_channel_messages': {
      const { channel, limit, oldest, latest, includeReplies } = args as {
        channel: string;
        limit?: number;
        oldest?: string;
        latest?: string;
        includeReplies?: boolean;
      };
      const op = slackLogger.startOperation('getChannelMessages');

      try {
        ensureSlackInitialized();

        // Resolve channel name to ID if needed
        let channelId = channel;
        const channelName = channel.replace(/^#/, ''); // Remove # prefix if present

        // If it looks like a channel name (not an ID), look it up
        if (!channel.startsWith('C') && !channel.startsWith('G')) {
          slackLogger.debug('Looking up channel by name', { channelName });

          // Use conversations.list to find the channel
          let cursor: string | undefined;
          let foundChannel = false;

          do {
            const listResult = await slackClient.conversations.list({
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

        // Convert date strings to Unix timestamps
        const oldestTs = oldest ? (new Date(oldest).getTime() / 1000).toString() : undefined;
        const latestTs = latest ? (new Date(latest).getTime() / 1000).toString() : undefined;

        // Fetch messages using conversations.history
        const historyResult = await slackClient.conversations.history({
          channel: channelId,
          limit: Math.min(limit || 100, 1000),
          oldest: oldestTs,
          latest: latestTs,
          inclusive: true,
        });

        if (!historyResult.ok) {
          throw new Error('Failed to fetch channel history');
        }

        // Process messages
        const messages = (historyResult.messages || []).map(
          (msg: {
            text?: string;
            user?: string;
            ts?: string;
            thread_ts?: string;
            reply_count?: number;
            reactions?: Array<{ name?: string; count?: number }>;
            subtype?: string;
          }) => ({
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
            // Include basic subtype info (e.g., bot_message, channel_join)
            subtype: msg.subtype,
          })
        );

        // Optionally fetch thread replies for messages that have them
        if (includeReplies) {
          for (const msg of messages) {
            if (msg.threadTs && msg.replyCount && msg.replyCount > 0) {
              try {
                const repliesResult = await slackClient.conversations.replies({
                  channel: channelId,
                  ts: msg.threadTs,
                });

                if (repliesResult.ok && repliesResult.messages) {
                  // Skip the first message (it's the parent) and get replies
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error), { channel });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `Failed to get channel messages: ${error instanceof Error ? error.message : String(error)}`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }

    // WhatsApp Message Database tool handlers
    case 'whatsapp_search_messages': {
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: messages.length,
                  messages: messages.map(
                    (m: {
                      id: number;
                      direction: string;
                      phone: string;
                      text: string;
                      isGroup: boolean;
                      groupId: string | null;
                      timestamp: Date;
                      mediaType: string | null;
                    }) => ({
                      id: m.id,
                      direction: m.direction,
                      phone: m.phone,
                      text: m.text,
                      isGroup: m.isGroup,
                      groupId: m.groupId,
                      timestamp: m.timestamp,
                      mediaType: m.mediaType,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_get_recent': {
      const { limit = 50 } = args as { limit?: number };
      const op = whatsappLogger.startOperation('getRecentMessages');

      try {
        const db = await getMessageDatabase();
        const messages = await db.getRecentMessages(limit);
        op.success('Retrieved recent messages', { count: messages.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: messages.length,
                  messages: messages.map(
                    (m: {
                      id: number;
                      direction: string;
                      phone: string;
                      text: string;
                      isGroup: boolean;
                      groupId: string | null;
                      timestamp: Date;
                      mediaType: string | null;
                    }) => ({
                      id: m.id,
                      direction: m.direction,
                      phone: m.phone,
                      text: m.text,
                      isGroup: m.isGroup,
                      groupId: m.groupId,
                      timestamp: m.timestamp,
                      mediaType: m.mediaType,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to get recent messages: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_get_conversation': {
      const { phone, limit = 100 } = args as { phone: string; limit?: number };
      const op = whatsappLogger.startOperation('getConversation');

      try {
        const db = await getMessageDatabase();
        const messages = await db.getConversationHistory(phone, limit);
        op.success('Retrieved conversation', { phone, count: messages.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  phone,
                  count: messages.length,
                  messages: messages.map(
                    (m: {
                      id: number;
                      direction: string;
                      text: string;
                      timestamp: Date;
                      mediaType: string | null;
                      transcribedText: string | null;
                    }) => ({
                      id: m.id,
                      direction: m.direction,
                      text: m.text,
                      timestamp: m.timestamp,
                      mediaType: m.mediaType,
                      transcribedText: m.transcribedText,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error), { phone });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to get conversation: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_get_group_messages': {
      const { groupId, limit = 100 } = args as { groupId: string; limit?: number };
      const op = whatsappLogger.startOperation('getGroupMessages');

      try {
        const db = await getMessageDatabase();

        // Try to find the group by name first if it doesn't look like a JID
        let actualGroupId = groupId;
        if (!groupId.includes('@')) {
          const group = await db.findGroupByName(groupId);
          if (group) {
            actualGroupId = group.groupId;
            whatsappLogger.debug('Resolved group name to ID', { name: groupId, id: actualGroupId });
          }
        }

        const messages = await db.getMessagesByGroup(actualGroupId, limit);
        const groupInfo = await db.getGroup(actualGroupId);

        op.success('Retrieved group messages', { groupId: actualGroupId, count: messages.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  groupId: actualGroupId,
                  groupName: groupInfo?.groupName || null,
                  groupSubject: groupInfo?.groupSubject || null,
                  count: messages.length,
                  messages: messages.map(
                    (m: {
                      id: number;
                      direction: string;
                      phone: string;
                      text: string;
                      timestamp: Date;
                      mediaType: string | null;
                    }) => ({
                      id: m.id,
                      direction: m.direction,
                      phone: m.phone,
                      text: m.text,
                      timestamp: m.timestamp,
                      mediaType: m.mediaType,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error), { groupId });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to get group messages: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_get_stats': {
      const op = whatsappLogger.startOperation('getStats');

      try {
        const db = await getMessageDatabase();
        const stats = await db.getStats();
        const mediaStats = await db.getMediaStats();

        op.success('Retrieved stats', { totalMessages: stats.totalMessages });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...stats,
                  media: mediaStats,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_list_contacts': {
      const op = whatsappLogger.startOperation('listContacts');

      try {
        const db = await getMessageDatabase();
        const contacts = await db.getUniqueContacts();

        op.success('Retrieved contacts', { count: contacts.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: contacts.length,
                  contacts,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list contacts: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_list_groups': {
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

        // Also get groups without names (from messages table)
        const groupIdsWithoutNames = await db.getGroupsWithoutNames();

        op.success('Retrieved groups', {
          namedGroups: groups.length,
          unnamedGroups: groupIdsWithoutNames.length,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  namedGroupsCount: groups.length,
                  unnamedGroupsCount: groupIdsWithoutNames.length,
                  groups: groups.map((g) => ({
                    groupId: g.groupId,
                    name: g.groupName,
                    subject: g.groupSubject,
                    participantCount: g.participantCount,
                    lastUpdated: g.lastUpdated,
                  })),
                  groupsWithoutNames: groupIdsWithoutNames,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list groups: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_get_media': {
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: messages.length,
                  mediaType: mediaType || 'all',
                  messages: messages.map(
                    (m: {
                      id: number;
                      direction: string;
                      phone: string;
                      text: string;
                      isGroup: boolean;
                      groupId: string | null;
                      timestamp: Date;
                      mediaType: string | null;
                      mediaPath: string | null;
                      mediaMimeType: string | null;
                      transcribedText: string | null;
                      transcribedLanguage: string | null;
                    }) => ({
                      id: m.id,
                      direction: m.direction,
                      phone: m.phone,
                      text: m.text,
                      isGroup: m.isGroup,
                      groupId: m.groupId,
                      timestamp: m.timestamp,
                      mediaType: m.mediaType,
                      mediaPath: m.mediaPath,
                      mediaMimeType: m.mediaMimeType,
                      transcribedText: m.transcribedText,
                      transcribedLanguage: m.transcribedLanguage,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to get media: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_send_poll': {
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
        // Call the WhatsApp bot's API server to send the poll
        const baseUrl =
          process.env.WHATSAPP_API_BASE ||
          `http://127.0.0.1:${process.env.WHATSAPP_API_PORT || '4097'}`;
        const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/send-poll`, {
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  pollId: result.pollId,
                  question,
                  options,
                  message: 'Poll sent successfully! The user will see it in their WhatsApp chat.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to send poll: ${error instanceof Error ? error.message : String(error)}`,
                hint: 'Make sure the WhatsApp bot is running and connected.',
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'whatsapp_send_message': {
      const { message } = args as { message: string };
      const op = whatsappLogger.startOperation('sendMessage');

      try {
        // Call the WhatsApp bot's API server to send the message
        const baseUrl =
          process.env.WHATSAPP_API_BASE ||
          `http://127.0.0.1:${process.env.WHATSAPP_API_PORT || '4097'}`;
        const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });

        const result = (await response.json()) as { success?: boolean; error?: string };

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to send message');
        }

        op.success('Message sent', { length: message.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Message sent successfully!',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
                hint: 'Make sure the WhatsApp bot is running and connected.',
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'orient_whatsapp_send_image': {
      const { imageUrl, imagePath, caption, jid } = args as {
        imageUrl?: string;
        imagePath?: string;
        caption?: string;
        jid?: string;
      };
      const op = whatsappLogger.startOperation('sendImage');

      if (!imageUrl && !imagePath) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Either imageUrl or imagePath is required',
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const baseUrl =
          process.env.WHATSAPP_API_BASE ||
          `http://127.0.0.1:${process.env.WHATSAPP_API_PORT || '4097'}`;
        const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/send-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jid, imageUrl, imagePath, caption }),
        });

        const result = (await response.json()) as {
          success?: boolean;
          error?: string;
          messageId?: string;
        };

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to send image');
        }

        op.success('Image sent via WhatsApp', { messageId: result.messageId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Image sent successfully!',
                  messageId: result.messageId,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to send image: ${error instanceof Error ? error.message : String(error)}`,
                hint: 'Make sure the WhatsApp bot is running and connected.',
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'orient_slack_send_image': {
      const { channel, imageUrl, imagePath, caption, filename } = args as {
        channel: string;
        imageUrl?: string;
        imagePath?: string;
        caption?: string;
        filename?: string;
      };
      const op = slackLogger.startOperation('sendImage');

      if (!imageUrl && !imagePath) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Either imageUrl or imagePath is required',
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        ensureSlackInitialized();

        // Resolve image to buffer
        let fileBuffer: Buffer;
        let resolvedFilename: string;

        if (imageUrl) {
          const imgResponse = await fetch(imageUrl);
          if (!imgResponse.ok) {
            throw new Error(
              `Failed to fetch image from URL: ${imgResponse.status} ${imgResponse.statusText}`
            );
          }
          const arrayBuffer = await imgResponse.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
          // Extract filename from URL or use provided filename
          resolvedFilename = filename || path.basename(new URL(imageUrl).pathname) || 'image.png';
        } else {
          const fs = await import('fs');
          if (!fs.existsSync(imagePath!)) {
            throw new Error(`File not found: ${imagePath}`);
          }
          fileBuffer = fs.readFileSync(imagePath!);
          resolvedFilename = filename || path.basename(imagePath!);
        }

        // Upload and share the image using Slack's files.uploadV2
        const uploadResult = await slackClient.files.uploadV2({
          channel_id: channel.replace(/^#/, ''),
          file: fileBuffer,
          filename: resolvedFilename,
          initial_comment: caption || undefined,
        });

        op.success('Image uploaded to Slack', { channel, filename: resolvedFilename });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Image uploaded and shared successfully!',
                  details: {
                    channel,
                    filename: resolvedFilename,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error), { channel });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `Failed to upload image: ${error instanceof Error ? error.message : String(error)}`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }

    // ========== Skill Management Tools ==========

    case 'skills_list': {
      const op = skillLogger.startOperation('listSkills');

      try {
        const skills = await getSkillsService();
        const skillList = skills.listSkills();

        op.success('Skills listed', { count: skillList.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: skillList.length,
                  skills: skillList.map((s) => ({
                    name: s.name,
                    description: s.description,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list skills: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'skills_read': {
      const { name: skillName } = args as { name: string };
      const op = skillLogger.startOperation('readSkill', { skillName });

      try {
        const skills = await getSkillsService();
        const skill = skills.readSkill(skillName);

        if (!skill) {
          op.failure(new Error(`Skill not found: ${skillName}`));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Skill "${skillName}" not found`,
                  hint: 'Use skills_list to see available skills.',
                }),
              },
            ],
            isError: true,
          };
        }

        op.success('Skill read', { skillName, contentLength: skill.content.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  name: skill.name,
                  description: skill.description,
                  content: skill.content,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to read skill: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'skills_create_async': {
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
        // Check admin permission - support both phone (WhatsApp) and Slack user ID
        let isAdmin = false;
        if (slackUserId) {
          isAdmin = isSkillEditingAdmin(slackUserId, 'slack');
        } else if (userPhone) {
          isAdmin = isSkillEditingAdmin(userPhone, 'phone');
        }

        if ((userPhone || slackUserId) && !isAdmin) {
          op.failure(new Error('Permission denied'));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Permission denied. Skill creation is restricted to admin users.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Check if required services are available
        const github = getGitHubService();
        const worktree = getWorktreeService();

        if (!github || !worktree) {
          op.failure(new Error('Skill editing services not configured'));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Skill editing is not configured. Missing GITHUB_TOKEN or GITHUB_REPO.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Check if skill already exists
        const skills = await getSkillsService();
        if (skills.hasSkill(skillName)) {
          op.failure(new Error('Skill already exists'));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Skill "${skillName}" already exists. Use skills_edit_async to modify it.`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Start background job (fire and forget)
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

        // Execute skill creation and wait for PR
        const result = await executeSkillCreationAsync(skillSpec, notificationConfig);

        op.success('Skill PR created', { skillName, prNumber: result?.prNumber });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `✅ Skill PR created for "${skillName}"`,
                  prNumber: result?.prNumber,
                  prUrl: result?.prUrl,
                  skillName,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to start skill creation: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'skills_edit_async': {
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
        // Check admin permission - support both phone (WhatsApp) and Slack user ID
        let isAdmin = false;
        if (slackUserId) {
          isAdmin = isSkillEditingAdmin(slackUserId, 'slack');
        } else if (userPhone) {
          isAdmin = isSkillEditingAdmin(userPhone, 'phone');
        }

        if ((userPhone || slackUserId) && !isAdmin) {
          op.failure(new Error('Permission denied'));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Permission denied. Skill editing is restricted to admin users.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Check if required services are available
        const github = getGitHubService();
        const worktree = getWorktreeService();

        if (!github || !worktree) {
          op.failure(new Error('Skill editing services not configured'));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Skill editing is not configured. Missing GITHUB_TOKEN or GITHUB_REPO.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Check if skill exists
        const skills = await getSkillsService();
        if (!skills.hasSkill(skillName)) {
          op.failure(new Error('Skill not found'));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Skill "${skillName}" does not exist. Use skills_create_async to create it.`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Start background job (fire and forget)
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

        // Execute skill edit and wait for PR
        const result = await executeSkillCreationAsync(skillSpec, notificationConfig);

        op.success('Skill PR created', { skillName, prNumber: result?.prNumber });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `✅ Skill PR created for "${skillName}"`,
                  prNumber: result?.prNumber,
                  prUrl: result?.prUrl,
                  skillName,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to start skill edit: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'skills_list_prs': {
      const op = skillLogger.startOperation('listSkillPRs');

      try {
        const github = getGitHubService();

        if (!github) {
          op.failure(new Error('GitHub service not configured'));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'GitHub service is not configured. Missing GITHUB_TOKEN or GITHUB_REPO.',
                }),
              },
            ],
            isError: true,
          };
        }

        const prs = await github.listSkillPRs();

        op.success('Listed skill PRs', { count: prs.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list skill PRs: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'skills_reload': {
      const op = skillLogger.startOperation('reloadSkills');

      try {
        const skills = await getSkillsService();
        const result = await skills.reload();

        op.success('Skills reloaded', result);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Skills reloaded successfully',
                  previous: result.previous,
                  current: result.current,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to reload skills: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // Google OAuth Tools
    // =========================================================================

    case 'google_oauth_connect': {
      const op = googleLogger.startOperation('connect');

      try {
        const googleOAuth = getGoogleOAuthService();
        const email = await googleOAuth.connectAccount(GOOGLE_DEFAULT_SCOPES);

        op.success('Google account connected', { email });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Successfully connected Google account: ${email}`,
                  email,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to connect Google account: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_oauth_list_accounts': {
      const op = googleLogger.startOperation('listAccounts');

      try {
        const googleOAuth = getGoogleOAuthService();
        const accounts = googleOAuth.getConnectedAccounts();

        op.success('Listed connected accounts', { count: accounts.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: accounts.length,
                  accounts: accounts.map(
                    (a: {
                      email: string;
                      displayName?: string;
                      connectedAt: number;
                      scopes: string[];
                    }) => ({
                      email: a.email,
                      displayName: a.displayName,
                      connectedAt: new Date(a.connectedAt).toISOString(),
                      scopeCount: a.scopes.length,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list accounts: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_oauth_disconnect': {
      const op = googleLogger.startOperation('disconnect');
      const { email } = args as { email: string };

      try {
        const googleOAuth = getGoogleOAuthService();
        const success = googleOAuth.disconnectAccount(email);

        if (success) {
          op.success('Account disconnected', { email });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Disconnected Google account: ${email}`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } else {
          op.failure('Account not found');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Account not found: ${email}` }),
              },
            ],
            isError: true,
          };
        }
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to disconnect: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // Gmail Tools
    case 'google_gmail_list_messages': {
      const op = googleLogger.startOperation('gmailListMessages');
      const { query, maxResults, unreadOnly, label, accountEmail } = args as {
        query?: string;
        maxResults?: number;
        unreadOnly?: boolean;
        label?: string;
        accountEmail?: string;
      };

      try {
        const gmail = getGmailService();
        const messages = await gmail.listMessages(
          {
            query,
            maxResults,
            unreadOnly,
            label,
          },
          accountEmail
        );

        op.success('Messages listed', { count: messages.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: messages.length,
                  messages: messages.map(
                    (m: {
                      id: string;
                      subject: string;
                      from: string;
                      date: Date;
                      snippet: string;
                      isUnread: boolean;
                      labels: string[];
                    }) => ({
                      id: m.id,
                      subject: m.subject,
                      from: m.from,
                      date: m.date.toISOString(),
                      snippet: m.snippet,
                      isUnread: m.isUnread,
                      labels: m.labels,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list messages: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_gmail_get_message': {
      const op = googleLogger.startOperation('gmailGetMessage');
      const { messageId, accountEmail } = args as { messageId: string; accountEmail?: string };

      try {
        const gmail = getGmailService();
        const message = await gmail.getMessage(messageId, accountEmail);

        op.success('Message retrieved', { messageId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to get message: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_gmail_send': {
      const op = googleLogger.startOperation('gmailSend');
      const { to, subject, body, cc, bcc, accountEmail } = args as {
        to: string;
        subject: string;
        body: string;
        cc?: string[];
        bcc?: string[];
        accountEmail?: string;
      };

      try {
        const gmail = getGmailService();
        const messageId = await gmail.sendMessage(
          {
            to,
            subject,
            body,
            cc,
            bcc,
          },
          accountEmail
        );

        op.success('Email sent', { messageId, to });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Email sent successfully to ${to}`,
                  messageId,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_gmail_create_draft': {
      const op = googleLogger.startOperation('gmailCreateDraft');
      const { to, subject, body, accountEmail } = args as {
        to: string;
        subject: string;
        body: string;
        accountEmail?: string;
      };

      try {
        const gmail = getGmailService();
        const draftId = await gmail.createDraft(
          {
            to,
            subject,
            body,
          },
          accountEmail
        );

        op.success('Draft created', { draftId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Draft created successfully',
                  draftId,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to create draft: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // Calendar Tools
    case 'google_calendar_list_events': {
      const op = googleLogger.startOperation('calendarListEvents');
      const { calendarId, days, maxResults, query, accountEmail } = args as {
        calendarId?: string;
        days?: number;
        maxResults?: number;
        query?: string;
        accountEmail?: string;
      };

      try {
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

        op.success('Events listed', { count: events.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: events.length,
                  events: events.map(
                    (e: {
                      id: string;
                      title: string;
                      startTime: Date;
                      endTime: Date;
                      location?: string;
                      isAllDay: boolean;
                      meetingLink?: string;
                      attendees: Array<unknown>;
                    }) => ({
                      id: e.id,
                      title: e.title,
                      startTime: e.startTime.toISOString(),
                      endTime: e.endTime.toISOString(),
                      location: e.location,
                      isAllDay: e.isAllDay,
                      meetingLink: e.meetingLink,
                      attendees: e.attendees.length,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list events: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_calendar_create_event': {
      const op = googleLogger.startOperation('calendarCreateEvent');
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

        op.success('Event created', { eventId: event.id });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to create event: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_calendar_update_event': {
      const op = googleLogger.startOperation('calendarUpdateEvent');
      const {
        eventId,
        title,
        startTime,
        endTime,
        description,
        location,
        calendarId,
        accountEmail,
      } = args as {
        eventId: string;
        title?: string;
        startTime?: string;
        endTime?: string;
        description?: string;
        location?: string;
        calendarId?: string;
        accountEmail?: string;
      };

      try {
        const calendar = getCalendarService();
        const event = await calendar.updateEvent(
          {
            eventId,
            title,
            startTime: startTime ? new Date(startTime) : undefined,
            endTime: endTime ? new Date(endTime) : undefined,
            description,
            location,
            calendarId: calendarId || 'primary',
          },
          accountEmail
        );

        op.success('Event updated', { eventId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to update event: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_calendar_delete_event': {
      const op = googleLogger.startOperation('calendarDeleteEvent');
      const { eventId, calendarId, accountEmail } = args as {
        eventId: string;
        calendarId?: string;
        accountEmail?: string;
      };

      try {
        const calendar = getCalendarService();
        await calendar.deleteEvent(eventId, calendarId || 'primary', accountEmail);

        op.success('Event deleted', { eventId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Event deleted successfully',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to delete event: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // Tasks Tools
    case 'google_tasks_list': {
      const op = googleLogger.startOperation('tasksList');
      const { taskListId, showCompleted, maxResults, accountEmail } = args as {
        taskListId?: string;
        showCompleted?: boolean;
        maxResults?: number;
        accountEmail?: string;
      };

      try {
        const tasks = getTasksService();
        const taskItems = await tasks.listTasks(
          {
            taskListId,
            showCompleted,
            maxResults,
          },
          accountEmail
        );

        op.success('Tasks listed', { count: taskItems.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: taskItems.length,
                  tasks: taskItems.map(
                    (t: {
                      id: string;
                      title: string;
                      notes?: string;
                      due?: Date;
                      status: string;
                    }) => ({
                      id: t.id,
                      title: t.title,
                      notes: t.notes,
                      dueDate: t.due?.toISOString(),
                      status: t.status,
                    })
                  ),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_tasks_create': {
      const op = googleLogger.startOperation('tasksCreate');
      const { title, notes, dueDate, taskListId, accountEmail } = args as {
        title: string;
        notes?: string;
        dueDate?: string;
        taskListId?: string;
        accountEmail?: string;
      };

      try {
        const tasks = getTasksService();
        const task = await tasks.createTask(
          {
            title,
            notes,
            due: dueDate ? new Date(dueDate) : undefined,
            taskListId,
          },
          accountEmail
        );

        op.success('Task created', { taskId: task.id });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Task created: ${task.title}`,
                  task: {
                    id: task.id,
                    title: task.title,
                    notes: task.notes,
                    dueDate: task.due?.toISOString(),
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_tasks_complete': {
      const op = googleLogger.startOperation('tasksComplete');
      const { taskId, taskListId, accountEmail } = args as {
        taskId: string;
        taskListId?: string;
        accountEmail?: string;
      };

      try {
        const tasks = getTasksService();
        const task = await tasks.completeTask(taskId, taskListId || '@default', accountEmail);

        op.success('Task completed', { taskId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_tasks_update': {
      const op = googleLogger.startOperation('tasksUpdate');
      const { taskId, title, notes, dueDate, taskListId, accountEmail } = args as {
        taskId: string;
        title?: string;
        notes?: string;
        dueDate?: string;
        taskListId?: string;
        accountEmail?: string;
      };

      try {
        const tasks = getTasksService();
        const task = await tasks.updateTask(
          {
            taskId,
            title,
            notes,
            due: dueDate ? new Date(dueDate) : undefined,
            taskListId: taskListId || '@default',
          },
          accountEmail
        );

        op.success('Task updated', { taskId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to update task: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // Sheets Tools (OAuth-based)
    case 'google_sheets_read': {
      const op = googleLogger.startOperation('sheetsRead');
      const { spreadsheetId, range, accountEmail } = args as {
        spreadsheetId: string;
        range: string;
        accountEmail?: string;
      };

      try {
        const sheets = getSheetsOAuthService();
        const values = await sheets.readRange(spreadsheetId, range, accountEmail);

        op.success('Sheet range read', { rowCount: values.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  range,
                  rowCount: values.length,
                  values,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to read sheet: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_sheets_write': {
      const op = googleLogger.startOperation('sheetsWrite');
      const { spreadsheetId, range, values, accountEmail } = args as {
        spreadsheetId: string;
        range: string;
        values: unknown[][];
        accountEmail?: string;
      };

      try {
        const sheets = getSheetsOAuthService();
        const updatedCells = await sheets.writeRange(
          spreadsheetId,
          { range, values },
          accountEmail
        );

        op.success('Sheet range written', { updatedCells });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Updated ${updatedCells} cells`,
                  range,
                  updatedCells,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to write sheet: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // Slides Tools (OAuth-based)
    case 'google_slides_get': {
      const op = googleLogger.startOperation('slidesGet');
      const { presentationId, accountEmail } = args as {
        presentationId: string;
        accountEmail?: string;
      };

      try {
        const slides = getSlidesOAuthService();
        const presentation = await slides.getPresentation(presentationId, accountEmail);

        op.success('Presentation retrieved', { slideCount: presentation.slides.length });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: presentation.presentationId,
                  title: presentation.title,
                  url: presentation.url,
                  slideCount: presentation.slides.length,
                  slides: presentation.slides,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to get presentation: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'google_slides_update': {
      const op = googleLogger.startOperation('slidesUpdate');
      const { presentationId, replacements, slideId, accountEmail } = args as {
        presentationId: string;
        replacements: Array<{ placeholder: string; replacement: string }>;
        slideId?: string;
        accountEmail?: string;
      };

      try {
        const slides = getSlidesOAuthService();

        // The slides-oauth service only has replaceText which replaces globally
        await slides.replaceText(presentationId, replacements, accountEmail);

        op.success('Presentation updated', { replacementCount: replacements.length, slideId });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Applied ${replacements.length} text replacements`,
                  slideId: slideId || 'all slides',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to update presentation: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // =========================================================================
    // Mini-Apps Tools
    // =========================================================================

    case 'apps_create': {
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

        // Step 1: Generate the app using AI
        const generated = await generator.generateApp({
          prompt,
          name: appName,
          author,
        });

        appsLogger.info('App generated', {
          name: generated.manifest.name,
          title: generated.manifest.title,
        });

        // Step 2: Create PR if git services are available
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
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to create app: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'apps_list': {
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

        // Filter by status if specified
        if (status && status !== 'all') {
          apps = apps.filter((app: { status: string }) => app.status === status);
        }

        // Apply limit
        const maxLimit = limit || 50;
        apps = apps.slice(0, maxLimit);

        const result = {
          total: apps.length,
          apps: apps.map(
            (app: {
              name: string;
              title: string;
              description: string;
              version: string;
              status: string;
              isBuilt: boolean;
              author?: string;
            }) => ({
              name: app.name,
              title: app.title,
              description: app.description,
              version: app.version,
              status: app.status,
              isBuilt: app.isBuilt,
              author: app.author,
            })
          ),
        };

        op.success('Apps listed', { count: apps.length });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list apps: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'apps_get': {
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
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  found: false,
                  message: `App "${appName}" not found. Use apps_list to see available apps.`,
                }),
              },
            ],
          };
        }

        // Build permissions object
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
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to get app: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'apps_share': {
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

        // Generate a share token
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
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to share app: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    case 'apps_update': {
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

        // Read existing code
        const fs = await import('fs');
        const pathMod = await import('path');
        const appTsxPath = pathMod.join(existingApp.srcPath, 'App.tsx');
        if (!fs.existsSync(appTsxPath)) {
          throw new Error(`App source file not found: ${appTsxPath}`);
        }
        const existingCode = fs.readFileSync(appTsxPath, 'utf-8');

        appsLogger.info('Updating app', { name: appName, requestLength: updateRequest.length });

        // Generate updated app
        const updated = await generator.updateApp(
          existingApp.manifest,
          existingCode,
          updateRequest
        );

        appsLogger.info('App updated', {
          name: updated.manifest.name,
          version: updated.manifest.version,
        });

        // Create PR if services available
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
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to update app: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // ============================================
    // MEDIA GENERATION TOOLS
    // ============================================

    case 'media_generate_mascot': {
      const mediaLogger = createServiceLogger('media-tools');
      const op = mediaLogger.startOperation('generateMascot', args);

      try {
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
          throw new Error('Prompt is required and must be at least 5 characters');
        }

        // Load base mascot image
        const fs = await import('fs');
        const pathMod = await import('path');
        const baseMascotPath = pathMod.join(
          process.cwd(),
          'packages/dashboard-frontend/public/mascot/base.png'
        );

        if (!fs.existsSync(baseMascotPath)) {
          throw new Error(
            'Base mascot image not found. Please place base.png in packages/dashboard-frontend/public/mascot/'
          );
        }

        const baseImageBuffer = fs.readFileSync(baseMascotPath);

        mediaLogger.info('Generating mascot variation', { variation_type, prompt, transparent });

        let imageBuffer: Buffer;

        if (transparent) {
          // Use OpenAI for transparent backgrounds
          const { getEnvWithSecrets } = await import('@orientbot/core');
          const apiKey = getEnvWithSecrets('OPENAI_API_KEY');
          if (!apiKey) {
            throw new Error(
              'OPENAI_API_KEY not set. Required for transparent background generation.'
            );
          }

          const OpenAI = await import('openai');
          const client = new OpenAI.default({ apiKey });

          // Use OpenAI's toFile utility for proper File handling
          const imageFile = await OpenAI.toFile(baseImageBuffer, 'mascot.png', {
            type: 'image/png',
          });

          // Build the prompt with mascot reference
          const fullPrompt = `Using this cartoon border collie dog mascot with blue bandana as the style reference: ${prompt}

CRITICAL: Generate PNG with TRANSPARENT background. Keep same cartoon style with clean lines and flat colors. No background elements.`;

          mediaLogger.info('Generating mascot with OpenAI (transparent)', {
            variation_type,
            prompt,
          });

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
            throw new Error('No image data returned from OpenAI');
          }

          imageBuffer = Buffer.from(imageData.b64_json, 'base64');
        } else {
          // Use Gemini for regular images
          const { createGeminiService } = await import('@orientbot/integrations/gemini');
          const geminiService = createGeminiService();

          const result = await geminiService.generateMascotVariation(baseImageBuffer, {
            variationType: variation_type,
            prompt,
          });

          if (!result.success || !result.imageBase64) {
            throw new Error(result.error || 'Failed to generate mascot variation');
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
        mediaLogger.info('Mascot variation saved', { path: outputPath, transparent });

        op.success('Mascot variation generated', { filename, transparent });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
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
              ),
            },
          ],
        };
      } catch (error) {
        op.failure(error instanceof Error ? error : String(error));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to generate mascot: ${error instanceof Error ? error.message : String(error)}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // ============================================
    // AGENT ORCHESTRATION TOOLS
    // ============================================

    case 'agents_get_context': {
      const { getAgentContextTool } = await import('@orientbot/mcp-tools');
      const minContext = {
        correlationId: '',
        config: getRawConfig() as unknown as import('@orientbot/core').AppConfig,
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
    }

    case 'agents_list': {
      const { listAgentsTool } = await import('@orientbot/mcp-tools');
      const minContext = {
        correlationId: '',
        config: getRawConfig() as unknown as import('@orientbot/core').AppConfig,
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
    }

    case 'agents_handoff': {
      const { handoffToAgentTool } = await import('@orientbot/mcp-tools');
      const minContext = {
        correlationId: '',
        config: getRawConfig() as unknown as import('@orientbot/core').AppConfig,
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
    }

    // Context persistence tools
    case 'context_read': {
      const { readContextTool } = await import('@orientbot/mcp-tools');
      const minContext = {
        correlationId: '',
        config: getRawConfig() as unknown as import('@orientbot/core').AppConfig,
        // Note: platform and chatId should be passed via request metadata in production
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
    }

    case 'context_update': {
      const { updateContextTool } = await import('@orientbot/mcp-tools');
      const minContext = {
        correlationId: '',
        config: getRawConfig() as unknown as import('@orientbot/core').AppConfig,
        // Note: platform and chatId should be passed via request metadata in production
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
    }

    default:
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      };
  }
}

// Start the server
async function main() {
  serverLogger.info('Starting MCP server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  serverLogger.info('Orient MCP Server running on stdio', {
    tools: tools.map((t) => t.name),
  });
}

main().catch((error) => {
  serverLogger.error('Failed to start MCP server', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
