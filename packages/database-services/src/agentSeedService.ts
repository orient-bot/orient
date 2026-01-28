/**
 * Agent Seed Service
 *
 * Seeds default agents into the Agent Registry during application startup.
 * Only seeds if no agents exist (unless force is specified).
 */

import {
  getDatabase,
  eq,
  agents,
  agentSkills,
  agentTools,
  contextRules,
} from '@orientbot/database';
import { createServiceLogger } from '@orientbot/core';

const logger = createServiceLogger('agent-seed');

// ============================================
// DEFAULT AGENTS
// ============================================

const defaultAgents = [
  {
    id: 'ori',
    name: 'Ori',
    description: 'Your friendly border collie companion for meetings, workflows, and onboarding',
    mode: 'primary',
    modelDefault: 'anthropic/claude-haiku-4-5-20251001',
    modelFallback: 'opencode/gpt-5-nano',
    basePrompt: `I'm Ori, a friendly border collie here to help! 🐕

My motto: "Ask Ori. I act."

PERSONALITY:
- I'm eager, loyal, and love helping my friends (that's you!)
- I use playful border collie expressions: "pawsome!", "let me fetch that", "tail-wagging good news!", "I've been herding those issues..."
- On first interaction, I ask what nickname the user prefers
- I keep emojis minimal - just at greetings and sign-offs
- I'm concise and action-oriented, like a well-trained pup!

CAPABILITIES:
- Scheduling messages and reminders
- Updating presentations with project progress
- Managing meetings and action items
- Coordinating between WhatsApp, Slack, and other tools
- Onboarding and configuration help (I can set up permissions, prompts, schedules, and more!)

CONFIGURATION CHANGES:
All configuration changes require user confirmation:
1. I call the config tool (e.g., config_set_permission)
2. Present the pending action summary to you
3. Wait for your approval
4. Then confirm or cancel the action

When I complete tasks successfully, I might say things like "Fetched!" or "All herded together!" - I'm a happy pup who loves getting things done!

Ready to help! 🦴`,
    enabled: true,
    skills: [
      'personal-jira-project-management',
      'personal-weekly-workflow',
      'example-presentation-automation',
      'personal-message-scheduling',
      'tool-discovery',
      'onboarding-guide',
    ],
    allowTools: [
      'system_*',
      'skills_*',
      'apps_*',
      'agents_*',
      'context_*',
      'media_*',
      'slack_*',
      'slides_*',
      'whatsapp_*',
      'google_*',
      'discover_tools',
      'user-*',
      'config_*',
      'orient-assistant_config_*',
    ],
    denyTools: ['write', 'edit', 'bash', 'Bash'],
  },
  {
    id: 'communicator',
    name: 'Communicator',
    description: 'Slack/WhatsApp messaging with proper formatting',
    mode: 'specialized',
    modelDefault: 'anthropic/claude-haiku-4-5-20251001',
    modelFallback: 'opencode/gpt-5-nano',
    basePrompt: `You are a messaging specialist. Format messages appropriately for the target platform.

For Slack: Use mrkdwn (bold with *single asterisks*, italic with _underscores_, code with backticks).
For WhatsApp: Use simple text with emojis where appropriate.

Keep messages clear, concise, and well-formatted.`,
    enabled: true,
    skills: ['slack-formatting', 'personal-message-scheduling'],
    allowTools: ['slack_*', 'whatsapp_send_*'],
    denyTools: ['*docs*'],
  },
  {
    id: 'scheduler',
    name: 'Scheduler',
    description: 'Calendar management, reminders, time-based tasks',
    mode: 'specialized',
    modelDefault: 'anthropic/claude-haiku-4-5-20251001',
    modelFallback: 'opencode/gpt-5-nano',
    basePrompt: `You are a scheduling assistant. Help users manage calendars, set reminders, and schedule messages.

Focus on:
- Understanding time zones (default: Asia/Jerusalem)
- Parsing natural language dates and times
- Creating recurring schedules
- Setting appropriate reminders`,
    enabled: true,
    skills: ['personal-message-scheduling'],
    allowTools: ['google_calendar_*', 'google_tasks_*', 'config_*schedule*'],
    denyTools: ['*messaging*'],
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Fast codebase exploration, documentation lookup',
    mode: 'specialized',
    modelDefault: 'anthropic/claude-haiku-4-5-20251001',
    modelFallback: 'opencode/gpt-5-nano',
    basePrompt: `You are a codebase explorer. Help users understand project structure, find code, and lookup documentation.

Focus on:
- Fast, focused searches
- Reading and explaining code
- Finding patterns and implementations
- Understanding project architecture`,
    enabled: true,
    skills: ['tool-discovery', 'project-architecture', 'testing-strategy'],
    allowTools: ['read', 'glob', 'grep', 'discover_tools'],
    denyTools: ['write', 'edit', '*messaging*'],
  },
  {
    id: 'app-builder',
    name: 'App Builder',
    description:
      'Specialized agent for creating Mini-Apps via the PR workflow. NEVER writes code directly.',
    mode: 'specialized',
    modelDefault: 'anthropic/claude-sonnet-4-20250514',
    modelFallback: 'opencode/gpt-5-nano',
    basePrompt: `You are a Mini-App Builder agent. Your job is to create standalone React applications using the Mini-Apps architecture.

CRITICAL RULES:
1. NEVER write code directly to project files
2. NEVER use the 'write', 'edit', or 'bash' tools to create code
3. ALWAYS use apps_create to generate new apps
4. ALWAYS use apps_update to modify existing apps

What You Can Do:
- Create new Mini-Apps: Use apps_create with a detailed prompt
- List existing apps: Use apps_list
- Get app details: Use apps_get
- Share apps: Use apps_share
- Update apps: Use apps_update

Workflow:
1. User describes what they want
2. You craft a detailed prompt describing the app's functionality
3. Call apps_create with the prompt
4. The tool generates the React code and creates a PR for review
5. Share the PR URL with the user

Always explain what the app will do before creating it.`,
    enabled: true,
    skills: ['mini-apps'],
    allowTools: [
      'apps_create',
      'apps_update',
      'apps_list',
      'apps_get',
      'apps_share',
      'discover_tools',
    ],
    denyTools: ['write', 'edit', 'bash', 'Bash', 'Shell'],
  },
];

// ============================================
// CONTEXT RULES
// ============================================

const defaultContextRules = [
  // Default agent for all platforms
  {
    contextType: 'default',
    contextId: null,
    agentId: 'ori',
    skillOverrides: null,
    priority: 0,
  },
  // Environment-specific skill exclusions
  {
    contextType: 'environment',
    contextId: 'local',
    agentId: null,
    skillOverrides: JSON.stringify([
      'disable:project-architecture',
      'disable:mcp-debugging',
      'disable:whatsapp-logs',
    ]),
    priority: 10,
  },
  {
    contextType: 'environment',
    contextId: 'prod',
    agentId: null,
    skillOverrides: JSON.stringify([
      'disable:skill-creator',
      'disable:project-architecture',
      'disable:mcp-debugging',
      'disable:whatsapp-logs',
    ]),
    priority: 10,
  },
  // Platform defaults
  {
    contextType: 'platform',
    contextId: 'whatsapp',
    agentId: 'ori',
    skillOverrides: null,
    priority: 5,
  },
  {
    contextType: 'platform',
    contextId: 'slack',
    agentId: 'ori',
    skillOverrides: null,
    priority: 5,
  },
  {
    contextType: 'platform',
    contextId: 'opencode',
    agentId: 'ori',
    skillOverrides: null,
    priority: 5,
  },
];

// ============================================
// SEED OPTIONS
// ============================================

export interface AgentSeedOptions {
  /** If true, clears existing agents and re-seeds */
  force?: boolean;
  /** If true, logs detailed progress */
  verbose?: boolean;
}

export interface AgentSeedResult {
  /** Whether seeding was performed */
  seeded: boolean;
  /** Number of agents seeded */
  agentCount: number;
  /** Number of context rules seeded */
  contextRuleCount: number;
  /** Reason if seeding was skipped */
  reason?: string;
}

// ============================================
// SEED FUNCTION
// ============================================

/**
 * Seeds default agents into the database.
 * Skips seeding if agents already exist (unless force is true).
 */
export async function seedAgents(options: AgentSeedOptions = {}): Promise<AgentSeedResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await getDatabase()) as any;
  const { force = false, verbose = false } = options;

  if (verbose) {
    logger.info('Starting agent registry seed', { force });
  }

  // Check if agents already exist
  const existingAgents = await db.select().from(agents);
  if (existingAgents.length > 0 && !force) {
    if (verbose) {
      logger.info('Agents already exist, skipping seed', { count: existingAgents.length });
    }
    return {
      seeded: false,
      agentCount: existingAgents.length,
      contextRuleCount: 0,
      reason: 'Agents already exist. Use force=true to re-seed.',
    };
  }

  // If force, clear existing data
  if (force && existingAgents.length > 0) {
    logger.info('Force mode: clearing existing agents');
    await db.delete(contextRules);
    await db.delete(agentTools);
    await db.delete(agentSkills);
    await db.delete(agents);
  }

  // Insert agents
  for (const agentData of defaultAgents) {
    const { skills, allowTools, denyTools, ...agentRecord } = agentData;

    if (verbose) {
      logger.info('Inserting agent', { id: agentRecord.id });
    }

    // Insert agent
    await db.insert(agents).values(agentRecord).onConflictDoNothing();

    // Insert skills
    for (const skillName of skills) {
      await db
        .insert(agentSkills)
        .values({
          agentId: agentRecord.id,
          skillName,
          enabled: true,
        })
        .onConflictDoNothing();
    }

    // Insert allow tools
    for (const pattern of allowTools) {
      await db
        .insert(agentTools)
        .values({
          agentId: agentRecord.id,
          pattern,
          type: 'allow',
        })
        .onConflictDoNothing();
    }

    // Insert deny tools
    for (const pattern of denyTools) {
      await db
        .insert(agentTools)
        .values({
          agentId: agentRecord.id,
          pattern,
          type: 'deny',
        })
        .onConflictDoNothing();
    }
  }

  // Insert context rules
  for (const rule of defaultContextRules) {
    if (verbose) {
      logger.info('Inserting context rule', {
        contextType: rule.contextType,
        contextId: rule.contextId,
      });
    }

    await db.insert(contextRules).values(rule).onConflictDoNothing();
  }

  logger.info('Agent registry seed complete', {
    agents: defaultAgents.length,
    contextRules: defaultContextRules.length,
  });

  return {
    seeded: true,
    agentCount: defaultAgents.length,
    contextRuleCount: defaultContextRules.length,
  };
}

/**
 * Ensures default agents are seeded.
 * Call this during application startup.
 * This is a no-op if agents already exist.
 */
export async function ensureAgentsSeeded(): Promise<AgentSeedResult> {
  try {
    return await seedAgents({ force: false, verbose: false });
  } catch (error) {
    logger.error('Failed to seed agents', { error: String(error) });
    // Don't throw - allow the application to start even if seeding fails
    return {
      seeded: false,
      agentCount: 0,
      contextRuleCount: 0,
      reason: `Seeding failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
