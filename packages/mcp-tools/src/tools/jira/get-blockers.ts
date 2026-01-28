/**
 * Get Blockers Tool
 *
 * Retrieves all blocker issues or issues with blocked label.
 */

import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';
import { requireJiraClient } from '../context.js';

// Input schema (empty - no parameters needed)
const GetBlockersInput = z.object({});

type Input = z.infer<typeof GetBlockersInput>;

// Output type
interface BlockerIssue {
  key: string;
  summary: string;
  status: string;
  assignee: string;
  priority: string;
  blockedBy?: string[];
  blocking?: string[];
}

interface Output {
  total: number;
  issues: BlockerIssue[];
}

/**
 * Get Blockers Tool Implementation
 */
export class GetBlockersTool extends MCPTool<Input, Output> {
  readonly name = 'jira_get_blockers';
  readonly description = 'Get all blocker issues or issues with blocked label for YOUR_COMPONENT.';
  readonly category = 'jira' as const;
  readonly inputSchema = GetBlockersInput;
  readonly keywords = ['blocker', 'blocked', 'blocking', 'impediment', 'issue'];
  readonly useCases = [
    'Find all blockers',
    'Check what is blocking progress',
    'Review impediments',
  ];
  readonly examples = [{ description: 'Get all blockers', input: {} }];

  async execute(_input: Input, context: ToolContext): Promise<Output> {
    const jiraClient = requireJiraClient(context);
    const config = context.config;

    if (!config.organization) {
      throw new Error('Organization config not available');
    }

    // Build JQL for blockers
    const projectKey = config.organization.jiraProjectKey;
    const component = config.organization.jiraComponent;
    let jql = `project = "${projectKey}" AND (priority = Blocker OR labels = blocked)`;
    if (component) {
      jql += ` AND component = "${component}"`;
    }
    jql += ' ORDER BY priority DESC, updated DESC';

    this.logger.debug('Executing blockers query', { jql });

    const result = await jiraClient.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 50,
      fields: ['summary', 'status', 'assignee', 'priority', 'issuelinks'],
    });

    const issues: BlockerIssue[] = (result.issues || []).map((issue) => {
      const fields = issue.fields as Record<string, unknown>;
      const status = fields.status as { name: string } | undefined;
      const assignee = fields.assignee as { displayName: string } | null;
      const priority = fields.priority as { name: string } | undefined;
      const issueLinks = fields.issuelinks as
        | Array<{
            type: { name: string; inward: string; outward: string };
            inwardIssue?: { key: string };
            outwardIssue?: { key: string };
          }>
        | undefined;

      // Extract blocking relationships
      const blockedBy: string[] = [];
      const blocking: string[] = [];

      if (issueLinks) {
        for (const link of issueLinks) {
          if (link.type.name === 'Blocks') {
            if (link.inwardIssue) {
              blockedBy.push(link.inwardIssue.key);
            }
            if (link.outwardIssue) {
              blocking.push(link.outwardIssue.key);
            }
          }
        }
      }

      return {
        key: issue.key || '',
        summary: (fields.summary as string) || '',
        status: status?.name || 'Unknown',
        assignee: assignee?.displayName || 'Unassigned',
        priority: priority?.name || 'Medium',
        blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
        blocking: blocking.length > 0 ? blocking : undefined,
      };
    });

    return {
      total: issues.length,
      issues,
    };
  }
}

// Export singleton instance
export const getBlockersTool = new GetBlockersTool();
