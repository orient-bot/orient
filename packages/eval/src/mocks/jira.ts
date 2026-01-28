/**
 * JIRA Mock Service
 *
 * Provides mock responses for JIRA-related tools during eval execution.
 */

import { BaseMockService } from './registry.js';
import { MockResponse } from '../types.js';

/**
 * Mock JIRA issue for testing
 */
export interface MockJiraIssue {
  key: string;
  summary: string;
  status: string;
  assignee?: string | null;
  priority?: string;
  labels?: string[];
  storyPoints?: number;
  epicKey?: string;
  created?: string;
  updated?: string;
}

/**
 * Create a mock JIRA issue with defaults
 */
export function createMockJiraIssue(overrides: Partial<MockJiraIssue> = {}): MockJiraIssue {
  return {
    key: 'PROJ-123',
    summary: 'Test issue summary',
    status: 'In Progress',
    assignee: 'John Doe',
    priority: 'Medium',
    labels: [],
    storyPoints: 3,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * JIRA mock service implementation
 */
export class JiraMockService extends BaseMockService {
  name = 'jira';

  constructor() {
    super();
    this.setupDefaults();
  }

  private setupDefaults(): void {
    // jira_get_blockers - Get blocked issues
    this.defaultResponses.set('jira_get_blockers', () => ({
      response: {
        count: 0,
        issues: [],
      },
    }));

    // jira_get_in_progress - Get in-progress issues
    this.defaultResponses.set('jira_get_in_progress', () => ({
      response: {
        count: 0,
        issues: [],
      },
    }));

    // jira_get_all_issues - Get all issues
    this.defaultResponses.set('jira_get_all_issues', () => ({
      response: {
        total: 0,
        issues: [],
      },
    }));

    // jira_get_issue - Get single issue
    this.defaultResponses.set('jira_get_issue', () => ({
      response: createMockJiraIssue(),
    }));

    // jira_get_weekly_summary - Get weekly summary
    this.defaultResponses.set('jira_get_weekly_summary', () => ({
      response: {
        weekEnding: new Date().toISOString().split('T')[0],
        summary: {
          completedCount: 0,
          velocityPoints: 0,
          addedCount: 0,
          agingCount: 0,
        },
        completed: [],
        added: [],
        aging: [],
      },
    }));

    // jira_check_overdue - Check overdue issues
    this.defaultResponses.set('jira_check_overdue', () => ({
      response: {
        count: 0,
        issues: [],
      },
    }));

    // jira_create_issue - Create issue
    this.defaultResponses.set('jira_create_issue', () => ({
      response: {
        success: true,
        issue: createMockJiraIssue({ key: 'PROJ-999' }),
      },
    }));

    // jira_update_issue - Update issue
    this.defaultResponses.set('jira_update_issue', () => ({
      response: {
        success: true,
        issue: createMockJiraIssue(),
      },
    }));

    // jira_transition_issue - Transition issue
    this.defaultResponses.set('jira_transition_issue', () => ({
      response: {
        success: true,
      },
    }));

    // jira_add_comment - Add comment
    this.defaultResponses.set('jira_add_comment', () => ({
      response: {
        success: true,
        commentId: 'comment-123',
      },
    }));

    // system_health_check - Health check
    this.defaultResponses.set('system_health_check', () => ({
      response: {
        status: 'ok',
        jira: {
          connected: true,
          host: 'mock.atlassian.net',
          project: 'YOUR_PROJECT',
          issueCount: 100,
        },
      },
    }));
  }

  /**
   * Create blockers response with custom issues
   */
  static createBlockersResponse(issues: MockJiraIssue[]): MockResponse {
    return {
      response: {
        count: issues.length,
        issues: issues.map((issue) => ({
          key: issue.key,
          summary: issue.summary,
          status: issue.status,
          assignee: issue.assignee,
          priority: issue.priority || 'Medium',
          labels: issue.labels || [],
        })),
      },
    };
  }

  /**
   * Create in-progress response with custom issues
   */
  static createInProgressResponse(issues: MockJiraIssue[]): MockResponse {
    return {
      response: {
        count: issues.length,
        issues: issues.map((issue) => ({
          key: issue.key,
          summary: issue.summary,
          status: issue.status,
          assignee: issue.assignee,
          priority: issue.priority || 'Medium',
          storyPoints: issue.storyPoints,
        })),
      },
    };
  }

  /**
   * Create weekly summary response
   */
  static createWeeklySummaryResponse(data: {
    completed?: MockJiraIssue[];
    added?: MockJiraIssue[];
    aging?: MockJiraIssue[];
    velocityPoints?: number;
  }): MockResponse {
    const completed = data.completed || [];
    const added = data.added || [];
    const aging = data.aging || [];

    return {
      response: {
        weekEnding: new Date().toISOString().split('T')[0],
        summary: {
          completedCount: completed.length,
          velocityPoints:
            data.velocityPoints || completed.reduce((sum, i) => sum + (i.storyPoints || 0), 0),
          addedCount: added.length,
          agingCount: aging.length,
        },
        completed,
        added,
        aging,
      },
    };
  }
}
