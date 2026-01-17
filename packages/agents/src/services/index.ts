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
// whatsappAgentService moved to @orient/bot-whatsapp to avoid circular dependency
// export * from './whatsappAgentService.js';
// notificationService depends on @orient/bot-whatsapp, excluded from @orient/agents
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
export * from './openCodeMessageProcessor.js';
