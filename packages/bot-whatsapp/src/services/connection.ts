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

import type { proto } from 'baileys';
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
  poll_vote_raw: (msg: proto.IWebMessageInfo) => void;
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
  private qrGenerationPaused = false;

  // Track message IDs we've sent to avoid processing our own responses
  private sentMessageIds: Set<string> = new Set();
  // Track chats where we're currently in a sendMessage() call (guards the race condition
  // where messages.upsert fires before registerSentMessage completes)
  private pendingSendChats: Set<string> = new Set();

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
   * Mark a chat as having a pending bot send (call before sendMessage)
   */
  markSending(chatId: string): void {
    this.pendingSendChats.add(chatId);
  }

  /**
   * Clear the pending send flag for a chat (call after registerSentMessage)
   */
  clearSending(chatId: string): void {
    this.pendingSendChats.delete(chatId);
  }

  /**
   * Get current QR code (for web display)
   */
  getCurrentQrCode(): string | null {
    return this.currentQrCode;
  }

  /**
   * Check if QR generation is paused (max retries exhausted)
   */
  isQrGenerationPaused(): boolean {
    return this.qrGenerationPaused;
  }

  /**
   * Request fresh QR code generation (resets retry counter and reconnects)
   */
  async requestQrRegeneration(): Promise<void> {
    logger.info('User requested QR regeneration');

    // Reset state
    this.reconnectAttempt = 0;
    this.qrGenerationPaused = false;
    this.currentQrCode = null;

    // Force disconnect any existing socket
    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch {
        // Socket may already be closed
      }
      this.socket = null;
    }

    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Reset shutdown flag
    this.isShuttingDown = false;
    this.state = 'connecting';

    // Trigger a fresh connection attempt
    await this.connect();
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
          this.qrGenerationPaused = false;
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

          // Detect poll vote updates (pollUpdateMessage) and emit raw event
          if (msg.message.pollUpdateMessage) {
            logger.info('Poll vote detected in messages.upsert', {
              pollCreationMsgId: msg.message.pollUpdateMessage.pollCreationMessageKey?.id,
              voterJid: msg.key.participant || msg.key.remoteJid,
            });
            this.emit('poll_vote_raw', msg);
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

          // For linked devices mode, fromMe is true for ALL messages from the account
          // (both user-typed and bot-sent). We need to distinguish them:
          // - DMs: always skip fromMe (outgoing echo)
          // - Groups: skip only if we KNOW this is a bot-sent message
          //   (via sentMessageIds or pendingSendChats race-condition guard)
          if (msg.key.fromMe === true) {
            if (!isGroup) {
              logger.debug('Skipping DM fromMe message', { messageId: msg.key.id });
              continue;
            }
            // Group fromMe: check if this is a bot-sent message
            if (
              (msg.key.id && this.sentMessageIds.has(msg.key.id)) ||
              this.pendingSendChats.has(jid)
            ) {
              // Auto-register in case it came via pendingSendChats race guard
              if (msg.key.id) this.sentMessageIds.add(msg.key.id);
              logger.debug('Skipping bot-sent group message', { messageId: msg.key.id });
              continue;
            }
            // Otherwise it's the user typing from the same account - process it
            logger.debug('Processing fromMe group message as user message', {
              messageId: msg.key.id,
              senderPhone,
            });
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
            isFromMe: msg.key.fromMe === true,
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
      // Handle poll vote updates via messages.update (fallback path)
      socket.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
          const msgUpdate = update.update as any;
          if (msgUpdate?.pollUpdates && msgUpdate.pollUpdates.length > 0) {
            const pollId = update.key?.id;
            if (!pollId) continue;

            logger.info('Poll vote detected in messages.update', {
              pollId,
              updateCount: msgUpdate.pollUpdates.length,
            });

            // Synthesize a raw message for the handler
            const latestUpdate = msgUpdate.pollUpdates[msgUpdate.pollUpdates.length - 1];
            const syntheticMsg: proto.IWebMessageInfo = {
              key: update.key,
              message: {
                pollUpdateMessage: {
                  pollCreationMessageKey: {
                    id: pollId,
                    remoteJid: update.key.remoteJid,
                    fromMe: true,
                  },
                  vote: latestUpdate.vote,
                },
              },
            };
            this.emit('poll_vote_raw', syntheticMsg);
          }
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
      this.qrGenerationPaused = true;
      this.currentQrCode = null;
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
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        fs.mkdirSync(sessionPath, { recursive: true });
        logger.info('Session folder cleared');
      } catch (error) {
        logger.error('Failed to clear session folder, removing individual files', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Fallback: try to remove individual files instead of the directory
        try {
          const files = fs.readdirSync(sessionPath);
          for (const file of files) {
            try {
              fs.unlinkSync(`${sessionPath}/${file}`);
            } catch {
              // Skip files we can't delete
            }
          }
          logger.info('Session files cleared (individual removal)');
        } catch {
          logger.error('Failed to clear session files entirely');
        }
      }
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
