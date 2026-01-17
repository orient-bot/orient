/**
 * Miniapp Edit Service
 *
 * Core service for AI-powered miniapp editing.
 * Orchestrates OpenCode sessions, git worktrees, builds, and rollbacks.
 *
 * Workflow:
 * 1. Create worktree for isolated development
 *
 * Exported via @orient/apps package.
 * 2. Create OpenCode session with working directory = worktree
 * 3. Send prompt to OpenCode for code generation
 * 4. Auto-commit changes
 * 5. Build the app
 * 6. Track commit history for rollback
 */

import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import { createServiceLogger } from '@orient/core';
import { AppGitService } from './appGitService.js';
import { OpenCodeClient } from '@orient/agents';
import { generateAppManifestTemplate } from '../types.js';
import {
  MiniappEditDatabase,
  MiniappEditSession,
  MiniappEditCommit,
} from './miniappEditDatabase.js';

const execAsync = promisify(exec);
const logger = createServiceLogger('miniapp-edit');

// ============================================
// TYPES
// ============================================

export interface MiniappEditConfig {
  /** AppGitService instance for worktree management */
  appGitService: AppGitService;
  /** OpenCodeClient instance for AI code generation */
  openCodeClient: OpenCodeClient;
  /** Database for tracking sessions */
  database: MiniappEditDatabase;
  /** URL for OpenCode portal (default: http://localhost:4099) */
  portalBaseUrl?: string;
  /** Default agent for code generation (default: build) */
  defaultAgent?: string;
}

export interface EditResult {
  /** Unique session ID */
  sessionId: string;
  /** OpenCode portal URL for continuing edits */
  portalUrl: string;
  /** AI response text */
  response: string;
  /** Git commit hash */
  commitHash: string;
  /** Build status */
  buildStatus: BuildResult;
}

export type EditProgressStage =
  | 'worktree_created'
  | 'scaffolded'
  | 'opencode_session_created'
  | 'opencode_request_sent'
  | 'opencode_chunk'
  | 'opencode_complete'
  | 'commit_created'
  | 'build_started'
  | 'build_complete';

export interface EditProgressEvent {
  stage: EditProgressStage;
  message: string;
  data?: Record<string, unknown>;
}

export interface BuildResult {
  /** Whether the build succeeded */
  success: boolean;
  /** Build output (stdout + stderr) */
  output: string;
  /** Build duration in milliseconds */
  duration: number;
  /** Error message if build failed */
  error?: string;
}

export interface CommitHistory {
  commits: Array<{
    hash: string;
    message: string;
    timestamp: Date;
    filesChanged: string[];
    buildSuccess: boolean;
  }>;
}

// ============================================
// MINIAPP EDIT SERVICE
// ============================================

export class MiniappEditService {
  private config: Required<MiniappEditConfig>;
  private activeSessions: Map<string, MiniappEditSession> = new Map();

  constructor(config: MiniappEditConfig) {
    this.config = {
      portalBaseUrl: config.portalBaseUrl || 'http://localhost:4099',
      defaultAgent: config.defaultAgent || 'build',
      ...config,
    };

    logger.info('MiniappEditService initialized', {
      portalBaseUrl: this.config.portalBaseUrl,
      defaultAgent: this.config.defaultAgent,
    });
  }

  /**
   * Start a new edit session
   * Creates worktree, OpenCode session, generates code, commits, and builds
   */
  async startEditSession(
    appName: string,
    prompt: string,
    createNew: boolean = false,
    onProgress?: (event: EditProgressEvent) => void
  ): Promise<EditResult> {
    const op = logger.startOperation('startEditSession', { appName, createNew });

    try {
      // 1. Create worktree
      logger.debug('Creating worktree for app', { appName });
      const worktreeResult = await this.config.appGitService.createWorktree(appName);
      const { worktreePath, branchName, appPath } = worktreeResult;
      onProgress?.({
        stage: 'worktree_created',
        message: 'Worktree created',
        data: { worktreePath, branchName },
      });

      // 2. Scaffold app if creating new
      if (createNew) {
        logger.debug('Scaffolding new app', { appName });
        const manifest = generateAppManifestTemplate(
          appName,
          prompt.substring(0, 50), // Use first part of prompt as title
          prompt
        );

        const defaultAppComponent = `export default function App() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          ${manifest.title}
        </h1>
        <p className="text-muted-foreground">
          ${manifest.description}
        </p>
      </div>
    </div>
  );
}`;

        await this.config.appGitService.scaffoldApp(
          worktreePath,
          appName,
          manifest,
          defaultAppComponent
        );

        // Commit the scaffold
        await this.config.appGitService.commit(worktreePath, `Initial scaffold for ${appName}`);
        onProgress?.({
          stage: 'scaffolded',
          message: 'App scaffold created',
          data: { appName },
        });
      }

      // 3. Create OpenCode session
      const sessionId = `miniapp:edit:${appName}:${Date.now()}`;
      logger.debug('Creating OpenCode session', { sessionId, worktreePath });

      const openCodeSession = await this.config.openCodeClient.createSession(`Edit: ${appName}`);
      onProgress?.({
        stage: 'opencode_session_created',
        message: 'OpenCode session created',
        data: { sessionId: openCodeSession.id },
      });

      // 4. Build enriched prompt
      const enrichedPrompt = this.buildEditPrompt(appName, prompt, createNew, appPath);

      // 5. Send prompt to OpenCode
      logger.debug('Sending prompt to OpenCode', { sessionId });
      const startTime = Date.now();
      const openCodeResponse = await this.config.openCodeClient.sendMessage(
        openCodeSession.id,
        enrichedPrompt,
        { agent: this.config.defaultAgent }
      );
      const duration = Date.now() - startTime;
      onProgress?.({
        stage: 'opencode_request_sent',
        message: 'Prompt sent to OpenCode',
        data: { duration },
      });

      logger.info('OpenCode completed generation', {
        sessionId,
        duration,
        tokens: openCodeResponse.info.tokens,
      });

      const response = this.config.openCodeClient.extractTextResponse(openCodeResponse);
      const responseParts = openCodeResponse.parts.filter(
        (part: { type: string; text?: string }) =>
          part.type === 'text' && typeof part.text === 'string'
      );
      for (const part of responseParts as Array<{ type: string; text: string }>) {
        onProgress?.({
          stage: 'opencode_chunk',
          message: 'Received OpenCode response chunk',
          data: { text: part.text },
        });
      }
      onProgress?.({
        stage: 'opencode_complete',
        message: 'OpenCode response complete',
        data: { tokens: openCodeResponse.info.tokens },
      });

      // 6. Get list of changed files for commit tracking
      const changedFiles = await this.getChangedFiles(worktreePath);

      // 7. Auto-commit changes
      const commitMessage = `AI Edit: ${prompt.substring(0, 50)}`;
      logger.debug('Committing changes', { worktreePath, commitMessage });
      const commitHash = await this.config.appGitService.commit(worktreePath, commitMessage);
      onProgress?.({
        stage: 'commit_created',
        message: 'Changes committed',
        data: { commitHash },
      });

      // 8. Store session in database
      const dbSessionId = `${appName}-${Date.now()}`;
      await this.config.database.createSession({
        id: dbSessionId,
        appName,
        sessionId: openCodeSession.id,
        worktreePath,
        branchName,
      });

      // Cache session
      const session = await this.config.database.getSession(dbSessionId);
      if (session) {
        this.activeSessions.set(openCodeSession.id, session);
      }

      // 9. Trigger build (in background to not block response)
      logger.debug('Starting build', { worktreePath });
      onProgress?.({
        stage: 'build_started',
        message: 'Build started',
        data: { worktreePath },
      });
      const buildResult = await this.buildApp(openCodeSession.id);
      onProgress?.({
        stage: 'build_complete',
        message: buildResult.success ? 'Build succeeded' : 'Build failed',
        data: { success: buildResult.success },
      });

      // 10. Record commit with build status
      await this.config.database.createCommit({
        sessionId: openCodeSession.id,
        commitHash,
        message: commitMessage,
        filesChanged: changedFiles,
        buildSuccess: buildResult.success,
      });

      const portalUrl = `${this.config.portalBaseUrl}/session/${openCodeSession.id}`;

      op.success('Edit session started', {
        sessionId: openCodeSession.id,
        commitHash,
        buildSuccess: buildResult.success,
      });

      return {
        sessionId: openCodeSession.id,
        portalUrl,
        response,
        commitHash,
        buildStatus: buildResult,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Continue editing an existing session
   */
  async continueEdit(
    sessionId: string,
    prompt: string,
    onProgress?: (event: EditProgressEvent) => void
  ): Promise<EditResult> {
    const op = logger.startOperation('continueEdit', { sessionId });

    try {
      // Get session
      const session =
        this.activeSessions.get(sessionId) ||
        (await this.config.database.getSessionBySessionId(sessionId));

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Update timestamp
      await this.config.database.touchSession(sessionId);

      // Send prompt to OpenCode
      logger.debug('Sending continuation prompt', { sessionId });
      const openCodeResponse = await this.config.openCodeClient.sendMessage(sessionId, prompt, {
        agent: this.config.defaultAgent,
      });

      const response = this.config.openCodeClient.extractTextResponse(openCodeResponse);
      onProgress?.({
        stage: 'opencode_request_sent',
        message: 'Prompt sent to OpenCode',
        data: { sessionId },
      });
      const responseParts = openCodeResponse.parts.filter(
        (part: { type: string; text?: string }) =>
          part.type === 'text' && typeof part.text === 'string'
      );
      for (const part of responseParts as Array<{ type: string; text: string }>) {
        onProgress?.({
          stage: 'opencode_chunk',
          message: 'Received OpenCode response chunk',
          data: { text: part.text },
        });
      }
      onProgress?.({
        stage: 'opencode_complete',
        message: 'OpenCode response complete',
        data: { tokens: openCodeResponse.info.tokens },
      });

      // Get changed files
      const changedFiles = await this.getChangedFiles(session.worktreePath);

      // Commit changes
      const commitMessage = `AI Edit: ${prompt.substring(0, 50)}`;
      const commitHash = await this.config.appGitService.commit(
        session.worktreePath,
        commitMessage
      );
      onProgress?.({
        stage: 'commit_created',
        message: 'Changes committed',
        data: { commitHash },
      });

      // Build
      onProgress?.({
        stage: 'build_started',
        message: 'Build started',
        data: { worktreePath: session.worktreePath },
      });
      const buildResult = await this.buildApp(sessionId);
      onProgress?.({
        stage: 'build_complete',
        message: buildResult.success ? 'Build succeeded' : 'Build failed',
        data: { success: buildResult.success },
      });

      // Record commit
      await this.config.database.createCommit({
        sessionId,
        commitHash,
        message: commitMessage,
        filesChanged: changedFiles,
        buildSuccess: buildResult.success,
      });

      const portalUrl = `${this.config.portalBaseUrl}/session/${sessionId}`;

      op.success('Edit continued', { sessionId, commitHash });

      return {
        sessionId,
        portalUrl,
        response,
        commitHash,
        buildStatus: buildResult,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Build an app in its worktree
   */
  async buildApp(sessionId: string): Promise<BuildResult> {
    const op = logger.startOperation('buildApp', { sessionId });

    try {
      // Get session
      const session =
        this.activeSessions.get(sessionId) ||
        (await this.config.database.getSessionBySessionId(sessionId));

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const worktreePath = session.worktreePath;
      const appPath = path.join(worktreePath, 'apps', session.appName);

      logger.debug('Building app', { sessionId, appPath });

      const startTime = Date.now();
      let output = '';
      let success = false;
      let error: string | undefined;

      try {
        // Check if package.json exists
        const packageJsonPath = path.join(appPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
          throw new Error('package.json not found - app may not be scaffolded');
        }

        // Install dependencies
        logger.debug('Installing dependencies', { appPath });
        const installResult = await execAsync('npm install', {
          cwd: appPath,
          timeout: 120000, // 2 minutes
        });
        output += `=== NPM INSTALL ===\n${installResult.stdout}\n${installResult.stderr}\n\n`;

        // Run build
        logger.debug('Running build', { appPath });
        const buildResult = await execAsync('npm run build', {
          cwd: appPath,
          timeout: 120000, // 2 minutes
        });
        output += `=== NPM BUILD ===\n${buildResult.stdout}\n${buildResult.stderr}\n\n`;

        // Verify dist exists
        const distPath = path.join(appPath, 'dist', 'index.html');
        if (!fs.existsSync(distPath)) {
          throw new Error('Build succeeded but dist/index.html not found');
        }

        success = true;
        logger.info('Build succeeded', { sessionId, appPath });
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        output += `\n=== BUILD ERROR ===\n${error}\n`;
        logger.warn('Build failed', { sessionId, error });
      }

      const duration = Date.now() - startTime;

      op.success('Build completed', { sessionId, success, duration });

      return {
        success,
        output,
        duration,
        error,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Rollback to a previous commit
   */
  async rollbackToCommit(sessionId: string, commitHash: string): Promise<void> {
    const op = logger.startOperation('rollbackToCommit', { sessionId, commitHash });

    try {
      // Get session
      const session =
        this.activeSessions.get(sessionId) ||
        (await this.config.database.getSessionBySessionId(sessionId));

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Verify commit exists
      const commit = await this.config.database.getCommit(sessionId, commitHash);
      if (!commit) {
        throw new Error(`Commit ${commitHash} not found in session ${sessionId}`);
      }

      logger.debug('Rolling back to commit', { sessionId, commitHash });

      // Perform git reset
      await execAsync(`git reset --hard ${commitHash}`, {
        cwd: session.worktreePath,
      });

      // Rebuild the app
      await this.buildApp(sessionId);

      // Update session timestamp
      await this.config.database.touchSession(sessionId);

      op.success('Rollback completed', { sessionId, commitHash });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get commit history for a session
   */
  async getHistory(sessionId: string, limit: number = 50): Promise<CommitHistory> {
    const op = logger.startOperation('getHistory', { sessionId, limit });

    try {
      const commits = await this.config.database.getCommits(sessionId, limit);

      op.success('History retrieved', { sessionId, count: commits.length });

      return {
        commits: commits.map((c) => ({
          hash: c.commitHash,
          message: c.message,
          timestamp: c.timestamp,
          filesChanged: c.filesChanged,
          buildSuccess: c.buildSuccess,
        })),
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Close a session and optionally merge to main
   */
  async closeSession(sessionId: string, merge: boolean = false): Promise<{ prUrl?: string }> {
    const op = logger.startOperation('closeSession', { sessionId, merge });

    try {
      // Get session
      const session =
        this.activeSessions.get(sessionId) ||
        (await this.config.database.getSessionBySessionId(sessionId));

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      let prUrl: string | undefined;

      if (merge) {
        logger.debug('Pushing and creating PR', { sessionId });

        // Push branch to remote
        await this.config.appGitService.push(session.worktreePath, session.branchName);

        // Create PR using gh CLI
        try {
          const prDescription = `AI-generated updates for miniapp: ${session.appName}`;
          const { stdout } = await execAsync(
            `gh pr create --title "Update ${session.appName}" --body "${prDescription}" --base main`,
            { cwd: session.worktreePath }
          );
          prUrl = stdout.trim();
          logger.info('PR created', { sessionId, prUrl });
        } catch (err) {
          logger.warn('Failed to create PR', {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Remove worktree
      logger.debug('Cleaning up worktree', { sessionId });
      await this.config.appGitService.removeWorktree(session.worktreePath, session.branchName);

      // Delete OpenCode session
      try {
        await this.config.openCodeClient.deleteSession(sessionId);
      } catch (err) {
        logger.warn('Failed to delete OpenCode session', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Mark session as closed in database
      await this.config.database.closeSession(sessionId);

      // Remove from cache
      this.activeSessions.delete(sessionId);

      op.success('Session closed', { sessionId, merge, prUrl });

      return { prUrl };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(): Promise<MiniappEditSession[]> {
    return this.config.database.getActiveSessions();
  }

  /**
   * Get sessions for a specific app
   */
  async getAppSessions(appName: string): Promise<MiniappEditSession[]> {
    return this.config.database.getSessionsByAppName(appName);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Build enriched prompt for OpenCode
   */
  private buildEditPrompt(
    appName: string,
    prompt: string,
    createNew: boolean,
    appPath: string
  ): string {
    if (createNew) {
      return `Create a new miniapp called "${appName}".

User request: ${prompt}

The app structure has been scaffolded at ${appPath} with:
- APP.yaml manifest
- src/App.tsx (main component)
- package.json, vite.config.ts, tailwind.config.js
- Full TypeScript + React + Tailwind setup

Please implement the requested functionality in src/App.tsx.
Use the design system variables (--background, --foreground, --primary, etc).
Keep the code clean and well-structured.
Test that the app builds successfully.

After editing, I will run: npm install && npm run build`;
    } else {
      return `Edit the existing miniapp "${appName}" at ${appPath}.

User request: ${prompt}

Please make the requested changes. Focus only on what's needed.
Test that the app still builds successfully.`;
    }
  }

  /**
   * Get list of changed files in worktree
   */
  private async getChangedFiles(worktreePath: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git diff --name-only HEAD~1 HEAD', {
        cwd: worktreePath,
      });

      return stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
    } catch {
      // If git diff fails (e.g., first commit), return empty array
      return [];
    }
  }
}

/**
 * Create a MiniappEditService instance
 */
export function createMiniappEditService(config: MiniappEditConfig): MiniappEditService {
  return new MiniappEditService(config);
}
