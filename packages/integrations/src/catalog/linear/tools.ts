/**
 * Linear Tools
 *
 * Tool implementations for Linear integration.
 * Uses the Linear GraphQL API.
 */

import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('linear-tools');

// =============================================================================
// Types
// =============================================================================

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  priorityLabel: string;
  state: {
    id: string;
    name: string;
    type: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  project?: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  labels: {
    nodes: Array<{ id: string; name: string; color: string }>;
  };
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  estimate?: number;
  url: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state: string;
  progress: number;
  startDate?: string;
  targetDate?: string;
  lead?: {
    id: string;
    name: string;
  };
  teams: {
    nodes: Array<{ id: string; name: string }>;
  };
  url: string;
}

export interface LinearCycle {
  id: string;
  number: number;
  name?: string;
  startsAt: string;
  endsAt: string;
  progress: number;
  team: {
    id: string;
    name: string;
  };
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
  private: boolean;
}

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
  };
}

// =============================================================================
// Linear Client
// =============================================================================

export class LinearClient {
  private accessToken: string;
  private apiUrl = 'https://api.linear.app/graphql';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Execute a GraphQL query
   */
  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.statusText}`);
    }

    const result = (await response.json()) as { data: T; errors?: Array<{ message: string }> };

    if (result.errors && result.errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  // ===========================================================================
  // Issues
  // ===========================================================================

  /**
   * List issues with optional filters
   */
  async listIssues(filters?: {
    teamId?: string;
    projectId?: string;
    assigneeId?: string;
    stateId?: string;
    first?: number;
  }): Promise<LinearIssue[]> {
    const op = logger.startOperation('listIssues', filters);

    try {
      const filterParts: string[] = [];
      if (filters?.teamId) filterParts.push(`team: { id: { eq: "${filters.teamId}" } }`);
      if (filters?.projectId) filterParts.push(`project: { id: { eq: "${filters.projectId}" } }`);
      if (filters?.assigneeId)
        filterParts.push(`assignee: { id: { eq: "${filters.assigneeId}" } }`);
      if (filters?.stateId) filterParts.push(`state: { id: { eq: "${filters.stateId}" } }`);

      const filterString = filterParts.length > 0 ? `filter: { ${filterParts.join(', ')} }` : '';

      const data = await this.query<{ issues: { nodes: LinearIssue[] } }>(
        `
        query ListIssues($first: Int) {
          issues(first: $first, ${filterString}) {
            nodes {
              id
              identifier
              title
              description
              priority
              priorityLabel
              state { id name type }
              assignee { id name email }
              project { id name }
              team { id name key }
              labels { nodes { id name color } }
              createdAt
              updatedAt
              dueDate
              estimate
              url
            }
          }
        }
      `,
        { first: filters?.first || 50 }
      );

      op.success('Issues listed', { count: data.issues.nodes.length });
      return data.issues.nodes;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get a specific issue
   */
  async getIssue(issueId: string): Promise<LinearIssue | null> {
    const op = logger.startOperation('getIssue', { issueId });

    try {
      const data = await this.query<{ issue: LinearIssue | null }>(
        `
        query GetIssue($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            description
            priority
            priorityLabel
            state { id name type }
            assignee { id name email }
            project { id name }
            team { id name key }
            labels { nodes { id name color } }
            createdAt
            updatedAt
            dueDate
            estimate
            url
          }
        }
      `,
        { id: issueId }
      );

      op.success('Issue retrieved', { found: !!data.issue });
      return data.issue;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(input: {
    title: string;
    teamId: string;
    description?: string;
    priority?: number;
    assigneeId?: string;
    projectId?: string;
    stateId?: string;
    labelIds?: string[];
    dueDate?: string;
    estimate?: number;
  }): Promise<LinearIssue> {
    const op = logger.startOperation('createIssue', { title: input.title, teamId: input.teamId });

    try {
      const data = await this.query<{ issueCreate: { success: boolean; issue: LinearIssue } }>(
        `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              description
              priority
              priorityLabel
              state { id name type }
              assignee { id name email }
              project { id name }
              team { id name key }
              labels { nodes { id name color } }
              createdAt
              updatedAt
              dueDate
              estimate
              url
            }
          }
        }
      `,
        { input }
      );

      if (!data.issueCreate.success) {
        throw new Error('Failed to create issue');
      }

      op.success('Issue created', { issueId: data.issueCreate.issue.id });
      return data.issueCreate.issue;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Update an issue
   */
  async updateIssue(
    issueId: string,
    input: {
      title?: string;
      description?: string;
      priority?: number;
      assigneeId?: string;
      stateId?: string;
      projectId?: string;
      labelIds?: string[];
      dueDate?: string;
      estimate?: number;
    }
  ): Promise<LinearIssue> {
    const op = logger.startOperation('updateIssue', { issueId });

    try {
      const data = await this.query<{ issueUpdate: { success: boolean; issue: LinearIssue } }>(
        `
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              title
              description
              priority
              priorityLabel
              state { id name type }
              assignee { id name email }
              project { id name }
              team { id name key }
              labels { nodes { id name color } }
              createdAt
              updatedAt
              dueDate
              estimate
              url
            }
          }
        }
      `,
        { id: issueId, input }
      );

      if (!data.issueUpdate.success) {
        throw new Error('Failed to update issue');
      }

      op.success('Issue updated');
      return data.issueUpdate.issue;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Search issues
   */
  async searchIssues(query: string, first: number = 25): Promise<LinearIssue[]> {
    const op = logger.startOperation('searchIssues', { query });

    try {
      const data = await this.query<{ issueSearch: { nodes: LinearIssue[] } }>(
        `
        query SearchIssues($query: String!, $first: Int) {
          issueSearch(query: $query, first: $first) {
            nodes {
              id
              identifier
              title
              description
              priority
              priorityLabel
              state { id name type }
              assignee { id name email }
              project { id name }
              team { id name key }
              labels { nodes { id name color } }
              createdAt
              updatedAt
              url
            }
          }
        }
      `,
        { query, first }
      );

      op.success('Issues searched', { count: data.issueSearch.nodes.length });
      return data.issueSearch.nodes;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Projects
  // ===========================================================================

  /**
   * List projects
   */
  async listProjects(first: number = 50): Promise<LinearProject[]> {
    const op = logger.startOperation('listProjects');

    try {
      const data = await this.query<{ projects: { nodes: LinearProject[] } }>(
        `
        query ListProjects($first: Int) {
          projects(first: $first) {
            nodes {
              id
              name
              description
              state
              progress
              startDate
              targetDate
              lead { id name }
              teams { nodes { id name } }
              url
            }
          }
        }
      `,
        { first }
      );

      op.success('Projects listed', { count: data.projects.nodes.length });
      return data.projects.nodes;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Cycles
  // ===========================================================================

  /**
   * List cycles for a team
   */
  async listCycles(teamId: string, first: number = 10): Promise<LinearCycle[]> {
    const op = logger.startOperation('listCycles', { teamId });

    try {
      const data = await this.query<{ team: { cycles: { nodes: LinearCycle[] } } }>(
        `
        query ListCycles($teamId: String!, $first: Int) {
          team(id: $teamId) {
            cycles(first: $first, orderBy: startsAt) {
              nodes {
                id
                number
                name
                startsAt
                endsAt
                progress
                team { id name }
              }
            }
          }
        }
      `,
        { teamId, first }
      );

      op.success('Cycles listed', { count: data.team.cycles.nodes.length });
      return data.team.cycles.nodes;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get current active cycle for a team
   */
  async getCurrentCycle(teamId: string): Promise<LinearCycle | null> {
    const op = logger.startOperation('getCurrentCycle', { teamId });

    try {
      const data = await this.query<{ team: { activeCycle: LinearCycle | null } }>(
        `
        query GetCurrentCycle($teamId: String!) {
          team(id: $teamId) {
            activeCycle {
              id
              number
              name
              startsAt
              endsAt
              progress
              team { id name }
            }
          }
        }
      `,
        { teamId }
      );

      op.success('Current cycle retrieved', { found: !!data.team.activeCycle });
      return data.team.activeCycle;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Teams
  // ===========================================================================

  /**
   * List teams
   */
  async listTeams(): Promise<LinearTeam[]> {
    const op = logger.startOperation('listTeams');

    try {
      const data = await this.query<{ teams: { nodes: LinearTeam[] } }>(`
        query ListTeams {
          teams {
            nodes {
              id
              name
              key
              description
              private
            }
          }
        }
      `);

      op.success('Teams listed', { count: data.teams.nodes.length });
      return data.teams.nodes;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Comments
  // ===========================================================================

  /**
   * List comments on an issue
   */
  async listComments(issueId: string): Promise<LinearComment[]> {
    const op = logger.startOperation('listComments', { issueId });

    try {
      const data = await this.query<{ issue: { comments: { nodes: LinearComment[] } } }>(
        `
        query ListComments($issueId: String!) {
          issue(id: $issueId) {
            comments {
              nodes {
                id
                body
                createdAt
                user { id name }
              }
            }
          }
        }
      `,
        { issueId }
      );

      op.success('Comments listed', { count: data.issue.comments.nodes.length });
      return data.issue.comments.nodes;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a comment on an issue
   */
  async createComment(issueId: string, body: string): Promise<LinearComment> {
    const op = logger.startOperation('createComment', { issueId });

    try {
      const data = await this.query<{
        commentCreate: { success: boolean; comment: LinearComment };
      }>(
        `
        mutation CreateComment($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
            comment {
              id
              body
              createdAt
              user { id name }
            }
          }
        }
      `,
        { input: { issueId, body } }
      );

      if (!data.commentCreate.success) {
        throw new Error('Failed to create comment');
      }

      op.success('Comment created');
      return data.commentCreate.comment;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Workflow States
  // ===========================================================================

  /**
   * Get workflow states for a team
   */
  async getWorkflowStates(
    teamId: string
  ): Promise<Array<{ id: string; name: string; type: string; color: string }>> {
    const op = logger.startOperation('getWorkflowStates', { teamId });

    try {
      const data = await this.query<{
        team: {
          states: { nodes: Array<{ id: string; name: string; type: string; color: string }> };
        };
      }>(
        `
        query GetWorkflowStates($teamId: String!) {
          team(id: $teamId) {
            states {
              nodes {
                id
                name
                type
                color
              }
            }
          }
        }
      `,
        { teamId }
      );

      op.success('Workflow states retrieved', { count: data.team.states.nodes.length });
      return data.team.states.nodes;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }
}

/**
 * Create a Linear client from access token
 */
export function createLinearClient(accessToken: string): LinearClient {
  return new LinearClient(accessToken);
}
