/**
 * JIRA Integration
 *
 * Complete JIRA service implementation for the Orient.
 *
 * @example
 * import {
 *   initializeJiraClient,
 *   getAllIssues,
 *   getInProgressIssues,
 *   JiraIssue,
 *   JiraUser,
 * } from '@orientbot/integrations/jira';
 *
 * // Initialize with config
 * initializeJiraClient({
 *   jira: { host: 'xxx.atlassian.net', email: '...', apiToken: '...', projectKey: 'YOUR_PROJECT', component: 'YOUR_COMPONENT' },
 *   sla: [{ status: 'In Progress', maxDays: 7 }],
 *   board: { kanbanBacklogStatuses: ['Backlog'] },
 * });
 *
 * // Use the service
 * const issues = await getAllIssues();
 */

// Re-export types
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
} from './types.js';

// Re-export service functions
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
} from './service.js';
