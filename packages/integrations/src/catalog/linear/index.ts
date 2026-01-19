/**
 * Linear Integration
 *
 * Complete Linear integration with OAuth and API tools.
 */

// OAuth config (legacy functions)
export {
  LINEAR_SCOPES,
  getLinearAuthUrl,
  exchangeLinearCode,
  revokeLinearToken,
  getLinearUserInfo,
  getLinearOAuthConfigFromEnv,
  type LinearOAuthConfig,
  type LinearTokens,
  type LinearUserInfo,
} from './oauth-config.js';

// OAuth service (new unified service)
export {
  LinearOAuthService,
  getLinearOAuthService,
  resetLinearOAuthService,
  DEFAULT_LINEAR_SCOPES,
  IS_LINEAR_OAUTH_PRODUCTION,
  type LinearAccount,
} from './oauth.js';

// API tools
export * from './tools.js';
