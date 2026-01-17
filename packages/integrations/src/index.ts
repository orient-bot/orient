/**
 * @orient/integrations
 *
 * External service integrations for the Orient.
 * Provides unified access to JIRA, Google, Linear, GitHub, and other services.
 *
 * @example
 * // JIRA types and service
 * import {
 *   initializeJiraClient,
 *   getAllIssues,
 *   JiraIssue,
 *   JiraUser,
 * } from '@orient/integrations';
 *
 * // Or use the subpath export
 * import * as jira from '@orient/integrations/jira';
 * import * as google from '@orient/integrations/google';
 *
 * // New catalog-based integrations
 * import * as catalog from '@orient/integrations/catalog';
 * import { IntegrationManifest } from '@orient/integrations/types';
 */

// Re-export JIRA types
export type {
  JiraUser,
  JiraIssue,
  JiraSprint,
  SLABreach,
  DigestTransition,
  JiraConfig,
  JiraServiceConfig,
  SLAConfig,
  BoardConfig,
  IssueLink,
} from './jira/index.js';

// Re-export JIRA service functions
export {
  initializeJiraClient,
  getJiraClient,
  testConnection,
  getIssueCount,
  getAllIssues,
  getIssuesByStatus,
  getInProgressIssues,
  getBoardIssues,
  getBlockerIssues,
  getIssueByKey,
  getRecentlyUpdatedIssues,
  checkSLABreaches,
  getYesterdayTransitions,
  getActiveSprintIssues,
  getCompletedThisWeek,
  getCreatedThisWeek,
  findJiraUserByEmail,
  deleteIssueLink,
  createIssueLink,
  getIssueLinks,
} from './jira/index.js';

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
 * - JIRA service functions (fully migrated)
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
 * - jiraService - Legacy JIRA service
 * - githubService - GitHub API
 * - gitWorktreeService - Git worktree management
 */
export const INTEGRATIONS_SERVICES = {
  // Package-native (preferred)
  jira: 'fully-migrated',
  google: 'migrated',
  gemini: 'migrated',
  // Catalog-based integrations (new architecture)
  catalogIntegrations: ['linear', 'github'],
  // Available via src/services/ imports
  srcServices: ['jiraService'],
  reExportedServices: ['githubService', 'gitWorktreeService'],
} as const;
