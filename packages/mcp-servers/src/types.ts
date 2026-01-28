/**
 * MCP Server Types and Configuration
 *
 * Defines the types for the multi-server architecture that splits
 * the monolithic MCP server into task-focused servers.
 */

import type { ToolCategory } from '@orientbot/agents';

/**
 * Server types for the multi-server architecture
 */
export type McpServerType = 'coding' | 'assistant' | 'core';

/**
 * Configuration for which tools a server should expose
 */
export interface ServerToolConfig {
  /**
   * Tool categories to include
   * Use 'all' to include all categories
   */
  categories: ToolCategory[] | 'all';

  /**
   * Specific tool names to include (in addition to categories)
   */
  includeTools?: string[];

  /**
   * Specific tool names to exclude (override category inclusion)
   */
  excludeTools?: string[];

  /**
   * Whether to include the discover_tools meta-tool
   */
  includeDiscovery: boolean;
}

/**
 * Full server configuration
 */
export interface McpServerConfig {
  /**
   * Server type identifier
   */
  type: McpServerType;

  /**
   * Human-readable server name
   */
  name: string;

  /**
   * Server version
   */
  version: string;

  /**
   * Tool configuration
   */
  tools: ServerToolConfig;

  /**
   * Services to initialize
   * Only initialize what's needed to reduce startup time
   */
  services: {
    slack?: boolean;
    whatsapp?: boolean;
    googleSlides?: boolean;
    googleSheets?: boolean;
    googleOAuth?: boolean;
    skills?: boolean;
    apps?: boolean;
    agents?: boolean;
  };
}

/**
 * Pre-defined server configurations
 */
export const SERVER_CONFIGS: Record<McpServerType, McpServerConfig> = {
  /**
   * Coding server: Minimal toolset for Cursor/Claude Code
   * Focus: Slides (example-presentation-automation), Apps, Agents
   */
  coding: {
    type: 'coding',
    name: 'coding-mcp',
    version: '1.0.0',
    tools: {
      categories: ['docs', 'apps', 'agents', 'media'],
      includeTools: [
        // System
        'ai_first_health_check',
        'ai_first_get_config',
      ],
      includeDiscovery: true,
    },
    services: {
      googleSlides: true, // For example-presentation-automation skill
      apps: true,
      agents: true,
    },
  },

  /**
   * Assistant server: Full capabilities for WhatsApp/Slack bots
   */
  assistant: {
    type: 'assistant',
    name: 'assistant-mcp',
    version: '1.0.0',
    tools: {
      categories: ['messaging', 'whatsapp', 'docs', 'google', 'context', 'system'],
      includeDiscovery: true,
    },
    services: {
      slack: true,
      whatsapp: true,
      googleSlides: true,
      googleSheets: true,
      googleOAuth: true,
    },
  },

  /**
   * Core server: Essential tools always available
   * Focus: Skills, Agents, System, Discovery
   */
  core: {
    type: 'core',
    name: 'core-mcp',
    version: '1.0.0',
    tools: {
      categories: ['system', 'agents'],
      includeDiscovery: true,
    },
    services: {
      skills: true,
      agents: true,
    },
  },
};
