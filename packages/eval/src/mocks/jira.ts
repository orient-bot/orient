/**
 * System Tools Mock Service
 *
 * Provides mock responses for system-related tools during eval execution.
 * Note: JIRA tools have been removed in favor of the Atlassian MCP server.
 */

import { BaseMockService } from './registry.js';

/**
 * System mock service implementation
 */
export class JiraMockService extends BaseMockService {
  name = 'system';

  constructor() {
    super();
    this.setupDefaults();
  }

  private setupDefaults(): void {
    // system_health_check - Health check
    this.defaultResponses.set('system_health_check', () => ({
      response: {
        status: 'healthy',
        services: [{ name: 'config', status: 'healthy', message: 'Configuration loaded' }],
        timestamp: new Date().toISOString(),
      },
    }));

    // system_get_config - Get configuration
    this.defaultResponses.set('system_get_config', () => ({
      response: {
        environment: 'test',
        version: '1.0.0',
      },
    }));
  }
}
