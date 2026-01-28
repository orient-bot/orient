/**
 * Eval HTTP Server
 *
 * Express server that wraps MCP functionality for eval testing.
 * Provides REST API endpoints for invoking agents and tools.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer, Server } from 'http';
import { createServiceLogger } from '@orientbot/core';
import { createEvalRoutes } from './routes.js';
import { EvalServerConfig } from '../types.js';

const logger = createServiceLogger('eval-server');

/**
 * Eval HTTP Server
 *
 * Wraps MCP functionality in an HTTP API for eval testing.
 */
export class EvalServer {
  private app: Express;
  private server: Server | null = null;
  private config: EvalServerConfig;

  constructor(config: EvalServerConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(
      cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    // JSON body parsing
    this.app.use(express.json({ limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      if (this.config.debug) {
        logger.debug('Request', {
          method: req.method,
          path: req.path,
          query: req.query,
        });
      }
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Mount eval routes under /api/eval
    this.app.use('/api/eval', createEvalRoutes({ openCodePassword: this.config.openCodePassword }));

    // Root health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'eval-server',
        port: this.config.port,
      });
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('Unhandled error', { error: err.message, stack: err.stack });
      res.status(500).json({
        error: 'Internal server error',
        message: this.config.debug ? err.message : undefined,
      });
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.app);

        this.server.listen(this.config.port, () => {
          const address = this.server?.address();
          const port = typeof address === 'object' && address ? address.port : this.config.port;

          logger.info('Eval server started', { port });
          resolve(port);
        });

        this.server.on('error', (error) => {
          logger.error('Server error', { error });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          logger.info('Eval server stopped');
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get the Express app (for testing)
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /**
   * Get the server port
   */
  getPort(): number | null {
    if (!this.server) return null;
    const address = this.server.address();
    return typeof address === 'object' && address ? address.port : null;
  }
}

/**
 * Create and start an eval server
 */
export async function startEvalServer(config: Partial<EvalServerConfig> = {}): Promise<EvalServer> {
  const fullConfig: EvalServerConfig = {
    port: config.port ?? 0, // 0 = auto-assign
    debug: config.debug ?? false,
    openCodePassword: config.openCodePassword,
  };

  const server = new EvalServer(fullConfig);
  await server.start();
  return server;
}
