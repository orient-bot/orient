/**
 * JIRA Integration (Catalog)
 *
 * Exports JIRA OAuth service and re-exports JIRA service functions.
 * Supports both API token and OAuth authentication methods.
 */

// Export OAuth service
export {
  JiraOAuthService,
  getJiraOAuthService,
  resetJiraOAuthService,
  DEFAULT_JIRA_SCOPES,
  IS_JIRA_OAUTH_PRODUCTION,
  type JiraAccount,
} from './oauth.js';

// Re-export JIRA service functions from main jira directory
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
} from '../../jira/index.js';

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
} from '../../jira/index.js';
