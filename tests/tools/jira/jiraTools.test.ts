import { describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '@orient/mcp-tools';
import { getIssueTool, getAllIssuesTool, getInProgressTool } from '@orient/mcp-tools';

const baseContext = {
  config: {
    organization: {
      jiraProjectKey: 'PROJ',
      jiraComponent: 'YOUR_COMPONENT',
    },
  },
  correlationId: 'test',
} as ToolContext;

describe('jira tools', () => {
  it('gets issue details', async () => {
    const jiraClient = {
      issues: {
        getIssue: vi.fn().mockResolvedValue({
          id: '1',
          key: 'PROJ-1',
          fields: {
            summary: 'Issue summary',
            description: 'Details',
            status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
            assignee: { accountId: 'a', displayName: 'Dev', emailAddress: 'dev@example.com' },
            reporter: { accountId: 'b', displayName: 'PM', emailAddress: 'pm@example.com' },
            priority: { name: 'High' },
            created: '2025-01-01',
            updated: '2025-01-02',
            labels: ['bug'],
            customfield_10016: 5,
          },
        }),
      },
    };

    const result = await getIssueTool.execute(
      { issueKey: 'PROJ-1' },
      { ...baseContext, jiraClient }
    );

    expect(result.key).toBe('PROJ-1');
    expect(result.summary).toBe('Issue summary');
    // New implementation returns flat assignee name, not nested object
    expect(result.assignee).toBe('Dev');
  });

  it('lists all issues with JQL', async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      issues: [
        {
          key: 'PROJ-2',
          fields: {
            summary: 'Issue 2',
            status: { name: 'Done', statusCategory: { name: 'Done' } },
            assignee: null,
            priority: { name: 'Low' },
            updated: '2025-01-03',
            customfield_10016: null,
          },
        },
      ],
    });

    const jiraClient = {
      issueSearch: {
        searchForIssuesUsingJqlEnhancedSearchPost: searchSpy,
      },
    };

    const result = await getAllIssuesTool.execute({ limit: 10 }, { ...baseContext, jiraClient });

    // New implementation returns 'issues' array and 'total' count
    expect(result.issues?.length).toBe(1);
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        maxResults: 10,
      })
    );
  });

  it('lists in-progress issues', async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      issues: [
        {
          key: 'PROJ-3',
          fields: {
            summary: 'Issue 3',
            status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
            assignee: { displayName: 'Dev' },
            updated: '2025-01-04',
          },
        },
      ],
    });

    const jiraClient = {
      issueSearch: {
        searchForIssuesUsingJqlEnhancedSearchPost: searchSpy,
      },
    };

    const result = await getInProgressTool.execute({}, { ...baseContext, jiraClient });

    // New implementation returns 'issues' array
    expect(result.issues?.length).toBe(1);
    expect(searchSpy).toHaveBeenCalled();
  });
});
