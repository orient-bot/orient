/**
 * JIRA Service
 *
 * Service for interacting with JIRA API.
 * Provides all JIRA-related operations for the Orient.
 *
 * @packageDocumentation
 */

import { Version3Client } from 'jira.js';
import { createServiceLogger } from '@orientbot/core';
import type {
  JiraIssue,
  JiraUser,
  SLABreach,
  DigestTransition,
  JiraServiceConfig,
  IssueLink,
} from './types.js';

// Create a service-specific logger
const jiraLogger = createServiceLogger('jira-service');

// Module-level client instance
let jiraClient: Version3Client | null = null;
let serviceConfig: JiraServiceConfig | null = null;

/**
 * Initialize the JIRA client with configuration
 */
export function initializeJiraClient(config: JiraServiceConfig): Version3Client {
  const op = jiraLogger.startOperation('initializeClient');

  try {
    serviceConfig = config;
    jiraClient = new Version3Client({
      host: `https://${config.jira.host}`,
      authentication: {
        basic: {
          email: config.jira.email,
          apiToken: config.jira.apiToken,
        },
      },
    });

    op.success('Jira client initialized', { host: config.jira.host });
    return jiraClient;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * Get the initialized JIRA client
 */
export function getJiraClient(): Version3Client {
  if (!jiraClient) {
    jiraLogger.error('Jira client not initialized', {
      hint: 'Call initializeJiraClient() first',
    });
    throw new Error('Jira client not initialized. Call initializeJiraClient() first.');
  }
  return jiraClient;
}

/**
 * Get the service configuration
 */
function getServiceConfig(): JiraServiceConfig {
  if (!serviceConfig) {
    throw new Error('JIRA service not initialized. Call initializeJiraClient() first.');
  }
  return serviceConfig;
}

/**
 * Test JIRA connection
 */
export async function testConnection(): Promise<boolean> {
  const op = jiraLogger.startOperation('testConnection');
  const client = getJiraClient();

  try {
    const user = await client.myself.getCurrentUser();
    op.success('Connection verified', {
      user: user.displayName,
      accountId: user.accountId,
    });
    return true;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    return false;
  }
}

/**
 * Build base JQL for the configured component
 */
function buildBaseJQL(): string {
  const config = getServiceConfig();
  const jql = `project = "${config.jira.projectKey}" AND component = "${config.jira.component}"`;
  jiraLogger.debug('Built base JQL', { jql });
  return jql;
}

/**
 * Transform Jira API response to JiraIssue type
 */
function transformIssue(issue: {
  id: string;
  key: string;
  fields: Record<string, unknown>;
}): JiraIssue {
  const fields = issue.fields;
  const status = fields.status as { name: string; statusCategory: { name: string } } | undefined;
  const assignee = fields.assignee as {
    accountId: string;
    displayName: string;
    emailAddress: string;
    avatarUrls: { '48x48': string };
  } | null;
  const reporter = fields.reporter as {
    accountId: string;
    displayName: string;
    emailAddress: string;
    avatarUrls: { '48x48': string };
  } | null;
  const priority = fields.priority as { name: string } | undefined;
  const sprint = (fields.sprint as { id: number; name: string; state: string } | undefined) || null;

  const transformed: JiraIssue = {
    id: issue.id,
    key: issue.key,
    summary: (fields.summary as string) || '',
    description: (fields.description as string) || null,
    status: status?.name || 'Unknown',
    statusCategory: (status?.statusCategory?.name as 'To Do' | 'In Progress' | 'Done') || 'To Do',
    assignee: assignee
      ? {
          accountId: assignee.accountId,
          displayName: assignee.displayName,
          emailAddress: assignee.emailAddress,
          avatarUrl: assignee.avatarUrls?.['48x48'] || '',
        }
      : null,
    reporter: reporter
      ? {
          accountId: reporter.accountId,
          displayName: reporter.displayName,
          emailAddress: reporter.emailAddress,
          avatarUrl: reporter.avatarUrls?.['48x48'] || '',
        }
      : null,
    priority: priority?.name || 'Medium',
    created: (fields.created as string) || new Date().toISOString(),
    updated: (fields.updated as string) || new Date().toISOString(),
    storyPoints: (fields.customfield_10016 as number) || null,
    labels: (fields.labels as string[]) || [],
    sprint: sprint
      ? {
          id: sprint.id,
          name: sprint.name,
          state: sprint.state as 'active' | 'closed' | 'future',
          startDate: null,
          endDate: null,
        }
      : null,
  };

  jiraLogger.debug('Transformed issue', {
    key: transformed.key,
    status: transformed.status,
    assignee: transformed.assignee?.displayName,
  });

  return transformed;
}

/**
 * Get issue count for health check
 */
export async function getIssueCount(): Promise<number> {
  const op = jiraLogger.startOperation('getIssueCount');
  const client = getJiraClient();
  const jql = buildBaseJQL();

  try {
    jiraLogger.debug('Executing count query', { jql });

    const result = await client.issueSearch.countIssues({
      jql,
    });

    const count = result.count || 0;
    op.success('Issue count retrieved', { count, jql });
    return count;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { jql });
    return 0;
  }
}

/**
 * Get all issues for the configured component
 */
export async function getAllIssues(): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getAllIssues');
  const client = getJiraClient();
  const jql = buildBaseJQL();

  try {
    const issues: JiraIssue[] = [];
    const maxResults = 100;
    let pageCount = 0;
    let nextPageToken: string | undefined = undefined;

    jiraLogger.debug('Starting paginated fetch', { jql, maxResults });

    // eslint-disable-next-line no-constant-condition -- pagination loop with break condition inside
    while (true) {
      pageCount++;
      jiraLogger.debug('Fetching page', { page: pageCount, hasToken: !!nextPageToken, maxResults });

      const result: { issues?: unknown[]; nextPageToken?: string } =
        await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
          jql,
          nextPageToken,
          maxResults,
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
            'customfield_10016',
          ],
        });

      if (!result.issues || result.issues.length === 0) {
        jiraLogger.debug('No more issues in response');
        break;
      }

      jiraLogger.debug('Page received', {
        page: pageCount,
        issuesInPage: result.issues.length,
        hasNextPage: !!result.nextPageToken,
      });

      for (const issue of result.issues) {
        issues.push(
          transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
        );
      }

      if (!result.nextPageToken) break;
      nextPageToken = result.nextPageToken;
    }

    op.success('All issues fetched', {
      totalIssues: issues.length,
      pagesProcessed: pageCount,
      issueKeys: issues.slice(0, 5).map((i) => i.key),
    });

    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { jql });
    return [];
  }
}

/**
 * Get issues by status
 */
export async function getIssuesByStatus(status: string): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getIssuesByStatus', { status });
  const client = getJiraClient();
  const jql = `${buildBaseJQL()} AND status = "${status}"`;

  try {
    jiraLogger.debug('Executing status query', { jql, status });

    const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 100,
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
      ],
    });

    const issues = (result.issues || []).map((issue) =>
      transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
    );

    op.success('Issues by status fetched', { status, count: issues.length });
    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { status, jql });
    return [];
  }
}

/**
 * Get issues in progress
 */
export async function getInProgressIssues(): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getInProgressIssues');
  const client = getJiraClient();
  const jql = `${buildBaseJQL()} AND statusCategory = "In Progress"`;

  try {
    jiraLogger.debug('Executing in-progress query', { jql });

    const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 100,
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
      ],
    });

    const issues = (result.issues || []).map((issue) =>
      transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
    );

    op.success('In-progress issues fetched', {
      count: issues.length,
      issueKeys: issues.map((i) => i.key),
    });
    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { jql });
    return [];
  }
}

/**
 * Get board issues (excluding Kanban backlog statuses)
 */
export async function getBoardIssues(): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getBoardIssues');
  const client = getJiraClient();
  const config = getServiceConfig();

  const backlogStatuses = config.board.kanbanBacklogStatuses;
  const backlogExclusion = backlogStatuses.map((s) => `"${s}"`).join(', ');
  const jql = `${buildBaseJQL()} AND status NOT IN (${backlogExclusion})`;

  try {
    jiraLogger.debug('Executing board issues query (excluding Kanban backlog)', {
      jql,
      excludedStatuses: backlogStatuses,
    });

    const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 100,
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
        'customfield_10016',
      ],
    });

    const issues = (result.issues || []).map((issue) =>
      transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
    );

    op.success('Board issues fetched (excluding Kanban backlog)', {
      count: issues.length,
      issueKeys: issues.map((i) => i.key),
      statuses: [...new Set(issues.map((i) => i.status))],
    });
    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { jql });
    return [];
  }
}

/**
 * Get issues with blocker priority or blocked label
 */
export async function getBlockerIssues(): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getBlockerIssues');
  const client = getJiraClient();
  const jql = `${buildBaseJQL()} AND (priority = Blocker OR labels = blocked)`;

  try {
    jiraLogger.debug('Executing blocker query', { jql });

    const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 100,
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
      ],
    });

    const issues = (result.issues || []).map((issue) =>
      transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
    );

    op.success('Blocker issues fetched', {
      count: issues.length,
      issueKeys: issues.map((i) => i.key),
      priorities: issues.map((i) => i.priority),
    });
    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { jql });
    return [];
  }
}

/**
 * Get a specific issue by key
 */
export async function getIssueByKey(issueKey: string): Promise<JiraIssue | null> {
  const op = jiraLogger.startOperation('getIssueByKey', { issueKey });
  const client = getJiraClient();

  try {
    jiraLogger.debug('Fetching single issue', { issueKey });

    const issue = await client.issues.getIssue({
      issueIdOrKey: issueKey,
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
      ],
    });

    const transformed = transformIssue(
      issue as unknown as { id: string; key: string; fields: Record<string, unknown> }
    );

    op.success('Issue fetched', {
      issueKey,
      status: transformed.status,
      assignee: transformed.assignee?.displayName,
    });
    return transformed;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { issueKey });
    return null;
  }
}

/**
 * Get issues updated in the last N hours
 */
export async function getRecentlyUpdatedIssues(hours: number): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getRecentlyUpdatedIssues', { hours });
  const client = getJiraClient();
  const jql = `${buildBaseJQL()} AND updated >= -${hours}h`;

  try {
    jiraLogger.debug('Executing recently updated query', { jql, hours });

    const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 100,
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
      ],
    });

    const issues = (result.issues || []).map((issue) =>
      transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
    );

    op.success('Recently updated issues fetched', {
      hours,
      count: issues.length,
      issueKeys: issues.map((i) => i.key),
    });
    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { hours, jql });
    return [];
  }
}

/**
 * Check for SLA breaches
 */
export async function checkSLABreaches(): Promise<SLABreach[]> {
  const op = jiraLogger.startOperation('checkSLABreaches');
  const client = getJiraClient();
  const config = getServiceConfig();
  const breaches: SLABreach[] = [];

  jiraLogger.debug('Checking SLA configurations', {
    configs: config.sla.map((s) => ({ status: s.status, maxDays: s.maxDays })),
  });

  for (const slaConfig of config.sla) {
    const jql = `${buildBaseJQL()} AND status = "${slaConfig.status}" AND updated < -${slaConfig.maxDays}d`;

    try {
      jiraLogger.debug('Checking SLA for status', {
        status: slaConfig.status,
        maxDays: slaConfig.maxDays,
        jql,
      });

      const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
        jql,
        maxResults: 100,
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
        ],
      });

      const statusBreaches: SLABreach[] = [];

      for (const issue of result.issues || []) {
        const transformedIssue = transformIssue(
          issue as { id: string; key: string; fields: Record<string, unknown> }
        );
        const updatedDate = new Date(transformedIssue.updated);
        const now = new Date();
        const daysInStatus = Math.floor(
          (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const breach: SLABreach = {
          issue: transformedIssue,
          status: slaConfig.status,
          daysInStatus,
          maxAllowedDays: slaConfig.maxDays,
        };

        statusBreaches.push(breach);
        breaches.push(breach);
      }

      jiraLogger.debug('SLA check complete for status', {
        status: slaConfig.status,
        breachCount: statusBreaches.length,
        breachedKeys: statusBreaches.map((b) => b.issue.key),
      });
    } catch (error) {
      jiraLogger.warn('Failed to check SLA for status', {
        status: slaConfig.status,
        error: error instanceof Error ? error.message : String(error),
        jql,
      });
    }
  }

  op.success('SLA breach check complete', {
    totalBreaches: breaches.length,
    byStatus: config.sla.map((s) => ({
      status: s.status,
      breaches: breaches.filter((b) => b.status === s.status).length,
    })),
  });

  return breaches;
}

/**
 * Get transitions from yesterday (issues that changed status)
 */
export async function getYesterdayTransitions(): Promise<DigestTransition[]> {
  const op = jiraLogger.startOperation('getYesterdayTransitions');

  try {
    jiraLogger.debug('Fetching issues updated in last 24h for transition detection');

    const recentIssues = await getRecentlyUpdatedIssues(24);
    const transitions: DigestTransition[] = [];

    for (const issue of recentIssues) {
      if (issue.statusCategory === 'Done') {
        transitions.push({
          issue,
          fromStatus: 'In Progress',
          toStatus: issue.status,
        });
      }
    }

    op.success('Yesterday transitions identified', {
      totalRecentIssues: recentIssues.length,
      transitionsFound: transitions.length,
      transitionKeys: transitions.map((t) => t.issue.key),
    });
    return transitions;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error));
    return [];
  }
}

/**
 * Get active sprint issues
 */
export async function getActiveSprintIssues(): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getActiveSprintIssues');
  const client = getJiraClient();
  const jql = `${buildBaseJQL()} AND sprint in openSprints()`;

  try {
    jiraLogger.debug('Executing active sprint query', { jql });

    const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 100,
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
        'customfield_10016',
      ],
    });

    const issues = (result.issues || []).map((issue) =>
      transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
    );

    const totalPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);

    op.success('Active sprint issues fetched', {
      count: issues.length,
      totalStoryPoints: totalPoints,
      byStatus: {
        todo: issues.filter((i) => i.statusCategory === 'To Do').length,
        inProgress: issues.filter((i) => i.statusCategory === 'In Progress').length,
        done: issues.filter((i) => i.statusCategory === 'Done').length,
      },
    });
    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { jql });
    return [];
  }
}

/**
 * Get completed issues in the last week
 */
export async function getCompletedThisWeek(): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getCompletedThisWeek');
  const client = getJiraClient();
  const jql = `${buildBaseJQL()} AND statusCategory = Done AND status changed to Done after -7d`;

  try {
    jiraLogger.debug('Executing completed this week query', { jql });

    const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 100,
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
        'customfield_10016',
      ],
    });

    const issues = (result.issues || []).map((issue) =>
      transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
    );

    const velocityPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);

    op.success('Completed this week fetched', {
      count: issues.length,
      velocityPoints,
      issueKeys: issues.map((i) => i.key),
    });
    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { jql });
    return [];
  }
}

/**
 * Get issues created this week
 */
export async function getCreatedThisWeek(): Promise<JiraIssue[]> {
  const op = jiraLogger.startOperation('getCreatedThisWeek');
  const client = getJiraClient();
  const jql = `${buildBaseJQL()} AND created >= -7d`;

  try {
    jiraLogger.debug('Executing created this week query', { jql });

    const result = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
      jql,
      maxResults: 100,
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
      ],
    });

    const issues = (result.issues || []).map((issue) =>
      transformIssue(issue as { id: string; key: string; fields: Record<string, unknown> })
    );

    op.success('Created this week fetched', {
      count: issues.length,
      issueKeys: issues.map((i) => i.key),
      byPriority: {
        blocker: issues.filter((i) => i.priority === 'Blocker').length,
        critical: issues.filter((i) => i.priority === 'Critical').length,
        major: issues.filter((i) => i.priority === 'Major').length,
        medium: issues.filter((i) => i.priority === 'Medium').length,
        minor: issues.filter((i) => i.priority === 'Minor').length,
      },
    });
    return issues;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { jql });
    return [];
  }
}

/**
 * Map Slack user to Jira user (by email if available)
 */
export async function findJiraUserByEmail(email: string): Promise<JiraUser | null> {
  const op = jiraLogger.startOperation('findJiraUserByEmail', { email });
  const client = getJiraClient();

  try {
    jiraLogger.debug('Searching for Jira user', { email });

    const users = await client.userSearch.findUsers({
      query: email,
      maxResults: 1,
    });

    if (users && users.length > 0) {
      const user = users[0];
      const jiraUser: JiraUser = {
        accountId: user.accountId || '',
        displayName: user.displayName || '',
        emailAddress: email,
        avatarUrl: user.avatarUrls?.['48x48'] || '',
      };

      op.success('Jira user found', {
        email,
        displayName: jiraUser.displayName,
        accountId: jiraUser.accountId,
      });
      return jiraUser;
    }

    op.success('No Jira user found', { email });
    return null;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { email });
    return null;
  }
}

/**
 * Delete an issue link by its ID
 */
export async function deleteIssueLink(linkId: string): Promise<boolean> {
  const op = jiraLogger.startOperation('deleteIssueLink');
  const client = getJiraClient();

  try {
    jiraLogger.debug('Deleting issue link', { linkId });

    await client.issueLinks.deleteIssueLink({ linkId });

    op.success('Issue link deleted', { linkId });
    return true;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { linkId });
    return false;
  }
}

/**
 * Create an issue link between two issues
 */
export async function createIssueLink(
  inwardIssueKey: string,
  outwardIssueKey: string,
  linkType: string = 'Blocks',
  comment?: string
): Promise<boolean> {
  const op = jiraLogger.startOperation('createIssueLink');
  const client = getJiraClient();

  try {
    jiraLogger.debug('Creating issue link', {
      inwardIssue: inwardIssueKey,
      outwardIssue: outwardIssueKey,
      linkType,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkPayload: any = {
      type: { name: linkType },
      inwardIssue: { key: inwardIssueKey },
      outwardIssue: { key: outwardIssueKey },
    };

    if (comment) {
      linkPayload.comment = {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment,
                },
              ],
            },
          ],
        },
      };
    }

    await client.issueLinks.linkIssues(linkPayload);

    op.success('Issue link created', {
      inwardIssue: inwardIssueKey,
      outwardIssue: outwardIssueKey,
      linkType,
    });
    return true;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), {
      inwardIssue: inwardIssueKey,
      outwardIssue: outwardIssueKey,
      linkType,
    });
    return false;
  }
}

/**
 * Get all issue links for a given issue
 */
export async function getIssueLinks(issueKey: string): Promise<IssueLink[]> {
  const op = jiraLogger.startOperation('getIssueLinks');
  const client = getJiraClient();

  try {
    jiraLogger.debug('Getting issue links', { issueKey });

    const issue = await client.issues.getIssue({
      issueIdOrKey: issueKey,
      fields: ['issuelinks'],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const links = ((issue.fields as any).issuelinks || []) as IssueLink[];

    op.success('Issue links retrieved', {
      issueKey,
      linkCount: links.length,
    });

    return links;
  } catch (error) {
    op.failure(error instanceof Error ? error : String(error), { issueKey });
    return [];
  }
}
