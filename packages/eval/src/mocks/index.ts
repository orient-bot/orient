/**
 * Mock Services Index
 *
 * Exports all mock services and provides a factory to create
 * a fully configured mock registry.
 */

export {
  MockServiceRegistry,
  BaseMockService,
  getMockRegistry,
  resetMockRegistry,
} from './registry.js';
export type { MockService } from './registry.js';

export { JiraMockService, createMockJiraIssue, type MockJiraIssue } from './jira.js';

export {
  SlackMockService,
  createMockSlackUser,
  createMockSlackChannel,
  type MockSlackUser,
  type MockSlackChannel,
  type MockSlackMessage,
} from './slack.js';

export {
  GoogleMockService,
  createMockSlide,
  createMockCalendarEvent,
  type MockSlide,
  type MockCalendarEvent,
} from './google.js';

export {
  WhatsAppMockService,
  createMockWhatsAppMessage,
  createMockWhatsAppChat,
  type MockWhatsAppMessage,
  type MockWhatsAppChat,
} from './whatsapp.js';

import { MockServiceRegistry } from './registry.js';
import { JiraMockService } from './jira.js';
import { SlackMockService } from './slack.js';
import { GoogleMockService } from './google.js';
import { WhatsAppMockService } from './whatsapp.js';

/**
 * Create a fully configured mock registry with all services
 */
export function createMockRegistry(): MockServiceRegistry {
  const registry = new MockServiceRegistry();

  // Register all mock services
  registry.registerService(new JiraMockService());
  registry.registerService(new SlackMockService());
  registry.registerService(new GoogleMockService());
  registry.registerService(new WhatsAppMockService());

  return registry;
}
