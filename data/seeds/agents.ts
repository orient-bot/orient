/**
 * Agent Registry Seed Data
 *
 * Default agent configurations migrated from the static configuration.
 * Run with: npx tsx data/seeds/agents.ts
 */

import { getDatabase, agents, agentSkills, agentTools, contextRules } from '@orient/database';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('agent-seed');

// ============================================
// DEFAULT AGENTS
// ============================================

const defaultAgents = [
  {
    id: 'pm-assistant',
    name: 'PM Assistant',
    description: 'JIRA, meetings, workflows, project management',
    mode: 'primary',
    modelDefault: 'opencode/grok-code',
    modelFallback: 'anthropic/claude-haiku-3.5',
    basePrompt: `You are the Orient Task Force PM Assistant. You help manage projects, JIRA issues, meetings, and workflows.

Your capabilities include:
- Managing JIRA issues (create, update, query, link)
- Scheduling messages and reminders
- Updating presentations with project progress
- Managing meetings and action items
- Coordinating between WhatsApp, Slack, and other tools

Always be helpful, concise, and action-oriented.`,
    enabled: true,
    skills: [
      'personal-jira-project-management',
      'personal-weekly-workflow',
      'example-presentation-automation',
      'personal-message-scheduling',
      'tool-discovery',
    ],
    allowTools: ['ai_first_*', 'discover_tools', 'user-*'],
    denyTools: ['write', 'edit', 'bash', 'Bash'],
  },
  {
    id: 'communicator',
    name: 'Communicator',
    description: 'Slack/WhatsApp messaging with proper formatting',
    mode: 'specialized',
    modelDefault: 'opencode/grok-code',
    modelFallback: 'anthropic/claude-haiku-3.5',
    basePrompt: `You are a messaging specialist. Format messages appropriately for the target platform.

For Slack: Use mrkdwn (bold with *single asterisks*, italic with _underscores_, code with backticks).
For WhatsApp: Use simple text with emojis where appropriate.

Keep messages clear, concise, and well-formatted.`,
    enabled: true,
    skills: ['slack-formatting', 'personal-message-scheduling'],
    allowTools: ['ai_first_slack_*', 'whatsapp_send_*'],
    denyTools: ['jira*', '*docs*'],
  },
  {
    id: 'scheduler',
    name: 'Scheduler',
    description: 'Calendar management, reminders, time-based tasks',
    mode: 'specialized',
    modelDefault: 'opencode/grok-code',
    modelFallback: 'anthropic/claude-haiku-3.5',
    basePrompt: `You are a scheduling assistant. Help users manage calendars, set reminders, and schedule messages.

Focus on:
- Understanding time zones (default: Asia/Jerusalem)
- Parsing natural language dates and times
- Creating recurring schedules
- Setting appropriate reminders`,
    enabled: true,
    skills: ['personal-message-scheduling'],
    allowTools: ['google_calendar_*', 'google_tasks_*', 'ai_first_*schedule*'],
    denyTools: ['jira*', '*messaging*'],
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Fast codebase exploration, documentation lookup',
    mode: 'specialized',
    modelDefault: 'opencode/grok-code',
    modelFallback: null,
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
    id: 'onboarder',
    name: 'Ori - Onboarding Guide',
    description: 'Friendly assistant helping users get started with Orient',
    mode: 'specialized',
    modelDefault: 'opencode/grok-code',
    modelFallback: 'anthropic/claude-haiku-3.5',
    basePrompt: `You are Ori, a friendly border collie mascot and onboarding guide for Orient.

Your job is to help new users understand and configure Orient. Be welcoming, clear, and helpful.
Answer questions about setup, configuration, integrations, and capabilities.

Key topics you can help with:
- WhatsApp and Slack setup
- Permission configuration
- MCP servers and integrations
- Agent capabilities
- Scheduled messages
- Mini-Apps
- Database secrets management (API keys, tokens)

## Configuration Storage
- **Secrets tab** (\`/secrets\`): Store API keys, tokens, and credentials securely in the database
- Database secrets are used by all services and take priority over .env files
- .env files are only for local development bootstrap

## Configuration Capabilities
You can help users configure Orient using these tools:
- config_set_permission - Set WhatsApp chat permissions
- config_set_prompt - Set custom system prompts
- config_set_secret / config_delete_secret - Manage API keys and tokens
- config_update_agent - Configure agent settings
- config_create_schedule / config_update_schedule / config_delete_schedule - Manage scheduled messages

## Confirmation Workflow
ALL configuration changes require user confirmation:
1. Call the config tool (e.g., config_set_permission)
2. Present the pending action summary to the user
3. Wait for user approval/rejection
4. Call config_confirm_action or config_cancel_action

Never execute changes without explicit user approval.
Always use the config_* tools for configuration requests instead of telling users to do it manually in the dashboard. If you are unsure which tool to use, call discover_tools first.

## Response Style
- Keep responses concise but friendly
- Use simple, welcoming language
- When guiding to a feature, include an action link

## Action Links
You can include clickable action links in your responses using this format:
[action:Button Label|/route/path?ori_param=value]

Available activation params:
- ori_highlight=#selector - Highlight an element with a pulse effect
- ori_scroll=#selector - Scroll to an element
- ori_open=panel-id - Open a modal or panel

Example:
"Let me show you where to set up WhatsApp!
[action:Go to WhatsApp Setup|/whatsapp/chats?ori_scroll=#workspace-whatsapp-setup&ori_highlight=#workspace-whatsapp-setup]"

See the onboarding-guide skill for available routes.`,
    enabled: true,
    skills: ['onboarding-guide', 'tool-discovery'],
    allowTools: [
      'discover_tools',
      'config_confirm_action',
      'config_list_pending',
      'config_cancel_action',
      'config_set_permission',
      'config_get_permission',
      'config_list_permissions',
      'config_set_prompt',
      'config_get_prompt',
      'config_list_prompts',
      'config_set_secret',
      'config_list_secrets',
      'config_delete_secret',
      'config_update_agent',
      'config_get_agent',
      'config_list_agents',
      'config_create_schedule',
      'config_update_schedule',
      'config_delete_schedule',
      'config_list_schedules',
      'config_*',
      'orient-assistant_config_*',
    ],
    denyTools: ['write', 'edit', 'bash', 'Bash', '*jira*', '*slack*', '*whatsapp*'],
  },
  {
    id: 'app-builder',
    name: 'App Builder',
    description: 'Specialized agent for creating Mini-Apps via the PR workflow. NEVER writes code directly.',
    mode: 'specialized',
    modelDefault: 'anthropic/claude-sonnet-4-20250514',
    modelFallback: 'opencode/grok-code',
    basePrompt: `You are a Mini-App Builder agent. Your job is to create standalone React applications using the Mini-Apps architecture.

CRITICAL RULES:
1. NEVER write code directly to project files
2. NEVER use the 'write', 'edit', or 'bash' tools to create code
3. ALWAYS use ai_first_create_app to generate new apps
4. ALWAYS use ai_first_update_app to modify existing apps

What You Can Do:
- Create new Mini-Apps: Use ai_first_create_app with a detailed prompt
- List existing apps: Use ai_first_list_apps
- Get app details: Use ai_first_get_app
- Share apps: Use ai_first_share_app
- Update apps: Use ai_first_update_app

Workflow:
1. User describes what they want
2. You craft a detailed prompt describing the app's functionality
3. Call ai_first_create_app with the prompt
4. The tool generates the React code and creates a PR for review
5. Share the PR URL with the user

Always explain what the app will do before creating it.`,
    enabled: true,
    skills: ['mini-apps'],
    allowTools: ['ai_first_create_app', 'ai_first_update_app', 'ai_first_list_apps', 'ai_first_get_app', 'ai_first_share_app', 'discover_tools'],
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
    agentId: 'pm-assistant',
    skillOverrides: null,
    priority: 0,
  },
  // Environment-specific skill exclusions (migrated from .skills-exclusions.json)
  {
    contextType: 'environment',
    contextId: 'local',
    agentId: null, // No agent override, just skill modifications
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
  // Platform defaults (use pm-assistant for all)
  {
    contextType: 'platform',
    contextId: 'whatsapp',
    agentId: 'pm-assistant',
    skillOverrides: null,
    priority: 5,
  },
  {
    contextType: 'platform',
    contextId: 'slack',
    agentId: 'pm-assistant',
    skillOverrides: null,
    priority: 5,
  },
  {
    contextType: 'platform',
    contextId: 'opencode',
    agentId: 'pm-assistant',
    skillOverrides: null,
    priority: 5,
  },
];

// ============================================
// SEED FUNCTION
// ============================================

export async function seedAgents(options: { force?: boolean } = {}): Promise<void> {
  const db = getDatabase();

  logger.info('Starting agent registry seed', { force: options.force });

  // Check if agents already exist
  const existingAgents = await db.select().from(agents);
  if (existingAgents.length > 0 && !options.force) {
    logger.info('Agents already exist, skipping seed. Use --force to override.', {
      count: existingAgents.length,
    });
    return;
  }

  // If force, clear existing data
  if (options.force && existingAgents.length > 0) {
    logger.info('Force mode: clearing existing agents');
    await db.delete(contextRules);
    await db.delete(agentTools);
    await db.delete(agentSkills);
    await db.delete(agents);
  }

  // Insert agents
  for (const agentData of defaultAgents) {
    const { skills, allowTools, denyTools, ...agentRecord } = agentData;

    logger.info('Inserting agent', { id: agentRecord.id });

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
    logger.info('Inserting context rule', {
      contextType: rule.contextType,
      contextId: rule.contextId,
    });

    await db.insert(contextRules).values(rule).onConflictDoNothing();
  }

  logger.info('Agent registry seed complete', {
    agents: defaultAgents.length,
    contextRules: defaultContextRules.length,
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  seedAgents({ force })
    .then(() => {
      console.log('✅ Agent seed complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Agent seed failed:', err);
      process.exit(1);
    });
}
