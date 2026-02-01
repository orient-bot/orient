/**
 * @orient-bot/agents
 *
 * AI agent services for the Orient.
 *
 * This package provides:
 * - Core agent orchestration
 * - Tool calling and execution
 * - Agent registry and context resolution
 * - Progressive response handling
 *
 * @example
 * import {
 *   AgentConfig,
 *   AgentContext,
 *   ToolCallingConfig,
 *   ToolCallingResult,
 * } from '@orient-bot/agents';
 */

// Export all types
export type {
  AgentMessage,
  AgentConversation,
  ToolResult,
  ToolExecutor,
  ToolCallingConfig,
  ToolCallingResult,
  AgentConfig,
  AgentContext,
  ContextRule,
  ProgressiveResponderConfig,
  ProgressiveUpdate,
  MessageParam,
  Tool,
  ContentBlock,
  // Prompt types (re-exported from database-services)
  PromptPlatform,
  SystemPromptRecord,
  SystemPromptWithInfo,
} from './types.js';

// Prompt service types (from database-services via promptService.ts)
export type { PromptServiceConfig, PromptDatabaseInterface } from './services/promptService.js';

// Export services
export {
  PromptService,
  createPromptService,
  getPromptService,
  initializePromptService,
  isPromptServiceInitialized,
  SkillsService,
  createSkillsService,
  type Skill,
  type SkillSummary,
  type SkillMetadata,
} from './services/index.js';

// Export shared OpenCode handler utilities
export {
  OpenCodeHandlerBase,
  type OpenCodeHandlerConfig,
  type OpenCodeSessionClient,
  type OpenCodeSystemResponse,
  type OpenCodeSessionCommandOptions,
} from './services/openCodeHandlerBase.js';

export {
  OpenCodeClient,
  createOpenCodeClient,
  getDefaultOpenCodeClient,
  type OpenCodeMessage,
} from './services/openCodeClient.js';

export {
  ToolRegistry,
  createToolRegistry,
  getToolRegistry,
  getToolExecutorRegistry,
  type ToolCategory,
  type ToolMetadata,
} from './services/toolRegistry.js';

export {
  ToolDiscoveryService,
  formatDiscoveryResult,
  getToolDiscoveryService,
  type DiscoveryInput,
  type DiscoveryResult,
  type SearchResult,
} from './services/toolDiscovery.js';

export {
  IntegrationConnectionService,
  CATEGORY_INTEGRATION_MAP,
  type IntegrationName,
  type ToolCategoryIntegration,
} from './services/integrationConnectionService.js';

// Export permissions system
export * from './permissions/index.js';

export { MCPClientManager } from './services/mcpClientManager.js';
export { getAgentRegistry } from './services/agentRegistry.js';
export { clearConfigCache } from './services/agentContextLoader.js';

// Export OAuth client provider utilities
export {
  createOAuthProvider,
  MCPOAuthClientProvider,
  handleProductionOAuthCallback,
  setSuppressBrowserOpen,
  getCapturedAuthUrl,
  getReceivedAuthCode,
  waitForAuthCode,
  waitForOAuthCallback,
  cancelPendingOAuth,
  stopCallbackServer,
  getCallbackConfig,
  ensureCallbackServerRunning,
  OAUTH_CALLBACK_PORT,
  OAUTH_CALLBACK_PATH,
  OAUTH_CALLBACK_URL,
  IS_PRODUCTION_OAUTH,
  type OAuthCallbackConfig,
} from './services/oauthClientProvider.js';

// Export OpenCode message processor utilities (model config, session handling, etc.)
export {
  // Model definitions
  AVAILABLE_MODELS,
  parseModelName,
  type ModelKey,
  // Platform defaults
  DEFAULT_AGENT,
  WHATSAPP_DEFAULT_MODEL,
  WHATSAPP_DEFAULT_MODEL_NAME,
  SLACK_DEFAULT_MODEL,
  SLACK_DEFAULT_MODEL_NAME,
  // Vision config
  VISION_MODEL_ID,
  VISION_MODEL_NAME,
  VISION_MODEL_PROVIDER,
  getDefaultVisionModelId,
  getVisionModelName,
  getProviderFromModelId,
  // Image/audio preprocessing
  preprocessImage,
  buildEnrichedMessage,
  // Model switching
  detectModelSwitch,
  type ModelSwitchResult,
  getModelForContext,
  buildModelSwitchConfirmation,
  buildAvailableModelsInfo,
  // Session commands
  detectSessionCommand,
  buildSlackHelpText,
  buildWhatsAppHelpText,
  extractAgentMention,
  // Response formatting
  formatModelName,
  formatToolsUsed,
  // Types
  type ImageData,
  type AudioData,
  type MessageEnrichment,
  type ProcessorConfig,
} from './services/openCodeMessageProcessor.js';

// Export progressive responder
export {
  ProgressiveResponder,
  createProgressiveResponder,
} from './services/progressiveResponder.js';

/**
 * Migration Status
 *
 * This package is being populated with services from src/services/:
 * - agentService.ts
 * - whatsappAgentService.ts
 * - toolCallingService.ts
 * - agentRegistry.ts
 * - agentContextLoader.ts
 * - toolDiscovery.ts
 * - toolRegistry.ts
 * - progressiveResponder.ts
 * - contextService.ts
 *
 * Types are available now, services will be migrated incrementally.
 */
export const AGENTS_MIGRATION_STATUS = {
  types: 'migrated',
  promptService: 'migrated',
  skillsService: 'migrated',
  agentService: 're-exported',
  whatsappAgentService: 're-exported',
  toolCallingService: 're-exported',
  agentRegistry: 're-exported',
  agentContextLoader: 're-exported',
  toolDiscovery: 're-exported',
  toolRegistry: 're-exported',
  progressiveResponder: 're-exported',
  contextService: 're-exported',
  sourceLocation: 'src/services/ (re-exported)',
} as const;
