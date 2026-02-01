/**
 * Prompt Service
 *
 * Re-exports from @orient-bot/database-services for backwards compatibility.
 * The single source of truth is in the database-services package.
 */

// Re-export everything from database-services
export {
  PromptService,
  createPromptService,
  getPromptService,
  initializePromptService,
  isPromptServiceInitialized,
  EMBEDDED_DEFAULT_PROMPTS,
  getEmbeddedDefaultPrompt,
  type PromptServiceConfig,
  type PromptDatabaseInterface,
} from '@orient-bot/database-services';
