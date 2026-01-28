/**
 * GitHub Tools
 *
 * Tool implementations for GitHub integration.
 * Uses the GitHub REST API v3.
 */

import { createServiceLogger } from '@orientbot/core';

const logger = createServiceLogger('github-tools');

// =============================================================================
// Types
// =============================================================================

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  owner: {
    login: string;
    id: number;
    avatarUrl: string;
    type: string;
  };
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  htmlUrl: string;
  draft: boolean;
  merged: boolean;
  mergedAt: string | null;
  mergeable: boolean | null;
  mergeableState: string;
  head: {
    ref: string;
    sha: string;
    repo: { fullName: string };
  };
  base: {
    ref: string;
    sha: string;
    repo: { fullName: string };
  };
  user: {
    login: string;
    id: number;
    avatarUrl: string;
  };
  labels: Array<{ id: number; name: string; color: string }>;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  htmlUrl: string;
  user: {
    login: string;
    id: number;
    avatarUrl: string;
  };
  labels: Array<{ id: number; name: string; color: string }>;
  assignees: Array<{ login: string; id: number; avatarUrl: string }>;
  milestone: { id: number; title: string; number: number } | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  comments: number;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  htmlUrl: string;
  author: {
    login: string;
    avatarUrl: string;
  } | null;
  committer: {
    login: string;
    avatarUrl: string;
  } | null;
  commit: {
    author: { name: string; email: string; date: string };
    committer: { name: string; email: string; date: string };
    message: string;
  };
}

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  htmlUrl: string;
  createdAt: string;
  publishedAt: string | null;
  author: {
    login: string;
    avatarUrl: string;
  };
  assets: Array<{
    id: number;
    name: string;
    size: number;
    downloadCount: number;
    browserDownloadUrl: string;
  }>;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  headBranch: string;
  headSha: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  runNumber: number;
  event: string;
  workflowId: number;
}

// =============================================================================
// GitHub Client
// =============================================================================

export class GitHubClient {
  private accessToken: string;
  private apiUrl = 'https://api.github.com';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Make an authenticated request to GitHub API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
        message: string;
      };
      throw new Error(`GitHub API error: ${error.message}`);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) return {} as T;

    return JSON.parse(text) as T;
  }

  // ===========================================================================
  // Repositories
  // ===========================================================================

  /**
   * List repositories for the authenticated user
   */
  async listRepositories(options?: {
    type?: 'all' | 'owner' | 'public' | 'private' | 'member';
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    direction?: 'asc' | 'desc';
    perPage?: number;
    page?: number;
  }): Promise<GitHubRepository[]> {
    const op = logger.startOperation('listRepositories', options);

    try {
      const params = new URLSearchParams();
      if (options?.type) params.set('type', options.type);
      if (options?.sort) params.set('sort', options.sort);
      if (options?.direction) params.set('direction', options.direction);
      if (options?.perPage) params.set('per_page', String(options.perPage));
      if (options?.page) params.set('page', String(options.page));

      const data = await this.request<
        Array<{
          id: number;
          name: string;
          full_name: string;
          description: string | null;
          private: boolean;
          html_url: string;
          clone_url: string;
          ssh_url: string;
          default_branch: string;
          language: string | null;
          stargazers_count: number;
          forks_count: number;
          open_issues_count: number;
          created_at: string;
          updated_at: string;
          pushed_at: string;
          owner: { login: string; id: number; avatar_url: string; type: string };
        }>
      >(`/user/repos?${params}`);

      const repos = data.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        defaultBranch: repo.default_branch,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        forksCount: repo.forks_count,
        openIssuesCount: repo.open_issues_count,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        owner: {
          login: repo.owner.login,
          id: repo.owner.id,
          avatarUrl: repo.owner.avatar_url,
          type: repo.owner.type,
        },
      }));

      op.success('Repositories listed', { count: repos.length });
      return repos;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get a specific repository
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const op = logger.startOperation('getRepository', { owner, repo });

    try {
      const data = await this.request<{
        id: number;
        name: string;
        full_name: string;
        description: string | null;
        private: boolean;
        html_url: string;
        clone_url: string;
        ssh_url: string;
        default_branch: string;
        language: string | null;
        stargazers_count: number;
        forks_count: number;
        open_issues_count: number;
        created_at: string;
        updated_at: string;
        pushed_at: string;
        owner: { login: string; id: number; avatar_url: string; type: string };
      }>(`/repos/${owner}/${repo}`);

      op.success('Repository retrieved');
      return {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        private: data.private,
        htmlUrl: data.html_url,
        cloneUrl: data.clone_url,
        sshUrl: data.ssh_url,
        defaultBranch: data.default_branch,
        language: data.language,
        stargazersCount: data.stargazers_count,
        forksCount: data.forks_count,
        openIssuesCount: data.open_issues_count,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        pushedAt: data.pushed_at,
        owner: {
          login: data.owner.login,
          id: data.owner.id,
          avatarUrl: data.owner.avatar_url,
          type: data.owner.type,
        },
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Pull Requests
  // ===========================================================================

  /**
   * List pull requests
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options?: {
      state?: 'open' | 'closed' | 'all';
      head?: string;
      base?: string;
      sort?: 'created' | 'updated' | 'popularity' | 'long-running';
      direction?: 'asc' | 'desc';
      perPage?: number;
    }
  ): Promise<GitHubPullRequest[]> {
    const op = logger.startOperation('listPullRequests', { owner, repo, ...options });

    try {
      const params = new URLSearchParams();
      if (options?.state) params.set('state', options.state);
      if (options?.head) params.set('head', options.head);
      if (options?.base) params.set('base', options.base);
      if (options?.sort) params.set('sort', options.sort);
      if (options?.direction) params.set('direction', options.direction);
      if (options?.perPage) params.set('per_page', String(options.perPage));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await this.request<any[]>(`/repos/${owner}/${repo}/pulls?${params}`);

      const prs = data.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        htmlUrl: pr.html_url,
        draft: pr.draft,
        merged: pr.merged || false,
        mergedAt: pr.merged_at,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state || '',
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
          repo: { fullName: pr.head.repo?.full_name || '' },
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
          repo: { fullName: pr.base.repo?.full_name || '' },
        },
        user: {
          login: pr.user.login,
          id: pr.user.id,
          avatarUrl: pr.user.avatar_url,
        },
        labels: pr.labels.map((l: { id: number; name: string; color: string }) => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        closedAt: pr.closed_at,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changedFiles: pr.changed_files || 0,
      }));

      op.success('Pull requests listed', { count: prs.length });
      return prs;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    input: {
      title: string;
      head: string;
      base: string;
      body?: string;
      draft?: boolean;
    }
  ): Promise<GitHubPullRequest> {
    const op = logger.startOperation('createPullRequest', { owner, repo, title: input.title });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await this.request<any>(`/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify(input),
      });

      op.success('Pull request created', { number: data.number });
      return {
        id: data.id,
        number: data.number,
        title: data.title,
        body: data.body,
        state: data.state,
        htmlUrl: data.html_url,
        draft: data.draft,
        merged: false,
        mergedAt: null,
        mergeable: data.mergeable,
        mergeableState: data.mergeable_state || '',
        head: {
          ref: data.head.ref,
          sha: data.head.sha,
          repo: { fullName: data.head.repo?.full_name || '' },
        },
        base: {
          ref: data.base.ref,
          sha: data.base.sha,
          repo: { fullName: data.base.repo?.full_name || '' },
        },
        user: {
          login: data.user.login,
          id: data.user.id,
          avatarUrl: data.user.avatar_url,
        },
        labels: [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        closedAt: null,
        additions: 0,
        deletions: 0,
        changedFiles: 0,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    options?: {
      commitTitle?: string;
      commitMessage?: string;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
    }
  ): Promise<{ sha: string; merged: boolean; message: string }> {
    const op = logger.startOperation('mergePullRequest', { owner, repo, pullNumber });

    try {
      const data = await this.request<{ sha: string; merged: boolean; message: string }>(
        `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
        {
          method: 'PUT',
          body: JSON.stringify({
            commit_title: options?.commitTitle,
            commit_message: options?.commitMessage,
            merge_method: options?.mergeMethod || 'merge',
          }),
        }
      );

      op.success('Pull request merged', { sha: data.sha });
      return data;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Issues
  // ===========================================================================

  /**
   * List issues
   */
  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: 'open' | 'closed' | 'all';
      labels?: string;
      assignee?: string;
      sort?: 'created' | 'updated' | 'comments';
      direction?: 'asc' | 'desc';
      perPage?: number;
    }
  ): Promise<GitHubIssue[]> {
    const op = logger.startOperation('listIssues', { owner, repo, ...options });

    try {
      const params = new URLSearchParams();
      if (options?.state) params.set('state', options.state);
      if (options?.labels) params.set('labels', options.labels);
      if (options?.assignee) params.set('assignee', options.assignee);
      if (options?.sort) params.set('sort', options.sort);
      if (options?.direction) params.set('direction', options.direction);
      if (options?.perPage) params.set('per_page', String(options.perPage));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await this.request<any[]>(`/repos/${owner}/${repo}/issues?${params}`);

      // Filter out pull requests (they appear in issues API too)
      const issues = data
        .filter((item) => !item.pull_request)
        .map((issue) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          htmlUrl: issue.html_url,
          user: {
            login: issue.user.login,
            id: issue.user.id,
            avatarUrl: issue.user.avatar_url,
          },
          labels: issue.labels.map((l: { id: number; name: string; color: string }) => ({
            id: l.id,
            name: l.name,
            color: l.color,
          })),
          assignees: issue.assignees.map(
            (a: { login: string; id: number; avatar_url: string }) => ({
              login: a.login,
              id: a.id,
              avatarUrl: a.avatar_url,
            })
          ),
          milestone: issue.milestone
            ? {
                id: issue.milestone.id,
                title: issue.milestone.title,
                number: issue.milestone.number,
              }
            : null,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
          comments: issue.comments,
        }));

      op.success('Issues listed', { count: issues.length });
      return issues;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create an issue
   */
  async createIssue(
    owner: string,
    repo: string,
    input: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: number;
    }
  ): Promise<GitHubIssue> {
    const op = logger.startOperation('createIssue', { owner, repo, title: input.title });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await this.request<any>(`/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        body: JSON.stringify(input),
      });

      op.success('Issue created', { number: data.number });
      return {
        id: data.id,
        number: data.number,
        title: data.title,
        body: data.body,
        state: data.state,
        htmlUrl: data.html_url,
        user: {
          login: data.user.login,
          id: data.user.id,
          avatarUrl: data.user.avatar_url,
        },
        labels: data.labels.map((l: { id: number; name: string; color: string }) => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
        assignees: data.assignees.map((a: { login: string; id: number; avatar_url: string }) => ({
          login: a.login,
          id: a.id,
          avatarUrl: a.avatar_url,
        })),
        milestone: data.milestone
          ? { id: data.milestone.id, title: data.milestone.title, number: data.milestone.number }
          : null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        closedAt: data.closed_at,
        comments: data.comments,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Branches
  // ===========================================================================

  /**
   * List branches
   */
  async listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    const op = logger.startOperation('listBranches', { owner, repo });

    try {
      const data = await this.request<
        Array<{
          name: string;
          commit: { sha: string; url: string };
          protected: boolean;
        }>
      >(`/repos/${owner}/${repo}/branches`);

      op.success('Branches listed', { count: data.length });
      return data;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a branch
   */
  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromSha: string
  ): Promise<{ ref: string; sha: string }> {
    const op = logger.startOperation('createBranch', { owner, repo, branchName });

    try {
      const data = await this.request<{ ref: string; object: { sha: string } }>(
        `/repos/${owner}/${repo}/git/refs`,
        {
          method: 'POST',
          body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha: fromSha,
          }),
        }
      );

      op.success('Branch created');
      return { ref: data.ref, sha: data.object.sha };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(owner: string, repo: string, branchName: string): Promise<void> {
    const op = logger.startOperation('deleteBranch', { owner, repo, branchName });

    try {
      await this.request(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
        method: 'DELETE',
      });

      op.success('Branch deleted');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  // ===========================================================================
  // Releases
  // ===========================================================================

  /**
   * List releases
   */
  async listReleases(owner: string, repo: string, perPage: number = 30): Promise<GitHubRelease[]> {
    const op = logger.startOperation('listReleases', { owner, repo });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await this.request<any[]>(
        `/repos/${owner}/${repo}/releases?per_page=${perPage}`
      );

      const releases = data.map((release) => ({
        id: release.id,
        tagName: release.tag_name,
        name: release.name,
        body: release.body,
        draft: release.draft,
        prerelease: release.prerelease,
        htmlUrl: release.html_url,
        createdAt: release.created_at,
        publishedAt: release.published_at,
        author: {
          login: release.author.login,
          avatarUrl: release.author.avatar_url,
        },
        assets: release.assets.map(
          (asset: {
            id: number;
            name: string;
            size: number;
            download_count: number;
            browser_download_url: string;
          }) => ({
            id: asset.id,
            name: asset.name,
            size: asset.size,
            downloadCount: asset.download_count,
            browserDownloadUrl: asset.browser_download_url,
          })
        ),
      }));

      op.success('Releases listed', { count: releases.length });
      return releases;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get latest release
   */
  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null> {
    const op = logger.startOperation('getLatestRelease', { owner, repo });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await this.request<any>(`/repos/${owner}/${repo}/releases/latest`);

      op.success('Latest release retrieved', { tagName: data.tag_name });
      return {
        id: data.id,
        tagName: data.tag_name,
        name: data.name,
        body: data.body,
        draft: data.draft,
        prerelease: data.prerelease,
        htmlUrl: data.html_url,
        createdAt: data.created_at,
        publishedAt: data.published_at,
        author: {
          login: data.author.login,
          avatarUrl: data.author.avatar_url,
        },
        assets: data.assets.map(
          (asset: {
            id: number;
            name: string;
            size: number;
            download_count: number;
            browser_download_url: string;
          }) => ({
            id: asset.id,
            name: asset.name,
            size: asset.size,
            downloadCount: asset.download_count,
            browserDownloadUrl: asset.browser_download_url,
          })
        ),
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return null;
    }
  }

  // ===========================================================================
  // Workflow Runs
  // ===========================================================================

  /**
   * List workflow runs
   */
  async listWorkflowRuns(
    owner: string,
    repo: string,
    options?: {
      branch?: string;
      event?: string;
      status?:
        | 'completed'
        | 'action_required'
        | 'cancelled'
        | 'failure'
        | 'neutral'
        | 'skipped'
        | 'success'
        | 'timed_out'
        | 'in_progress'
        | 'queued'
        | 'requested'
        | 'waiting';
      perPage?: number;
    }
  ): Promise<GitHubWorkflowRun[]> {
    const op = logger.startOperation('listWorkflowRuns', { owner, repo, ...options });

    try {
      const params = new URLSearchParams();
      if (options?.branch) params.set('branch', options.branch);
      if (options?.event) params.set('event', options.event);
      if (options?.status) params.set('status', options.status);
      if (options?.perPage) params.set('per_page', String(options.perPage));

      const data = await this.request<{
        workflow_runs: Array<{
          id: number;
          name: string;
          head_branch: string;
          head_sha: string;
          status: string;
          conclusion: string | null;
          html_url: string;
          created_at: string;
          updated_at: string;
          run_number: number;
          event: string;
          workflow_id: number;
        }>;
      }>(`/repos/${owner}/${repo}/actions/runs?${params}`);

      const runs = data.workflow_runs.map((run) => ({
        id: run.id,
        name: run.name,
        headBranch: run.head_branch,
        headSha: run.head_sha,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.html_url,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        runNumber: run.run_number,
        event: run.event,
        workflowId: run.workflow_id,
      }));

      op.success('Workflow runs listed', { count: runs.length });
      return runs;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Trigger a workflow dispatch
   */
  async triggerWorkflowDispatch(
    owner: string,
    repo: string,
    workflowId: string | number,
    ref: string,
    inputs?: Record<string, string>
  ): Promise<void> {
    const op = logger.startOperation('triggerWorkflowDispatch', { owner, repo, workflowId, ref });

    try {
      await this.request(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref, inputs }),
      });

      op.success('Workflow dispatch triggered');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }
}

/**
 * Create a GitHub client from access token
 */
export function createGitHubClient(accessToken: string): GitHubClient {
  return new GitHubClient(accessToken);
}
