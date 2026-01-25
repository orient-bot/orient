/**
 * Google Integration
 *
 * Re-exports Google service types and implementations.
 *
 * @example
 * import {
 *   SlideInfo,
 *   GmailMessage,
 *   CalendarEvent,
 *   Task,
 * } from '@orient/integrations/google';
 */

// Re-export all types
export type {
  // Slides types
  SlideInfo,
  SlideContent,
  TableContent,
  TextReplacement,
  SlidesConfig,
  // Sheets types
  SpreadsheetInfo,
  CreateSpreadsheetResult,
  SheetsConfig,
  // Gmail types
  GmailMessage,
  GmailMessageDetails,
  GmailSearchOptions,
  GmailSendOptions,
  GmailDraftOptions,
  // Calendar types
  CalendarEvent,
  CalendarSearchOptions,
  CreateEventOptions,
  // Tasks types
  TaskList,
  Task,
  CreateTaskOptions,
  // OAuth types
  GoogleOAuthConfig,
  GoogleTokens,
} from './types.js';

// OAuth service types (from sheets-oauth.ts and slides-oauth.ts)
export type {
  SpreadsheetInfo as SpreadsheetOAuthInfo,
  CellRange,
  CreateSpreadsheetOptions,
  UpdateValuesOptions,
} from './sheets-oauth.js';

export type { PresentationInfo, TextReplacement as TextReplacementOAuth } from './slides-oauth.js';

// Service implementations
export * from './oauth.js';
export * from './oauth-proxy.js';
export * from './gmail.js';
export * from './calendar.js';
export * from './tasks.js';
export * from './sheets.js';
export * from './slides.js';
export * from './sheets-oauth.js';
export * from './slides-oauth.js';

export const GOOGLE_SERVICES_MIGRATION_PENDING = false;

export const GOOGLE_MIGRATION_STATUS = {
  types: 'migrated',
  slides: 'migrated',
  sheets: 'migrated',
  gmail: 'migrated',
  calendar: 'migrated',
  tasks: 'migrated',
  oauth: 'migrated',
  sheetsOAuth: 'migrated',
  slidesOAuth: 'migrated',
  sourceLocation: 'packages/integrations/src/google/',
} as const;
