import Anthropic from '@anthropic-ai/sdk';

/**
 * Core JIRA tool definitions shared between all agents.
 */
export const JIRA_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'get_all_issues',
    description:
      'Get all Jira issues for the Orient task force. Use this to see the full backlog or answer questions about total issues.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of issues to return (default: 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_issue_details',
    description:
      'Get detailed information about a specific Jira issue by its key (e.g., PROJ-123).',
    input_schema: {
      type: 'object' as const,
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'get_in_progress_issues',
    description:
      'Get all issues that are currently in progress. Use this when asked about active work or what people are working on.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_board_issues',
    description:
      'Get all issues currently visible on the Kanban board (excluding Kanban backlog). Returns issues in board columns like TO DO, IN PROGRESS, and DONE - but NOT issues in the Kanban backlog section. Use this when asked about "issues on the board", "open issues", "opened issues now", or what is currently visible/active on the Jira Kanban board.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_blocker_issues',
    description:
      'Get all blocker issues or issues marked as blocked. Use this when asked about blockers, impediments, or urgent issues.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'check_sla_breaches',
    description:
      'Check for SLA breaches - tickets that have been in a status longer than allowed. Use this for stale ticket reports.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_sprint_issues',
    description:
      'Get all issues in the current active sprint. Use this for sprint status or burndown questions.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_completed_this_week',
    description:
      'Get issues completed in the last 7 days. Use this for velocity, progress, or accomplishment questions.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_created_this_week',
    description:
      'Get issues created in the last 7 days. Use this to see what new work has been added recently.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_issues_by_status',
    description:
      'Get issues filtered by a specific status (e.g., "To Do", "In Progress", "In Review", "Done").',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          description: 'The Jira status to filter by',
        },
      },
      required: ['status'],
    },
  },
];

export const JIRA_EXTENDED_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'get_board_issues',
    description:
      'Get all issues currently visible on the Kanban board (excluding Kanban backlog). Returns issues in board columns like TO DO, IN PROGRESS, and DONE - but NOT issues in the Kanban backlog section. Use this when asked about "issues on the board", "open issues", "opened issues now", or what is currently visible/active on the Jira Kanban board.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_blocker_issues',
    description:
      'Get all blocker issues or issues marked as blocked. Use this when asked about blockers, impediments, or urgent issues.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'check_sla_breaches',
    description:
      'Check for SLA breaches - tickets that have been in a status longer than allowed. Use this for stale ticket reports.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

export function getSlackJiraTools(): Anthropic.Tool[] {
  return [...JIRA_TOOL_DEFINITIONS];
}

export function getWhatsAppJiraTools(): Anthropic.Tool[] {
  return [...JIRA_TOOL_DEFINITIONS, ...JIRA_EXTENDED_TOOL_DEFINITIONS];
}
