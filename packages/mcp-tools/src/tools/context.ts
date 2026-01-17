/**
 * Tool Context Factory
 *
 * Creates the shared context passed to all tool executions.
 * Handles lazy initialization of services.
 */

import { Version3Client } from 'jira.js';
import type { ToolContext } from '../types.js';
import type { AppConfig } from '@orient/core';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('tool-context');

// Cached service instances
let jiraClientInstance: Version3Client | null = null;

/**
 * Initialize the JIRA client
 */
function initializeJiraClient(config: AppConfig): Version3Client | null {
  if (jiraClientInstance) {
    return jiraClientInstance;
  }

  const jiraConfig = config.integrations?.jira;
  if (!jiraConfig?.host || !jiraConfig?.email || !jiraConfig?.apiToken) {
    logger.warn('JIRA not configured, skipping client initialization');
    return null;
  }

  logger.info('Initializing JIRA client', {
    host: jiraConfig.host,
  });

  jiraClientInstance = new Version3Client({
    host: `https://${jiraConfig.host}`,
    authentication: {
      basic: {
        email: jiraConfig.email,
        apiToken: jiraConfig.apiToken,
      },
    },
  });

  return jiraClientInstance;
}

/**
 * Generate a unique correlation ID for request tracing
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a tool context with all required services
 */
export function createToolContext(
  config: AppConfig,
  options?: {
    correlationId?: string;
    slackClient?: unknown;
    getSlidesService?: () => Promise<unknown>;
    getMessageDatabase?: () => Promise<unknown>;
  }
): ToolContext {
  const correlationId = options?.correlationId || generateCorrelationId();

  return {
    config,
    correlationId,
    jiraClient: initializeJiraClient(config) ?? undefined,
    slackClient: options?.slackClient,
    getSlidesService: options?.getSlidesService,
    getMessageDatabase: options?.getMessageDatabase,
  };
}

/**
 * Clear cached service instances
 * Useful for testing or reconfiguration
 */
export function clearContextCache(): void {
  jiraClientInstance = null;
  logger.info('Tool context cache cleared');
}

/**
 * Get the JIRA client from context or throw an error
 */
export function requireJiraClient(context: ToolContext): Version3Client {
  if (!context.jiraClient) {
    throw new Error('JIRA client not available in context');
  }
  return context.jiraClient;
}
