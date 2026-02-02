/**
 * Agent Services
 *
 * Export all agent-related services.
 */

export {
  PromptService,
  createPromptService,
  getPromptService,
  initializePromptService,
  isPromptServiceInitialized,
  EMBEDDED_DEFAULT_PROMPTS,
  getEmbeddedDefaultPrompt,
} from './promptService.js';

export {
  SkillsService,
  createSkillsService,
  type Skill,
  type SkillSummary,
  type SkillMetadata,
} from './skillsService.js';

export {
  OpenCodeHandlerBase,
  type OpenCodeHandlerConfig,
  type OpenCodeSessionClient,
  type OpenCodeSystemResponse,
  type OpenCodeSessionCommandOptions,
} from './openCodeHandlerBase.js';

export * from './agentService.js';
// whatsappAgentService moved to @orient-bot/bot-whatsapp to avoid circular dependency
// export * from './whatsappAgentService.js';
// notificationService depends on @orient-bot/bot-whatsapp, excluded from @orient-bot/agents
// export * from './notificationService.js';
export * from './toolCallingService.js';
export * from './agentRegistry.js';
export * from './agentContextLoader.js';
export * from './toolDiscovery.js';
export * from './toolRegistry.js';
export * from './progressiveResponder.js';
export * from './contextService.js';
export * from './openCodeClient.js';
export * from './mcpClientManager.js';
export * from './oauthClientProvider.js';
export * from './integrationConnectionService.js';
export * from './capabilityAvailabilityService.js';
export * from './openCodeMessageProcessor.js';
