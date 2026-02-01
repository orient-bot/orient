/**
 * GitHub Service
 *
 * Manages GitHub API interactions for creating pull requests
 * and managing skill-related branches.
 */

import { createServiceLogger } from '@orient-bot/core';

const logger = createServiceLogger('github-service');

export interface GitHubConfig {
  /** GitHub personal access token with repo scope */
  token: string;
  /** Repository in format "owner/repo" */
  repo: string;
  /** Base branch for PRs (default: main) */
  baseBranch?: string;
  /** GitHub API base URL (default: https://api.github.com) */
  apiBaseUrl?: string;
}

export interface PRResult {
  /** Pull request number */
  number: number;
  /** Pull request URL */
  url: string;
  /** Pull request title */
  title: string;
  /** Pull request state */
  state: 'open' | 'closed' | 'merged';
}

export interface PR {
  number: number;
  title: string;
  url: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  headBranch: string;
  author: string;
}

interface GitHubError {
  message: string;
  documentation_url?: string;
  errors?: Array<{ message: string }>;
}

export class GitHubService {
  private config: Required<GitHubConfig>;
  private owner: string;
  private repoName: string;

  constructor(config: GitHubConfig) {
    this.config = {
      token: config.token,
      repo: config.repo,
      baseBranch: config.baseBranch || 'main',
      apiBaseUrl: config.apiBaseUrl || 'https://api.github.com',
    };

    // Parse owner/repo
    const [owner, repoName] = this.config.repo.split('/');
    if (!owner || !repoName) {
      throw new Error(`Invalid repo format: ${config.repo}. Expected "owner/repo"`);
    }
    this.owner = owner;
    this.repoName = repoName;

    logger.info('GitHub service initialized', { repo: config.repo });
  }

  /**
   * Make an authenticated request to GitHub API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.apiBaseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as GitHubError;
      const errorMessage = errorBody.message || `GitHub API error: ${response.status}`;
      logger.error('GitHub API error', {
        status: response.status,
        endpoint,
        error: errorMessage,
      });
      throw new Error(errorMessage);
    }

    // Handle empty responses (e.g., 204 No Content)
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  /**
   * Create a pull request from a pushed branch
   * @param branch - The head branch (your feature branch)
   * @param title - PR title
   * @param body - PR description (markdown)
   * @returns PRResult with PR details
   */
  async createPullRequest(branch: string, title: string, body: string): Promise<PRResult> {
    const op = logger.startOperation('createPullRequest', { branch, title });

    try {
      interface CreatePRResponse {
        number: number;
        html_url: string;
        title: string;
        state: string;
      }

      const result = await this.request<CreatePRResponse>(
        `/repos/${this.owner}/${this.repoName}/pulls`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            body,
            head: branch,
            base: this.config.baseBranch,
          }),
        }
      );

      const prResult: PRResult = {
        number: result.number,
        url: result.html_url,
        title: result.title,
        state: result.state as 'open' | 'closed' | 'merged',
      };

      op.success('Pull request created', { prNumber: result.number, url: result.html_url });

      return prResult;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * List open pull requests for skill branches
   * @returns Array of skill-related PRs
   */
  async listSkillPRs(): Promise<PR[]> {
    const op = logger.startOperation('listSkillPRs');

    try {
      interface ListPRResponse {
        number: number;
        title: string;
        html_url: string;
        state: string;
        created_at: string;
        updated_at: string;
        head: {
          ref: string;
        };
        user: {
          login: string;
        };
      }

      const results = await this.request<ListPRResponse[]>(
        `/repos/${this.owner}/${this.repoName}/pulls?state=open&per_page=100`
      );

      // Filter to skill-related PRs (branches starting with "skill/")
      const skillPRs = results
        .filter((pr) => pr.head.ref.startsWith('skill/'))
        .map((pr) => ({
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          state: pr.state,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          headBranch: pr.head.ref,
          author: pr.user.login,
        }));

      op.success('Listed skill PRs', { count: skillPRs.length });

      return skillPRs;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get a specific pull request by number
   */
  async getPullRequest(prNumber: number): Promise<PR> {
    interface GetPRResponse {
      number: number;
      title: string;
      html_url: string;
      state: string;
      created_at: string;
      updated_at: string;
      head: {
        ref: string;
      };
      user: {
        login: string;
      };
    }

    const result = await this.request<GetPRResponse>(
      `/repos/${this.owner}/${this.repoName}/pulls/${prNumber}`
    );

    return {
      number: result.number,
      title: result.title,
      url: result.html_url,
      state: result.state,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      headBranch: result.head.ref,
      author: result.user.login,
    };
  }

  /**
   * Add a comment to a pull request
   */
  async addPRComment(prNumber: number, body: string): Promise<void> {
    await this.request(`/repos/${this.owner}/${this.repoName}/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    logger.debug('Added comment to PR', { prNumber });
  }

  /**
   * Add labels to a pull request
   */
  async addPRLabels(prNumber: number, labels: string[]): Promise<void> {
    await this.request(`/repos/${this.owner}/${this.repoName}/issues/${prNumber}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels }),
    });

    logger.debug('Added labels to PR', { prNumber, labels });
  }

  /**
   * Check if a branch exists on remote
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.request(
        `/repos/${this.owner}/${this.repoName}/branches/${encodeURIComponent(branchName)}`
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a branch (useful for cleanup after PR merge)
   */
  async deleteBranch(branchName: string): Promise<void> {
    const op = logger.startOperation('deleteBranch', { branchName });

    try {
      await this.request(
        `/repos/${this.owner}/${this.repoName}/git/refs/heads/${encodeURIComponent(branchName)}`,
        { method: 'DELETE' }
      );

      op.success('Branch deleted');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get repository info
   */
  async getRepoInfo(): Promise<{ defaultBranch: string; fullName: string }> {
    interface RepoResponse {
      default_branch: string;
      full_name: string;
    }

    const result = await this.request<RepoResponse>(`/repos/${this.owner}/${this.repoName}`);

    return {
      defaultBranch: result.default_branch,
      fullName: result.full_name,
    };
  }

  /**
   * Generate a PR description for a skill
   */
  generateSkillPRDescription(
    skillName: string,
    skillDescription: string,
    isEdit: boolean = false
  ): string {
    const action = isEdit ? 'Update' : 'Add';

    return `## ${action} Skill: ${skillName}

### Description
${skillDescription}

### Checklist
- [ ] Skill follows naming conventions
- [ ] Description is clear and comprehensive
- [ ] Triggers are well-defined
- [ ] Content is under 500 lines (progressive disclosure)

### Testing
After merging, the skill will be automatically deployed and available for use.

---
*This PR was created automatically by the WhatsApp Skill Editor*
`;
  }
}

/**
 * Create a GitHubService instance
 */
export function createGitHubService(config: GitHubConfig): GitHubService {
  return new GitHubService(config);
}

/**
 * Create a GitHubService from environment variables
 */
export function createGitHubServiceFromEnv(): GitHubService | null {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    logger.warn('GitHub service not configured (missing GITHUB_TOKEN or GITHUB_REPO)');
    return null;
  }

  return createGitHubService({
    token,
    repo,
    baseBranch: process.env.GITHUB_BASE_BRANCH || 'main',
  });
}
