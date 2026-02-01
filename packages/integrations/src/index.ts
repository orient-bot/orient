/**
 * @orient-bot/integrations
 *
 * External service integrations for the Orient.
 * Provides unified access to Google, Linear, GitHub, and other services.
 *
 * @example
 * // Google types and service
 * import * as google from '@orient-bot/integrations/google';
 *
 * // New catalog-based integrations
 * import * as catalog from '@orient-bot/integrations/catalog';
 * import { IntegrationManifest } from '@orient-bot/integrations/types';
 */

// Re-export Google types
export * from './google/index.js';

// Re-export legacy GitHub/worktree services
export * from './github.js';
export * from './gitWorktree.js';

// Re-export Gemini types and functions
export type {
  GeminiConfig,
  GeminiServiceInterface,
  ImageGenerationResult,
  MascotVariationInput,
  MascotVariationResult,
  MascotVariationType,
} from './gemini/index.js';

export {
  initializeGeminiClient,
  getGeminiClient,
  isGeminiInitialized,
  generateImage,
  editImage,
  generateMascotVariation,
  createGeminiService,
} from './gemini/index.js';

// Re-export integration types
export type {
  IntegrationManifest,
  IntegrationOAuthConfig,
  IntegrationSecret,
  IntegrationTool,
  IntegrationWebhookConfig,
  IntegrationConnection,
  IntegrationConnectionStatus,
  IntegrationAuditEntry,
  IntegrationCatalogEntry,
} from './types/integration.js';

export { validateManifest } from './types/integration.js';

/**
 * Integration Services Status
 *
 * Package-native implementations:
 * - Google services (migrated)
 *
 * Services available via src/services/:
 * - googleOAuthService - OAuth authentication
 * - gmailService - Email functionality
 * - calendarService - Calendar management
 * - tasksService - Task management
 * - sheetsService - Spreadsheet operations
 * - slidesService - Presentation operations
 * - sheetsOAuthService - OAuth for Sheets
 * - slidesOAuthService - OAuth for Slides
 * - githubService - GitHub API
 * - gitWorktreeService - Git worktree management
 */
export const INTEGRATIONS_SERVICES = {
  // Package-native (preferred)
  google: 'migrated',
  gemini: 'migrated',
  // Catalog-based integrations (new architecture)
  catalogIntegrations: ['linear', 'github'],
  // Available via src/services/ imports
  srcServices: [],
  reExportedServices: ['githubService', 'gitWorktreeService'],
} as const;
