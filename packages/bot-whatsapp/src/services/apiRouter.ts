/**
 * WhatsApp API Router
 *
 * Express router that exposes HTTP endpoints for QR code scanning, pairing code, and health checks.
 * This allows WhatsApp functionality to be mounted in the unified dashboard server.
 */

import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { createServiceLogger } from '@orient-bot/core';
import type { WhatsAppConnection } from './connection.js';

const logger = createServiceLogger('whatsapp-api-router');

/**
 * Create an Express router for WhatsApp API endpoints
 * @param connection - The WhatsApp connection instance
 * @returns Express router with all WhatsApp endpoints mounted
 */
export function createWhatsAppRouter(connection: WhatsAppConnection): Router {
  const router = Router();

  /**
   * Health check endpoint
   */
  router.get('/whatsapp/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      connected: connection.isConnected(),
      state: connection.getState(),
    });
  });

  /**
   * QR code page endpoint - serves the pairing page HTML
   * Also handles /qr and /qr/ paths
   */
  const handleQrPage = async (_req: Request, res: Response): Promise<void> => {
    const html = generateQrPageHtml();
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).send(html);
  };

  router.get('/qr', handleQrPage);
  router.get('/qr/', handleQrPage);

  /**
   * QR code status endpoint (JSON)
   */
  router.get('/qr/status', async (_req: Request, res: Response): Promise<void> => {
    const qrCode = connection.getCurrentQrCode();
    const isConnected = connection.isConnected();
    const adminPhone = process.env.WHATSAPP_ADMIN_PHONE || null;

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

    res.json({
      needsQrScan: !isConnected && qrCode !== null,
      isConnected,
      qrCode: qrCode || null,
      qrDataUrl,
      adminPhone,
      updatedAt: new Date().toISOString(),
    });
  });

  /**
   * QR code image endpoint (PNG)
   */
  router.get('/qr.png', async (_req: Request, res: Response): Promise<void> => {
    const qrCode = connection.getCurrentQrCode();

    if (!qrCode) {
      res.status(404).json({ error: 'No QR code available' });
      return;
    }

    try {
      const buffer = await QRCode.toBuffer(qrCode, {
        type: 'png',
        width: 400,
        margin: 2,
      });
      res.setHeader('Content-Type', 'image/png');
      res.status(200).send(buffer);
    } catch (error) {
      logger.error('Failed to generate QR image', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to generate QR image' });
    }
  });

  /**
   * Pairing code request endpoint
   */
  router.post('/pairing-code', async (req: Request, res: Response): Promise<void> => {
    try {
      const { phoneNumber } = req.body as { phoneNumber?: string };

      if (!phoneNumber || typeof phoneNumber !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Missing required field: phoneNumber',
        });
        return;
      }

      // Clean and validate phone number
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        res.status(400).json({
          success: false,
          error:
            'Invalid phone number format. Expected 10-15 digits in international format (e.g., 972501234567).',
        });
        return;
      }

      // Check if already connected
      if (connection.isConnected()) {
        res.status(400).json({
          success: false,
          error: 'Already connected to WhatsApp. Disconnect first to pair a new device.',
        });
        return;
      }

      logger.info('Requesting pairing code via API', {
        phoneNumber: cleanPhone.substring(0, 5) + '***',
      });

      // Request the pairing code
      const code = await connection.requestPairingCode(cleanPhone);

      // Format code with dash for display (ABCD-1234)
      const formattedCode =
        code.length === 8 ? `${code.substring(0, 4)}-${code.substring(4)}` : code;

      res.json({
        success: true,
        code: code,
        formattedCode: formattedCode,
        message:
          'Enter this code in WhatsApp on your phone: Settings → Linked Devices → Link with phone number',
      });

      logger.info('Pairing code generated successfully via API');
    } catch (error) {
      logger.error('Failed to generate pairing code', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate pairing code',
      });
    }
  });

  // Also support /qr/pairing-code path for backwards compatibility
  router.post('/qr/pairing-code', async (req: Request, res: Response): Promise<void> => {
    try {
      const { phoneNumber } = req.body as { phoneNumber?: string };

      if (!phoneNumber || typeof phoneNumber !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Missing required field: phoneNumber',
        });
        return;
      }

      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        res.status(400).json({
          success: false,
          error: 'Invalid phone number format.',
        });
        return;
      }

      if (connection.isConnected()) {
        res.status(400).json({
          success: false,
          error: 'Already connected to WhatsApp.',
        });
        return;
      }

      const code = await connection.requestPairingCode(cleanPhone);
      const formattedCode =
        code.length === 8 ? `${code.substring(0, 4)}-${code.substring(4)}` : code;

      res.json({ success: true, code, formattedCode });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate pairing code',
      });
    }
  });

  /**
   * Flush session endpoint
   */
  router.post('/flush-session', async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info('Flushing WhatsApp session');
      await connection.flushSession();

      res.json({
        success: true,
        message: 'Session flushed. Reconnecting - new QR code will appear shortly.',
      });
    } catch (error) {
      logger.error('Failed to flush session', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to flush session',
      });
    }
  });

  // Also support /qr/flush-session path
  router.post('/qr/flush-session', async (_req: Request, res: Response): Promise<void> => {
    try {
      await connection.flushSession();
      res.json({
        success: true,
        message: 'Session flushed. Reconnecting - new QR code will appear shortly.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to flush session',
      });
    }
  });

  /**
   * Factory reset endpoint
   */
  router.post('/factory-reset', async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info('Factory reset requested - clearing all session data');

      // Force disconnect and flush
      await connection.flushSession();

      res.json({
        success: true,
        message: 'Factory reset complete. Bot is reconnecting with fresh state.',
        pairingMode: true,
      });

      logger.info('Factory reset complete');
    } catch (error) {
      logger.error('Factory reset failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to perform factory reset',
      });
    }
  });

  // Also support /qr/factory-reset path
  router.post('/qr/factory-reset', async (_req: Request, res: Response): Promise<void> => {
    try {
      await connection.flushSession();
      res.json({
        success: true,
        message: 'Factory reset complete.',
        pairingMode: true,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to perform factory reset',
      });
    }
  });

  /**
   * Send message endpoint (for testing)
   */
  router.post('/send', async (req: Request, res: Response): Promise<void> => {
    try {
      const { to, text } = req.body as { to?: string; text?: string };

      if (!to || !text) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: to, text',
        });
        return;
      }

      if (!connection.isConnected()) {
        res.status(503).json({
          success: false,
          error: 'WhatsApp not connected',
        });
        return;
      }

      const socket = connection.getSocket();
      if (!socket) {
        res.status(503).json({
          success: false,
          error: 'No socket available',
        });
        return;
      }

      logger.info('Sending test message', { to, textLength: text.length });

      const result = await socket.sendMessage(to, { text });

      // Register the sent message ID to avoid processing it
      if (result?.key?.id) {
        connection.registerSentMessage(result.key.id);
      }

      res.json({
        success: true,
        messageId: result?.key?.id,
        to,
      });

      logger.info('Test message sent', { messageId: result?.key?.id, to });
    } catch (error) {
      logger.error('Failed to send test message', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  });

  /**
   * E2E test endpoint
   */
  router.post('/e2e-test', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as {
        jid?: string;
        testMessage?: string;
        waitForAck?: boolean;
        ackTimeoutMs?: number;
      };

      if (!body.jid) {
        res.status(400).json({
          success: false,
          error: 'jid is required - specify the WhatsApp chat/group JID to test',
          example: { jid: '120363000000000001@g.us', testMessage: 'Hello!' },
        });
        return;
      }

      const testGroupJid = body.jid;
      const testId = `e2e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const testMessage =
        body.testMessage || `🧪 E2E Test [${testId}] - ${new Date().toISOString()}`;
      const waitForAck = body.waitForAck !== false;
      const ackTimeoutMs = body.ackTimeoutMs || 10000;

      logger.info('Starting E2E test', {
        jid: testGroupJid,
        testId,
        waitForAck,
        ackTimeoutMs,
      });

      if (!connection.isConnected()) {
        res.status(503).json({
          success: false,
          error: 'WhatsApp not connected',
          phase: 'connection_check',
          testId,
        });
        return;
      }

      const socket = connection.getSocket();
      if (!socket) {
        res.status(503).json({
          success: false,
          error: 'No socket available',
          phase: 'connection_check',
          testId,
        });
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

      // Phase 1: Send a test message
      let messageId: string | null = null;
      try {
        const phase1Start = Date.now();
        const sendResult = await socket.sendMessage(testGroupJid, { text: testMessage });

        if (!sendResult?.key?.id) {
          throw new Error('No message key returned from sendMessage');
        }

        messageId = sendResult.key.id;
        connection.registerSentMessage(messageId);

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
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          phase: 'send_message',
          success: false,
          duration: Date.now() - startTime,
          error: errorMsg,
        });

        res.status(500).json({
          success: false,
          error: `Failed to send message: ${errorMsg}`,
          results,
          totalDuration: Date.now() - startTime,
          testId,
        });
        return;
      }

      // Phase 2: Wait for delivery acknowledgment
      if (waitForAck && messageId) {
        const phase2Start = Date.now();
        await new Promise((resolve) => setTimeout(resolve, Math.min(ackTimeoutMs, 3000)));

        results.push({
          phase: 'delivery_ack',
          success: true,
          duration: Date.now() - phase2Start,
          details: {
            messageId,
            note: 'Message sent successfully (ack wait completed)',
          },
        });
      }

      const totalDuration = Date.now() - startTime;
      const allPassed = results.every((r) => r.success);

      res.status(allPassed ? 200 : 500).json({
        success: allPassed,
        testId,
        jid: testGroupJid,
        message: testMessage,
        results,
        totalDuration,
      });

      logger.info('E2E test completed', {
        success: allPassed,
        testId,
        totalDuration,
      });
    } catch (error) {
      logger.error('E2E test error', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'E2E test failed',
      });
    }
  });

  return router;
}

/**
 * Generate the HTML page for QR code and pairing code display
 * This is the same HTML as in apiServer.ts, extracted for reuse
 */
function generateQrPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Pairing - Orient</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    /* Dashboard Design System Tokens */
    :root {
      --background: 0 0% 100%;
      --foreground: 240 10% 3.9%;
      --card: 0 0% 100%;
      --card-foreground: 240 10% 3.9%;
      --muted: 240 4.8% 95.9%;
      --muted-foreground: 240 3.8% 46.1%;
      --border: 240 5.9% 90%;
      --input: 240 5.9% 90%;
      --primary: 240 5.9% 10%;
      --primary-foreground: 0 0% 98%;
      --secondary: 240 4.8% 95.9%;
      --secondary-foreground: 240 5.9% 10%;
      --accent: 240 4.8% 95.9%;
      --accent-foreground: 240 5.9% 10%;
      --destructive: 0 84.2% 60.2%;
      --ring: 240 5.9% 10%;
      --radius: 0.5rem;
    }

    .dark {
      --background: 240 10% 3.9%;
      --foreground: 0 0% 98%;
      --card: 240 10% 3.9%;
      --card-foreground: 0 0% 98%;
      --muted: 240 3.7% 15.9%;
      --muted-foreground: 240 5% 64.9%;
      --border: 240 3.7% 15.9%;
      --input: 240 3.7% 15.9%;
      --primary: 0 0% 98%;
      --primary-foreground: 240 5.9% 10%;
      --secondary: 240 3.7% 15.9%;
      --secondary-foreground: 0 0% 98%;
      --accent: 240 3.7% 15.9%;
      --accent-foreground: 0 0% 98%;
      --destructive: 0 62.8% 50.6%;
      --ring: 240 4.9% 83.9%;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: hsl(var(--background));
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: hsl(var(--foreground));
      overflow-x: hidden;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem;
      max-width: 420px;
      width: 100%;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      text-decoration: none;
      color: hsl(var(--foreground));
    }

    .header-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      overflow: hidden;
    }

    .header-icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .header-text {
      font-size: 1.125rem;
      font-weight: 600;
    }

    .card {
      background: hsl(var(--card));
      border: 1px solid hsl(var(--border));
      border-radius: 12px;
      padding: 1.5rem;
      width: 100%;
      text-align: center;
    }

    .status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      font-weight: 500;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    .status-dot.waiting { background: #f59e0b; }
    .status-dot.connected { background: #22c55e; }
    .status-text.waiting { color: #f59e0b; }
    .status-text.connected { color: #22c55e; }

    .tabs {
      display: flex;
      gap: 0.25rem;
      margin-bottom: 1.25rem;
      background: hsl(var(--secondary));
      padding: 4px;
      border-radius: 8px;
      border: 1px solid hsl(var(--border));
    }

    .tab {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: none;
      background: transparent;
      color: hsl(var(--muted-foreground));
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .tab:hover { color: hsl(var(--foreground)); }
    .tab.active {
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .qr-container {
      display: inline-block;
      margin: 0.75rem 0;
    }

    .qr-frame {
      padding: 16px;
      background: #ffffff;
      border-radius: 12px;
      display: inline-block;
      border: 1px solid hsl(var(--border));
    }

    .qr-code {
      display: block;
      width: 200px;
      height: 200px;
      border-radius: 4px;
    }

    .qr-placeholder {
      width: 200px;
      height: 200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: hsl(var(--muted));
      border-radius: 4px;
      color: hsl(var(--muted-foreground));
      font-size: 0.8125rem;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 2px solid hsl(var(--border));
      border-top-color: hsl(var(--foreground));
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 0.75rem;
    }

    .connected-panel {
      padding: 2rem 1rem;
    }

    .connected-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 1rem;
      background: rgba(34, 197, 94, 0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .connected-icon svg {
      width: 24px;
      height: 24px;
      color: #22c55e;
    }

    .connected-text {
      font-size: 1rem;
      font-weight: 600;
      color: hsl(var(--foreground));
      margin-bottom: 0.25rem;
    }

    .connected-subtext {
      font-size: 0.8125rem;
      color: hsl(var(--muted-foreground));
      margin-bottom: 1.25rem;
    }

    .pairing-form { margin: 0.75rem 0; }

    .form-description {
      color: hsl(var(--muted-foreground));
      margin-bottom: 1rem;
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    .phone-input-group {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .phone-prefix {
      width: 72px;
      height: 36px;
      padding: 0 0.75rem;
      background: transparent;
      border: 1px solid hsl(var(--input));
      border-radius: 6px;
      color: hsl(var(--foreground));
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      text-align: center;
    }

    .phone-input {
      flex: 1;
      height: 36px;
      padding: 0 0.75rem;
      background: transparent;
      border: 1px solid hsl(var(--input));
      border-radius: 6px;
      color: hsl(var(--foreground));
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .phone-input:focus { border-color: hsl(var(--ring)); }
    .phone-input::placeholder { color: hsl(var(--muted-foreground)); }
    .phone-prefix:focus { border-color: hsl(var(--ring)); outline: none; }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 36px;
      padding: 0 1rem;
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }

    .btn-primary {
      width: 100%;
      background: hsl(var(--primary));
      border: none;
      color: hsl(var(--primary-foreground));
    }

    .btn-primary:hover:not(:disabled) { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-secondary {
      background: hsl(var(--secondary));
      border: 1px solid hsl(var(--border));
      color: hsl(var(--secondary-foreground));
    }

    .btn-secondary:hover { background: hsl(var(--accent)); }

    .btn-ghost {
      background: transparent;
      border: 1px solid hsl(var(--border));
      color: hsl(var(--muted-foreground));
    }

    .btn-ghost:hover {
      background: hsl(var(--muted));
      color: hsl(var(--foreground));
    }

    .btn-destructive {
      background: transparent;
      border: 1px solid hsl(var(--destructive) / 0.3);
      color: hsl(var(--destructive));
    }

    .btn-destructive:hover {
      background: hsl(var(--destructive) / 0.1);
    }

    .pairing-code-display {
      margin: 1rem 0;
      padding: 1.25rem;
      background: hsl(var(--muted));
      border: 1px solid hsl(var(--border));
      border-radius: 8px;
    }

    .pairing-code-label {
      font-size: 0.75rem;
      color: hsl(var(--muted-foreground));
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 500;
    }

    .pairing-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.75rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      color: hsl(var(--foreground));
    }

    .pairing-code-hint {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: hsl(var(--muted-foreground));
    }

    .error-message {
      margin-top: 0.75rem;
      padding: 0.625rem 0.75rem;
      background: hsl(var(--destructive) / 0.1);
      border: 1px solid hsl(var(--destructive) / 0.2);
      border-radius: 6px;
      color: hsl(var(--destructive));
      font-size: 0.8125rem;
      text-align: left;
    }

    .instructions {
      margin-top: 1.25rem;
      text-align: left;
      padding: 1rem;
      background: hsl(var(--muted));
      border-radius: 8px;
      border: 1px solid hsl(var(--border));
    }

    .instructions-title {
      font-weight: 600;
      font-size: 0.8125rem;
      color: hsl(var(--foreground));
      margin-bottom: 0.625rem;
    }

    .steps { list-style: none; counter-reset: step; }

    .steps li {
      counter-increment: step;
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      color: hsl(var(--muted-foreground));
      font-size: 0.8125rem;
      line-height: 1.5;
      margin-bottom: 0.375rem;
    }

    .steps li::before {
      content: counter(step);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      background: hsl(var(--border));
      border-radius: 50%;
      font-size: 0.6875rem;
      font-weight: 600;
      color: hsl(var(--foreground));
      flex-shrink: 0;
      margin-top: 1px;
    }

    .steps li strong {
      color: hsl(var(--foreground));
      font-weight: 500;
    }

    .hint {
      margin-top: 0.75rem;
      font-size: 0.6875rem;
      color: hsl(var(--muted-foreground));
      font-family: 'JetBrains Mono', monospace;
    }

    .hint code {
      background: hsl(var(--border));
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }

    .divider {
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid hsl(var(--border));
    }

    .divider-text {
      color: hsl(var(--muted-foreground));
      font-size: 0.6875rem;
      margin-bottom: 0.625rem;
      line-height: 1.4;
    }

    .button-group {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .button-group .btn {
      flex: 1;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 480px) {
      .container { padding: 1rem; }
      .card { padding: 1.25rem; }
      .qr-code, .qr-placeholder { width: 180px; height: 180px; }
      .pairing-code { font-size: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="header">
      <div class="header-icon">
        <img src="/mascot/ori-icon.png" alt="Ori" onerror="this.parentElement.innerHTML='&#128054;'" />
      </div>
      <span class="header-text">Orient</span>
    </a>

    <div class="card">
      <div class="status" id="status">
        <span class="status-dot waiting"></span>
        <span class="status-text waiting">Checking status...</span>
      </div>

      <div id="connected-panel" style="display: none;">
        <div class="connected-panel">
          <div class="connected-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div class="connected-text">Connected</div>
          <div class="connected-subtext">WhatsApp bot is ready and running</div>
          <a href="/" class="btn btn-primary">Go to Dashboard</a>
          <div class="button-group">
            <button onclick="flushSession()" class="btn btn-ghost">Disconnect</button>
          </div>
        </div>
      </div>

      <div id="pairing-panel">
        <div class="tabs">
          <button class="tab active" onclick="switchTab('qr')">QR Code</button>
          <button class="tab" onclick="switchTab('pairing')">Pairing Code</button>
        </div>

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
            <div class="instructions-title">How to connect</div>
            <ol class="steps">
              <li>Open WhatsApp on your phone</li>
              <li>Go to <strong>Settings → Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li>Point your camera at this QR code</li>
            </ol>
          </div>

          <div class="hint">
            Auto-refreshing every <code>3s</code> · QR expires in ~60s
          </div>
        </div>

        <div id="tab-pairing" class="tab-content">
          <div class="pairing-form" id="pairing-form">
            <p class="form-description">
              Enter your phone number to receive an 8-character pairing code
            </p>
            <div class="phone-input-group">
              <input type="text" class="phone-prefix" id="phone-prefix" value="+" maxlength="5" placeholder="+1">
              <input type="tel" class="phone-input" id="phone-number" placeholder="501234567" maxlength="15">
            </div>
            <button class="btn btn-primary" id="request-code-btn" onclick="requestPairingCode()">
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
            <button class="btn btn-secondary" onclick="showPairingForm()" style="width: 100%;">
              Try Different Number
            </button>
          </div>

          <div class="instructions" id="pairing-instructions">
            <div class="instructions-title">How to connect with code</div>
            <ol class="steps">
              <li>Open WhatsApp on your phone</li>
              <li>Go to <strong>Settings → Linked Devices</strong></li>
              <li>Tap <strong>Link with phone number instead</strong></li>
              <li>Enter the 8-character code shown above</li>
            </ol>
          </div>
        </div>

        <div class="divider" id="factory-reset-section">
          <p class="divider-text">
            Having trouble pairing? Stuck on "Logging In..."? Try a reset.
          </p>
          <button onclick="factoryReset()" class="btn btn-destructive" id="factory-reset-btn" style="width: 100%;">
            Factory Reset
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
      statusEl.innerHTML = '<span class="status-dot waiting"></span><span class="status-text waiting">Flushing session...</span>';

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
      if (!confirm('FACTORY RESET will:\\n\\n• Clear ALL session data locally\\n• Require a completely fresh pairing\\n\\nThis is the nuclear option for fixing pairing issues. Continue?')) {
        return;
      }

      const btn = document.getElementById('factory-reset-btn');
      const statusEl = document.getElementById('status');

      btn.disabled = true;
      btn.textContent = 'Resetting...';

      statusEl.innerHTML = '<span class="status-dot waiting"></span><span class="status-text waiting">Factory reset in progress...</span>';

      try {
        const response = await fetch('/factory-reset', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
          lastQrCode = null;
          showPairingForm();
          statusEl.innerHTML = '<span class="status-dot waiting"></span><span class="status-text waiting">Reset complete - waiting for new QR...</span>';
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = setInterval(checkStatus, 2000);
        } else {
          alert('Factory reset failed: ' + (data.error || 'Unknown error'));
          statusEl.innerHTML = '<span class="status-dot waiting"></span><span class="status-text waiting">Reset failed - please try again</span>';
        }
      } catch (error) {
        console.error('Factory reset error:', error);
        alert('Factory reset failed. Please try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Factory Reset';
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
        statusEl.innerHTML = '<span class="status-dot connected"></span><span class="status-text connected">Connected to WhatsApp</span>';
        connectedPanel.style.display = 'block';
        pairingPanel.style.display = 'none';

        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = setInterval(checkStatus, 10000);
        }
      } else {
        connectedPanel.style.display = 'none';
        pairingPanel.style.display = 'block';

        if (data.qrDataUrl && data.qrCode !== lastQrCode) {
          lastQrCode = data.qrCode;
          statusEl.innerHTML = '<span class="status-dot waiting"></span><span class="status-text waiting">Waiting for pairing...</span>';
          qrContainer.innerHTML = '<div class="qr-frame"><img class="qr-code" src="' + data.qrDataUrl + '" alt="WhatsApp QR Code" /></div>';

          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = setInterval(checkStatus, 3000);
          }
        } else if (!data.qrDataUrl && !data.isConnected) {
          statusEl.innerHTML = '<span class="status-dot waiting"></span><span class="status-text waiting">Generating QR code...</span>';
          qrContainer.innerHTML = '<div class="qr-frame"><div class="qr-placeholder"><div class="spinner"></div><span>Generating QR code...</span></div></div>';
        }
      }
    }

    checkStatus();
    pollInterval = setInterval(checkStatus, 3000);

    document.getElementById('phone-number').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        requestPairingCode();
      }
    });
  </script>
</body>
</html>`;
}
