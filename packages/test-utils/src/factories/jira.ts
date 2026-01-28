/**
 * JIRA Test Factories
 *
 * Create test data for JIRA-related tests.
 */

import type { JiraIssue, JiraUser, JiraSprint } from '@orientbot/core';

let issueCounter = 1;

/**
 * Create a mock JIRA user
 */
export function createJiraUser(overrides: Partial<JiraUser> = {}): JiraUser {
  return {
    accountId: `user-${Date.now()}`,
    displayName: 'Test User',
    emailAddress: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    ...overrides,
  };
}

/**
 * Create a mock JIRA issue
 */
export function createJiraIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  const id = issueCounter++;
  return {
    id: String(id),
    key: `TEST-${id}`,
    summary: `Test issue ${id}`,
    description: null,
    status: 'To Do',
    statusCategory: 'To Do',
    assignee: null,
    reporter: null,
    priority: 'Medium',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    storyPoints: null,
    labels: [],
    sprint: null,
    ...overrides,
  };
}

/**
 * Create a mock JIRA sprint
 */
export function createJiraSprint(overrides: Partial<JiraSprint> = {}): JiraSprint {
  return {
    id: Date.now(),
    name: 'Test Sprint',
    state: 'active',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/**
 * Transition type for workflow tests
 */
export interface TestJiraTransition {
  id: string;
  name: string;
}

/**
 * Create mock JIRA transitions for workflow tests
 */
export function createJiraTransitions(): TestJiraTransition[] {
  return [
    { id: '1', name: 'To Do' },
    { id: '2', name: 'In Progress' },
    { id: '3', name: 'Done' },
  ];
}

/**
 * Reset the issue counter (useful between tests)
 */
export function resetIssueCounter(): void {
  issueCounter = 1;
}
