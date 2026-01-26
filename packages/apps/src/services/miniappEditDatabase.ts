/**
 * Miniapp Edit Database Service
 *
 * PostgreSQL database for storing AI-powered miniapp editing sessions and their commit history.
 * Tracks worktree-based edit sessions, OpenCode integration, and build status.
 *
 * Exported via @orient/apps package.
 */

import pg from 'pg';
import { createServiceLogger } from '@orient/core';

const { Pool } = pg;
const logger = createServiceLogger('miniapp-edit-db');

// ============================================
// TYPES
// ============================================

export interface MiniappEditSession {
  id: string;
  appName: string;
  sessionId: string;
  worktreePath: string;
  branchName: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  createdBy?: string;
}

export interface MiniappEditCommit {
  id: number;
  sessionId: string;
  commitHash: string;
  message: string;
  filesChanged: string[]; // Array of file paths
  timestamp: Date;
  buildSuccess: boolean;
}

export interface CreateSessionInput {
  id: string;
  appName: string;
  sessionId: string;
  worktreePath: string;
  branchName: string;
  createdBy?: string;
}

export interface CreateCommitInput {
  sessionId: string;
  commitHash: string;
  message: string;
  filesChanged: string[];
  buildSuccess: boolean;
}

// ============================================
// MINIAPP EDIT DATABASE
// ============================================

export class MiniappEditDatabase {
  private pool: pg.Pool;
  private initialized: boolean = false;

  constructor(connectionString?: string) {
    const dbUrl =
      connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0';

    this.pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    logger.info('Miniapp edit database pool created', {
      connectionString: dbUrl.replace(/:[^:@]+@/, ':****@'),
    });
  }

  /**
   * Initialize the database (must be called before using)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.initializeTables();
    this.initialized = true;
  }

  /**
   * Initialize database tables for miniapp editing
   */
  private async initializeTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Miniapp edit sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS miniapp_edit_sessions (
          id TEXT PRIMARY KEY,
          app_name TEXT NOT NULL,
          session_id TEXT NOT NULL UNIQUE,
          worktree_path TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          closed_at TIMESTAMPTZ,
          created_by TEXT
        )
      `);

      // Miniapp edit commits table
      await client.query(`
        CREATE TABLE IF NOT EXISTS miniapp_edit_commits (
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          commit_hash TEXT NOT NULL,
          message TEXT NOT NULL,
          files_changed TEXT NOT NULL,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          build_success BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (session_id) REFERENCES miniapp_edit_sessions(session_id) ON DELETE CASCADE
        )
      `);

      // Create indexes for better query performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_miniapp_edit_sessions_app_name
          ON miniapp_edit_sessions(app_name);
        CREATE INDEX IF NOT EXISTS idx_miniapp_edit_sessions_session_id
          ON miniapp_edit_sessions(session_id);
        CREATE INDEX IF NOT EXISTS idx_miniapp_edit_sessions_closed_at
          ON miniapp_edit_sessions(closed_at);
        CREATE INDEX IF NOT EXISTS idx_miniapp_edit_commits_session_id
          ON miniapp_edit_commits(session_id);
        CREATE INDEX IF NOT EXISTS idx_miniapp_edit_commits_timestamp
          ON miniapp_edit_commits(timestamp);
      `);

      await client.query('COMMIT');
      logger.info('Miniapp edit database tables initialized');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // SESSION CRUD OPERATIONS
  // ============================================

  /**
   * Create a new edit session
   */
  async createSession(input: CreateSessionInput): Promise<MiniappEditSession> {
    const result = await this.pool.query(
      `
      INSERT INTO miniapp_edit_sessions (
        id, app_name, session_id, worktree_path, branch_name, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        input.id,
        input.appName,
        input.sessionId,
        input.worktreePath,
        input.branchName,
        input.createdBy || null,
      ]
    );

    logger.info('Created miniapp edit session', {
      id: result.rows[0].id,
      appName: input.appName,
      sessionId: input.sessionId,
    });

    return this.rowToSession(result.rows[0]);
  }

  /**
   * Get a session by ID
   */
  async getSession(id: string): Promise<MiniappEditSession | null> {
    const result = await this.pool.query('SELECT * FROM miniapp_edit_sessions WHERE id = $1', [id]);

    return result.rows.length > 0 ? this.rowToSession(result.rows[0]) : null;
  }

  /**
   * Get a session by OpenCode session ID
   */
  async getSessionBySessionId(sessionId: string): Promise<MiniappEditSession | null> {
    const result = await this.pool.query(
      'SELECT * FROM miniapp_edit_sessions WHERE session_id = $1',
      [sessionId]
    );

    return result.rows.length > 0 ? this.rowToSession(result.rows[0]) : null;
  }

  /**
   * Get all sessions for an app
   */
  async getSessionsByAppName(appName: string): Promise<MiniappEditSession[]> {
    const result = await this.pool.query(
      'SELECT * FROM miniapp_edit_sessions WHERE app_name = $1 ORDER BY created_at DESC',
      [appName]
    );

    return result.rows.map((row) => this.rowToSession(row));
  }

  /**
   * Get all active (not closed) sessions
   */
  async getActiveSessions(): Promise<MiniappEditSession[]> {
    const result = await this.pool.query(
      'SELECT * FROM miniapp_edit_sessions WHERE closed_at IS NULL ORDER BY created_at DESC'
    );

    return result.rows.map((row) => this.rowToSession(row));
  }

  /**
   * Update session's updated_at timestamp
   */
  async touchSession(sessionId: string): Promise<void> {
    await this.pool.query(
      'UPDATE miniapp_edit_sessions SET updated_at = NOW() WHERE session_id = $1',
      [sessionId]
    );
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<MiniappEditSession | null> {
    const result = await this.pool.query(
      `
      UPDATE miniapp_edit_sessions
      SET closed_at = NOW(), updated_at = NOW()
      WHERE session_id = $1
      RETURNING *
    `,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Closed miniapp edit session', { sessionId });
    return this.rowToSession(result.rows[0]);
  }

  /**
   * Delete a session and all its commits
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM miniapp_edit_sessions WHERE session_id = $1',
      [sessionId]
    );

    if ((result.rowCount || 0) > 0) {
      logger.info('Deleted miniapp edit session', { sessionId });
      return true;
    }
    return false;
  }

  // ============================================
  // COMMIT OPERATIONS
  // ============================================

  /**
   * Record a commit in the edit session
   */
  async createCommit(input: CreateCommitInput): Promise<MiniappEditCommit> {
    const result = await this.pool.query(
      `
      INSERT INTO miniapp_edit_commits (
        session_id, commit_hash, message, files_changed, build_success
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
      [
        input.sessionId,
        input.commitHash,
        input.message,
        JSON.stringify(input.filesChanged),
        input.buildSuccess,
      ]
    );

    logger.debug('Recorded commit', {
      sessionId: input.sessionId,
      commitHash: input.commitHash,
    });

    return this.rowToCommit(result.rows[0]);
  }

  /**
   * Get all commits for a session
   */
  async getCommits(sessionId: string, limit: number = 50): Promise<MiniappEditCommit[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM miniapp_edit_commits
      WHERE session_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `,
      [sessionId, limit]
    );

    return result.rows.map((row) => this.rowToCommit(row));
  }

  /**
   * Get a specific commit
   */
  async getCommit(sessionId: string, commitHash: string): Promise<MiniappEditCommit | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM miniapp_edit_commits
      WHERE session_id = $1 AND commit_hash = $2
    `,
      [sessionId, commitHash]
    );

    return result.rows.length > 0 ? this.rowToCommit(result.rows[0]) : null;
  }

  /**
   * Update commit build status
   */
  async updateCommitBuildStatus(
    sessionId: string,
    commitHash: string,
    buildSuccess: boolean
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE miniapp_edit_commits
      SET build_success = $3
      WHERE session_id = $1 AND commit_hash = $2
    `,
      [sessionId, commitHash, buildSuccess]
    );

    logger.debug('Updated commit build status', { sessionId, commitHash, buildSuccess });
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get statistics for miniapp editing
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalCommits: number;
    successfulBuilds: number;
    failedBuilds: number;
  }> {
    const [totalSessions, activeSessions, totalCommits, successfulBuilds, failedBuilds] =
      await Promise.all([
        this.pool.query('SELECT COUNT(*) as count FROM miniapp_edit_sessions'),
        this.pool.query(
          'SELECT COUNT(*) as count FROM miniapp_edit_sessions WHERE closed_at IS NULL'
        ),
        this.pool.query('SELECT COUNT(*) as count FROM miniapp_edit_commits'),
        this.pool.query(
          'SELECT COUNT(*) as count FROM miniapp_edit_commits WHERE build_success = TRUE'
        ),
        this.pool.query(
          'SELECT COUNT(*) as count FROM miniapp_edit_commits WHERE build_success = FALSE'
        ),
      ]);

    return {
      totalSessions: parseInt(totalSessions.rows[0].count),
      activeSessions: parseInt(activeSessions.rows[0].count),
      totalCommits: parseInt(totalCommits.rows[0].count),
      successfulBuilds: parseInt(successfulBuilds.rows[0].count),
      failedBuilds: parseInt(failedBuilds.rows[0].count),
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Convert database row to MiniappEditSession type
   */
  private rowToSession(row: Record<string, unknown>): MiniappEditSession {
    return {
      id: row.id as string,
      appName: row.app_name as string,
      sessionId: row.session_id as string,
      worktreePath: row.worktree_path as string,
      branchName: row.branch_name as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      closedAt: row.closed_at ? new Date(row.closed_at as string) : undefined,
      createdBy: row.created_by as string | undefined,
    };
  }

  /**
   * Convert database row to MiniappEditCommit type
   */
  private rowToCommit(row: Record<string, unknown>): MiniappEditCommit {
    return {
      id: row.id as number,
      sessionId: row.session_id as string,
      commitHash: row.commit_hash as string,
      message: row.message as string,
      filesChanged: JSON.parse(row.files_changed as string) as string[],
      timestamp: new Date(row.timestamp as string),
      buildSuccess: row.build_success as boolean,
    };
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Miniapp edit database connection pool closed');
  }
}

/**
 * Create a MiniappEditDatabase instance
 */
export function createMiniappEditDatabase(connectionString?: string): MiniappEditDatabase {
  return new MiniappEditDatabase(connectionString);
}
