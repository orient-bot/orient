/**
 * Miniapp Edit Database Service
 *
 * SQLite database for storing AI-powered miniapp editing sessions and their commit history.
 * Tracks worktree-based edit sessions, OpenCode integration, and build status.
 *
 * Exported via @orient-bot/apps package.
 */

import { createServiceLogger } from '@orient-bot/core';
import {
  getDatabase,
  getRawSqliteDb,
  eq,
  desc,
  isNull,
  count,
  and,
  sql,
} from '@orient-bot/database';
import type { Database } from '@orient-bot/database';

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
  private _db: Database | null = null;
  private initialized: boolean = false;

  private get db(): Database {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_connectionString?: string) {
    // connectionString is ignored - we use SQLite now
    logger.info('Miniapp edit database initialized (SQLite)');
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
    const rawDb = getRawSqliteDb();

    // Miniapp edit sessions table
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS miniapp_edit_sessions (
        id TEXT PRIMARY KEY,
        app_name TEXT NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        worktree_path TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        closed_at INTEGER,
        created_by TEXT
      )
    `);

    // Miniapp edit commits table
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS miniapp_edit_commits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        message TEXT NOT NULL,
        files_changed TEXT NOT NULL,
        timestamp INTEGER DEFAULT (unixepoch()),
        build_success INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES miniapp_edit_sessions(session_id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better query performance
    rawDb.exec(`
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

    logger.info('Miniapp edit database tables initialized');
  }

  // ============================================
  // SESSION CRUD OPERATIONS
  // ============================================

  /**
   * Create a new edit session
   */
  async createSession(input: CreateSessionInput): Promise<MiniappEditSession> {
    const rawDb = getRawSqliteDb();
    const now = Math.floor(Date.now() / 1000);

    const stmt = rawDb.prepare(`
      INSERT INTO miniapp_edit_sessions (
        id, app_name, session_id, worktree_path, branch_name, created_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.appName,
      input.sessionId,
      input.worktreePath,
      input.branchName,
      input.createdBy || null,
      now,
      now
    );

    logger.info('Created miniapp edit session', {
      id: input.id,
      appName: input.appName,
      sessionId: input.sessionId,
    });

    return this.getSession(input.id) as Promise<MiniappEditSession>;
  }

  /**
   * Get a session by ID
   */
  async getSession(id: string): Promise<MiniappEditSession | null> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare('SELECT * FROM miniapp_edit_sessions WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToSession(row) : null;
  }

  /**
   * Get a session by OpenCode session ID
   */
  async getSessionBySessionId(sessionId: string): Promise<MiniappEditSession | null> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare('SELECT * FROM miniapp_edit_sessions WHERE session_id = ?');
    const row = stmt.get(sessionId) as Record<string, unknown> | undefined;

    return row ? this.rowToSession(row) : null;
  }

  /**
   * Get all sessions for an app
   */
  async getSessionsByAppName(appName: string): Promise<MiniappEditSession[]> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare(
      'SELECT * FROM miniapp_edit_sessions WHERE app_name = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(appName) as Record<string, unknown>[];

    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Get all active (not closed) sessions
   */
  async getActiveSessions(): Promise<MiniappEditSession[]> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare(
      'SELECT * FROM miniapp_edit_sessions WHERE closed_at IS NULL ORDER BY created_at DESC'
    );
    const rows = stmt.all() as Record<string, unknown>[];

    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Update session's updated_at timestamp
   */
  async touchSession(sessionId: string): Promise<void> {
    const rawDb = getRawSqliteDb();
    const now = Math.floor(Date.now() / 1000);
    const stmt = rawDb.prepare(
      'UPDATE miniapp_edit_sessions SET updated_at = ? WHERE session_id = ?'
    );
    stmt.run(now, sessionId);
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<MiniappEditSession | null> {
    const rawDb = getRawSqliteDb();
    const now = Math.floor(Date.now() / 1000);

    const stmt = rawDb.prepare(`
      UPDATE miniapp_edit_sessions
      SET closed_at = ?, updated_at = ?
      WHERE session_id = ?
    `);
    const result = stmt.run(now, now, sessionId);

    if (result.changes === 0) {
      return null;
    }

    logger.info('Closed miniapp edit session', { sessionId });
    return this.getSessionBySessionId(sessionId);
  }

  /**
   * Delete a session and all its commits
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare('DELETE FROM miniapp_edit_sessions WHERE session_id = ?');
    const result = stmt.run(sessionId);

    if (result.changes > 0) {
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
    const rawDb = getRawSqliteDb();
    const now = Math.floor(Date.now() / 1000);

    const stmt = rawDb.prepare(`
      INSERT INTO miniapp_edit_commits (
        session_id, commit_hash, message, files_changed, build_success, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.sessionId,
      input.commitHash,
      input.message,
      JSON.stringify(input.filesChanged),
      input.buildSuccess ? 1 : 0,
      now
    );

    logger.debug('Recorded commit', {
      sessionId: input.sessionId,
      commitHash: input.commitHash,
    });

    return this.getCommitById(Number(result.lastInsertRowid)) as Promise<MiniappEditCommit>;
  }

  /**
   * Get a commit by ID
   */
  private async getCommitById(id: number): Promise<MiniappEditCommit | null> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare('SELECT * FROM miniapp_edit_commits WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    return row ? this.rowToCommit(row) : null;
  }

  /**
   * Get all commits for a session
   */
  async getCommits(sessionId: string, limit: number = 50): Promise<MiniappEditCommit[]> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare(`
      SELECT * FROM miniapp_edit_commits
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(sessionId, limit) as Record<string, unknown>[];

    return rows.map((row) => this.rowToCommit(row));
  }

  /**
   * Get a specific commit
   */
  async getCommit(sessionId: string, commitHash: string): Promise<MiniappEditCommit | null> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare(`
      SELECT * FROM miniapp_edit_commits
      WHERE session_id = ? AND commit_hash = ?
    `);
    const row = stmt.get(sessionId, commitHash) as Record<string, unknown> | undefined;

    return row ? this.rowToCommit(row) : null;
  }

  /**
   * Update commit build status
   */
  async updateCommitBuildStatus(
    sessionId: string,
    commitHash: string,
    buildSuccess: boolean
  ): Promise<void> {
    const rawDb = getRawSqliteDb();
    const stmt = rawDb.prepare(`
      UPDATE miniapp_edit_commits
      SET build_success = ?
      WHERE session_id = ? AND commit_hash = ?
    `);
    stmt.run(buildSuccess ? 1 : 0, sessionId, commitHash);

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
    const rawDb = getRawSqliteDb();

    const totalSessions = (
      rawDb.prepare('SELECT COUNT(*) as count FROM miniapp_edit_sessions').get() as {
        count: number;
      }
    ).count;
    const activeSessions = (
      rawDb
        .prepare('SELECT COUNT(*) as count FROM miniapp_edit_sessions WHERE closed_at IS NULL')
        .get() as { count: number }
    ).count;
    const totalCommits = (
      rawDb.prepare('SELECT COUNT(*) as count FROM miniapp_edit_commits').get() as { count: number }
    ).count;
    const successfulBuilds = (
      rawDb
        .prepare('SELECT COUNT(*) as count FROM miniapp_edit_commits WHERE build_success = 1')
        .get() as { count: number }
    ).count;
    const failedBuilds = (
      rawDb
        .prepare('SELECT COUNT(*) as count FROM miniapp_edit_commits WHERE build_success = 0')
        .get() as { count: number }
    ).count;

    return {
      totalSessions,
      activeSessions,
      totalCommits,
      successfulBuilds,
      failedBuilds,
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
      createdAt: new Date((row.created_at as number) * 1000),
      updatedAt: new Date((row.updated_at as number) * 1000),
      closedAt: row.closed_at ? new Date((row.closed_at as number) * 1000) : undefined,
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
      timestamp: new Date((row.timestamp as number) * 1000),
      buildSuccess: Boolean(row.build_success),
    };
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    logger.info('Miniapp edit database connection closed');
  }
}

/**
 * Create a MiniappEditDatabase instance
 */
export function createMiniappEditDatabase(_connectionString?: string): MiniappEditDatabase {
  return new MiniappEditDatabase(_connectionString);
}
