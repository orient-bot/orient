/**
 * Mock Service Registry
 *
 * Central registry for managing mock responses during eval execution.
 * Allows configuring deterministic responses for external services.
 */

import { EvalMocks, MockResponse } from '../types.js';
import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('mock-registry');

/**
 * Interface for individual mock services
 */
export interface MockService {
  /** Service name (e.g., 'jira', 'slack') */
  name: string;

  /** Configure mock responses */
  configure(config: Record<string, MockResponse>): void;

  /** Get response for an operation */
  getResponse(operation: string, args: unknown): MockResponse | null;

  /** Check if operation is mocked */
  hasMock(operation: string): boolean;

  /** Reset all configured mocks */
  reset(): void;

  /** Get all configured operations */
  getConfiguredOperations(): string[];
}

/**
 * Base mock service implementation
 */
export abstract class BaseMockService implements MockService {
  abstract name: string;

  protected responses: Map<string, MockResponse> = new Map();
  protected defaultResponses: Map<string, () => MockResponse> = new Map();

  configure(config: Record<string, MockResponse>): void {
    for (const [operation, response] of Object.entries(config)) {
      this.responses.set(operation, response);
      logger.debug(`Configured mock for ${this.name}.${operation}`);
    }
  }

  getResponse(operation: string, _args: unknown): MockResponse | null {
    // First check explicit config
    if (this.responses.has(operation)) {
      return this.responses.get(operation)!;
    }

    // Then check defaults
    const defaultFn = this.defaultResponses.get(operation);
    if (defaultFn) {
      return defaultFn();
    }

    return null;
  }

  hasMock(operation: string): boolean {
    return this.responses.has(operation) || this.defaultResponses.has(operation);
  }

  reset(): void {
    this.responses.clear();
    logger.debug(`Reset mocks for ${this.name}`);
  }

  getConfiguredOperations(): string[] {
    return [...new Set([...this.responses.keys(), ...this.defaultResponses.keys()])];
  }
}

/**
 * Central registry for all mock services
 */
export class MockServiceRegistry {
  private services: Map<string, MockService> = new Map();

  constructor() {
    // Services are registered via registerService()
  }

  /**
   * Register a mock service
   */
  registerService(service: MockService): void {
    this.services.set(service.name, service);
    logger.debug(`Registered mock service: ${service.name}`);
  }

  /**
   * Configure mocks from eval case
   */
  configure(mocks: EvalMocks): void {
    for (const [serviceName, config] of Object.entries(mocks)) {
      const service = this.services.get(serviceName);
      if (service) {
        service.configure(config);
      } else {
        logger.warn(`Unknown mock service: ${serviceName}`);
      }
    }
  }

  /**
   * Get mock response for a tool call
   */
  getResponse(toolName: string): MockResponse | null {
    // Parse tool name to find service
    // e.g., system_health_check -> system service, slack_send_dm -> slack service
    const service = this.findServiceForTool(toolName);
    if (service) {
      return service.getResponse(toolName, {});
    }
    return null;
  }

  /**
   * Check if a tool has a mock configured
   */
  hasMock(toolName: string): boolean {
    const service = this.findServiceForTool(toolName);
    return service ? service.hasMock(toolName) : false;
  }

  /**
   * Reset all mocks
   */
  reset(): void {
    for (const service of this.services.values()) {
      service.reset();
    }
    logger.debug('Reset all mock services');
  }

  /**
   * Get a specific service
   */
  getService(name: string): MockService | undefined {
    return this.services.get(name);
  }

  /**
   * List all registered services
   */
  listServices(): string[] {
    return [...this.services.keys()];
  }

  /**
   * Find the appropriate service for a tool
   */
  private findServiceForTool(toolName: string): MockService | null {
    // Check each service if it has this tool mocked
    for (const service of this.services.values()) {
      if (service.hasMock(toolName)) {
        return service;
      }
    }

    // Infer from tool name patterns
    if (toolName.includes('jira') || toolName.match(/get_(blockers|issues|in_progress)/)) {
      return this.services.get('jira') || null;
    }
    if (toolName.includes('slack')) {
      return this.services.get('slack') || null;
    }
    if (
      toolName.includes('slides') ||
      toolName.includes('calendar') ||
      toolName.includes('gmail')
    ) {
      return this.services.get('google') || null;
    }
    if (toolName.includes('whatsapp')) {
      return this.services.get('whatsapp') || null;
    }

    return null;
  }
}

// Singleton instance
let registryInstance: MockServiceRegistry | null = null;

/**
 * Get the mock service registry singleton
 */
export function getMockRegistry(): MockServiceRegistry {
  if (!registryInstance) {
    registryInstance = new MockServiceRegistry();
  }
  return registryInstance;
}

/**
 * Reset the mock registry (for testing)
 */
export function resetMockRegistry(): void {
  if (registryInstance) {
    registryInstance.reset();
  }
  registryInstance = null;
}
