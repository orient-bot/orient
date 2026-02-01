/**
 * Git Worktree Service
 *
 * Manages isolated git worktrees for skill development.
 * Worktrees allow editing skills on feature branches without
 * affecting the main checkout where the agent is running.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createServiceLogger } from '@orient-bot/core';

const execAsync = promisify(exec);
const logger = createServiceLogger('git-worktree');

export interface WorktreeResult {
  /** Path to the worktree directory */
  worktreePath: string;
  /** Name of the branch created */
  branchName: string;
  /** Cleanup function to remove worktree when done */
  cleanup: () => Promise<void>;
}

export interface SkillFileResult {
  /** Path to the created SKILL.md file */
  skillFilePath: string;
  /** Path to the skill directory */
  skillDirPath: string;
}

export interface GitWorktreeConfig {
  /** Base directory for worktrees (default: $HOME/skill-worktrees) */
  worktreeBase?: string;
  /** Path to the main repository */
  repoPath: string;
  /** Remote name (default: origin) */
  remoteName?: string;
  /** Base branch to create feature branches from (default: main) */
  baseBranch?: string;
  /** Path to skills directory within the repo (default: .claude/skills) */
  skillsPath?: string;
}

export class GitWorktreeService {
  private config: Required<GitWorktreeConfig>;

  constructor(config: GitWorktreeConfig) {
    this.config = {
      worktreeBase: config.worktreeBase || path.join(os.homedir(), 'skill-worktrees'),
      repoPath: config.repoPath,
      remoteName: config.remoteName || 'origin',
      baseBranch: config.baseBranch || 'main',
      skillsPath: config.skillsPath || '.claude/skills',
    };

    // Ensure worktree base directory exists
    if (!fs.existsSync(this.config.worktreeBase)) {
      fs.mkdirSync(this.config.worktreeBase, { recursive: true });
      logger.info('Created worktree base directory', { path: this.config.worktreeBase });
    }
  }

  /**
   * Create an isolated worktree for skill editing
   * @param skillName - Name of the skill (used in branch name)
   * @returns WorktreeResult with path, branch, and cleanup function
   */
  async createWorktree(skillName: string): Promise<WorktreeResult> {
    const op = logger.startOperation('createWorktree', { skillName });

    try {
      // Generate unique branch name
      const timestamp = Date.now();
      const sanitizedName = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const branchName = `skill/${sanitizedName}-${timestamp}`;
      const worktreePath = path.join(this.config.worktreeBase, `${sanitizedName}-${timestamp}`);

      // Fetch latest from remote to ensure we have up-to-date refs
      logger.debug('Fetching latest from remote');
      await execAsync(`git fetch ${this.config.remoteName}`, { cwd: this.config.repoPath });

      // Create the worktree with a new branch based on latest main
      logger.debug('Creating worktree', { worktreePath, branchName });
      await execAsync(
        `git worktree add -b "${branchName}" "${worktreePath}" "${this.config.remoteName}/${this.config.baseBranch}"`,
        { cwd: this.config.repoPath }
      );

      // Create cleanup function
      const cleanup = async (): Promise<void> => {
        await this.removeWorktree(worktreePath, branchName);
      };

      op.success('Worktree created', { worktreePath, branchName });

      return {
        worktreePath,
        branchName,
        cleanup,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Write a skill file in the worktree
   * @param worktreePath - Path to the worktree
   * @param skillName - Name of the skill
   * @param content - Full SKILL.md content (including frontmatter)
   * @returns SkillFileResult with paths
   */
  async writeSkillFile(
    worktreePath: string,
    skillName: string,
    content: string
  ): Promise<SkillFileResult> {
    const op = logger.startOperation('writeSkillFile', { skillName });

    try {
      const sanitizedName = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const skillDirPath = path.join(worktreePath, this.config.skillsPath, sanitizedName);
      const skillFilePath = path.join(skillDirPath, 'SKILL.md');

      // Create skill directory
      fs.mkdirSync(skillDirPath, { recursive: true });

      // Write SKILL.md
      fs.writeFileSync(skillFilePath, content, 'utf-8');

      op.success('Skill file written', { skillFilePath });

      return {
        skillFilePath,
        skillDirPath,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Update an existing skill file in the worktree
   * @param worktreePath - Path to the worktree
   * @param skillName - Name of the skill
   * @param content - Updated SKILL.md content
   */
  async updateSkillFile(
    worktreePath: string,
    skillName: string,
    content: string
  ): Promise<SkillFileResult> {
    return this.writeSkillFile(worktreePath, skillName, content);
  }

  /**
   * Add additional files to a skill directory (references, scripts, assets)
   * @param worktreePath - Path to the worktree
   * @param skillName - Name of the skill
   * @param subPath - Path within the skill directory (e.g., "references/schema.md")
   * @param content - File content
   */
  async addSkillResource(
    worktreePath: string,
    skillName: string,
    subPath: string,
    content: string
  ): Promise<string> {
    const sanitizedName = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const filePath = path.join(worktreePath, this.config.skillsPath, sanitizedName, subPath);

    // Ensure directory exists
    const dirPath = path.dirname(filePath);
    fs.mkdirSync(dirPath, { recursive: true });

    // Write file
    fs.writeFileSync(filePath, content, 'utf-8');

    logger.debug('Added skill resource', { skillName, subPath, filePath });

    return filePath;
  }

  /**
   * Commit changes in the worktree
   * @param worktreePath - Path to the worktree
   * @param message - Commit message
   */
  async commit(worktreePath: string, message: string): Promise<string> {
    const op = logger.startOperation('commit', { worktreePath });

    try {
      // Stage all changes
      await execAsync('git add -A', { cwd: worktreePath });

      // Check if there are changes to commit
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: worktreePath });
      if (!status.trim()) {
        throw new Error('No changes to commit');
      }

      // Commit
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: worktreePath,
      });

      // Get commit hash
      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: worktreePath });
      const commitHash = hash.trim();

      op.success('Changes committed', { commitHash });

      return commitHash;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Push the branch to remote
   * @param worktreePath - Path to the worktree
   * @param branchName - Name of the branch to push
   */
  async push(worktreePath: string, branchName: string): Promise<void> {
    const op = logger.startOperation('push', { branchName });

    try {
      await execAsync(`git push -u ${this.config.remoteName} ${branchName}`, {
        cwd: worktreePath,
      });

      op.success('Branch pushed to remote');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Commit and push changes in one operation
   * @param worktreePath - Path to the worktree
   * @param branchName - Name of the branch
   * @param message - Commit message
   * @returns Commit hash
   */
  async commitAndPush(worktreePath: string, branchName: string, message: string): Promise<string> {
    const commitHash = await this.commit(worktreePath, message);
    await this.push(worktreePath, branchName);
    return commitHash;
  }

  /**
   * Remove a worktree and optionally its branch
   * @param worktreePath - Path to the worktree
   * @param branchName - Name of the branch to delete (optional)
   */
  async removeWorktree(worktreePath: string, branchName?: string): Promise<void> {
    const op = logger.startOperation('removeWorktree', { worktreePath });

    try {
      // Remove the worktree
      if (fs.existsSync(worktreePath)) {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: this.config.repoPath,
        });
        logger.debug('Worktree removed', { worktreePath });
      }

      // Optionally delete the local branch (remote branch stays for PR)
      if (branchName) {
        try {
          await execAsync(`git branch -D "${branchName}"`, {
            cwd: this.config.repoPath,
          });
          logger.debug('Local branch deleted', { branchName });
        } catch {
          // Branch might not exist locally anymore, that's fine
          logger.debug('Could not delete local branch (may not exist)', { branchName });
        }
      }

      op.success('Worktree cleanup complete');
    } catch (error) {
      // Log but don't throw - cleanup is best-effort
      op.failure(error instanceof Error ? error : String(error));
    }
  }

  /**
   * List all active worktrees
   */
  async listWorktrees(): Promise<Array<{ path: string; branch: string }>> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: this.config.repoPath,
      });

      const worktrees: Array<{ path: string; branch: string }> = [];
      const lines = stdout.split('\n');

      let currentPath = '';
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentPath = line.substring(9);
        } else if (line.startsWith('branch ')) {
          const branch = line.substring(7);
          if (currentPath && branch.startsWith('refs/heads/skill/')) {
            worktrees.push({
              path: currentPath,
              branch: branch.replace('refs/heads/', ''),
            });
          }
          currentPath = '';
        }
      }

      return worktrees;
    } catch (error) {
      logger.error('Failed to list worktrees', { error });
      return [];
    }
  }

  /**
   * Clean up stale worktrees (older than specified hours)
   * @param maxAgeHours - Maximum age in hours before cleanup (default: 24)
   */
  async cleanupStaleWorktrees(maxAgeHours: number = 24): Promise<number> {
    const op = logger.startOperation('cleanupStaleWorktrees', { maxAgeHours });

    try {
      const worktrees = await this.listWorktrees();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
      const now = Date.now();
      let cleaned = 0;

      for (const wt of worktrees) {
        try {
          const stat = fs.statSync(wt.path);
          const age = now - stat.mtimeMs;

          if (age > maxAgeMs) {
            await this.removeWorktree(wt.path, wt.branch);
            cleaned++;
            logger.info('Cleaned up stale worktree', {
              path: wt.path,
              ageHours: age / (60 * 60 * 1000),
            });
          }
        } catch {
          // Worktree might already be gone
        }
      }

      op.success('Stale worktrees cleaned', { cleaned });
      return cleaned;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      return 0;
    }
  }
}

/**
 * Create a GitWorktreeService instance
 */
export function createGitWorktreeService(config: GitWorktreeConfig): GitWorktreeService {
  return new GitWorktreeService(config);
}
