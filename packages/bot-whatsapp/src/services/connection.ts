/**
 * WhatsApp Connection Service
 *
 * Manages Baileys WebSocket connection, authentication, and reconnection.
 * Uses the Linked Devices feature for authentication (QR code scan).
 */

import Baileys, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';
import fs from 'fs';
import { createServiceLogger } from '@orient-bot/core';
import type { ConnectionState, WhatsAppBotConfig } from '../types.js';

// Create a pino logger for baileys internal use (required by makeCacheableSignalKeyStore)
const baileysLogger = pino({ level: 'warn' });

// Handle Baileys ESM default export
const makeWASocket = (Baileys as any).default || Baileys;

const logger = createServiceLogger('whatsapp-connection');

import type { ParsedMessage } from '../types.js';

export interface ConnectionEvents {
  connected: () => void;
  qr: (qr: string) => void;
  qr_terminal: (qr: string) => void;
  disconnected: (reason: string) => void;
  reconnecting: (attempt: number) => void;
  error: (error: Error) => void;
  ready: () => void;
  message: (message: ParsedMessage) => void;
}

/**
 * WhatsApp Connection Manager
 *
 * Handles low-level Baileys connection lifecycle:
 * - Authentication state management
 * - QR code generation
 * - Automatic reconnection
 * - Socket lifecycle
 */
export class WhatsAppConnection extends EventEmitter {
  private socket: WASocket | null = null;
  private config: WhatsAppBotConfig;
  private state: ConnectionState = 'connecting';
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private currentQrCode: string | null = null;
  private myLid: string | null = null;

  // Track message IDs we've sent to avoid processing our own responses
  private sentMessageIds: Set<string> = new Set();

  constructor(config: WhatsAppBotConfig) {
    super();
    this.config = config;

    // Ensure session directory exists
    if (!fs.existsSync(config.sessionPath)) {
      fs.mkdirSync(config.sessionPath, { recursive: true });
      logger.info('Created session directory', { path: config.sessionPath });
    }
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'open';
  }

  /**
   * Get the underlying Baileys socket (for messaging)
   */
  getSocket(): WASocket | null {
    return this.socket;
  }

  /**
   * Register a message ID as sent by us (to avoid processing it in upsert)
   */
  registerSentMessage(messageId: string): void {
    this.sentMessageIds.add(messageId);
    // Clean up old IDs after 60 seconds to prevent memory leak
    setTimeout(() => {
      this.sentMessageIds.delete(messageId);
    }, 60000);
  }

  /**
   * Get current QR code (for web display)
   */
  getCurrentQrCode(): string | null {
    return this.currentQrCode;
  }

  /**
   * Get our LID for group message matching
   */
  getMyLid(): string | null {
    return this.myLid;
  }

  /**
   * Connect to WhatsApp
   */
  async connect(): Promise<void> {
    const op = logger.startOperation('connect');

    try {
      // Get latest Baileys version info
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info('Using Baileys version', { version, isLatest });

      // Load auth state from file system
      const { state, saveCreds } = await useMultiFileAuthState(this.config.sessionPath);

      // Create the socket (handle both default and named export)
      const socket = (makeWASocket as any)({
        version,
        logger: baileysLogger,
        browser: ['Orient Bot', 'Chrome', '125.0.0.0'],
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        printQRInTerminal: false, // We'll handle QR ourselves
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => true,
      }) as WASocket;

      this.socket = socket;

      // Handle connection updates
      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          logger.info('QR Code received - scan with WhatsApp');
          this.currentQrCode = qr;

          // Emit QR code for web display
          this.emit('qr', qr);

          // Generate terminal QR
          try {
            const qrTerminal = await QRCode.toString(qr, { type: 'terminal', small: true });
            console.log(qrTerminal);
            this.emit('qr_terminal', qrTerminal);
          } catch (e) {
            logger.debug('Could not generate terminal QR', { error: String(e) });
          }
        }

        if (connection === 'close') {
          const error = lastDisconnect?.error as Error & { output?: { statusCode?: number } };
          const reason = error?.output?.statusCode;
          const reasonName =
            reason !== undefined ? DisconnectReason[reason] || String(reason) : 'unknown';
          const shouldReconnect = reason !== DisconnectReason.loggedOut && !this.isShuttingDown;

          logger.warn('Connection closed', {
            reason: reasonName,
            shouldReconnect,
            isShuttingDown: this.isShuttingDown,
          });

          this.state = 'close';
          this.stopKeepAlive();
          this.emit('disconnected', reasonName);

          if (shouldReconnect && this.config.autoReconnect) {
            this.scheduleReconnect();
          } else if (reason === DisconnectReason.loggedOut) {
            logger.warn('Logged out - session cleared. Reconnecting for fresh pairing...');
            await this.clearSession();
            if (this.config.autoReconnect && !this.isShuttingDown) {
              this.scheduleReconnect();
            }
          }
        }

        if (connection === 'open') {
          this.state = 'open';
          this.reconnectAttempt = 0;
          this.currentQrCode = null;
          this.startKeepAlive();

          // Capture our LID for group message matching
          const socket = this.socket;
          if (socket?.user?.lid) {
            const lidFull = socket.user.lid;
            const lidMatch = lidFull.match(/^(\d+)/);
            this.myLid = lidMatch ? lidMatch[1] : null;
            logger.info('Captured LID', { lidFull, lidExtracted: this.myLid });
          }

          logger.info('Connected to WhatsApp');
          op.success('Connected successfully');
          this.emit('connected');
          this.emit('ready');
        }
      });

      // Save credentials when updated
      socket.ev.on('creds.update', saveCreds);

      // Handle incoming messages
      socket.ev.on('messages.upsert', async (m) => {
        logger.debug('messages.upsert event', {
          type: m.type,
          messageCount: m.messages.length,
        });

        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          // Debug log the raw message structure
          logger.debug('Processing message', {
            hasMessage: !!msg.message,
            hasKey: !!msg.key,
            remoteJid: msg.key?.remoteJid,
            fromMe: msg.key?.fromMe,
            messageTypes: msg.message ? Object.keys(msg.message) : [],
          });

          // Skip if no message content or key
          if (!msg.message || !msg.key) {
            logger.debug('Skipping message - no content or key');
            continue;
          }

          // Skip status broadcasts
          if (msg.key.remoteJid === 'status@broadcast') {
            logger.debug('Skipping status broadcast');
            continue;
          }

          // Skip messages we sent ourselves (registered via registerSentMessage)
          if (msg.key.id && this.sentMessageIds.has(msg.key.id)) {
            logger.debug('Skipping message we sent', { messageId: msg.key.id });
            continue;
          }

          const jid = msg.key.remoteJid;
          if (!jid) continue;

          const isGroup = jid.endsWith('@g.us');
          const messageContent = msg.message;

          // Determine message type and extract text
          let text = '';
          let mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker' | undefined;

          if (messageContent.conversation) {
            text = messageContent.conversation;
          } else if (messageContent.extendedTextMessage?.text) {
            text = messageContent.extendedTextMessage.text;
          } else if (messageContent.imageMessage) {
            text = messageContent.imageMessage.caption || '';
            mediaType = 'image';
          } else if (messageContent.audioMessage) {
            mediaType = 'audio';
          } else if (messageContent.videoMessage) {
            text = messageContent.videoMessage.caption || '';
            mediaType = 'video';
          } else if (messageContent.documentMessage) {
            text = messageContent.documentMessage.caption || '';
            mediaType = 'document';
          } else if (messageContent.stickerMessage) {
            mediaType = 'sticker';
          }

          // Debug: Always log message content for troubleshooting
          logger.debug('Message content extracted', {
            messageKeys: Object.keys(messageContent),
            conversationValue: messageContent.conversation,
            conversationType: typeof messageContent.conversation,
            extendedTextValue: messageContent.extendedTextMessage?.text,
            extractedText: text,
          });

          // Get sender info
          const senderJid = isGroup ? msg.key.participant || msg.key.remoteJid : msg.key.remoteJid;
          const senderPhone = senderJid?.replace(/@.*/, '') || '';

          // For linked devices mode, fromMe is true for all messages from your account
          // For GROUPS: Don't skip based on LID match - user might be sending from same account
          //             The permission system will decide whether to respond
          // For DMs: Skip if the message appears to be from the bot (prevents echo)
          let isFromMe = false;

          if (!isGroup) {
            // For DMs, check if this is a message we sent (not one we received)
            // In DMs with fromMe=true, it's an outgoing message we don't need to process
            isFromMe = msg.key.fromMe === true;
          }
          // For groups, we DON'T set isFromMe - we process all group messages
          // and let the permission system in main.ts decide what to respond to

          logger.debug('Message sender check', {
            senderPhone,
            isFromMe,
            fromMeFlag: msg.key.fromMe,
            isGroup,
            myLid: this.myLid,
            note: isGroup ? 'Groups process all messages' : 'DMs skip fromMe=true',
          });

          // Skip DM messages from ourselves
          if (isFromMe) {
            logger.debug('Skipping DM message from self');
            continue;
          }

          // Parse timestamp - can be number, Long, or undefined
          let timestamp: Date;
          const msgTs = msg.messageTimestamp;
          if (typeof msgTs === 'number') {
            timestamp = new Date(msgTs * 1000);
          } else if (msgTs && typeof (msgTs as any).toNumber === 'function') {
            timestamp = new Date((msgTs as any).toNumber() * 1000);
          } else {
            timestamp = new Date();
          }

          const parsedMessage: ParsedMessage = {
            id: msg.key.id!,
            chatId: jid,
            senderJid: senderJid || jid,
            senderPhone,
            senderName: msg.pushName || senderPhone,
            text,
            timestamp,
            isGroup,
            isFromMe: !!isFromMe,
            hasMedia: !!mediaType,
            mediaType,
            rawMessage: msg,
          };

          logger.info('Incoming message', {
            from: senderPhone,
            chatId: jid,
            isGroup,
            textPreview: text.substring(0, 50),
          });

          this.emit('message', parsedMessage);
        }
      });
    } catch (error) {
      op.failure(error as Error);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached');
      this.emit('disconnected', 'max_reconnect_attempts');
      return;
    }

    this.reconnectAttempt++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempt - 1), 60000);

    logger.info('Scheduling reconnect', { attempt: this.reconnectAttempt, delayMs: delay });
    this.emit('reconnecting', this.reconnectAttempt);

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed', {
          attempt: this.reconnectAttempt,
          error: String(error),
        });
      }
    }, delay);
  }

  /**
   * Start keep-alive pings
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.socket && this.state === 'open') {
        logger.debug('Keep-alive ping');
      }
    }, 30000);
  }

  /**
   * Stop keep-alive pings
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Clear session files
   */
  private async clearSession(): Promise<void> {
    const sessionPath = this.config.sessionPath;
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true });
      fs.mkdirSync(sessionPath, { recursive: true });
      logger.info('Session folder cleared');
    }
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.stopKeepAlive();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    const socket = this.socket;
    if (socket) {
      try {
        socket.end(undefined);
      } catch {
        // Socket may already be closed
      }
      this.socket = null;
    }

    this.state = 'close';
    logger.info('WhatsApp connection disconnected');
  }

  /**
   * Logout and clear session
   */
  async logout(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
    }

    await this.clearSession();
    this.state = 'close';
    logger.info('WhatsApp session cleared');
  }

  /**
   * Request a pairing code for linking via phone number
   * Alternative to QR code scanning
   * @param phoneNumber - Phone number in international format without '+' (e.g., "972501234567")
   * @returns The 8-character pairing code to enter in WhatsApp
   */
  async requestPairingCode(phoneNumber: string): Promise<string> {
    if (this.state === 'open') {
      throw new Error('Already connected to WhatsApp. Disconnect first to pair a new device.');
    }

    if (!this.socket) {
      throw new Error('WhatsApp socket not initialized. Call connect() first.');
    }

    // Clean the phone number - remove any non-digit characters
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    // Validate phone number format (10-15 digits)
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      throw new Error(
        'Invalid phone number format. Expected 10-15 digits in international format (e.g., 972501234567).'
      );
    }

    logger.info('Requesting pairing code', { phoneNumber: cleanPhone.substring(0, 5) + '***' });

    try {
      const code = await this.socket.requestPairingCode(cleanPhone);
      logger.info('Pairing code generated successfully');
      return code;
    } catch (error) {
      logger.error('Failed to request pairing code', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the session path
   */
  getSessionPath(): string {
    return this.config.sessionPath;
  }

  /**
   * Clear local session and restart for fresh pairing
   */
  async flushSession(): Promise<void> {
    logger.info('Flushing WhatsApp session');

    // Disconnect first
    await this.disconnect();

    // Clear session files
    await this.clearSession();

    // Small delay before reconnecting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Reset shutdown flag
    this.isShuttingDown = false;

    // Reconnect - this will trigger a new QR code
    this.connect().catch((error) => {
      logger.error('Failed to reconnect after flush', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
