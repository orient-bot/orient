/**
 * Get Weekly Summary Tool
 *
 * Retrieves a weekly summary with completed issues and velocity.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { requireJiraClient } from '../context.js';

// Input schema (empty - no parameters needed)
const GetWeeklySummaryInput = z.object({});

type Input = z.infer<typeof GetWeeklySummaryInput>;

// Output type
interface SummaryIssue {
  key: string;
  summary: string;
  storyPoints: number | null;
}

interface Output {
  weekStart: string;
  weekEnd: string;
  completed: {
    total: number;
    storyPoints: number;
    issues: SummaryIssue[];
  };
  created: {
    total: number;
    storyPoints: number;
  };
  velocity: number;
  summary: string;
}

/**
 * Get Weekly Summary Tool Implementation
 */
export class GetWeeklySummaryTool extends MCPTool<Input, Output> {
  readonly name = 'jira_get_weekly_summary';
  readonly description =
    'Get a weekly summary including completed issues, velocity points, newly added issues, and aging tickets.';
  readonly category = 'jira' as const;
  readonly inputSchema = GetWeeklySummaryInput;
  readonly keywords = ['weekly', 'summary', 'velocity', 'completed', 'report'];
  readonly useCases = [
    'Get weekly progress report',
    'Check team velocity',
    'Review completed work',
  ];
  readonly examples = [{ description: 'Get weekly summary', input: {} }];

  async execute(_input: Input, context: ToolContext): Promise<Output> {
    const jiraClient = requireJiraClient(context);
    const config = context.config;

    if (!config.organization) {
      throw new Error('Organization config not available');
    }

    // Calculate week bounds
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = now.toISOString().split('T')[0];

    const projectKey = config.organization.jiraProjectKey;
    const component = config.organization.jiraComponent;

    // Get completed issues this week
    let completedJql = `project = "${projectKey}" AND status = Done AND resolved >= -7d`;
    if (component) {
      completedJql += ` AND component = "${component}"`;
    }
    completedJql += ' ORDER BY resolved DESC';

    const completedResult = await jiraClient.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql: completedJql,
      maxResults: 50,
      fields: ['summary', 'customfield_10016'], // Story points
    });

    // Get created issues this week
    let createdJql = `project = "${projectKey}" AND created >= -7d`;
    if (component) {
      createdJql += ` AND component = "${component}"`;
    }

    const createdResult = await jiraClient.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql: createdJql,
      maxResults: 50,
      fields: ['summary', 'customfield_10016'],
    });

    // Process completed issues
    const completedIssues: SummaryIssue[] = [];
    let completedPoints = 0;

    for (const issue of completedResult.issues || []) {
      const fields = issue.fields as Record<string, unknown>;
      const points = (fields.customfield_10016 as number) || 0;
      completedPoints += points;
      completedIssues.push({
        key: issue.key || '',
        summary: (fields.summary as string) || '',
        storyPoints: points || null,
      });
    }

    // Process created issues
    let createdPoints = 0;
    for (const issue of createdResult.issues || []) {
      const fields = issue.fields as Record<string, unknown>;
      createdPoints += (fields.customfield_10016 as number) || 0;
    }

    const velocity = completedPoints;
    const summary = `Completed ${completedIssues.length} issues (${completedPoints} points), created ${createdResult.issues?.length || 0} new issues`;

    return {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      completed: {
        total: completedIssues.length,
        storyPoints: completedPoints,
        issues: completedIssues,
      },
      created: {
        total: createdResult.issues?.length || 0,
        storyPoints: createdPoints,
      },
      velocity,
      summary,
    };
  }
}

// Export singleton instance
export const getWeeklySummaryTool = new GetWeeklySummaryTool();
