/**
 * Get In Progress Issues Tool
 *
 * Retrieves all issues currently in progress for the component.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { requireJiraClient } from '../context.js';

// Input schema (empty - no parameters needed)
const GetInProgressInput = z.object({});

type Input = z.infer<typeof GetInProgressInput>;

// Output type
interface InProgressIssue {
  key: string;
  summary: string;
  assignee: string;
  priority: string;
  daysInProgress: number;
}

interface Output {
  total: number;
  issues: InProgressIssue[];
}

/**
 * Get In Progress Issues Tool Implementation
 */
export class GetInProgressTool extends MCPTool<Input, Output> {
  readonly name = 'jira_get_in_progress';
  readonly description = 'Get all issues currently in progress for the YOUR_COMPONENT component.';
  readonly category = 'jira' as const;
  readonly inputSchema = GetInProgressInput;
  readonly keywords = ['in progress', 'working', 'active', 'current', 'ongoing'];
  readonly useCases = [
    'See what everyone is working on',
    'Check current work in progress',
    'Review active tickets',
  ];
  readonly examples = [{ description: 'Get all in-progress issues', input: {} }];

  async execute(_input: Input, context: ToolContext): Promise<Output> {
    const jiraClient = requireJiraClient(context);
    const config = context.config;

    if (!config.organization) {
      throw new Error('Organization config not available');
    }

    // Build JQL for in-progress issues
    const projectKey = config.organization.jiraProjectKey;
    const component = config.organization.jiraComponent;
    let jql = `project = "${projectKey}" AND status = "In Progress"`;
    if (component) {
      jql += ` AND component = "${component}"`;
    }
    jql += ' ORDER BY updated DESC';

    this.logger.debug('Executing in-progress query', { jql });

    const result = await jiraClient.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 50,
      fields: ['summary', 'assignee', 'priority', 'updated', 'statuscategorychangedate'],
    });

    const now = new Date();
    const issues: InProgressIssue[] = (result.issues || []).map((issue) => {
      const fields = issue.fields as Record<string, unknown>;
      const assignee = fields.assignee as { displayName: string } | null;
      const priority = fields.priority as { name: string } | undefined;
      const statusChangeDate = fields.statuscategorychangedate as string | undefined;

      // Calculate days in progress
      let daysInProgress = 0;
      if (statusChangeDate) {
        const changeDate = new Date(statusChangeDate);
        daysInProgress = Math.floor((now.getTime() - changeDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        key: issue.key || '',
        summary: (fields.summary as string) || '',
        assignee: assignee?.displayName || 'Unassigned',
        priority: priority?.name || 'Medium',
        daysInProgress,
      };
    });

    return {
      total: issues.length,
      issues,
    };
  }
}

// Export singleton instance
export const getInProgressTool = new GetInProgressTool();
