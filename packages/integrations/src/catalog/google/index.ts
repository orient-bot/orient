/**
 * Google Workspace Integration (Catalog)
 *
 * Re-exports Google services from the main google/ directory.
 * This catalog entry provides the manifest and integration metadata.
 */

// Re-export OAuth service and related functions
export {
  GoogleOAuthService,
  getGoogleOAuthService,
  resetGoogleOAuthService,
  createGoogleOAuthService,
  handleGoogleOAuthCallback,
  IS_GOOGLE_OAUTH_PRODUCTION,
  DEFAULT_SCOPES,
  GOOGLE_OAUTH_SCOPES,
  type GoogleAccount,
  type GoogleOAuthConfig,
} from '../../google/oauth.js';

// Re-export other Google services
export * from '../../google/gmail.js';
export * from '../../google/calendar.js';
export * from '../../google/tasks.js';
export * from '../../google/sheets.js';
export * from '../../google/slides.js';
