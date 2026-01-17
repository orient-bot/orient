/**
 * Get Issue Tool
 *
 * Retrieves details of a specific JIRA issue by key.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { requireJiraClient } from '../context.js';

// Input schema
const GetIssueInput = z.object({
  issueKey: z.string().describe('The Jira issue key (e.g., PROJ-123)'),
});

type Input = z.infer<typeof GetIssueInput>;

// Output type
interface Output {
  key: string;
  summary: string;
  description: string | null;
  status: string;
  statusCategory: string;
  assignee: string | null;
  reporter: string | null;
  priority: string;
  created: string;
  updated: string;
  storyPoints: number | null;
  labels: string[];
  components: string[];
  sprint: string | null;
}

/**
 * Get Issue Tool Implementation
 */
export class GetIssueTool extends MCPTool<Input, Output> {
  readonly name = 'ai_first_get_issue';
  readonly description = 'Get details of a specific Jira issue by its key (e.g., PROJ-123).';
  readonly category = 'jira' as const;
  readonly inputSchema = GetIssueInput;
  readonly keywords = ['issue', 'ticket', 'details', 'jira', 'get', 'fetch'];
  readonly useCases = [
    'Get details of a specific ticket',
    'Check the status of an issue',
    'Look up information about a JIRA ticket',
  ];
  readonly examples = [{ description: 'Get issue PROJ-123', input: { issueKey: 'PROJ-123' } }];

  async execute(input: Input, context: ToolContext): Promise<Output> {
    const jiraClient = requireJiraClient(context);

    this.logger.debug('Fetching issue', { issueKey: input.issueKey });

    const issue = await jiraClient.issues.getIssue({
      issueIdOrKey: input.issueKey,
      fields: [
        'summary',
        'description',
        'status',
        'assignee',
        'reporter',
        'priority',
        'created',
        'updated',
        'labels',
        'components',
        'customfield_10016', // Story points
        'customfield_10020', // Sprint
      ],
    });

    const fields = issue.fields as Record<string, unknown>;
    const status = fields.status as { name: string; statusCategory: { name: string } } | undefined;
    const assignee = fields.assignee as { displayName: string } | null;
    const reporter = fields.reporter as { displayName: string } | null;
    const priority = fields.priority as { name: string } | undefined;
    const components = fields.components as Array<{ name: string }> | undefined;
    const sprints = fields.customfield_10020 as Array<{ name: string }> | null;

    return {
      key: issue.key || '',
      summary: (fields.summary as string) || '',
      description: (fields.description as string) || null,
      status: status?.name || 'Unknown',
      statusCategory: status?.statusCategory?.name || 'Unknown',
      assignee: assignee?.displayName || null,
      reporter: reporter?.displayName || null,
      priority: priority?.name || 'Medium',
      created: (fields.created as string) || '',
      updated: (fields.updated as string) || '',
      storyPoints: (fields.customfield_10016 as number) || null,
      labels: (fields.labels as string[]) || [],
      components: components?.map((c) => c.name) || [],
      sprint: sprints?.[0]?.name || null,
    };
  }
}

// Export singleton instance
export const getIssueTool = new GetIssueTool();
