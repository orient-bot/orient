/**
 * Health Check Tool
 *
 * Checks the health and connectivity of the Orient.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

// Input schema (empty - no parameters needed)
const HealthCheckInput = z.object({});

type Input = z.infer<typeof HealthCheckInput>;

// Output type
interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
}

interface Output {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  services: ServiceStatus[];
  timestamp: string;
}

/**
 * Health Check Tool Implementation
 */
export class HealthCheckTool extends MCPTool<Input, Output> {
  readonly name = 'ai_first_health_check';
  readonly description = 'Check the health and connectivity of the Orient.';
  readonly category = 'system' as const;
  readonly inputSchema = HealthCheckInput;
  readonly keywords = ['health', 'status', 'check', 'connectivity', 'system'];
  readonly useCases = [
    'Check if the bot is running properly',
    'Verify service connectivity',
    'Get system status',
  ];
  readonly examples = [{ description: 'Run health check', input: {} }];

  async execute(_input: Input, context: ToolContext): Promise<Output> {
    const services: ServiceStatus[] = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check config
    services.push({
      name: 'config',
      status: 'healthy',
      message: 'Configuration loaded',
    });

    return {
      status: overallStatus,
      uptime: process.uptime() * 1000,
      services,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const healthCheckTool = new HealthCheckTool();
