/**
 * WhatsApp API Server
 *
 * Exposes a local HTTP API for external tools (like MCP) to interact with WhatsApp.
 * This allows OpenCode to send polls, messages, etc. through its MCP tools.
 *
 * Also provides a web interface for QR code scanning at the root URL.
 *
 * Exported via @orient-bot/bot-whatsapp package.
 */

import http from 'http';
import QRCode from 'qrcode';
import { WhatsAppService, WritePermissionDeniedError } from './whatsappService.js';
import { WhatsAppCloudApiService, WebhookPayload } from './whatsappCloudApiService.js';
import { OpenCodeWhatsAppHandler } from './openCodeWhatsAppHandler.js';
import { createDedicatedServiceLogger } from '@orient-bot/core';
import { WebhookForwardingService, getWebhookForwardingService } from '@orient-bot/api-gateway';
import { SkillsService } from '@orient-bot/agents';

const logger = createDedicatedServiceLogger('whatsapp', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

export interface WhatsAppApiServerConfig {
  port: number; // Default: 4097
  host: string; // Default: 127.0.0.1 (localhost only)
  /** Secret token for skill reload endpoint (optional, for security) */
  skillReloadToken?: string;
}

export class WhatsAppApiServer {
  private server: http.Server | null = null;
  private whatsappService: WhatsAppService;
  private cloudApiService: WhatsAppCloudApiService | null = null;
  private opencodeHandler: OpenCodeWhatsAppHandler | null = null;
  private forwardingService: WebhookForwardingService;
  private skillsService: SkillsService | null = null;
  private config: WhatsAppApiServerConfig;
  private currentJid: string | null = null; // Track current chat JID for context

  constructor(whatsappService: WhatsAppService, config?: Partial<WhatsAppApiServerConfig>) {
    this.whatsappService = whatsappService;
    this.config = {
      port: config?.port || 4097,
      host: config?.host || '127.0.0.1',
      skillReloadToken: config?.skillReloadToken,
    };
    // Initialize webhook forwarding service (singleton)
    this.forwardingService = getWebhookForwardingService();
  }

  /**
   * Set the skills service for hot reload capability
   */
  setSkillsService(service: SkillsService): void {
    this.skillsService = service;
    logger.info('Skills service attached to API server');
  }

  /**
   * Set the Cloud API service for handling webhooks
   */
  setCloudApiService(service: WhatsAppCloudApiService): void {
    this.cloudApiService = service;
    logger.info('Cloud API service attached to API server');
  }

  /**
   * Set the OpenCode handler for AI testing
   */
  setOpenCodeHandler(handler: OpenCodeWhatsAppHandler): void {
    this.opencodeHandler = handler;
    logger.info('OpenCode handler set for API server');
  }

  /**
   * Set the current chat context (called when a message is received)
   */
  setCurrentJid(jid: string): void {
    this.currentJid = jid;
  }

  /**
   * Get the current chat JID
   */
  getCurrentJid(): string | null {
    return this.currentJid;
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // Set CORS headers for local requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        try {
          const url = new URL(req.url || '/', `http://${req.headers.host}`);

          // Route requests

          // Root path - serve QR code web interface
          if (url.pathname === '/' || url.pathname === '/qr' || url.pathname === '/qr/') {
            await this.handleQrPage(req, res);
            return;
          }

          // QR code image endpoint
          if (url.pathname === '/qr.png') {
            await this.handleQrImage(req, res);
            return;
          }

          // QR code data endpoint (JSON)
          if (url.pathname === '/qr/status') {
            await this.handleQrStatus(req, res);
            return;
          }

          if (url.pathname === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', currentJid: this.currentJid }));
            return;
          }

          if (url.pathname === '/send-poll' && req.method === 'POST') {
            await this.handleSendPoll(req, res);
            return;
          }

          if (url.pathname === '/send-message' && req.method === 'POST') {
            await this.handleSendMessage(req, res);
            return;
          }

          if (url.pathname === '/send-image' && req.method === 'POST') {
            await this.handleSendImage(req, res);
            return;
          }

          if (url.pathname === '/current-context') {
            res.writeHead(200);
            res.end(
              JSON.stringify({
                currentJid: this.currentJid,
                isConnected: this.whatsappService.isReady(),
              })
            );
            return;
          }

          // Flush session endpoint (clear session and force new QR code)
          if (
            (url.pathname === '/qr/flush-session' || url.pathname === '/flush-session') &&
            req.method === 'POST'
          ) {
            await this.handleFlushSession(req, res);
            return;
          }

          // Pairing code endpoint (alternative to QR code)
          if (url.pathname === '/pairing-code' && req.method === 'POST') {
            await this.handleRequestPairingCode(req, res);
            return;
          }

          // Factory reset endpoint (clear local + S3 session, enter pairing mode)
          if (
            (url.pathname === '/qr/factory-reset' || url.pathname === '/factory-reset') &&
            req.method === 'POST'
          ) {
            await this.handleFactoryReset(req, res);
            return;
          }

          // QR code regeneration endpoint (user-initiated after pause)
          if (
            (url.pathname === '/qr/regenerate' || url.pathname === '/regenerate') &&
            req.method === 'POST'
          ) {
            await this.handleQrRegenerate(req, res);
            return;
          }

          // E2E test endpoint (WhatsApp messaging only)
          if (url.pathname === '/e2e-test' && req.method === 'POST') {
            await this.handleE2ETest(req, res);
            return;
          }

          // Full E2E test endpoint (includes AI/OpenCode testing)
          if (url.pathname === '/e2e-test-full' && req.method === 'POST') {
            await this.handleFullE2ETest(req, res);
            return;
          }

          // Cloud API Webhook endpoints
          // GET: Webhook verification from Meta
          if (url.pathname === '/webhooks/whatsapp' && req.method === 'GET') {
            await this.handleCloudApiWebhookVerify(req, res, url);
            return;
          }

          // POST: Incoming messages/events from Meta
          if (url.pathname === '/webhooks/whatsapp' && req.method === 'POST') {
            await this.handleCloudApiWebhookEvent(req, res);
            return;
          }

          // =======================================================================
          // Webhook Forwarding API (for local dev testing)
          // =======================================================================

          // Register a forwarding target (local dev registering with production)
          if (url.pathname === '/api/webhook-forward/register' && req.method === 'POST') {
            await this.handleWebhookForwardRegister(req, res);
            return;
          }

          // Renew/heartbeat an existing registration
          if (url.pathname === '/api/webhook-forward/renew' && req.method === 'POST') {
            await this.handleWebhookForwardRenew(req, res);
            return;
          }

          // Deregister a forwarding target
          if (url.pathname === '/api/webhook-forward/deregister' && req.method === 'POST') {
            await this.handleWebhookForwardDeregister(req, res);
            return;
          }

          // Get forwarding status (for monitoring)
          if (url.pathname === '/api/webhook-forward/status' && req.method === 'GET') {
            await this.handleWebhookForwardStatus(req, res);
            return;
          }

          // =======================================================================
          // Skills Hot Reload API
          // =======================================================================

          // Reload skills from disk (for CI/CD skill deployment)
          if (url.pathname === '/reload-skills' && req.method === 'POST') {
            await this.handleReloadSkills(req, res);
            return;
          }

          // Also support /api prefix for consistency
          if (url.pathname === '/api/reload-skills' && req.method === 'POST') {
            await this.handleReloadSkills(req, res);
            return;
          }

          // 404 for unknown routes
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        } catch (error) {
          logger.error('API error', {
            error: error instanceof Error ? error.message : String(error),
            path: req.url,
          });
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      this.server.listen(this.config.port, this.config.host, () => {
        logger.info('WhatsApp API server started', {
          port: this.config.port,
          host: this.config.host,
        });
        console.log(`📡 WhatsApp API: http://${this.config.host}:${this.config.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('API server error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('WhatsApp API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Parse JSON body from request
   */
  private async parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk.toString()));
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Handle /send-poll endpoint
   *
   * Accepts:
   * - jid: Chat JID (optional, uses current context if not provided)
   * - question: Poll question text
   * - options: Array of option strings (2-12 options)
   * - selectableCount: How many options can be selected (default: 1)
   * - context: Original query context (legacy, string)
   * - sessionId: OpenCode session ID to continue when vote is received
   * - actionId: Structured action to execute when vote is received
   * - actionPayload: Custom data for the action handler
   */
  private async handleSendPoll(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = (await this.parseBody(req)) as {
      jid?: string;
      question: string;
      options: string[];
      selectableCount?: number;
      context?: string;
      // New fields for session continuity and actions
      sessionId?: string;
      actionId?: string;
      actionPayload?: Record<string, unknown>;
    };

    // Use provided JID or current context JID
    const jid = body.jid || this.currentJid;

    if (!jid) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          error: 'No JID provided and no current chat context',
          hint: 'Either provide a "jid" in the request body or ensure a conversation is active',
        })
      );
      return;
    }

    if (!body.question || !body.options || !Array.isArray(body.options)) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          error: 'Missing required fields: question, options (array)',
        })
      );
      return;
    }

    if (body.options.length < 2) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'At least 2 options are required' }));
      return;
    }

    if (body.options.length > 12) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Maximum 12 options allowed' }));
      return;
    }

    try {
      // Build poll context with all provided fields
      const pollContext: {
        originalQuery?: string;
        sessionId?: string;
        actionId?: string;
        actionPayload?: Record<string, unknown>;
      } = {};

      // Support legacy context field
      if (body.context) {
        pollContext.originalQuery = body.context;
      }

      // Add session continuity fields
      if (body.sessionId) {
        pollContext.sessionId = body.sessionId;
      }

      // Add action fields
      if (body.actionId) {
        pollContext.actionId = body.actionId;
      }
      if (body.actionPayload) {
        pollContext.actionPayload = body.actionPayload;
      }

      const poll = await this.whatsappService.sendPoll(
        jid,
        body.question,
        body.options,
        body.selectableCount || 1,
        Object.keys(pollContext).length > 0 ? pollContext : undefined
      );

      logger.info('Poll sent via API', {
        pollId: poll.id,
        question: body.question,
        optionCount: body.options.length,
        hasSessionId: !!body.sessionId,
        hasActionId: !!body.actionId,
      });

      res.writeHead(200);
      res.end(
        JSON.stringify({
          success: true,
          pollId: poll.id,
          question: poll.question,
          options: poll.options,
          sessionId: body.sessionId,
          actionId: body.actionId,
        })
      );
    } catch (error) {
      // Handle permission denied errors specifically
      if (error instanceof WritePermissionDeniedError) {
        logger.warn('Poll blocked - write permission denied', {
          jid: error.jid,
          permission: error.permission,
        });
        res.writeHead(403);
        res.end(
          JSON.stringify({
            error: 'Write permission denied',
            chatId: jid,
            permission: error.permission,
            message:
              'This chat does not have write permission. Enable "Read + Write" in the admin dashboard to allow bot messages.',
          })
        );
        return;
      }

      logger.error('Failed to send poll via API', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to send poll',
        })
      );
    }
  }

  /**
   * Handle /send-message endpoint
   */
  private async handleSendMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = (await this.parseBody(req)) as {
      jid?: string;
      message: string;
    };

    const jid = body.jid || this.currentJid;

    if (!jid) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          error: 'No JID provided and no current chat context',
        })
      );
      return;
    }

    if (!body.message) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing required field: message' }));
      return;
    }

    try {
      await this.whatsappService.sendBotResponse(jid, body.message);

      logger.info('Message sent via API', {
        jid,
        messageLength: body.message.length,
      });

      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      // Handle permission denied errors specifically
      if (error instanceof WritePermissionDeniedError) {
        logger.warn('Message blocked - write permission denied', {
          jid: error.jid,
          permission: error.permission,
        });
        res.writeHead(403);
        res.end(
          JSON.stringify({
            error: 'Write permission denied',
            chatId: jid,
            permission: error.permission,
            message:
              'This chat does not have write permission. Enable "Read + Write" in the admin dashboard to allow bot messages.',
          })
        );
        return;
      }

      logger.error('Failed to send message via API', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to send message',
        })
      );
    }
  }

  /**
   * Handle /send-image endpoint
   */
  private async handleSendImage(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = (await this.parseBody(req)) as {
      jid?: string;
      imageUrl?: string;
      imagePath?: string;
      caption?: string;
    };

    const jid = body.jid || this.currentJid;

    if (!jid) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          error: 'No JID provided and no current chat context',
        })
      );
      return;
    }

    if (!body.imageUrl && !body.imagePath) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          error: 'Either imageUrl or imagePath is required',
        })
      );
      return;
    }

    try {
      let imageBuffer: Buffer;

      if (body.imageUrl) {
        // Fetch image from URL
        const response = await fetch(body.imageUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch image from URL: ${response.status} ${response.statusText}`
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      } else {
        // Read image from local file path
        const fs = await import('fs');
        if (!fs.existsSync(body.imagePath!)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: `File not found: ${body.imagePath}` }));
          return;
        }
        imageBuffer = fs.readFileSync(body.imagePath!);
      }

      const result = await this.whatsappService.sendImage(jid, imageBuffer, {
        caption: body.caption,
      });

      logger.info('Image sent via API', {
        jid,
        source: body.imageUrl ? 'url' : 'file',
        size: imageBuffer.length,
      });

      res.writeHead(200);
      res.end(
        JSON.stringify({
          success: true,
          messageId: result?.key?.id,
        })
      );
    } catch (error) {
      // Handle permission denied errors specifically
      if (error instanceof WritePermissionDeniedError) {
        logger.warn('Image blocked - write permission denied', {
          jid: error.jid,
          permission: error.permission,
        });
        res.writeHead(403);
        res.end(
          JSON.stringify({
            error: 'Write permission denied',
            chatId: jid,
            permission: error.permission,
            message:
              'This chat does not have write permission. Enable "Read + Write" in the admin dashboard to allow bot messages.',
          })
        );
        return;
      }

      logger.error('Failed to send image via API', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to send image',
        })
      );
    }
  }

  /**
   * Handle QR code status endpoint (JSON)
   */
  private async handleQrStatus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const qrCode = this.whatsappService.getCurrentQrCode();
    const isConnected = this.whatsappService.isReady();
    const needsQrScan = this.whatsappService.needsQrScan();
    const updatedAt = this.whatsappService.getQrCodeUpdatedAt();
    const qrGenerationPaused = this.whatsappService.isQrGenerationPaused();

    let qrDataUrl: string | null = null;
    if (qrCode) {
      try {
        qrDataUrl = await QRCode.toDataURL(qrCode, {
          width: 400,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
      } catch (error) {
        logger.error('Failed to generate QR data URL', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        needsQrScan,
        isConnected,
        qrCode: qrCode || null,
        qrDataUrl,
        updatedAt: updatedAt?.toISOString() || null,
        qrGenerationPaused,
        syncState: this.whatsappService.getSyncState(),
        syncProgress: this.whatsappService.getSyncProgress(),
        userPhone: this.whatsappService.getUserPhone(),
      })
    );
  }

  /**
   * Handle flush session endpoint - clears session data and forces new QR code
   */
  private async handleFlushSession(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      logger.info('Flushing WhatsApp session - clearing auth data');

      // Get the session path from the service
      const sessionPath = this.whatsappService.getSessionPath();

      // Import fs dynamically
      const fs = await import('fs');
      const path = await import('path');

      // Clear all session files
      if (fs.existsSync(sessionPath)) {
        const files = fs.readdirSync(sessionPath);
        for (const file of files) {
          const filePath = path.join(sessionPath, file);
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            // Ignore errors for individual files
          }
        }
        logger.info('Session files cleared', { count: files.length, path: sessionPath });
      }

      // Disconnect the current connection to force reconnect with new QR
      await this.whatsappService.disconnect();

      // Small delay before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Reconnect - this will trigger a new QR code
      this.whatsappService.connect().catch((error) => {
        logger.error('Failed to reconnect after flush', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          message: 'Session flushed. Reconnecting - new QR code will appear shortly.',
        })
      );
    } catch (error) {
      logger.error('Failed to flush session', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to flush session',
        })
      );
    }
  }

  /**
   * Handle pairing code request endpoint
   * Alternative to QR code - user enters phone number and receives an 8-char code
   */
  private async handleRequestPairingCode(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      // Parse request body
      const body = (await this.parseBody(req)) as { phoneNumber?: string };
      const phoneNumber = body?.phoneNumber;

      if (!phoneNumber || typeof phoneNumber !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: 'Missing required field: phoneNumber',
          })
        );
        return;
      }

      // Clean and validate phone number
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error:
              'Invalid phone number format. Expected 10-15 digits in international format (e.g., 972501234567).',
          })
        );
        return;
      }

      // Check if already connected
      if (this.whatsappService.isReady()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: 'Already connected to WhatsApp. Disconnect first to pair a new device.',
          })
        );
        return;
      }

      logger.info('Requesting pairing code via API', {
        phoneNumber: cleanPhone.substring(0, 5) + '***',
      });

      // Request the pairing code
      const code = await this.whatsappService.requestPairingCode(cleanPhone);

      // Format code with dash for display (ABCD-1234)
      const formattedCode =
        code.length === 8 ? `${code.substring(0, 4)}-${code.substring(4)}` : code;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          code: code,
          formattedCode: formattedCode,
          message:
            'Enter this code in WhatsApp on your phone: Settings → Linked Devices → Link with phone number',
        })
      );

      logger.info('Pairing code generated successfully via API');
    } catch (error) {
      logger.error('Failed to generate pairing code', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to generate pairing code',
        })
      );
    }
  }

  /**
   * Handle factory reset endpoint
   * Completely clears session from local storage AND S3, enters pairing mode
   * This is the nuclear option for fixing pairing issues
   */
  private async handleFactoryReset(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      logger.info('Factory reset requested - clearing all session data');

      // 1. Force disconnect WhatsApp regardless of connection state
      // This handles sockets in any state: connected, connecting, failed, or closed
      logger.info('Force disconnecting WhatsApp for factory reset');
      await this.whatsappService.forceDisconnect();

      // 2. Get session path and clear local session completely
      const sessionPath = this.whatsappService.getSessionPath();
      const fs = await import('fs');
      const path = await import('path');
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        logger.info('Local session folder cleared', { path: sessionPath });
      }

      // 3. Recreate session directory
      fs.mkdirSync(sessionPath, { recursive: true });

      // 4. Enter pairing mode (creates marker file)
      this.whatsappService.enterPairingMode();
      logger.info('Entered pairing mode - S3 sync will skip session restore');

      // 5. Clear S3 session (run the clear script if available)
      try {
        // Try to clear S3 session using environment variables
        const s3Bucket = process.env.S3_BUCKET;
        const awsEndpoint = process.env.AWS_ENDPOINT_URL;

        if (s3Bucket && process.env.AWS_ACCESS_KEY_ID) {
          const awsOpts = awsEndpoint ? `--endpoint-url ${awsEndpoint}` : '';
          const cmd = `aws ${awsOpts} s3 rm "s3://${s3Bucket}/data/whatsapp-auth/" --recursive --quiet 2>/dev/null || true`;

          await execAsync(cmd);
          logger.info('S3 session cleared', { bucket: s3Bucket });
        } else {
          logger.info('S3 not configured, skipping S3 clear');
        }
      } catch (s3Error) {
        // S3 clear is best-effort, don't fail the whole operation
        logger.warn('Failed to clear S3 session (non-critical)', {
          error: s3Error instanceof Error ? s3Error.message : String(s3Error),
        });
      }

      // 6. Small delay before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 7. Reconnect - this will trigger a new QR code with fresh state
      this.whatsappService.connect().catch((error) => {
        logger.error('Failed to reconnect after factory reset', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          message:
            'Factory reset complete. All session data cleared from local storage and S3. Bot is reconnecting with fresh state.',
          pairingMode: true,
        })
      );

      logger.info('Factory reset complete');
    } catch (error) {
      logger.error('Factory reset failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to perform factory reset',
        })
      );
    }
  }

  /**
   * Handle QR code regeneration request
   * Called when user clicks "Generate New QR Code" after QR generation was paused
   */
  private async handleQrRegenerate(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      logger.info('QR regeneration requested by user');

      // Check if already connected - no need to regenerate
      if (this.whatsappService.isReady()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            message: 'Already connected to WhatsApp',
            isConnected: true,
          })
        );
        return;
      }

      // Request QR regeneration
      await this.whatsappService.requestQrRegeneration();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          message: 'QR regeneration started. New QR code will appear shortly.',
        })
      );

      logger.info('QR regeneration initiated successfully');
    } catch (error) {
      logger.error('QR regeneration failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to regenerate QR code',
        })
      );
    }
  }

  /**
   * Handle E2E test endpoint
   * Sends a test message and verifies delivery acknowledgment
   */
  private async handleE2ETest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = (await this.parseBody(req)) as {
      jid?: string;
      testMessage?: string;
      waitForAck?: boolean; // Wait for delivery acknowledgment (default: true)
      ackTimeoutMs?: number; // Timeout for ack (default: 10000)
    };

    // JID must be provided - no default to avoid accidental messages to wrong chats
    if (!body.jid) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          success: false,
          error: 'jid is required - specify the WhatsApp chat/group JID to test',
          example: { jid: '120363000000000001@g.us', testMessage: 'Hello!' },
        })
      );
      return;
    }

    const testGroupJid = body.jid;
    const testId = `e2e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const testMessage = body.testMessage || `🧪 E2E Test [${testId}] - ${new Date().toISOString()}`;
    const waitForAck = body.waitForAck !== false; // Default to true
    const ackTimeoutMs = body.ackTimeoutMs || 10000;

    logger.info('Starting E2E test', {
      jid: testGroupJid,
      testId,
      waitForAck,
      ackTimeoutMs,
    });

    // Check if connected
    if (!this.whatsappService.isReady()) {
      res.writeHead(503);
      res.end(
        JSON.stringify({
          success: false,
          error: 'WhatsApp not connected',
          phase: 'connection_check',
          testId,
        })
      );
      return;
    }

    const startTime = Date.now();
    const results: {
      phase: string;
      success: boolean;
      duration: number;
      error?: string;
      details?: Record<string, unknown>;
    }[] = [];

    // Phase 1: Send a test message and get the message key
    let messageId: string | null = null;
    try {
      const phase1Start = Date.now();
      const sendResult = await this.whatsappService.sendMessageWithResult(
        testGroupJid,
        testMessage
      );

      if (!sendResult || !sendResult.key?.id) {
        throw new Error('No message key returned from sendMessage');
      }

      messageId = sendResult.key.id;

      results.push({
        phase: 'send_message',
        success: true,
        duration: Date.now() - phase1Start,
        details: {
          messageId: sendResult.key.id,
          fromMe: sendResult.key.fromMe,
          status: sendResult.status,
          timestamp: sendResult.messageTimestamp,
        },
      });
      logger.info('E2E test: Message sent', {
        messageId: sendResult.key.id,
        status: sendResult.status,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        phase: 'send_message',
        success: false,
        duration: Date.now() - startTime,
        error: errorMsg,
      });
      logger.error('E2E test: Failed to send message', { error: errorMsg });

      res.writeHead(500);
      res.end(
        JSON.stringify({
          success: false,
          error: `Failed to send message: ${errorMsg}`,
          results,
          totalDuration: Date.now() - startTime,
          testId,
        })
      );
      return;
    }

    // Phase 2: Wait for delivery acknowledgment
    if (waitForAck && messageId) {
      try {
        const phase2Start = Date.now();
        logger.info('E2E test: Waiting for delivery acknowledgment...', {
          messageId,
          timeout: ackTimeoutMs,
        });

        const ackReceived = await this.whatsappService.waitForMessageAck(messageId, ackTimeoutMs);

        results.push({
          phase: 'delivery_ack',
          success: ackReceived,
          duration: Date.now() - phase2Start,
          details: {
            messageId,
            ackReceived,
          },
        });

        if (ackReceived) {
          logger.info('E2E test: Delivery acknowledgment received', { messageId });
        } else {
          logger.warn('E2E test: Delivery acknowledgment timeout', {
            messageId,
            timeout: ackTimeoutMs,
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          phase: 'delivery_ack',
          success: false,
          duration: Date.now() - startTime,
          error: errorMsg,
        });
        logger.error('E2E test: Error waiting for ack', { error: errorMsg });
      }
    }

    // Phase 3: Send completion message (optional, don't fail test if this fails)
    try {
      const phase3Start = Date.now();
      const completionMessage = `✅ E2E [${testId}] Complete - ${Date.now() - startTime}ms`;
      await this.whatsappService.sendMessageWithResult(testGroupJid, completionMessage);
      results.push({
        phase: 'send_completion',
        success: true,
        duration: Date.now() - phase3Start,
      });
      logger.info('E2E test: Completion message sent');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        phase: 'send_completion',
        success: false,
        duration: Date.now() - startTime,
        error: errorMsg,
      });
      logger.warn('E2E test: Failed to send completion message', { error: errorMsg });
    }

    const totalDuration = Date.now() - startTime;

    // Test passes if send_message succeeded (delivery_ack is informational only since
    // Baileys doesn't reliably emit messages.update events for outbound messages)
    const sendResult = results.find((r) => r.phase === 'send_message');
    const allSuccess = sendResult?.success ?? false;

    // Note if delivery ack was received (informational)
    const ackResult = results.find((r) => r.phase === 'delivery_ack');
    const ackNote = ackResult
      ? ackResult.success
        ? ' (delivery confirmed)'
        : ' (delivery ack not received - may still be delivered)'
      : '';

    logger.info('E2E test completed', {
      success: allSuccess,
      totalDuration,
      testId,
      results,
    });

    res.writeHead(allSuccess ? 200 : 500);
    res.end(
      JSON.stringify({
        success: allSuccess,
        message: allSuccess
          ? `E2E test passed - message sent successfully${ackNote}`
          : 'E2E test failed - check results for details',
        results,
        totalDuration,
        testGroupJid,
        testId,
      })
    );
  }

  /**
   * Handle full E2E test endpoint (includes AI/OpenCode testing)
   * Tests: WhatsApp connectivity + OpenCode AI round-trip
   */
  private async handleFullE2ETest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const body = (await this.parseBody(req)) as {
      jid?: string;
      testMessage?: string;
      aiTestMessage?: string; // Message to send to AI
      waitForAck?: boolean;
      ackTimeoutMs?: number;
      aiTimeoutMs?: number; // Timeout for AI response (default: 60000)
    };

    // JID must be provided - no default to avoid accidental messages to wrong chats
    if (!body.jid) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          success: false,
          error: 'jid is required - specify the WhatsApp chat/group JID to test',
          example: { jid: '120363000000000001@g.us', aiTestMessage: 'Hello AI!' },
        })
      );
      return;
    }

    const testGroupJid = body.jid;
    const testId = `e2e_full_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const testMessage =
      body.testMessage || `🧪 Full E2E Test [${testId}] - ${new Date().toISOString()}`;
    const aiTestMessage =
      body.aiTestMessage || 'Hello! Please respond with a short greeting to confirm AI is working.';
    const waitForAck = body.waitForAck !== false;
    const ackTimeoutMs = body.ackTimeoutMs || 10000;
    const aiTimeoutMs = body.aiTimeoutMs || 60000;

    logger.info('Starting full E2E test (with AI)', {
      jid: testGroupJid,
      testId,
      hasOpenCodeHandler: !!this.opencodeHandler,
    });

    const startTime = Date.now();
    const results: {
      phase: string;
      success: boolean;
      duration: number;
      error?: string;
      details?: Record<string, unknown>;
    }[] = [];

    // Phase 1: Check WhatsApp connection
    if (!this.whatsappService.isReady()) {
      res.writeHead(503);
      res.end(
        JSON.stringify({
          success: false,
          error: 'WhatsApp not connected',
          phase: 'connection_check',
          testId,
        })
      );
      return;
    }
    results.push({ phase: 'connection_check', success: true, duration: 0 });

    // Phase 2: Test AI/OpenCode (if handler is available)
    let aiResponseText: string | null = null;
    if (this.opencodeHandler) {
      try {
        const aiStart = Date.now();
        logger.info('Full E2E test: Testing OpenCode AI...', { testId, aiTimeoutMs });

        // Create a test context
        const testContext = {
          phone: 'e2e-test',
          jid: testGroupJid,
          isGroup: true,
          groupId: testGroupJid.split('@')[0],
          groupName: 'E2E Test',
        };

        // Process message through OpenCode with timeout
        const aiPromise = this.opencodeHandler.processMessage(aiTestMessage, testContext);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI response timeout')), aiTimeoutMs)
        );

        const aiResult = await Promise.race([aiPromise, timeoutPromise]);
        aiResponseText = aiResult.text;

        results.push({
          phase: 'ai_process',
          success: true,
          duration: Date.now() - aiStart,
          details: {
            responseLength: aiResult.text.length,
            model: aiResult.model,
            provider: aiResult.provider,
            cost: aiResult.cost,
            tokens: aiResult.tokens,
            toolsUsed: aiResult.toolsUsed,
          },
        });
        logger.info('Full E2E test: OpenCode AI responded', {
          testId,
          responseLength: aiResult.text.length,
          model: aiResult.model,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          phase: 'ai_process',
          success: false,
          duration: Date.now() - startTime,
          error: errorMsg,
        });
        logger.error('Full E2E test: OpenCode AI failed', { testId, error: errorMsg });
      }
    } else {
      results.push({
        phase: 'ai_process',
        success: false,
        duration: 0,
        error: 'OpenCode handler not configured',
        details: { skipped: true },
      });
      logger.warn('Full E2E test: OpenCode handler not available, skipping AI test');
    }

    // Phase 3: Send AI response to WhatsApp (if AI processing succeeded)
    if (aiResponseText) {
      try {
        const phase3Start = Date.now();
        const formattedResponse = `🤖 *E2E Test Response* [${testId}]\n\n${aiResponseText}`;
        await this.whatsappService.sendMessageWithResult(testGroupJid, formattedResponse);

        results.push({
          phase: 'ai_response_send',
          success: true,
          duration: Date.now() - phase3Start,
          details: {
            responseLength: formattedResponse.length,
          },
        });
        logger.info('Full E2E test: AI response sent to WhatsApp', { testId });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          phase: 'ai_response_send',
          success: false,
          duration: Date.now() - startTime,
          error: errorMsg,
        });
        logger.error('Full E2E test: Failed to send AI response', { testId, error: errorMsg });
      }
    }

    // Phase 4: Send WhatsApp test notification message
    let messageId: string | null = null;
    try {
      const phase4Start = Date.now();
      const sendResult = await this.whatsappService.sendMessageWithResult(
        testGroupJid,
        testMessage
      );

      if (!sendResult || !sendResult.key?.id) {
        throw new Error('No message key returned from sendMessage');
      }

      messageId = sendResult.key.id;
      results.push({
        phase: 'send_notification',
        success: true,
        duration: Date.now() - phase4Start,
        details: {
          messageId: sendResult.key.id,
          status: sendResult.status,
        },
      });
      logger.info('Full E2E test: WhatsApp notification sent', { testId, messageId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        phase: 'send_notification',
        success: false,
        duration: Date.now() - startTime,
        error: errorMsg,
      });
      logger.error('Full E2E test: Failed to send WhatsApp notification', {
        testId,
        error: errorMsg,
      });
    }

    // Phase 5: Wait for delivery ack (optional, informational)
    if (waitForAck && messageId) {
      try {
        const phase5Start = Date.now();
        const ackReceived = await this.whatsappService.waitForMessageAck(messageId, ackTimeoutMs);
        results.push({
          phase: 'delivery_ack',
          success: ackReceived,
          duration: Date.now() - phase5Start,
          details: { messageId, ackReceived },
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          phase: 'delivery_ack',
          success: false,
          duration: Date.now() - startTime,
          error: errorMsg,
        });
      }
    }

    const totalDuration = Date.now() - startTime;

    // Test passes if:
    // 1. AI processing succeeded (or was skipped)
    // 2. AI response was sent to WhatsApp (if AI processing succeeded)
    // 3. Notification message was sent
    const aiProcessResult = results.find((r) => r.phase === 'ai_process');
    const aiResponseResult = results.find((r) => r.phase === 'ai_response_send');
    const notificationResult = results.find((r) => r.phase === 'send_notification');

    const aiProcessSuccess = aiProcessResult?.success ?? false;
    const aiProcessSkipped = aiProcessResult?.details?.skipped === true;
    const aiResponseSuccess = aiResponseResult?.success ?? false;
    const notificationSuccess = notificationResult?.success ?? false;

    // Success if notification sent AND (AI round-trip worked OR AI was skipped)
    const aiRoundTripSuccess = aiProcessSuccess && aiResponseSuccess;
    const allSuccess = notificationSuccess && (aiRoundTripSuccess || aiProcessSkipped);

    logger.info('Full E2E test completed', {
      success: allSuccess,
      notificationSuccess,
      aiRoundTripSuccess,
      aiProcessSkipped,
      totalDuration,
      testId,
    });

    const aiStatus = aiRoundTripSuccess ? '✅' : aiProcessSkipped ? '⏭️ skipped' : '❌';
    res.writeHead(allSuccess ? 200 : 500);
    res.end(
      JSON.stringify({
        success: allSuccess,
        message: allSuccess
          ? `Full E2E test passed - AI round-trip: ${aiStatus}, Notification: ✅`
          : `Full E2E test failed - AI round-trip: ${aiStatus}, Notification: ${notificationSuccess ? '✅' : '❌'}`,
        results,
        totalDuration,
        testGroupJid,
        testId,
      })
    );
  }

  /**
   * Handle QR code image endpoint
   */
  private async handleQrImage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const qrCode = this.whatsappService.getCurrentQrCode();

    if (!qrCode) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'No QR code available',
          isConnected: this.whatsappService.isReady(),
        })
      );
      return;
    }

    try {
      const buffer = await QRCode.toBuffer(qrCode, {
        type: 'png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(buffer);
    } catch (error) {
      logger.error('Failed to generate QR image', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate QR image' }));
    }
  }

  /**
   * Handle QR code web page
   */
  private async handleQrPage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const html = this.generateQrPageHtml();
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(html);
  }

  // ==========================================================================
  // Cloud API Webhook Handlers
  // ==========================================================================

  /**
   * Handle Cloud API webhook verification (GET request from Meta)
   */
  private async handleCloudApiWebhookVerify(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL
  ): Promise<void> {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    logger.info('Cloud API webhook verification request', {
      mode,
      hasToken: !!token,
      hasChallenge: !!challenge,
    });

    if (!this.cloudApiService) {
      logger.warn('Cloud API webhook verify called but no Cloud API service configured');
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'Cloud API not configured' }));
      return;
    }

    if (!mode || !token || !challenge) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing required parameters' }));
      return;
    }

    const verifyResult = this.cloudApiService.verifyWebhook(mode, token, challenge);

    if (verifyResult) {
      logger.info('Cloud API webhook verified successfully');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(verifyResult);
    } else {
      logger.warn('Cloud API webhook verification failed');
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Verification failed' }));
    }
  }

  /**
   * Handle Cloud API webhook events (POST request from Meta)
   */
  private async handleCloudApiWebhookEvent(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    if (!this.cloudApiService) {
      logger.warn('Cloud API webhook event received but no Cloud API service configured');
      // Still return 200 to prevent Meta from retrying
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ignored - service not configured' }));
      return;
    }

    // Read the raw body for signature verification
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf-8');

    // Verify signature if app secret is configured
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (signature) {
      const isValid = this.cloudApiService.verifySignature(rawBody, signature);
      if (!isValid) {
        logger.warn('Cloud API webhook signature verification failed');
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }
      logger.debug('Cloud API webhook signature verified');
    }

    // Parse and process the webhook payload
    try {
      const payload = JSON.parse(rawBody) as WebhookPayload;

      logger.info('Cloud API webhook event received', {
        object: payload.object,
        entryCount: payload.entry?.length || 0,
      });

      // Process the webhook event (emits events for messages/statuses)
      this.cloudApiService.processWebhookEvent(payload);

      // Forward to registered dev environments (fire-and-forget)
      // This never blocks production processing
      const headers: Record<string, string> = {};
      if (signature) {
        headers['x-hub-signature-256'] = signature;
      }
      this.forwardingService.forwardWebhook(rawBody, headers);

      // Always return 200 to acknowledge receipt
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'received' }));
    } catch (error) {
      logger.error('Failed to process Cloud API webhook event', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Still return 200 to prevent retries for malformed payloads
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'error', message: 'Failed to process' }));
    }
  }

  // ==========================================================================
  // Webhook Forwarding Handlers
  // ==========================================================================

  /**
   * Handle webhook forward registration
   * POST /api/webhook-forward/register
   * Body: { url: string, ttlSeconds?: number, description?: string }
   * Headers: X-Forward-Secret: <shared_secret>
   */
  private async handleWebhookForwardRegister(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const secret = (req.headers['x-forward-secret'] as string) || '';

    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf-8');

    try {
      const request = JSON.parse(body);

      if (!request.url) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Missing url in request body' }));
        return;
      }

      const result = this.forwardingService.register(secret, {
        url: request.url,
        ttlSeconds: request.ttlSeconds,
        description: request.description,
      });

      res.writeHead(result.success ? 200 : 401);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON body',
        })
      );
    }
  }

  /**
   * Handle webhook forward renewal (heartbeat)
   * POST /api/webhook-forward/renew
   * Body: { id: string, ttlSeconds?: number }
   * Headers: X-Forward-Secret: <shared_secret>
   */
  private async handleWebhookForwardRenew(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const secret = (req.headers['x-forward-secret'] as string) || '';

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf-8');

    try {
      const request = JSON.parse(body);

      if (!request.id) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Missing id in request body' }));
        return;
      }

      const result = this.forwardingService.renew(secret, request.id, request.ttlSeconds);

      res.writeHead(result.success ? 200 : result.error === 'Invalid authentication' ? 401 : 404);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON body',
        })
      );
    }
  }

  /**
   * Handle webhook forward deregistration
   * POST /api/webhook-forward/deregister
   * Body: { id: string }
   * Headers: X-Forward-Secret: <shared_secret>
   */
  private async handleWebhookForwardDeregister(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const secret = (req.headers['x-forward-secret'] as string) || '';

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf-8');

    try {
      const request = JSON.parse(body);

      if (!request.id) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Missing id in request body' }));
        return;
      }

      const success = this.forwardingService.deregister(secret, request.id);

      res.writeHead(success ? 200 : 401);
      res.end(JSON.stringify({ success }));
    } catch (error) {
      res.writeHead(400);
      res.end(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON body',
        })
      );
    }
  }

  /**
   * Handle webhook forward status request
   * GET /api/webhook-forward/status
   * Headers: X-Forward-Secret: <shared_secret> (optional for basic status)
   */
  private async handleWebhookForwardStatus(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const status = this.forwardingService.getStatus();

    res.writeHead(200);
    res.end(JSON.stringify(status));
  }

  /**
   * Generate the HTML page for QR code and pairing code display
   */
  private generateQrPageHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Pairing - Orient</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-card: #1a1a24;
      --accent-green: #25D366;
      --accent-green-glow: rgba(37, 211, 102, 0.3);
      --accent-blue: #4F94EF;
      --text-primary: #ffffff;
      --text-secondary: #9ca3af;
      --text-muted: #6b7280;
      --border-color: rgba(255, 255, 255, 0.08);
      --gradient-start: #128C7E;
      --gradient-end: #25D366;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      overflow-x: hidden;
    }

    /* Animated background */
    .bg-pattern {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 0;
      opacity: 0.4;
      background: 
        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37, 211, 102, 0.15), transparent),
        radial-gradient(ellipse 60% 40% at 100% 100%, rgba(79, 148, 239, 0.1), transparent);
    }

    .container {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
      max-width: 480px;
      width: 100%;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
      animation: fadeInDown 0.6s ease-out;
    }

    .logo-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 8px 32px var(--accent-green-glow);
    }

    .logo-text {
      font-size: 1.5rem;
      font-weight: 600;
      background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 24px;
      padding: 2rem;
      width: 100%;
      text-align: center;
      box-shadow: 
        0 4px 24px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.03) inset;
      animation: fadeInUp 0.6s ease-out 0.2s both;
    }

    .status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    .status-dot.waiting { background: #f59e0b; box-shadow: 0 0 12px rgba(245, 158, 11, 0.5); }
    .status-dot.connected { background: var(--accent-green); box-shadow: 0 0 12px var(--accent-green-glow); }
    .status-text.waiting { color: #f59e0b; }
    .status-text.connected { color: var(--accent-green); }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      background: var(--bg-secondary);
      padding: 4px;
      border-radius: 12px;
    }

    .tab {
      flex: 1;
      padding: 0.75rem 1rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-family: 'Outfit', sans-serif;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tab:hover {
      color: var(--text-secondary);
    }

    .tab.active {
      background: var(--accent-green);
      color: #000;
      box-shadow: 0 4px 12px var(--accent-green-glow);
    }

    /* Content panels */
    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    .qr-container {
      position: relative;
      display: inline-block;
      margin: 1rem 0;
    }

    .qr-frame {
      padding: 20px;
      background: #ffffff;
      border-radius: 16px;
      display: inline-block;
      box-shadow: 
        0 0 0 4px var(--bg-card),
        0 0 0 6px var(--accent-green),
        0 20px 60px rgba(37, 211, 102, 0.2);
      transition: all 0.3s ease;
    }

    .qr-frame:hover {
      transform: scale(1.02);
    }

    .qr-code {
      display: block;
      width: 240px;
      height: 240px;
      border-radius: 8px;
    }

    .qr-placeholder {
      width: 240px;
      height: 240px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--bg-secondary);
      border-radius: 8px;
      color: var(--text-muted);
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border-color);
      border-top-color: var(--accent-green);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    .connected-icon { font-size: 64px; margin-bottom: 1rem; animation: bounceIn 0.6s ease-out; }
    .connected-text { font-size: 1.5rem; font-weight: 600; color: var(--accent-green); margin-bottom: 0.5rem; }

    /* Pairing code styles */
    .pairing-form {
      margin: 1rem 0;
    }

    .phone-input-group {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .phone-prefix {
      width: 80px;
      padding: 0.875rem 1rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      text-align: center;
    }

    .phone-input {
      flex: 1;
      padding: 0.875rem 1rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }

    .phone-input:focus {
      border-color: var(--accent-green);
    }

    .phone-input::placeholder {
      color: var(--text-muted);
    }

    .btn-primary {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
      border: none;
      border-radius: 12px;
      color: #fff;
      font-family: 'Outfit', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 4px 16px var(--accent-green-glow);
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px var(--accent-green-glow);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Pairing code display */
    .pairing-code-display {
      margin: 1.5rem 0;
      padding: 1.5rem;
      background: var(--bg-secondary);
      border: 2px solid var(--accent-green);
      border-radius: 16px;
      box-shadow: 0 0 30px var(--accent-green-glow);
    }

    .pairing-code-label {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-bottom: 0.75rem;
    }

    .pairing-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 2.5rem;
      font-weight: 600;
      letter-spacing: 0.2em;
      color: var(--accent-green);
      text-shadow: 0 0 20px var(--accent-green-glow);
    }

    .pairing-code-hint {
      margin-top: 0.75rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .error-message {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #ef4444;
      font-size: 0.875rem;
    }

    .instructions {
      margin-top: 1.5rem;
      text-align: left;
      padding: 1rem;
      background: var(--bg-secondary);
      border-radius: 12px;
      border: 1px solid var(--border-color);
    }

    .instructions-title {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--text-primary);
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .steps {
      list-style: none;
      counter-reset: step;
    }

    .steps li {
      counter-increment: step;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 0.5rem;
    }

    .steps li::before {
      content: counter(step);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      background: var(--border-color);
      border-radius: 50%;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-primary);
      flex-shrink: 0;
    }

    .refresh-hint {
      margin-top: 1rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }

    .refresh-hint code {
      background: var(--border-color);
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }

    .flush-btn {
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: rgba(255, 100, 100, 0.1);
      border: 1px solid rgba(255, 100, 100, 0.3);
      color: #ff6464;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .flush-btn:hover {
      background: rgba(255, 100, 100, 0.2);
    }

    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes bounceIn {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }

    /* Factory Reset Section */
    .factory-reset-section {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border-color);
    }

    .factory-reset-warning {
      color: var(--text-muted);
      font-size: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .factory-reset-btn {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid rgba(239, 68, 68, 0.3);
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      font-family: 'Outfit', sans-serif;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .factory-reset-btn:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.5);
    }

    .factory-reset-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Responsive */
    @media (max-width: 480px) {
      .container { padding: 1rem; }
      .card { padding: 1.5rem; border-radius: 20px; }
      .qr-code, .qr-placeholder { width: 200px; height: 200px; }
      .pairing-code { font-size: 2rem; }
    }
  </style>
</head>
<body>
  <div class="bg-pattern"></div>
  <div class="container">
    <a href="/" class="logo" style="text-decoration: none;">
      <div class="logo-icon">🤖</div>
      <span class="logo-text">Orient</span>
    </a>

    <div class="card">
      <div class="status" id="status">
        <span class="status-dot waiting"></span>
        <span class="status-text waiting">Checking status...</span>
      </div>

      <!-- Connected state (shown when connected) -->
      <div id="connected-panel" style="display: none;">
        <div class="qr-frame" style="background: transparent; box-shadow: none;">
          <div class="qr-placeholder" style="background: transparent;">
            <div class="connected-icon">✅</div>
            <div class="connected-text">Connected!</div>
            <span style="color: var(--text-secondary);">Bot is ready and running</span>
            <a href="/" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end)); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; box-shadow: 0 4px 12px var(--accent-green-glow);">
              📊 Go to Dashboard
            </a>
            <button onclick="flushSession()" class="flush-btn">
              🔄 Disconnect & Reconnect
            </button>
          </div>
        </div>
      </div>

      <!-- Pairing tabs (shown when not connected) -->
      <div id="pairing-panel">
        <div class="tabs">
          <button class="tab active" onclick="switchTab('qr')">📷 QR Code</button>
          <button class="tab" onclick="switchTab('pairing')">📱 Pairing Code</button>
        </div>

        <!-- QR Code Tab -->
        <div id="tab-qr" class="tab-content active">
          <div class="qr-container" id="qr-container">
            <div class="qr-frame">
              <div class="qr-placeholder">
                <div class="spinner"></div>
                <span>Loading QR code...</span>
              </div>
            </div>
          </div>

          <div class="instructions" id="qr-instructions">
            <div class="instructions-title">📱 How to connect</div>
            <ol class="steps">
              <li>Open WhatsApp on your phone</li>
              <li>Go to <strong>Settings → Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li>Point your camera at this QR code</li>
            </ol>
          </div>

          <div class="refresh-hint">
            Auto-refreshing every <code>3s</code> • QR expires in ~60s
          </div>
        </div>

        <!-- Pairing Code Tab -->
        <div id="tab-pairing" class="tab-content">
          <div class="pairing-form" id="pairing-form">
            <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.875rem;">
              Enter your phone number to receive an 8-character pairing code
            </p>
            <div class="phone-input-group">
              <input type="text" class="phone-prefix" id="phone-prefix" value="+" maxlength="5" placeholder="+1">
              <input type="tel" class="phone-input" id="phone-number" placeholder="501234567" maxlength="15">
            </div>
            <button class="btn-primary" id="request-code-btn" onclick="requestPairingCode()">
              Get Pairing Code
            </button>
            <div id="pairing-error" class="error-message" style="display: none;"></div>
          </div>

          <div id="pairing-result" style="display: none;">
            <div class="pairing-code-display">
              <div class="pairing-code-label">Your pairing code</div>
              <div class="pairing-code" id="pairing-code-value">----</div>
              <div class="pairing-code-hint">Enter this code in WhatsApp</div>
            </div>
            <button class="btn-primary" onclick="showPairingForm()" style="background: var(--bg-secondary); box-shadow: none;">
              Try Different Number
            </button>
          </div>

          <div class="instructions" id="pairing-instructions">
            <div class="instructions-title">📱 How to connect with code</div>
            <ol class="steps">
              <li>Open WhatsApp on your phone</li>
              <li>Go to <strong>Settings → Linked Devices</strong></li>
              <li>Tap <strong>Link with phone number instead</strong></li>
              <li>Enter the 8-character code shown above</li>
            </ol>
          </div>
        </div>

        <!-- Factory Reset Section (for both tabs) -->
        <div class="factory-reset-section" id="factory-reset-section">
          <p class="factory-reset-warning">
            Having trouble pairing? Stuck on "Logging In..."? Try a complete reset:
          </p>
          <button onclick="factoryReset()" class="factory-reset-btn" id="factory-reset-btn">
            🔄 Factory Reset (Clear All Session Data)
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let lastQrCode = null;
    let pollInterval = null;
    let currentTab = 'qr';

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      if (tab === 'qr') {
        document.querySelector('.tab:first-child').classList.add('active');
        document.getElementById('tab-qr').classList.add('active');
      } else {
        document.querySelector('.tab:last-child').classList.add('active');
        document.getElementById('tab-pairing').classList.add('active');
      }
    }

    function showPairingForm() {
      document.getElementById('pairing-form').style.display = 'block';
      document.getElementById('pairing-result').style.display = 'none';
      document.getElementById('pairing-error').style.display = 'none';
    }

    async function requestPairingCode() {
      const prefix = document.getElementById('phone-prefix').value.replace(/[^0-9]/g, '');
      const number = document.getElementById('phone-number').value.replace(/[^0-9]/g, '');
      const fullNumber = prefix + number;
      
      if (fullNumber.length < 10 || fullNumber.length > 15) {
        document.getElementById('pairing-error').textContent = 'Please enter a valid phone number (10-15 digits with country code)';
        document.getElementById('pairing-error').style.display = 'block';
        return;
      }

      const btn = document.getElementById('request-code-btn');
      btn.disabled = true;
      btn.textContent = 'Requesting...';
      document.getElementById('pairing-error').style.display = 'none';

      try {
        const response = await fetch('/pairing-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: fullNumber })
        });
        
        const data = await response.json();
        
        if (data.success) {
          document.getElementById('pairing-form').style.display = 'none';
          document.getElementById('pairing-result').style.display = 'block';
          document.getElementById('pairing-code-value').textContent = data.formattedCode || data.code;
        } else {
          document.getElementById('pairing-error').textContent = data.error || 'Failed to get pairing code';
          document.getElementById('pairing-error').style.display = 'block';
        }
      } catch (error) {
        console.error('Pairing code error:', error);
        document.getElementById('pairing-error').textContent = 'Network error. Please try again.';
        document.getElementById('pairing-error').style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Get Pairing Code';
      }
    }

    async function flushSession() {
      if (!confirm('This will disconnect WhatsApp and require re-pairing. Continue?')) {
        return;
      }
      
      const statusEl = document.getElementById('status');
      statusEl.innerHTML = \`
        <span class="status-dot waiting"></span>
        <span class="status-text waiting">Flushing session...</span>
      \`;
      
      try {
        const response = await fetch('/qr/flush-session', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          lastQrCode = null;
          showPairingForm();
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = setInterval(checkStatus, 2000);
        } else {
          alert('Failed to flush session: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Flush session error:', error);
        alert('Failed to flush session. Please try again.');
      }
    }

    async function factoryReset() {
      if (!confirm('FACTORY RESET will:\\n\\n• Clear ALL session data locally\\n• Clear session data from cloud storage (S3)\\n• Require a completely fresh pairing\\n\\nThis is the nuclear option for fixing pairing issues. Continue?')) {
        return;
      }
      
      const btn = document.getElementById('factory-reset-btn');
      const statusEl = document.getElementById('status');
      
      btn.disabled = true;
      btn.textContent = '🔄 Resetting...';
      
      statusEl.innerHTML = \`
        <span class="status-dot waiting"></span>
        <span class="status-text waiting">Factory reset in progress...</span>
      \`;
      
      try {
        const response = await fetch('/factory-reset', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          lastQrCode = null;
          showPairingForm();
          
          // Show success feedback
          statusEl.innerHTML = \`
            <span class="status-dot waiting"></span>
            <span class="status-text waiting">Reset complete - waiting for new QR...</span>
          \`;
          
          // Start polling for new status
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = setInterval(checkStatus, 2000);
        } else {
          alert('Factory reset failed: ' + (data.error || 'Unknown error'));
          statusEl.innerHTML = \`
            <span class="status-dot waiting"></span>
            <span class="status-text waiting">Reset failed - please try again</span>
          \`;
        }
      } catch (error) {
        console.error('Factory reset error:', error);
        alert('Factory reset failed. Please try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Factory Reset (Clear All Session Data)';
      }
    }

    async function checkStatus() {
      try {
        const response = await fetch('/qr/status');
        const data = await response.json();
        updateUI(data);
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }

    function updateUI(data) {
      const statusEl = document.getElementById('status');
      const connectedPanel = document.getElementById('connected-panel');
      const pairingPanel = document.getElementById('pairing-panel');
      const qrContainer = document.getElementById('qr-container');

      if (data.isConnected) {
        // Connected state
        statusEl.innerHTML = \`
          <span class="status-dot connected"></span>
          <span class="status-text connected">Connected to WhatsApp</span>
        \`;
        connectedPanel.style.display = 'block';
        pairingPanel.style.display = 'none';
        
        // Slow down polling when connected
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = setInterval(checkStatus, 10000);
        }
      } else {
        // Not connected - show pairing options
        connectedPanel.style.display = 'none';
        pairingPanel.style.display = 'block';
        
        if (data.qrDataUrl && data.qrCode !== lastQrCode) {
          // New QR code available
          lastQrCode = data.qrCode;
          statusEl.innerHTML = \`
            <span class="status-dot waiting"></span>
            <span class="status-text waiting">Waiting for pairing...</span>
          \`;
          qrContainer.innerHTML = \`
            <div class="qr-frame">
              <img class="qr-code" src="\${data.qrDataUrl}" alt="WhatsApp QR Code" />
            </div>
          \`;
          
          // Fast polling when waiting for scan
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = setInterval(checkStatus, 3000);
          }
        } else if (!data.qrDataUrl && !data.isConnected) {
          // No QR yet, waiting
          statusEl.innerHTML = \`
            <span class="status-dot waiting"></span>
            <span class="status-text waiting">Generating QR code...</span>
          \`;
          qrContainer.innerHTML = \`
            <div class="qr-frame">
              <div class="qr-placeholder">
                <div class="spinner"></div>
                <span>Generating QR code...</span>
              </div>
            </div>
          \`;
        }
      }
    }

    // Initial check
    checkStatus();
    
    // Start polling
    pollInterval = setInterval(checkStatus, 3000);

    // Handle Enter key in phone input
    document.getElementById('phone-number').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        requestPairingCode();
      }
    });
  </script>
</body>
</html>`;
  }

  /**
   * Handle skill reload request
   * POST /reload-skills
   * Headers: X-Reload-Token (optional, for security)
   */
  private async handleReloadSkills(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      // Verify token if configured
      if (this.config.skillReloadToken) {
        const providedToken = req.headers['x-reload-token'] as string;
        if (providedToken !== this.config.skillReloadToken) {
          logger.warn('Skill reload rejected - invalid token');
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Invalid or missing X-Reload-Token header' }));
          return;
        }
      }

      // Check if skills service is attached
      if (!this.skillsService) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'Skills service not available' }));
        return;
      }

      // Reload skills
      logger.info('Skill reload requested');
      const result = await this.skillsService.reload();

      logger.info('Skills reloaded successfully', {
        previousCount: result.previous,
        currentCount: result.current,
      });

      res.writeHead(200);
      res.end(
        JSON.stringify({
          success: true,
          message: 'Skills reloaded successfully',
          previousCount: result.previous,
          currentCount: result.current,
          skills: this.skillsService.listSkills().map((s: { name: string }) => s.name),
        })
      );
    } catch (error) {
      logger.error('Failed to reload skills', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500);
      res.end(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to reload skills',
        })
      );
    }
  }
}

/**
 * Create a WhatsApp API server
 */
export function createWhatsAppApiServer(
  whatsappService: WhatsAppService,
  config?: Partial<WhatsAppApiServerConfig>
): WhatsAppApiServer {
  return new WhatsAppApiServer(whatsappService, config);
}
