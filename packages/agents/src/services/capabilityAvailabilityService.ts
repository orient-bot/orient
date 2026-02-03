/**
 * Capability Availability Service
 *
 * Checks whether capabilities (MCP servers, OAuth integrations, configurations)
 * are available at runtime. Used to filter skills that require specific capabilities.
 *
 * Capability naming convention:
 * - `*-mcp`: MCP server availability (e.g., `atlassian-mcp`)
 * - `*-oauth`: OAuth integration connected (e.g., `google-oauth`)
 * - `*-config`: Configuration available (e.g., `slack-config`)
 */

import { createServiceLogger, getRawConfig } from '@orient-bot/core';
import { IntegrationConnectionService, IntegrationName } from './integrationConnectionService.js';

const logger = createServiceLogger('capability-availability');

export type CapabilityType = 'mcp' | 'oauth' | 'config';

export interface CapabilityStatus {
  name: string;
  type: CapabilityType;
  available: boolean;
}

interface CacheEntry {
  status: boolean;
  timestamp: number;
}

export class CapabilityAvailabilityService {
  private integrationService = new IntegrationConnectionService();
  private cache = new Map<string, CacheEntry>();
  private cacheTTL = 30_000; // 30 seconds

  /**
   * Check if a single capability is available
   */
  async isCapabilityAvailable(capability: string): Promise<boolean> {
    const cached = this.cache.get(capability);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.status;
    }

    const status = await this.checkCapability(capability);
    this.cache.set(capability, { status, timestamp: Date.now() });
    return status;
  }

  /**
   * Check if all required capabilities are available
   * Returns true if requirements is undefined or empty (backward compatible)
   */
  async areCapabilitiesAvailable(requirements?: string[]): Promise<boolean> {
    if (!requirements || requirements.length === 0) {
      return true;
    }
    const results = await Promise.all(requirements.map((r) => this.isCapabilityAvailable(r)));
    return results.every((r) => r);
  }

  /**
   * Get detailed status for multiple capabilities
   */
  async getCapabilityStatuses(capabilities: string[]): Promise<CapabilityStatus[]> {
    return Promise.all(
      capabilities.map(async (name) => ({
        name,
        type: this.parseCapabilityType(name),
        available: await this.isCapabilityAvailable(name),
      }))
    );
  }

  /**
   * Clear the capability cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Capability cache cleared');
  }

  /**
   * Parse the capability type from the capability name
   */
  private parseCapabilityType(capability: string): CapabilityType {
    if (capability.endsWith('-mcp')) return 'mcp';
    if (capability.endsWith('-oauth')) return 'oauth';
    if (capability.endsWith('-config')) return 'config';
    // Default to oauth for backward compatibility
    return 'oauth';
  }

  /**
   * Check a single capability's availability
   */
  private async checkCapability(capability: string): Promise<boolean> {
    const type = this.parseCapabilityType(capability);
    const baseName = capability.replace(/-(?:mcp|oauth|config)$/, '');

    try {
      switch (type) {
        case 'mcp':
          return this.checkMCPServer(baseName);
        case 'oauth':
          return this.checkOAuthIntegration(baseName);
        case 'config':
          return this.checkConfiguration(baseName);
        default:
          return false;
      }
    } catch (error) {
      logger.warn('Capability check failed', { capability, error: String(error) });
      return false;
    }
  }

  /**
   * Check if an MCP server is enabled
   * Checks environment variables for MCP server configuration
   */
  private checkMCPServer(serverName: string): boolean {
    // Check for MCP server enabled via environment variable
    const envKey = `MCP_${serverName.toUpperCase().replace(/-/g, '_')}_ENABLED`;
    if (process.env[envKey] === 'true') {
      return true;
    }

    // Check config for MCP servers
    try {
      const config = getRawConfig() as {
        mcpServers?: Record<string, unknown>;
      };
      if (config.mcpServers) {
        // Check for server by name (case-insensitive)
        const serverKeys = Object.keys(config.mcpServers);
        return serverKeys.some((key) => key.toLowerCase().includes(serverName.toLowerCase()));
      }
    } catch {
      // Config not available
    }

    return false;
  }

  /**
   * Check if an OAuth integration is connected
   */
  private async checkOAuthIntegration(integrationName: string): Promise<boolean> {
    const integrationMap: Record<string, IntegrationName> = {
      google: 'google',
      atlassian: 'atlassian',
      jira: 'atlassian',
      confluence: 'atlassian',
      slack: 'slack',
      github: 'github',
      linear: 'linear',
    };

    const mapped = integrationMap[integrationName.toLowerCase()];
    if (!mapped) {
      logger.debug('Unknown integration', { integrationName });
      return false;
    }
    return this.integrationService.isIntegrationConnected(mapped);
  }

  /**
   * Check if a configuration is available
   */
  private checkConfiguration(configName: string): boolean {
    try {
      const config = getRawConfig() as Record<string, unknown>;

      switch (configName.toLowerCase()) {
        case 'slack':
          return Boolean(
            process.env.SLACK_BOT_TOKEN ||
            process.env.SLACK_APP_TOKEN ||
            (config.integrations as Record<string, unknown>)?.slack ||
            config.slack
          );

        case 'whatsapp':
          return Boolean(
            process.env.WHATSAPP_ENABLED === 'true' ||
            (config.integrations as Record<string, unknown>)?.whatsapp ||
            config.whatsapp
          );

        default:
          // Check if config section exists
          return Boolean(
            config[configName] || (config.integrations as Record<string, unknown>)?.[configName]
          );
      }
    } catch {
      return false;
    }
  }
}

// Singleton instance
let instance: CapabilityAvailabilityService | null = null;

/**
 * Get the singleton CapabilityAvailabilityService instance
 */
export function getCapabilityAvailabilityService(): CapabilityAvailabilityService {
  if (!instance) {
    instance = new CapabilityAvailabilityService();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetCapabilityAvailabilityService(): void {
  instance = null;
}
