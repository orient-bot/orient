/**
 * JIRA Integration Types
 *
 * Type definitions for JIRA service operations.
 * These types are used across the Orient for JIRA interactions.
 */

/**
 * JIRA user information
 */
export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl: string;
}

/**
 * JIRA sprint information
 */
export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate: string | null;
  endDate: string | null;
}

/**
 * JIRA issue representation
 */
export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  status: string;
  statusCategory: 'To Do' | 'In Progress' | 'Done';
  assignee: JiraUser | null;
  reporter: JiraUser | null;
  priority: string;
  created: string;
  updated: string;
  storyPoints: number | null;
  labels: string[];
  sprint: JiraSprint | null;
}

/**
 * SLA breach information
 */
export interface SLABreach {
  issue: JiraIssue;
  status: string;
  daysInStatus: number;
  maxAllowedDays: number;
}

/**
 * Issue transition from changelog
 */
export interface DigestTransition {
  issue: JiraIssue;
  fromStatus: string;
  toStatus: string;
}

/**
 * JIRA service configuration
 */
export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
  projectKey: string;
  component: string;
}

/**
 * SLA configuration for a status
 */
export interface SLAConfig {
  status: string;
  maxDays: number;
}

/**
 * Board configuration
 */
export interface BoardConfig {
  kanbanBacklogStatuses: string[];
}

/**
 * Full JIRA service configuration including SLA and board settings
 */
export interface JiraServiceConfig {
  jira: JiraConfig;
  sla: SLAConfig[];
  board: BoardConfig;
}

/**
 * Issue link type information
 */
export interface IssueLink {
  id: string;
  type: {
    id: string;
    name: string;
    inward: string;
    outward: string;
  };
  inwardIssue?: {
    id: string;
    key: string;
    summary?: string;
    status?: string;
  };
  outwardIssue?: {
    id: string;
    key: string;
    summary?: string;
    status?: string;
  };
}
