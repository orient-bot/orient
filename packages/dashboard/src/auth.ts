/**
 * Dashboard Authentication Module
 *
 * Handles JWT-based authentication for the dashboard API.
 * Uses bcrypt for password hashing and JWT for session tokens.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { MessageDatabase } from './services/messageDatabase.js';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('dashboard-auth');

// Salt rounds for bcrypt (10 is a good balance of security and speed)
const SALT_ROUNDS = 10;

// JWT expiration time (24 hours)
const JWT_EXPIRATION = '24h';

/**
 * Extended Express Request with user info from JWT
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
  };
}

/**
 * JWT payload structure
 */
interface JWTPayload {
  userId: number;
  username: string;
  iat?: number;
  exp?: number;
}

/**
 * Dashboard Auth Service
 */
export class DashboardAuth {
  private jwtSecret: string;
  private db: MessageDatabase;

  constructor(jwtSecret: string, db: MessageDatabase) {
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters long');
    }
    this.jwtSecret = jwtSecret;
    this.db = db;
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT token for a user
   */
  generateToken(userId: number, username: string): string {
    const payload: JWTPayload = {
      userId,
      username,
    };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: JWT_EXPIRATION });
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as JWTPayload;
    } catch (error) {
      logger.debug('Token verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Authenticate a user with username and password
   * Returns a JWT token if successful, null otherwise
   */
  async login(
    username: string,
    password: string
  ): Promise<{ token: string; username: string } | null> {
    const user = await this.db.getDashboardUser(username);

    if (!user) {
      logger.warn('Login failed: user not found', { username });
      return null;
    }

    const isValid = await this.verifyPassword(password, user.passwordHash);

    if (!isValid) {
      logger.warn('Login failed: invalid password', { username });
      return null;
    }

    const token = this.generateToken(user.id, user.username);
    logger.info('User logged in successfully', { username, userId: user.id });

    return { token, username: user.username };
  }

  /**
   * Create a new user (for initial setup or admin creation)
   */
  async createUser(username: string, password: string): Promise<number> {
    // Check if username already exists
    const existing = await this.db.getDashboardUser(username);
    if (existing) {
      throw new Error(`User "${username}" already exists`);
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const passwordHash = await this.hashPassword(password);
    const userId = await this.db.createDashboardUser(username, passwordHash);

    logger.info('Created new dashboard user', { username, userId });
    return userId;
  }

  /**
   * Change a user's password
   */
  async changePassword(username: string, newPassword: string): Promise<boolean> {
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const passwordHash = await this.hashPassword(newPassword);
    const success = await this.db.updateDashboardUserPassword(username, passwordHash);

    if (success) {
      logger.info('Password changed for user', { username });
    }

    return success;
  }

  /**
   * Express middleware for authentication
   * Adds user info to request if authenticated
   */
  authMiddleware = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'No authorization header' });
      return;
    }

    // Support both "Bearer <token>" and just "<token>"
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    const payload = this.verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Verify user still exists
    const user = await this.db.getDashboardUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: payload.userId,
      username: payload.username,
    };

    next();
  };

  /**
   * Check if any users exist (for initial setup)
   */
  async hasUsers(): Promise<boolean> {
    return this.db.hasDashboardUsers();
  }
}

/**
 * Create a DashboardAuth instance
 */
export function createDashboardAuth(jwtSecret: string, db: MessageDatabase): DashboardAuth {
  return new DashboardAuth(jwtSecret, db);
}

/**
 * Rate limiting for login attempts (simple in-memory implementation)
 */
export class LoginRateLimiter {
  private attempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly blockDurationMs: number;

  constructor(
    maxAttempts: number = 5,
    windowMs: number = 15 * 60 * 1000, // 15 minutes
    blockDurationMs: number = 30 * 60 * 1000 // 30 minutes block
  ) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.blockDurationMs = blockDurationMs;

    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Record a failed login attempt
   */
  recordFailure(identifier: string): void {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now - record.lastAttempt > this.windowMs) {
      // Start fresh window
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
    } else {
      // Increment within window
      record.count++;
      record.lastAttempt = now;
    }
  }

  /**
   * Record a successful login (reset the counter)
   */
  recordSuccess(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Check if an identifier is blocked
   */
  isBlocked(identifier: string): boolean {
    const record = this.attempts.get(identifier);
    if (!record) return false;

    const now = Date.now();

    // If exceeded max attempts and within block duration
    if (record.count >= this.maxAttempts) {
      if (now - record.lastAttempt < this.blockDurationMs) {
        return true;
      }
      // Block expired, reset
      this.attempts.delete(identifier);
    }

    return false;
  }

  /**
   * Get remaining attempts for an identifier
   */
  getRemainingAttempts(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record) return this.maxAttempts;

    const now = Date.now();
    if (now - record.lastAttempt > this.windowMs) {
      return this.maxAttempts;
    }

    return Math.max(0, this.maxAttempts - record.count);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.attempts.entries()) {
      if (now - record.lastAttempt > this.blockDurationMs) {
        this.attempts.delete(key);
      }
    }
  }
}

/**
 * Express middleware for rate limiting login attempts
 */
export function createRateLimitMiddleware(limiter?: LoginRateLimiter) {
  const actualLimiter = limiter || new LoginRateLimiter();
  return (req: Request, res: Response, next: NextFunction): void => {
    // Use IP address as identifier
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';

    if (actualLimiter.isBlocked(identifier)) {
      logger.warn('Rate limit exceeded for login', { ip: identifier });
      res.status(429).json({
        error: 'Too many login attempts. Please try again later.',
        retryAfter: 30 * 60, // 30 minutes in seconds
      });
      return;
    }

    next();
  };
}

/**
 * Create auth middleware from DashboardAuth instance
 */
export function createAuthMiddleware(auth: DashboardAuth) {
  return auth.authMiddleware.bind(auth);
}
