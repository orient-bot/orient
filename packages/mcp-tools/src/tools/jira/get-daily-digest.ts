/**
 * Get Daily Digest Tool
 *
 * Retrieves a daily digest including in-progress issues and blockers.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { requireJiraClient } from '../context.js';

// Input schema (empty - no parameters needed)
const GetDailyDigestInput = z.object({});

type Input = z.infer<typeof GetDailyDigestInput>;

// Output type
interface DigestIssue {
  key: string;
  summary: string;
  status: string;
  assignee: string;
  daysInStatus?: number;
}

interface Output {
  date: string;
  inProgress: {
    total: number;
    issues: DigestIssue[];
  };
  blockers: {
    total: number;
    issues: DigestIssue[];
  };
  summary: string;
}

/**
 * Get Daily Digest Tool Implementation
 */
export class GetDailyDigestTool extends MCPTool<Input, Output> {
  readonly name = 'jira_get_daily_digest';
  readonly description = "Get a daily digest including today's in-progress issues and blockers.";
  readonly category = 'jira' as const;
  readonly inputSchema = GetDailyDigestInput;
  readonly keywords = ['daily', 'digest', 'summary', 'today', 'standup'];
  readonly useCases = [
    'Get a daily standup summary',
    "Review today's work status",
    'Check current progress and blockers',
  ];
  readonly examples = [{ description: 'Get daily digest', input: {} }];

  async execute(_input: Input, context: ToolContext): Promise<Output> {
    const jiraClient = requireJiraClient(context);
    const config = context.config;
    const today = new Date().toISOString().split('T')[0];

    if (!config.organization) {
      throw new Error('Organization config not available');
    }

    const projectKey = config.organization.jiraProjectKey;
    const component = config.organization.jiraComponent;

    // Get in-progress issues
    let inProgressJql = `project = "${projectKey}" AND status = "In Progress"`;
    if (component) {
      inProgressJql += ` AND component = "${component}"`;
    }
    inProgressJql += ' ORDER BY updated DESC';

    const inProgressResult = await jiraClient.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost(
      {
        jql: inProgressJql,
        maxResults: 20,
        fields: ['summary', 'status', 'assignee', 'statuscategorychangedate'],
      }
    );

    // Get blockers
    let blockersJql = `project = "${projectKey}" AND (priority = Blocker OR labels = blocked)`;
    if (component) {
      blockersJql += ` AND component = "${component}"`;
    }
    blockersJql += ' ORDER BY priority DESC';

    const blockersResult = await jiraClient.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql: blockersJql,
      maxResults: 10,
      fields: ['summary', 'status', 'assignee', 'priority'],
    });

    const now = new Date();

    const mapIssue = (issue: any): DigestIssue => {
      const fields = issue.fields as Record<string, unknown>;
      const status = fields.status as { name: string } | undefined;
      const assignee = fields.assignee as { displayName: string } | null;
      const statusChangeDate = fields.statuscategorychangedate as string | undefined;

      let daysInStatus: number | undefined;
      if (statusChangeDate) {
        const changeDate = new Date(statusChangeDate);
        daysInStatus = Math.floor((now.getTime() - changeDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        key: issue.key || '',
        summary: (fields.summary as string) || '',
        status: status?.name || 'Unknown',
        assignee: assignee?.displayName || 'Unassigned',
        daysInStatus,
      };
    };

    const inProgressIssues = (inProgressResult.issues || []).map(mapIssue);
    const blockerIssues = (blockersResult.issues || []).map(mapIssue);

    // Generate summary
    const summary = `${inProgressIssues.length} issues in progress, ${blockerIssues.length} blockers`;

    return {
      date: today,
      inProgress: {
        total: inProgressIssues.length,
        issues: inProgressIssues,
      },
      blockers: {
        total: blockerIssues.length,
        issues: blockerIssues,
      },
      summary,
    };
  }
}

// Export singleton instance
export const getDailyDigestTool = new GetDailyDigestTool();
