/**
 * Get Config Tool
 *
 * Gets the current configuration (excluding sensitive credentials).
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

// Input schema (empty - no parameters needed)
const GetConfigInput = z.object({});

type Input = z.infer<typeof GetConfigInput>;

// Output type
interface Output {
  organization: {
    name: string;
    jiraProjectKey: string;
    jiraComponent?: string;
  };
  features: {
    whatsappEnabled: boolean;
    slackEnabled: boolean;
    schedulerEnabled: boolean;
  };
  environment: string;
}

/**
 * Get Config Tool Implementation
 */
export class GetConfigTool extends MCPTool<Input, Output> {
  readonly name = 'ai_first_get_config';
  readonly description =
    'Get the current configuration for the Orient (excluding sensitive credentials).';
  readonly category = 'system' as const;
  readonly inputSchema = GetConfigInput;
  readonly keywords = ['config', 'configuration', 'settings', 'options'];
  readonly useCases = [
    'View current configuration',
    'Check which features are enabled',
    'Verify organization settings',
  ];
  readonly examples = [{ description: 'Get current config', input: {} }];

  async execute(_input: Input, context: ToolContext): Promise<Output> {
    const config = context.config;
    const org = config.organization;

    return {
      organization: org
        ? {
            name: org.name,
            jiraProjectKey: org.jiraProjectKey,
            jiraComponent: org.jiraComponent,
          }
        : {
            name: 'Not configured',
            jiraProjectKey: '',
            jiraComponent: undefined,
          },
      features: {
        whatsappEnabled: !!(config.integrations as any)?.whatsapp,
        slackEnabled: !!config.integrations?.slack,
        schedulerEnabled: true, // Scheduler is always enabled if the service runs
      },
      environment: process.env.NODE_ENV || 'development',
    };
  }
}

// Export singleton instance
export const getConfigTool = new GetConfigTool();
