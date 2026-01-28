/**
 * WhatsApp Service - Using Baileys library
 *
 * Handles WhatsApp Web connection, authentication, and message handling.
 * Uses the Linked Devices feature for authentication (QR code scan).
 *
 * Exported via @orient/bot-whatsapp package.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  jidNormalizedUser,
} from 'baileys';
import { decryptPollVote } from 'baileys/lib/Utils/process-message.js';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  WhatsAppConfig,
  WhatsAppMessage,
  WhatsAppMediaType,
  WhatsAppAudioType,
  WhatsAppPoll,
  PollVote,
} from '../types.js';
import { createDedicatedServiceLogger } from '@orient/core';
import pino from 'pino';

// Use dedicated WhatsApp logger - logs go to logs/whatsapp-debug-*.log and logs/whatsapp-error-*.log
const logger = createDedicatedServiceLogger('whatsapp', {
  maxSize: '20m', // 20MB per log file before rotation
  maxDays: '14d', // Keep logs for 14 days
  compress: true, // Compress rotated logs
});

// Create a pino logger for Baileys (required by makeCacheableSignalKeyStore)
const baileysLogger = pino({ level: 'warn' });

export interface HistorySyncData {
  messages: proto.IWebMessageInfo[];
  isLatest: boolean;
}

export interface ChatSyncData {
  id: string;
  name?: string;
  isGroup: boolean;
}

export interface WhatsAppServiceEvents {
  ready: () => void;
  qr: (qr: string) => void;
  message: (message: WhatsAppMessage) => void;
  message_stored: (message: WhatsAppMessage) => void; // For read-only messages (not responded to)
  history_sync: (data: HistorySyncData) => void; // When historical messages are synced
  chats_sync: (chats: ChatSyncData[]) => void; // When chat metadata is synced (includes group names)
  poll_vote: (vote: PollVote, poll: WhatsAppPoll) => void; // When someone votes on a poll
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
}

/**
 * Permission check result from the permission checker callback
 */
export interface PermissionCheckResult {
  permission: 'ignored' | 'read_only' | 'read_write';
  shouldStore: boolean;
  shouldRespond: boolean;
  source: string;
}

/**
 * Permission checker callback type (for incoming messages)
 * Can be sync or async depending on the implementation.
 */
export type PermissionChecker = (
  chatId: string,
  isGroup: boolean,
  senderPhone: string
) => PermissionCheckResult | Promise<PermissionCheckResult>;

/**
 * Write permission check result
 */
export interface WritePermissionCheckResult {
  allowed: boolean;
  permission: 'ignored' | 'read_only' | 'read_write';
  reason?: string;
}

/**
 * Write permission checker callback type (for outgoing messages)
 * Returns whether writing to this JID is allowed.
 * Can be sync or async depending on the implementation.
 */
export type WritePermissionChecker = (
  jid: string
) => WritePermissionCheckResult | Promise<WritePermissionCheckResult>;

/**
 * Error thrown when write permission is denied
 */
export class WritePermissionDeniedError extends Error {
  public readonly jid: string;
  public readonly permission: string;

  constructor(jid: string, permission: string) {
    super(
      `Write permission denied for chat ${jid}: permission is '${permission}', must be 'read_write'`
    );
    this.name = 'WritePermissionDeniedError';
    this.jid = jid;
    this.permission = permission;
  }
}

export class WhatsAppService extends EventEmitter {
  private socket: WASocket | null = null;
  private config: WhatsAppConfig;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10; // Increased from 5
  private messageTimestamps: number[] = [];
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;
  private permissionChecker: PermissionChecker | null = null;
  private writePermissionChecker: WritePermissionChecker | null = null;
  private myLid: string | null = null; // Store our LID for group message matching
  private activePolls: Map<string, WhatsAppPoll> = new Map(); // Track active polls for vote handling
  private pollCleanupInterval: NodeJS.Timeout | null = null;
  private readonly POLL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - polls expire after this
  private currentQrCode: string | null = null; // Store current QR code for web display
  private qrCodeUpdatedAt: Date | null = null; // Track when QR was last updated
  private readonly PAIRING_MODE_MARKER = '.pairing-mode'; // Marker file to indicate pairing mode
  private qrGenerationPaused: boolean = false; // True when max reconnect attempts reached in pairing mode
  private syncState: 'idle' | 'syncing' | 'ready' = 'idle'; // Track initial sync state after connection
  private syncProgress = { chatsReceived: 0, isLatest: false }; // Track sync progress

  constructor(config: WhatsAppConfig) {
    super();
    this.config = config;

    // Ensure session directory exists
    if (!fs.existsSync(config.sessionPath)) {
      fs.mkdirSync(config.sessionPath, { recursive: true });
      logger.info('Created session directory', { path: config.sessionPath });
    }
  }

  /**
   * Set the permission checker callback.
   * This is called for each incoming message to determine if the bot should respond.
   * If not set, falls back to legacy allowedGroupIds behavior.
   */
  setPermissionChecker(checker: PermissionChecker): void {
    this.permissionChecker = checker;
    logger.info('Permission checker set');
  }

  /**
   * Set the write permission checker callback.
   * This is called for EVERY outgoing message to verify the bot has explicit
   * read_write permission for the target chat.
   *
   * CRITICAL: If not set, ALL writes will be BLOCKED for safety.
   * This ensures the bot NEVER writes to unauthorized chats.
   */
  setWritePermissionChecker(checker: WritePermissionChecker): void {
    this.writePermissionChecker = checker;
    logger.info('Write permission checker set - outgoing messages now enforced');
  }

  /**
   * Check if writing to a JID is allowed.
   * Throws WritePermissionDeniedError if not allowed.
   *
   * FAIL CLOSED: If no write permission checker is set, writing is BLOCKED.
   */
  private async checkWritePermission(jid: string): Promise<void> {
    // FAIL CLOSED: If no checker is set, block all writes
    if (!this.writePermissionChecker) {
      logger.error('Write permission BLOCKED - no write permission checker configured', { jid });
      throw new WritePermissionDeniedError(jid, 'UNCONFIGURED');
    }

    const result = await this.writePermissionChecker(jid);

    if (!result.allowed) {
      logger.warn('Write permission DENIED', {
        jid: jid.substring(0, 30) + '...',
        permission: result.permission,
        reason: result.reason,
      });
      throw new WritePermissionDeniedError(jid, result.permission);
    }

    logger.debug('Write permission ALLOWED', {
      jid: jid.substring(0, 30) + '...',
      permission: result.permission,
    });
  }

  /**
   * Initialize and connect to WhatsApp Web
   */
  async connect(): Promise<void> {
    // Note: We do NOT reset isShuttingDown here. It should remain true until
    // connection opens successfully. This prevents unwanted auto-reconnect loops
    // after forceDisconnect() when the connection fails to authenticate.
    // The flag is reset in the 'connection === open' handler.

    const op = logger.startOperation('connect');

    try {
      // Get latest Baileys version info
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info('Using Baileys version', { version, isLatest });

      // Load auth state from file system
      const { state, saveCreds } = await useMultiFileAuthState(this.config.sessionPath);

      // Create the socket
      // Note: Baileys requires a pino-compatible logger for all operations
      // History sync: enabled - we filter messages in our handler
      this.socket = makeWASocket({
        version,
        logger: baileysLogger,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        printQRInTerminal: false, // We'll handle QR ourselves
        generateHighQualityLinkPreview: false,
        syncFullHistory: false, // Only sync recent history
        shouldSyncHistoryMessage: () => {
          // Accept all history sync notifications - we filter in our handler
          return true;
        },
      });

      // Handle connection updates
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          logger.info('QR Code received - scan with WhatsApp');
          qrcode.generate(qr, { small: true });
          // Store the QR code for web display
          this.currentQrCode = qr;
          this.qrCodeUpdatedAt = new Date();
          this.emit('qr', qr);
        }

        if (connection === 'close') {
          const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const isConnectionReplaced = reason === DisconnectReason.connectionReplaced;
          // Allow reconnects if:
          // 1. Not logged out AND not shutting down (normal operation)
          // 2. In pairing mode (factory reset flow - needs to retry to show QR)
          // Connection replaced means another session is active; don't auto-reconnect
          const shouldReconnect =
            (reason !== DisconnectReason.loggedOut &&
              !this.isShuttingDown &&
              !isConnectionReplaced) ||
            this.isInPairingMode();

          logger.warn('Connection closed', {
            reason: DisconnectReason[reason] || reason,
            shouldReconnect,
            isShuttingDown: this.isShuttingDown,
            isInPairingMode: this.isInPairingMode(),
          });

          this.isConnected = false;
          this.syncState = 'idle';
          this.syncProgress = { chatsReceived: 0, isLatest: false };
          this.stopKeepAlive();
          this.emit('disconnected', DisconnectReason[reason] || String(reason));

          if (isConnectionReplaced) {
            logger.error(
              'WhatsApp session replaced by another device or process. Stop other instances or clear the session before reconnecting.'
            );
            this.emit('error', new Error('WhatsApp connection replaced by another session.'));
          }

          if (shouldReconnect && this.config.autoReconnect) {
            this.scheduleReconnect();
          } else if (reason === DisconnectReason.loggedOut) {
            logger.warn('Logged out - session cleared. Reconnecting for fresh pairing...');
            // Clear the session folder
            if (fs.existsSync(this.config.sessionPath)) {
              fs.rmSync(this.config.sessionPath, { recursive: true });
              logger.info('Session folder cleared');
            }
            // Recreate session directory for fresh start
            fs.mkdirSync(this.config.sessionPath, { recursive: true });
            // Enter pairing mode - prevents S3 from restoring stale session
            this.enterPairingMode();
            // Reconnect to allow pairing code or QR scan
            if (this.config.autoReconnect && !this.isShuttingDown) {
              this.scheduleReconnect();
            }
          }
        }

        if (connection === 'open') {
          this.isConnected = true;
          this.isShuttingDown = false; // Reset shutdown flag now that we're connected
          this.reconnectAttempts = 0;
          this.startKeepAlive();
          // Clear QR code once connected
          this.currentQrCode = null;
          this.qrCodeUpdatedAt = null;
          // Exit pairing mode - now allow normal S3 session sync
          this.exitPairingMode();
          // Start syncing state - will transition to 'ready' when history sync completes
          this.syncState = 'syncing';
          this.syncProgress = { chatsReceived: 0, isLatest: false };

          // Capture our LID for group message matching
          // The LID format is like "164677636071544:73@lid" - we need just the number before ":"
          if (this.socket?.user?.lid) {
            const lidFull = this.socket.user.lid;
            // Extract just the LID number (before the colon)
            const lidMatch = lidFull.match(/^(\d+)/);
            this.myLid = lidMatch ? lidMatch[1] : null;
            logger.info('Captured LID for group matching', {
              lidFull,
              lidExtracted: this.myLid,
            });
          }

          logger.info('Connected to WhatsApp');
          op.success('Connected successfully');
          this.emit('ready');
        }
      });

      // Save credentials when updated
      this.socket.ev.on('creds.update', saveCreds);

      // Handle incoming messages
      this.socket.ev.on('messages.upsert', async (m) => {
        // Log all upsert events for debugging
        logger.debug('messages.upsert event', {
          type: m.type,
          messageCount: m.messages.length,
        });

        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          // Check if this is a poll vote update message
          const pollUpdateMsg = msg.message?.pollUpdateMessage;
          if (pollUpdateMsg) {
            await this.handlePollUpdateMessage(msg);
            continue;
          }

          await this.handleIncomingMessage(msg);
        }
      });

      // Handle poll vote updates
      this.socket.ev.on('messages.update', async (updates) => {
        logger.debug('Received messages.update event', {
          updateCount: updates.length,
          activePolls: this.activePolls.size,
        });
        for (const update of updates) {
          await this.handleMessageUpdate(update);
        }
      });

      // Handle history sync (when linking a new device)
      this.socket.ev.on('messaging-history.set', ({ messages, isLatest }) => {
        // Track sync progress - isLatest can be undefined, default to false
        const isLatestSync = isLatest ?? false;
        this.syncProgress.isLatest = isLatestSync;
        if (isLatestSync && this.syncState === 'syncing') {
          this.syncState = 'ready';
          logger.info('Initial sync completed', {
            totalChatsReceived: this.syncProgress.chatsReceived,
          });
        }

        if (messages.length > 0) {
          logger.info('Received history sync', {
            messageCount: messages.length,
            isLatest: isLatestSync,
          });
          this.emit('history_sync', { messages, isLatest: isLatestSync });
        }
      });

      // Handle chat metadata sync (includes group names)
      // Listen for chat metadata updates (type assertion needed for Baileys compatibility)
      const ev = this.socket.ev as any;

      ev.on('chats.set', ({ chats }: any) => {
        if (chats && chats.length > 0) {
          // Track sync progress
          this.syncProgress.chatsReceived += chats.length;

          const chatData = chats.map((chat: any) => ({
            id: chat.id,
            name: chat.name,
            isGroup: chat.id?.endsWith('@g.us'),
          }));
          const groups = chatData.filter((c: any) => c.isGroup);
          logger.info('Received chat metadata sync', {
            totalChats: chats.length,
            groups: groups.length,
            groupsWithNames: groups.filter((c: any) => c.name).length,
          });
          // Always emit to ensure groups are tracked even without names
          if (groups.length > 0) {
            this.emit('chats_sync', chatData);
          }
        }
      });

      // Handle chat updates (when group names change)
      ev.on('chats.upsert', (chats: any) => {
        if (chats && chats.length > 0) {
          const chatData = chats.map((chat: any) => ({
            id: chat.id,
            name: chat.name,
            isGroup: chat.id?.endsWith('@g.us'),
          }));
          const groups = chatData.filter((c: any) => c.isGroup);
          if (groups.length > 0) {
            logger.info('Received chat upsert', {
              groups: groups.length,
              groupsWithNames: groups.filter((c: any) => c.name).length,
            });
            // Always emit to track group updates
            this.emit('chats_sync', chatData);
          }
        }
      });

      // Start poll cleanup interval
      this.startPollCleanup();
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Handle an incoming WhatsApp message
   */
  private async handleIncomingMessage(msg: proto.IWebMessageInfo): Promise<void> {
    // Skip if no message content or key
    if (!msg.message || !msg.key) return;

    // Skip status broadcasts
    if (msg.key.remoteJid === 'status@broadcast') return;

    const jid = msg.key.remoteJid;
    if (!jid) return;

    const isGroup = jid.endsWith('@g.us');

    // For groups, the sender is in msg.key.participant
    // For direct messages, the sender is the remoteJid
    let senderPhone: string;

    if (isGroup) {
      // In groups, participant contains the sender's JID
      const participantJid = msg.key.participant;
      if (!participantJid) {
        // If fromMe is true, the sender is the admin (ourselves)
        if (msg.key.fromMe) {
          senderPhone = this.config.adminPhone.replace(/\D/g, '');
        } else {
          return; // Can't determine sender
        }
      } else {
        senderPhone = this.extractPhoneNumber(participantJid);
      }
    } else {
      // For DMs from self (admin messaging the bot), process them
      if (msg.key.fromMe) {
        // This is the admin sending a message - use admin phone
        senderPhone = this.config.adminPhone.replace(/\D/g, '');
      } else {
        senderPhone = this.extractPhoneNumber(jid);
      }
    }

    // Extract message text and check for image/audio
    const text = this.extractMessageText(msg.message);
    const imageInfo = this.extractImageInfo(msg.message);
    const audioInfo = this.extractAudioInfo(msg.message);

    // Skip if no text AND no image AND no audio
    if (!text && !imageInfo && !audioInfo) return;

    // Determine if this message should trigger a response
    let shouldStore = true; // Default: store all messages (read access)
    let shouldRespond = false; // Default: don't respond
    let permissionSource = 'legacy';

    if (this.permissionChecker) {
      // Use the permission checker callback (smart defaults)
      const permResult = await this.permissionChecker(jid, isGroup, senderPhone);
      shouldStore = permResult.shouldStore;
      shouldRespond = permResult.shouldRespond;
      permissionSource = permResult.source;

      logger.debug('Permission check result', {
        chatId: jid.substring(0, 20) + '...',
        permission: permResult.permission,
        source: permResult.source,
        shouldStore,
        shouldRespond,
      });
    } else {
      // Fallback to legacy allowedGroupIds behavior
      const isFromAdmin = this.isAdminPhone(senderPhone);
      const allowedGroups = this.config.allowedGroupIds || [];
      const isAllowedGroup = isGroup && allowedGroups.includes(jid);
      shouldRespond = isFromAdmin && (!isGroup || isAllowedGroup);
    }

    const messageId = msg.key.id || `msg_${Date.now()}`;
    const whatsappMessage: WhatsAppMessage = {
      id: messageId,
      from: jid,
      fromPhone: senderPhone,
      text: text || imageInfo?.caption || '',
      timestamp: new Date((msg.messageTimestamp as number) * 1000),
      isGroup,
      groupId: isGroup ? jid : undefined,
    };

    // Emit message_stored for database storage if shouldStore is true
    if (shouldStore) {
      logger.debug('Storing message', {
        from: senderPhone,
        isGroup,
        groupJid: isGroup ? jid : undefined,
        textPreview: whatsappMessage.text.substring(0, 30) || '[Media]',
        willRespond: shouldRespond,
        permissionSource,
      });
      this.emit('message_stored', whatsappMessage);
    } else {
      logger.debug('Message ignored (permission: ignored)', {
        from: senderPhone,
        isGroup,
        permissionSource,
      });
      return;
    }

    // Only proceed with response handling if permission allows
    if (!shouldRespond) {
      logger.info('Message stored but NOT responding (permission check)', {
        phone: senderPhone,
        isGroup,
        chatId: jid.substring(0, 30) + '...',
        permissionSource,
        reason: 'Permission does not allow bot response in this chat',
      });
      return;
    }

    // Extra safety log: we ARE going to respond
    logger.info('Permission check PASSED - will respond', {
      phone: senderPhone,
      isGroup,
      chatId: jid.substring(0, 30) + '...',
      permissionSource,
    });

    // Rate limiting (only for messages we respond to)
    if (!this.checkRateLimit()) {
      logger.warn('Rate limit exceeded', { phone: senderPhone });
      await this.sendMessage(
        jid,
        '⚠️ Rate limit exceeded. Please wait a moment before sending more messages.'
      );
      return;
    }

    // Download image if present (only for messages we'll respond to)
    if (imageInfo && this.socket) {
      try {
        logger.info('Downloading image from message', {
          from: senderPhone,
          mimetype: imageInfo.mimetype,
        });

        const buffer = await downloadMediaMessage(
          msg as any, // Type assertion needed for Baileys compatibility
          'buffer',
          {},
          {
            logger: undefined as any,
            reuploadRequest: this.socket.updateMediaMessage,
          }
        );

        whatsappMessage.mediaType = 'image';
        whatsappMessage.mediaBuffer = buffer as Buffer;
        whatsappMessage.mediaCaption = imageInfo.caption;

        logger.info('Image downloaded successfully', {
          from: senderPhone,
          size: (buffer as Buffer).length,
        });
      } catch (error) {
        logger.error('Failed to download image', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without the image - the text/caption will still be processed
      }
    }

    // Download audio/voice message if present (only for messages we'll respond to)
    if (audioInfo && this.socket) {
      try {
        logger.info('Downloading voice message', {
          from: senderPhone,
          mimetype: audioInfo.mimetype,
          duration: audioInfo.duration,
        });

        const buffer = await downloadMediaMessage(
          msg as any, // Type assertion needed for Baileys compatibility
          'buffer',
          {},
          {
            logger: undefined as any,
            reuploadRequest: this.socket.updateMediaMessage,
          }
        );

        whatsappMessage.isAudio = true;
        whatsappMessage.audioType = 'audio';
        whatsappMessage.audioBuffer = buffer as Buffer;
        whatsappMessage.audioDuration = audioInfo.duration;

        logger.info('Voice message downloaded successfully', {
          from: senderPhone,
          size: (buffer as Buffer).length,
          duration: audioInfo.duration,
        });
      } catch (error) {
        logger.error('Failed to download voice message', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Mark as audio but without buffer - let handler know transcription failed
        whatsappMessage.isAudio = true;
        whatsappMessage.text = '[Voice message - download failed]';
      }
    }

    logger.info('Received message (responding)', {
      from: senderPhone,
      isGroup,
      groupJid: isGroup ? jid : undefined,
      textPreview: whatsappMessage.text.substring(0, 50) || '[Voice/Media message]',
      hasImage: !!whatsappMessage.mediaBuffer,
      hasAudio: !!whatsappMessage.audioBuffer,
    });

    this.emit('message', whatsappMessage);
  }

  /**
   * Handle a poll update message (when someone votes on a poll)
   *
   * Poll votes come as pollUpdateMessage, not as part of messages.update.
   * We need to manually decrypt the vote using the stored messageSecret.
   */
  private async handlePollUpdateMessage(msg: proto.IWebMessageInfo): Promise<void> {
    const pollUpdateMsg = msg.message?.pollUpdateMessage;
    if (!pollUpdateMsg) return;

    // Get the poll creation message key (which poll this vote is for)
    const creationMsgKey = pollUpdateMsg.pollCreationMessageKey;
    if (!creationMsgKey?.id) {
      logger.debug('Poll update has no creation message key');
      return;
    }

    const pollId = creationMsgKey.id;

    logger.debug('Processing poll update message', {
      pollId,
      voterKey: msg.key,
      hasEncPayload: !!pollUpdateMsg.vote?.encPayload,
    });

    // Check if we're tracking this poll
    const poll = this.activePolls.get(pollId);
    if (!poll) {
      logger.debug('Poll vote received for untracked poll', { pollId });
      return;
    }

    // We need the message secret to decrypt the vote
    if (!poll.messageSecret) {
      logger.error('Poll has no messageSecret, cannot decrypt vote', { pollId });
      return;
    }

    try {
      const myId = this.socket?.user?.id;
      const meIdNormalised = myId ? jidNormalizedUser(myId) : '';

      // Get the voter's JID
      const voterJid = msg.key?.participant || msg.key?.remoteJid || '';

      if (!voterJid) {
        logger.warn('Poll update has no voter JID', { pollId });
        return;
      }

      // Get the encrypted vote payload
      const encPayload = pollUpdateMsg.vote?.encPayload;
      const encIv = pollUpdateMsg.vote?.encIv;

      if (!encPayload || !encIv) {
        logger.debug('Poll update has no encrypted payload', { pollId });
        return;
      }

      // Get the poll creator JID - this should be OUR JID (the bot), not the group
      // In groups, creationMsgKey.remoteJid is the group, not the creator
      // The poll creator is always us (the bot) since we sent the poll
      //
      // IMPORTANT: When voters use LID format (@lid), we might need to try
      // different JID formats for decryption to work
      const isVoterLid = voterJid.endsWith('@lid');

      // Try with our LID if voter is LID, otherwise use phone JID
      let pollCreatorJid: string;
      if (isVoterLid && this.myLid) {
        // Use our LID format to match the voter's format
        pollCreatorJid = `${this.myLid}@lid`;
      } else {
        pollCreatorJid = meIdNormalised;
      }

      logger.debug('Decrypting poll vote', {
        pollId,
        voterJid,
        pollCreatorJid,
        isVoterLid,
        myLid: this.myLid,
        creationMsgKeyParticipant: creationMsgKey.participant,
        creationMsgKeyRemoteJid: creationMsgKey.remoteJid,
        hasMessageSecret: !!poll.messageSecret,
      });

      // Try to decrypt the vote - may need to try multiple JID formats
      let decryptedVote;
      try {
        decryptedVote = decryptPollVote(
          {
            encPayload: encPayload as Uint8Array,
            encIv: encIv as Uint8Array,
          },
          {
            pollCreatorJid,
            pollMsgId: pollId,
            pollEncKey: poll.messageSecret,
            voterJid: jidNormalizedUser(voterJid),
          }
        );
      } catch (firstError) {
        // If first attempt failed and we used LID, try with phone JID
        if (isVoterLid) {
          logger.debug('First decryption attempt failed, trying alternate JID format', {
            pollId,
            firstCreatorJid: pollCreatorJid,
            alternateCreatorJid: meIdNormalised,
          });

          decryptedVote = decryptPollVote(
            {
              encPayload: encPayload as Uint8Array,
              encIv: encIv as Uint8Array,
            },
            {
              pollCreatorJid: meIdNormalised,
              pollMsgId: pollId,
              pollEncKey: poll.messageSecret,
              voterJid: jidNormalizedUser(voterJid),
            }
          );
        } else {
          throw firstError;
        }
      }

      // Map the selected option hashes back to option names
      const selectedOptions: string[] = [];
      for (const optionHash of decryptedVote.selectedOptions || []) {
        // The hash is SHA256 of the option name
        for (const option of poll.options) {
          const hash = crypto.createHash('sha256').update(option).digest();
          if (Buffer.from(optionHash).equals(hash)) {
            selectedOptions.push(option);
            break;
          }
        }
      }

      if (selectedOptions.length > 0) {
        const pollVote: PollVote = {
          pollId,
          voterJid,
          voterPhone: this.extractPhoneNumber(voterJid),
          selectedOptions,
          timestamp: new Date(),
        };

        logger.info('Poll vote received and decrypted', {
          pollId,
          question: poll.question,
          selectedOptions,
          voterPhone: pollVote.voterPhone,
        });

        this.emit('poll_vote', pollVote, poll);
      } else {
        logger.warn('Could not map any selected options from poll vote', {
          pollId,
          optionHashCount: decryptedVote.selectedOptions?.length || 0,
          availableOptions: poll.options,
        });
      }
    } catch (error) {
      logger.error('Failed to process poll vote', {
        error: error instanceof Error ? error.message : String(error),
        pollId,
      });
    }
  }

  /**
   * Handle message updates (poll votes, reactions, etc.)
   */
  private async handleMessageUpdate(update: {
    key: proto.IMessageKey;
    update: Partial<proto.IWebMessageInfo>;
  }): Promise<void> {
    const { key, update: msgUpdate } = update;

    // Log what fields are present in the update
    logger.debug('Processing message update', {
      keyId: key.id,
      keyRemoteJid: key.remoteJid,
      hasPollUpdates: !!msgUpdate.pollUpdates,
      pollUpdatesLength: msgUpdate.pollUpdates?.length,
      updateKeys: Object.keys(msgUpdate),
    });

    // Check if this is a poll update
    if (msgUpdate.pollUpdates && msgUpdate.pollUpdates.length > 0) {
      const pollId = key.id;
      if (!pollId) return;

      // Check if we're tracking this poll
      const poll = this.activePolls.get(pollId);
      if (!poll) {
        logger.debug('Poll vote received for untracked poll', { pollId });
        return;
      }

      // We need to decrypt the poll votes using the stored messageSecret
      if (!poll.messageSecret) {
        logger.error('Poll has no messageSecret, cannot decrypt votes', { pollId });
        return;
      }

      try {
        const myId = this.socket?.user?.id;
        const meIdNormalised = myId ? jidNormalizedUser(myId) : '';

        // Process the latest poll update
        const latestUpdate = msgUpdate.pollUpdates[msgUpdate.pollUpdates.length - 1];

        // Get the voter's JID from the update
        const voterJid =
          latestUpdate.pollUpdateMessageKey?.participant ||
          latestUpdate.pollUpdateMessageKey?.remoteJid ||
          '';

        if (!voterJid) {
          logger.warn('Poll update has no voter JID', { pollId });
          return;
        }

        // The poll vote is encrypted - we need to decrypt it
        const pollUpdateMsg = latestUpdate.vote;

        if (!pollUpdateMsg) {
          logger.debug('Poll update has no vote data, checking for encrypted payload', { pollId });

          // Try to get the encrypted payload from pollCreationMessageKey
          const encPayload = (latestUpdate as unknown as { encPayload?: Buffer }).encPayload;
          const encIv = (latestUpdate as unknown as { encIv?: Buffer }).encIv;

          if (encPayload && encIv) {
            // Decrypt the vote using Baileys' decryptPollVote helper
            const pollCreatorJid = key.participant || meIdNormalised;

            try {
              const decryptedVote = decryptPollVote(
                { encPayload, encIv },
                {
                  pollCreatorJid,
                  pollMsgId: pollId,
                  pollEncKey: poll.messageSecret,
                  voterJid: jidNormalizedUser(voterJid),
                }
              );

              // Map the selected option hashes back to option names
              const selectedOptions: string[] = [];
              for (const optionHash of decryptedVote.selectedOptions || []) {
                // The hash is SHA256 of the option name
                for (const option of poll.options) {
                  const hash = crypto.createHash('sha256').update(option).digest();
                  if (hash.equals(optionHash)) {
                    selectedOptions.push(option);
                    break;
                  }
                }
              }

              if (selectedOptions.length > 0) {
                const pollVote: PollVote = {
                  pollId,
                  voterJid,
                  voterPhone: this.extractPhoneNumber(voterJid),
                  selectedOptions,
                  timestamp: new Date(),
                };

                logger.info('Poll vote received (decrypted)', {
                  pollId,
                  question: poll.question,
                  selectedOptions,
                  voterPhone: pollVote.voterPhone,
                });

                this.emit('poll_vote', pollVote, poll);
              }
            } catch (decryptError) {
              logger.error('Failed to decrypt poll vote', {
                error: decryptError instanceof Error ? decryptError.message : String(decryptError),
                pollId,
              });
            }
          } else {
            logger.debug('No encrypted payload found in poll update', {
              pollId,
              updateKeys: Object.keys(latestUpdate),
            });
          }
          return;
        }

        // If we have pre-decrypted vote data (selectedOptions as hashes)
        const selectedOptions: string[] = [];
        for (const optionHash of pollUpdateMsg.selectedOptions || []) {
          // The hash is SHA256 of the option name
          for (const option of poll.options) {
            const hash = crypto.createHash('sha256').update(option).digest();
            if (hash.equals(optionHash)) {
              selectedOptions.push(option);
              break;
            }
          }
        }

        if (selectedOptions.length > 0) {
          const pollVote: PollVote = {
            pollId,
            voterJid,
            voterPhone: this.extractPhoneNumber(voterJid),
            selectedOptions,
            timestamp: new Date(),
          };

          logger.info('Poll vote received', {
            pollId,
            question: poll.question,
            selectedOptions,
            voterPhone: pollVote.voterPhone,
          });

          // Emit the vote event
          this.emit('poll_vote', pollVote, poll);
        } else {
          logger.debug('Could not map any selected options', {
            pollId,
            optionHashCount: pollUpdateMsg.selectedOptions?.length || 0,
          });
        }
      } catch (error) {
        logger.error('Error processing poll vote', {
          error: error instanceof Error ? error.message : String(error),
          pollId,
        });
      }
    }
  }

  /**
   * Extract text content from a WhatsApp message
   */
  private extractMessageText(message: proto.IMessage): string | null {
    return (
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      message.videoMessage?.caption ||
      null
    );
  }

  /**
   * Extract image info from a WhatsApp message if present
   */
  private extractImageInfo(message: proto.IMessage): { mimetype: string; caption?: string } | null {
    const imageMessage = message.imageMessage;
    if (!imageMessage) return null;

    // Supported image types for Claude vision
    const supportedMimetypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mimetype = imageMessage.mimetype || 'image/jpeg';

    if (!supportedMimetypes.includes(mimetype)) {
      logger.debug('Unsupported image mimetype', { mimetype });
      return null;
    }

    return {
      mimetype,
      caption: imageMessage.caption || undefined,
    };
  }

  /**
   * Extract audio info from a WhatsApp message if present
   * Handles both regular audio messages and voice notes (PTT)
   */
  private extractAudioInfo(message: proto.IMessage): { mimetype: string; duration: number } | null {
    // Check for regular audio message or voice note (PTT - Push To Talk)
    const audioMessage = message.audioMessage;
    if (!audioMessage) return null;

    // WhatsApp voice messages are typically ogg/opus
    // Supported audio types for OpenAI Whisper
    const supportedMimetypes = [
      'audio/ogg',
      'audio/ogg; codecs=opus',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/wav',
      'audio/webm',
    ];

    const mimetype = audioMessage.mimetype || 'audio/ogg; codecs=opus';

    // Be lenient with audio types - Whisper can handle most formats
    const isSupported = supportedMimetypes.some((type) =>
      mimetype.toLowerCase().includes(type.split(';')[0])
    );

    if (!isSupported) {
      logger.debug('Potentially unsupported audio mimetype, will try anyway', { mimetype });
    }

    return {
      mimetype,
      duration: audioMessage.seconds || 0,
    };
  }

  /**
   * Extract clean phone number from JID
   */
  private extractPhoneNumber(jid: string): string {
    // JID format: [phone]@s.whatsapp.net or [phone]@g.us
    return jid.split('@')[0].replace(/\D/g, '');
  }

  /**
   * Check if a phone number or LID is the admin
   */
  private isAdminPhone(phoneOrLid: string): boolean {
    const adminPhone = this.config.adminPhone.replace(/\D/g, '');

    // Match by phone number
    if (phoneOrLid === adminPhone) {
      return true;
    }

    // Match by LID (for group messages)
    if (this.myLid && phoneOrLid === this.myLid) {
      return true;
    }

    return false;
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxMessages = this.config.messageRateLimit || 10;

    // Remove timestamps outside the window
    this.messageTimestamps = this.messageTimestamps.filter((t) => now - t < windowMs);

    if (this.messageTimestamps.length >= maxMessages) {
      return false;
    }

    this.messageTimestamps.push(now);
    return true;
  }

  /**
   * Send a text message
   *
   * PERMISSION ENFORCED: Will throw WritePermissionDeniedError if the chat
   * does not have explicit 'read_write' permission.
   */
  async sendMessage(jid: string, text: string): Promise<void> {
    // CRITICAL: Check write permission BEFORE doing anything else
    await this.checkWritePermission(jid);

    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const op = logger.startOperation('sendMessage');

    try {
      await this.socket.sendMessage(jid, { text });
      op.success('Message sent', { to: this.extractPhoneNumber(jid) });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Send a message and return detailed result including message key
   * Used for E2E testing to verify message delivery
   */
  async sendMessageWithResult(
    jid: string,
    text: string
  ): Promise<{
    key: { remoteJid: string; id: string; fromMe: boolean };
    status?: number;
    messageTimestamp?: number;
  } | null> {
    await this.checkWritePermission(jid);

    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const op = logger.startOperation('sendMessageWithResult');

    try {
      const result = await this.socket.sendMessage(jid, { text });
      op.success('Message sent with result', {
        to: this.extractPhoneNumber(jid),
        messageId: result?.key?.id,
        status: result?.status,
      });
      return result
        ? {
            key: {
              remoteJid: result.key.remoteJid || jid,
              id: result.key.id || '',
              fromMe: result.key.fromMe || false,
            },
            status: result.status ?? undefined,
            messageTimestamp:
              typeof result.messageTimestamp === 'number'
                ? result.messageTimestamp
                : Number(result.messageTimestamp),
          }
        : null;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Wait for message acknowledgment (delivery status update)
   */
  async waitForMessageAck(messageId: string, timeoutMs: number = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.socket?.ev.off('messages.update', handler);
        resolve(false);
      }, timeoutMs);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (updates: any[]) => {
        for (const update of updates) {
          if (update.key?.id === messageId && update.update?.status) {
            // Status 2 = DELIVERY_ACK, 3 = READ, 4 = PLAYED
            if (update.update.status >= 2) {
              clearTimeout(timeout);
              this.socket?.ev.off('messages.update', handler);
              resolve(true);
              return;
            }
          }
        }
      };

      this.socket?.ev.on('messages.update', handler);
    });
  }

  /**
   * Send a reply to a specific message
   *
   * PERMISSION ENFORCED: Will throw WritePermissionDeniedError if the chat
   * does not have explicit 'read_write' permission.
   */
  async sendReply(jid: string, text: string, quotedMessageId: string): Promise<void> {
    // CRITICAL: Check write permission BEFORE doing anything else
    await this.checkWritePermission(jid);

    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const op = logger.startOperation('sendReply');

    try {
      await this.socket.sendMessage(
        jid,
        {
          text,
        },
        {
          quoted: {
            key: {
              remoteJid: jid,
              id: quotedMessageId,
            },
            message: {},
          } as any,
        }
      );
      op.success('Reply sent', { to: this.extractPhoneNumber(jid) });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Send an image message
   *
   * PERMISSION ENFORCED: Will throw WritePermissionDeniedError if the chat
   * does not have explicit 'read_write' permission.
   */
  async sendImage(
    jid: string,
    image: Buffer | string,
    options?: { caption?: string; mimetype?: string }
  ): Promise<{ key: { id: string } } | null> {
    // CRITICAL: Check write permission BEFORE doing anything else
    await this.checkWritePermission(jid);

    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const op = logger.startOperation('sendImage');

    try {
      const content: any =
        typeof image === 'string'
          ? { image: { url: image }, caption: options?.caption }
          : { image, caption: options?.caption, mimetype: options?.mimetype || 'image/jpeg' };

      const result = await this.socket.sendMessage(jid, content);
      op.success('Image sent', { to: this.extractPhoneNumber(jid) });
      return result
        ? {
            key: {
              id: result.key.id || '',
            },
          }
        : null;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Send a formatted response with bot header
   * Note: Model attribution is added by formatResponseWithMetadata in whatsapp-bot.ts
   */
  async sendBotResponse(jid: string, response: string): Promise<void> {
    const formattedMessage = `*[Orient]*\n━━━━━━━━━━━━━━━\n${response}`;
    await this.sendMessage(jid, formattedMessage);
  }

  /**
   * React to a message with an emoji
   *
   * @param jid - The chat JID where the message is
   * @param messageId - The ID of the message to react to
   * @param emoji - The emoji to react with (e.g., '🐕', '👍')
   *
   * PERMISSION ENFORCED: Will throw WritePermissionDeniedError if the chat
   * does not have explicit 'read_write' permission.
   */
  async reactToMessage(
    jid: string,
    messageId: string,
    emoji: string,
    options?: { isGroup?: boolean; senderJid?: string }
  ): Promise<void> {
    // CRITICAL: Check write permission BEFORE doing anything else
    await this.checkWritePermission(jid);

    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const op = logger.startOperation('reactToMessage');

    try {
      await this.socket.sendMessage(jid, {
        react: {
          text: emoji,
          key: {
            remoteJid: jid,
            id: messageId,
            fromMe: false, // We're reacting to user's message, not our own
            participant: options?.isGroup ? options.senderJid : undefined,
          },
        },
      });
      op.success('Reaction sent', { to: this.extractPhoneNumber(jid), emoji });
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Send a poll to ask a clarifying question
   * @param jid - The chat JID to send to
   * @param question - The poll question
   * @param options - Array of options (max 12)
   * @param selectableCount - How many options can be selected (default: 1)
   * @param context - Optional context about why this poll is being asked
   * @returns The created poll object
   *
   * PERMISSION ENFORCED: Will throw WritePermissionDeniedError if the chat
   * does not have explicit 'read_write' permission.
   */
  async sendPoll(
    jid: string,
    question: string,
    options: string[],
    selectableCount: number = 1,
    context?: { originalQuery?: string; purposeId?: string }
  ): Promise<WhatsAppPoll> {
    // CRITICAL: Check write permission BEFORE doing anything else
    await this.checkWritePermission(jid);

    if (!this.socket || !this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const op = logger.startOperation('sendPoll');

    // WhatsApp polls have a limit of 12 options
    if (options.length > 12) {
      logger.warn('Poll has too many options, truncating to 12', {
        originalCount: options.length,
      });
      options = options.slice(0, 12);
    }

    if (options.length < 2) {
      throw new Error('Poll must have at least 2 options');
    }

    try {
      // Generate a 32-byte secret for poll encryption
      const messageSecret = new Uint8Array(32);
      crypto.getRandomValues(messageSecret);

      const result = await this.socket.sendMessage(jid, {
        poll: {
          name: question,
          values: options,
          selectableCount: Math.min(selectableCount, options.length),
          messageSecret,
        },
      });

      const pollId = result?.key?.id || `poll_${Date.now()}`;

      // Store the poll for tracking votes
      const poll: WhatsAppPoll = {
        id: pollId,
        jid,
        question,
        options,
        selectableCount: Math.min(selectableCount, options.length),
        createdAt: new Date(),
        messageSecret,
        context,
      };

      this.activePolls.set(pollId, poll);

      op.success('Poll sent', {
        to: this.extractPhoneNumber(jid),
        pollId,
        optionCount: options.length,
      });

      return poll;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Send a clarifying text question
   */
  async sendQuestion(jid: string, question: string, context?: string): Promise<void> {
    let message = `❓ *Clarification Needed*\n\n${question}`;
    if (context) {
      message += `\n\n_${context}_`;
    }
    await this.sendBotResponse(jid, message);
  }

  /**
   * Get an active poll by ID
   */
  getActivePoll(pollId: string): WhatsAppPoll | undefined {
    return this.activePolls.get(pollId);
  }

  /**
   * Get all active polls for a JID
   */
  getActivePollsForJid(jid: string): WhatsAppPoll[] {
    return Array.from(this.activePolls.values()).filter((p) => p.jid === jid);
  }

  /**
   * Clear an active poll (after it's been answered)
   */
  clearPoll(pollId: string): void {
    this.activePolls.delete(pollId);
  }

  /**
   * Get the admin's JID for sending messages
   */
  getAdminJid(): string {
    const phone = this.config.adminPhone.replace(/\D/g, '');
    return `${phone}@s.whatsapp.net`;
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Get the session path for auth data
   */
  getSessionPath(): string {
    return this.config.sessionPath;
  }

  /**
   * Get the current QR code string (if pending authentication)
   * Returns null if already authenticated or no QR has been generated
   */
  getCurrentQrCode(): string | null {
    return this.currentQrCode;
  }

  /**
   * Get when the QR code was last updated
   */
  getQrCodeUpdatedAt(): Date | null {
    return this.qrCodeUpdatedAt;
  }

  /**
   * Get the current sync state
   */
  getSyncState(): 'idle' | 'syncing' | 'ready' {
    return this.syncState;
  }

  /**
   * Get the current sync progress
   */
  getSyncProgress(): { chatsReceived: number; isLatest: boolean } {
    return this.syncProgress;
  }

  /**
   * Get the connected user's phone number from the socket
   * Format: "972501234567:52@s.whatsapp.net" or "972501234567@s.whatsapp.net"
   * Returns just the phone number digits (e.g., "972501234567")
   */
  getUserPhone(): string | null {
    if (!this.socket?.user?.id) return null;
    const jid = this.socket.user.id;
    const match = jid.match(/^(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Check if QR code scanning is needed
   */
  needsQrScan(): boolean {
    return this.currentQrCode !== null && !this.isConnected;
  }

  /**
   * Check if QR generation is paused (max attempts reached in pairing mode)
   */
  isQrGenerationPaused(): boolean {
    return this.qrGenerationPaused;
  }

  /**
   * Request QR code regeneration after being paused.
   * Resets reconnect attempts and triggers a fresh connection attempt.
   * Call this when the user clicks "Generate New QR Code".
   */
  async requestQrRegeneration(): Promise<void> {
    logger.info('User requested QR regeneration');

    // Reset state
    this.reconnectAttempts = 0;
    this.qrGenerationPaused = false;
    this.currentQrCode = null;
    this.qrCodeUpdatedAt = null;

    // Force disconnect any existing socket
    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch {
        // Ignore errors during disconnect
      }
      this.socket = null;
      this.isConnected = false;
    }

    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Trigger a fresh connection attempt
    await this.connect();
  }

  /**
   * Get the path to the pairing mode marker file
   */
  private getPairingModeMarkerPath(): string {
    return path.join(this.config.sessionPath, this.PAIRING_MODE_MARKER);
  }

  /**
   * Check if the service is in pairing mode.
   * Pairing mode means we're waiting for a fresh pairing and S3 sync should NOT restore old sessions.
   */
  isInPairingMode(): boolean {
    return fs.existsSync(this.getPairingModeMarkerPath());
  }

  /**
   * Enter pairing mode - creates a marker file that tells S3 sync to skip session restore.
   * This prevents stale credentials from being restored during pairing.
   */
  enterPairingMode(): void {
    const markerPath = this.getPairingModeMarkerPath();

    // Ensure session directory exists
    if (!fs.existsSync(this.config.sessionPath)) {
      fs.mkdirSync(this.config.sessionPath, { recursive: true });
    }

    fs.writeFileSync(
      markerPath,
      JSON.stringify({
        enteredAt: new Date().toISOString(),
        reason: 'Waiting for fresh pairing - S3 sync should skip session restore',
      })
    );

    logger.info('Entered pairing mode - S3 session sync disabled', {
      markerPath,
    });
  }

  /**
   * Exit pairing mode - removes the marker file, allowing normal S3 session sync.
   * Called when connection is successfully established.
   */
  exitPairingMode(): void {
    const markerPath = this.getPairingModeMarkerPath();

    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
      logger.info('Exited pairing mode - S3 session sync enabled');
    }
  }

  /**
   * Request a pairing code for phone number authentication.
   * This is an alternative to QR code scanning.
   *
   * @param phoneNumber - Phone number in international format without '+' (e.g., "972501234567")
   * @returns The 8-character pairing code to enter in WhatsApp
   * @throws Error if already connected or socket not initialized
   */
  async requestPairingCode(phoneNumber: string): Promise<string> {
    if (this.isConnected) {
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

    // Ensure session directory exists (it may have been cleared on logout)
    if (!fs.existsSync(this.config.sessionPath)) {
      fs.mkdirSync(this.config.sessionPath, { recursive: true });
      logger.info('Created session directory for pairing', { path: this.config.sessionPath });
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
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        isPairingMode: this.isInPairingMode(),
      });

      // In pairing mode: pause and wait for user action to regenerate QR
      // This prevents infinite QR code loops when user isn't scanning
      if (this.isInPairingMode()) {
        this.qrGenerationPaused = true;
        logger.warn('QR generation paused in pairing mode - waiting for user to request new QR');
        this.emit('error', new Error('QR code expired. Click "Generate New QR" to try again.'));
        return;
      }

      // Connected mode (temporary disconnection): auto-reset after 5 minutes
      setTimeout(
        () => {
          this.reconnectAttempts = 0;
          logger.info('Reconnection attempts reset - ready for new connection attempts');
        },
        5 * 60 * 1000
      ); // 5 minutes
      this.emit('error', new Error('Max reconnection attempts reached. Will retry in 5 minutes.'));
      return;
    }

    this.reconnectAttempts++;

    // Use shorter delay when in pairing mode (user is waiting to pair)
    // Normal mode: Exponential backoff: 2s, 4s, 8s, 16s, 32s, up to 60s max
    // Pairing mode: Fixed 2s delay for quick reconnection
    const isPairingMode = this.isInPairingMode();
    const delay = isPairingMode
      ? 2000 // 2s fixed delay in pairing mode - user is waiting
      : Math.min(2000 * Math.pow(2, this.reconnectAttempts - 1), 60000);

    logger.info('Scheduling reconnection...', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs: delay,
      pairingMode: isPairingMode,
    });

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Will try again via connection.close handler
      }
    }, delay);
  }

  /**
   * Start keepalive ping interval
   */
  private startKeepAlive(): void {
    this.stopKeepAlive(); // Clear any existing interval

    // Ping every 30 seconds to keep connection alive
    this.keepAliveInterval = setInterval(async () => {
      if (this.socket && this.isConnected) {
        try {
          // Simple presence update to keep connection alive
          await this.socket.sendPresenceUpdate('available');
        } catch (error) {
          logger.warn('Keepalive failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }, 30000); // 30 seconds

    logger.debug('KeepAlive started');
  }

  /**
   * Stop keepalive ping interval
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      logger.debug('KeepAlive stopped');
    }
  }

  /**
   * Send typing indicator to a chat
   * Call this before processing to show the user the bot is working
   */
  async sendTypingIndicator(jid: string): Promise<void> {
    if (!this.socket || !this.isConnected) {
      return;
    }

    try {
      await this.socket.sendPresenceUpdate('composing', jid);
      logger.debug('Sent typing indicator', { jid });
    } catch (error) {
      logger.warn('Failed to send typing indicator', {
        jid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear typing indicator (show as available/paused)
   */
  async clearTypingIndicator(jid: string): Promise<void> {
    if (!this.socket || !this.isConnected) {
      return;
    }

    try {
      await this.socket.sendPresenceUpdate('paused', jid);
    } catch (error) {
      // Silently ignore - not critical
    }
  }

  /**
   * Start periodic cleanup of expired polls
   */
  private startPollCleanup(): void {
    this.stopPollCleanup();

    // Clean up every hour
    this.pollCleanupInterval = setInterval(
      () => {
        const now = Date.now();
        let cleaned = 0;

        for (const [pollId, poll] of this.activePolls.entries()) {
          if (now - poll.createdAt.getTime() > this.POLL_TTL_MS) {
            this.activePolls.delete(pollId);
            cleaned++;
          }
        }

        if (cleaned > 0) {
          logger.debug('Cleaned up expired polls', { count: cleaned });
        }
      },
      60 * 60 * 1000
    ); // Every hour

    logger.debug('Poll cleanup started');
  }

  /**
   * Stop poll cleanup interval
   */
  private stopPollCleanup(): void {
    if (this.pollCleanupInterval) {
      clearInterval(this.pollCleanupInterval);
      this.pollCleanupInterval = null;
    }
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.stopKeepAlive();
    this.stopPollCleanup();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
      this.isConnected = false;
      logger.info('Disconnected from WhatsApp');
    }

    // Clear active polls
    this.activePolls.clear();
  }

  /**
   * Force disconnect from WhatsApp - used for factory reset
   * More aggressive than disconnect() - tries logout first, then force closes
   * This ensures cleanup regardless of socket state (connecting, failed, closed, etc.)
   */
  async forceDisconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.stopKeepAlive();
    this.stopPollCleanup();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      try {
        // Try graceful logout first (notifies WhatsApp servers)
        await this.socket.logout();
        logger.info('Logged out from WhatsApp');
      } catch (logoutError) {
        // If logout fails, just log it - we'll force close below anyway
        logger.debug('Logout failed, will force close socket', {
          error: logoutError instanceof Error ? logoutError.message : String(logoutError),
        });
      }

      // Always close the socket, whether logout succeeded or failed
      try {
        this.socket.end(undefined);
      } catch {
        // Ignore errors during force close
      }

      this.socket = null;
      this.isConnected = false;
      logger.info('Force disconnected from WhatsApp');
    }

    // Clear active polls
    this.activePolls.clear();
  }

  /**
   * Get metadata for a group (name, participants, etc.)
   */
  async getGroupMetadata(
    groupJid: string
  ): Promise<{ id: string; subject: string; participants: number } | null> {
    if (!this.socket || !this.isConnected) {
      logger.warn('Cannot get group metadata - not connected');
      return null;
    }

    try {
      const metadata = await this.socket.groupMetadata(groupJid);
      return {
        id: metadata.id,
        subject: metadata.subject, // This is the group name
        participants: metadata.participants.length,
      };
    } catch (error) {
      logger.error('Failed to get group metadata', {
        groupJid,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get metadata for multiple groups
   */
  async getGroupsMetadata(
    groupJids: string[]
  ): Promise<Map<string, { id: string; subject: string; participants: number }>> {
    const results = new Map<string, { id: string; subject: string; participants: number }>();

    for (const jid of groupJids) {
      const metadata = await this.getGroupMetadata(jid);
      if (metadata) {
        results.set(jid, metadata);
      }
    }

    return results;
  }
}

/**
 * Create a WhatsApp service instance
 */
export function createWhatsAppService(config: WhatsAppConfig): WhatsAppService {
  return new WhatsAppService(config);
}
