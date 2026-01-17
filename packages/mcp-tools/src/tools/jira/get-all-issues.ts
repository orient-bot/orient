/**
 * Get All Issues Tool
 *
 * Retrieves all JIRA issues for the configured component.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { requireJiraClient } from '../context.js';

// Input schema
const GetAllIssuesInput = z.object({
  limit: z.number().optional().describe('Maximum number of issues to return (default: 50)'),
});

type Input = z.infer<typeof GetAllIssuesInput>;

// Output type
interface IssueItem {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  assignee: string;
  priority: string;
  storyPoints: number | null;
  updated: string;
}

interface Output {
  total: number;
  returned: number;
  issues: IssueItem[];
}

/**
 * Get All Issues Tool Implementation
 */
export class GetAllIssuesTool extends MCPTool<Input, Output> {
  readonly name = 'ai_first_get_all_issues';
  readonly description =
    'Get all Jira issues for the YOUR_COMPONENT component. Returns issue key, summary, status, assignee, and priority.';
  readonly category = 'jira' as const;
  readonly inputSchema = GetAllIssuesInput;
  readonly keywords = ['issues', 'all', 'list', 'jira', 'tickets', 'query'];
  readonly useCases = [
    'Get a list of all issues in the project',
    'See all tickets assigned to the team',
    'Review the full backlog',
  ];
  readonly examples = [
    { description: 'Get first 50 issues', input: {} },
    { description: 'Get first 10 issues', input: { limit: 10 } },
  ];

  async execute(input: Input, context: ToolContext): Promise<Output> {
    const jiraClient = requireJiraClient(context);
    const limit = input.limit || 50;
    const config = context.config;

    if (!config.organization) {
      throw new Error('Organization config not available');
    }

    // Build JQL for the component
    const projectKey = config.organization.jiraProjectKey;
    const component = config.organization.jiraComponent;
    let jql = `project = "${projectKey}"`;
    if (component) {
      jql += ` AND component = "${component}"`;
    }

    this.logger.debug('Executing get all issues query', { jql, limit });

    const result = await jiraClient.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: limit,
      fields: [
        'summary',
        'status',
        'assignee',
        'priority',
        'updated',
        'customfield_10016', // Story points
      ],
    });

    const issues: IssueItem[] = (result.issues || []).map((issue) => {
      const fields = issue.fields as Record<string, unknown>;
      const status = fields.status as
        | { name: string; statusCategory: { name: string } }
        | undefined;
      const assignee = fields.assignee as { displayName: string } | null;
      const priority = fields.priority as { name: string } | undefined;

      return {
        key: issue.key || '',
        summary: (fields.summary as string) || '',
        status: status?.name || 'Unknown',
        statusCategory: status?.statusCategory?.name || 'Unknown',
        assignee: assignee?.displayName || 'Unassigned',
        priority: priority?.name || 'Medium',
        storyPoints: (fields.customfield_10016 as number) || null,
        updated: (fields.updated as string) || '',
      };
    });

    return {
      total: result.issues?.length || 0,
      returned: issues.length,
      issues,
    };
  }
}

// Export singleton instance
export const getAllIssuesTool = new GetAllIssuesTool();
