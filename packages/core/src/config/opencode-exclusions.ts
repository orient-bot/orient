/**
 * OpenCode Deployment Exclusions
 *
 * Specifies which skills and MCPs should be EXCLUDED from each deployment environment.
 * Items listed here will NOT be available in that environment.
 *
 * Usage:
 * - Add skill directory names to excludeSkills array to prevent them from being copied
 * - Add MCP server names (as they appear in opencode.json) to excludeMcps array to remove them
 *
 * After modifying this file, run: npm run build:opencode-config
 */

/**
 * Items to exclude from a deployment environment
 */
export interface ExcludedItems {
  /** Skill directory names to EXCLUDE (will not be copied to this environment) */
  excludeSkills: string[];
  /** MCP server names to EXCLUDE (will be removed from opencode.json for this environment) */
  excludeMcps: string[];
}

/**
 * Exclusion configuration for each deployment environment
 */
export interface OpenCodeExclusionConfig {
  /** Exclusions for local Docker development (docker-compose.local.yml) */
  localDockerExclusions: ExcludedItems;
  /** Exclusions for remote production (docker-compose.prod.yml) */
  prodExclusions: ExcludedItems;
}

/**
 * Available skills that can be excluded:
 * - personal-jira-project-management
 * - mcp-debugging
 * - example-presentation-automation
 * - project-architecture
 * - skill-creator
 * - slack-formatting
 * - tool-discovery
 * - whatsapp-logs
 * - whatsapp-messages
 * - personal-weekly-workflow
 *
 * Available MCPs that can be excluded:
 * - orienter
 * - Atlassian-MCP-Server
 */
export const openCodeExclusions: OpenCodeExclusionConfig = {
  localDockerExclusions: {
    excludeSkills: [
      // Development/debugging skills - not needed for PM functionality
      'project-architecture', // Bot architecture docs - dev only
      'mcp-debugging', // MCP server debugging - dev only
      'whatsapp-logs', // WhatsApp bot log analysis - dev only
      // Note: skill-creator kept in local for testing
    ],
    excludeMcps: [
      // MCPs to EXCLUDE from local Docker environment
    ],
  },

  prodExclusions: {
    excludeSkills: [
      // Development/debugging skills - not needed for PM functionality
      'project-architecture', // Bot architecture docs - dev only
      'mcp-debugging', // MCP server debugging - dev only
      'whatsapp-logs', // WhatsApp bot log analysis - dev only
      'skill-creator', // Skill creation guide - dev only
    ],
    excludeMcps: [
      // MCPs to EXCLUDE from production environment
    ],
  },
};
