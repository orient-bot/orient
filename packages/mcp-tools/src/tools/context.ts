/**
 * Tool Context Factory
 *
 * Creates the shared context passed to all tool executions.
 * Handles lazy initialization of services.
 */

import type { ToolContext } from '../types.js';
import type { AppConfig } from '@orient-bot/core';
import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('tool-context');

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
  logger.info('Tool context cache cleared');
}
