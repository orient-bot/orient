/**
 * WhatsApp Integration for Dashboard
 *
 * Initializes and manages WhatsApp connection when running in unified server mode.
 * This allows the dashboard to handle WhatsApp pairing and messaging.
 */

import { Router } from 'express';
import {
  WhatsAppConnection,
  createWhatsAppRouter,
  TranscriptionService,
} from '@orient/bot-whatsapp';
import type { WhatsAppBotConfig, ParsedMessage } from '@orient/bot-whatsapp';
import { createServiceLogger, loadConfig, getConfig, startConfigPoller } from '@orient/core';
import { MessageDatabase, createChatPermissionService } from '@orient/database-services';
import { createOpenCodeClient } from '@orient/agents';
import { downloadMediaMessage } from 'baileys';

const logger = createServiceLogger('whatsapp-integration');

// --- Inline Progressive Responder ---
const PROGRESS_CONFIG = {
  initialDelayMs: 2500,
  midProgressDelayMs: 12000,
  reactionEmoji: '🐕',
  reactionEnabled: true,
};

const INITIAL_MESSAGES = [
  'Got it! Looking into that...',
  'On it! Give me a sec...',
  'Let me check that for you...',
  'Working on it...',
  'Looking into that now...',
];

interface ProgressCallbacks {
  onReact?: (emoji: string) => Promise<void>;
  onSendMessage: (text: string) => Promise<void>;
}

async function processWithProgress<T>(
  processor: () => Promise<T>,
  callbacks: ProgressCallbacks
): Promise<{ result: T; reactionSent: boolean; progressMessagesSent: number }> {
  let reactionSent = false;
  let initialSent = false;
  let midProgressSent = false;
  let completed = false;
  const startTime = Date.now();

  if (PROGRESS_CONFIG.reactionEnabled && callbacks.onReact) {
    try {
      await callbacks.onReact(PROGRESS_CONFIG.reactionEmoji);
      reactionSent = true;
    } catch (error) {
      logger.error('Failed to send reaction', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const timers: NodeJS.Timeout[] = [];

  const initialTimer = setTimeout(async () => {
    if (completed) return;
    try {
      const message = INITIAL_MESSAGES[Math.floor(Math.random() * INITIAL_MESSAGES.length)];
      await callbacks.onSendMessage(message);
      initialSent = true;
    } catch (error) {
      logger.error('Failed to send initial progress message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, PROGRESS_CONFIG.initialDelayMs);
  timers.push(initialTimer);

  const midTimer = setTimeout(async () => {
    if (completed) return;
    try {
      const message = 'Still working on this - almost there...';
      await callbacks.onSendMessage(message);
      midProgressSent = true;
    } catch (error) {
      logger.error('Failed to send mid-progress message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, PROGRESS_CONFIG.midProgressDelayMs);
  timers.push(midTimer);

  try {
    const result = await processor();
    completed = true;
    timers.forEach((timer) => clearTimeout(timer));
    const progressMessagesSent = (initialSent ? 1 : 0) + (midProgressSent ? 1 : 0);
    return { result, reactionSent, progressMessagesSent };
  } catch (error) {
    completed = true;
    timers.forEach((timer) => clearTimeout(timer));
    throw error;
  }
}

export interface WhatsAppIntegrationResult {
  connection: WhatsAppConnection;
  router: Router;
  shutdown: () => Promise<void>;
}

/**
 * Initialize WhatsApp integration for the dashboard
 * @returns WhatsApp connection, router, and shutdown function
 */
export async function initializeWhatsAppIntegration(): Promise<WhatsAppIntegrationResult | null> {
  // Check if WhatsApp should be enabled
  const whatsappEnabled = process.env.WHATSAPP_ENABLED !== 'false';
  if (!whatsappEnabled) {
    logger.info('WhatsApp integration disabled (WHATSAPP_ENABLED=false)');
    return null;
  }

  logger.info('Initializing WhatsApp integration...');

  // Start config poller if configured
  const pollUrl = process.env.ORIENT_CONFIG_POLL_URL;
  if (pollUrl) {
    startConfigPoller({
      url: pollUrl,
      intervalMs: parseInt(process.env.ORIENT_CONFIG_POLL_INTERVAL_MS || '30000', 10),
    });
  }

  // Load configuration
  try {
    await loadConfig();
  } catch (error) {
    logger.warn('Config load failed, using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const config = getConfig();

  // Build WhatsApp bot config
  const whatsappConfig = config.integrations?.whatsapp;
  const personalConfig = whatsappConfig?.personal;

  const botConfig: WhatsAppBotConfig = {
    sessionPath: process.env.SESSION_PATH || personalConfig?.sessionPath || './data/whatsapp-auth',
    autoReconnect: personalConfig?.autoReconnect ?? true,
    maxReconnectAttempts: 10,
    reconnectDelay: 5000,
  };

  logger.info('WhatsApp configuration loaded', { sessionPath: botConfig.sessionPath });

  // Initialize connection
  const connection = new WhatsAppConnection(botConfig);

  // Initialize services for message handling
  const messageDb = new MessageDatabase();

  // Admin phone for permission checks
  const adminPhone = process.env.ADMIN_PHONE || personalConfig?.adminPhone || '';

  // Initialize chat permission service
  const chatPermissionService = createChatPermissionService(messageDb, {
    defaultPermission: 'read_only',
    adminPhone,
  });
  logger.info('Chat permission service initialized', {
    adminPhone: adminPhone ? '(configured)' : '(not set)',
  });

  // Get OpenCode URL for AI processing
  const openCodeUrl =
    process.env.OPENCODE_URL || `http://localhost:${process.env.OPENCODE_PORT || 4099}`;

  // Initialize OpenCode client
  const openCodeClient = createOpenCodeClient(openCodeUrl, 'opencode/grok-code');
  logger.info('OpenCode client initialized', { url: openCodeUrl });

  // Initialize transcription service
  let transcriptionService: TranscriptionService | null = null;
  try {
    transcriptionService = new TranscriptionService({});
    logger.info('Transcription service initialized');
  } catch (error) {
    logger.warn('Transcription service not available', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Create the Express router
  const router = createWhatsAppRouter(connection);

  // Set up event handlers
  connection.on('connected', () => {
    logger.info('WhatsApp connected successfully');
  });

  connection.on('qr', (_qr: string) => {
    logger.info('QR code received - scan with WhatsApp app or use /qr endpoint');
  });

  connection.on('ready', () => {
    logger.info('WhatsApp Bot is ready!');
  });

  connection.on('disconnected', (reason: string) => {
    logger.warn('WhatsApp disconnected', { reason });
  });

  connection.on('error', (error: Error) => {
    logger.error('WhatsApp error', { error: String(error) });
  });

  // Set up message handling
  connection.on('message', async (message: ParsedMessage) => {
    try {
      logger.info('Received message', {
        from: message.chatId,
        senderPhone: message.senderPhone,
        text: message.text?.substring(0, 50),
        isGroup: message.isGroup,
      });

      // Permission check
      let permissionResult;
      try {
        permissionResult = await chatPermissionService.checkPermission(
          message.chatId,
          message.isGroup,
          message.senderPhone
        );
      } catch (permError) {
        logger.error('Permission check failed', {
          error: String(permError),
          chatId: message.chatId,
        });
        return;
      }

      const { shouldRespond, shouldStore, permission, source } = permissionResult;

      logger.info('Permission check result', {
        chatId: message.chatId,
        permission,
        source,
        shouldStore,
        shouldRespond,
      });

      // Store message if allowed
      if (shouldStore) {
        try {
          await messageDb.storeIncomingMessage(
            message.id,
            message.chatId,
            message.senderPhone,
            message.text || '',
            message.timestamp || new Date(),
            message.isGroup,
            message.isGroup ? message.chatId : undefined
          );

          // Fetch group metadata in background
          if (message.isGroup && message.chatId) {
            setImmediate(async () => {
              try {
                const socket = connection.getSocket();
                if (socket && socket.groupMetadata) {
                  const metadata = await socket.groupMetadata(message.chatId);
                  if (metadata?.subject) {
                    const participantCount = Array.isArray(metadata.participants)
                      ? metadata.participants.length
                      : typeof metadata.participants === 'number'
                        ? metadata.participants
                        : 0;
                    await messageDb.upsertGroup(
                      message.chatId,
                      metadata.subject,
                      metadata.subject,
                      participantCount
                    );
                  }
                }
              } catch (error) {
                logger.debug('Failed to fetch group metadata', {
                  groupId: message.chatId,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            });
          }
        } catch (storeError) {
          logger.warn('Failed to store message', { error: String(storeError) });
        }
      }

      // Handle audio messages
      let messageText = message.text;
      let isTranscribedAudio = false;

      if (
        shouldRespond &&
        message.hasMedia &&
        message.mediaType === 'audio' &&
        message.rawMessage
      ) {
        if (transcriptionService) {
          try {
            const audioBuffer = (await downloadMediaMessage(
              message.rawMessage as Parameters<typeof downloadMediaMessage>[0],
              'buffer',
              {}
            )) as Buffer;

            const audioMsg = message.rawMessage.message?.audioMessage;
            const mimeType = audioMsg?.mimetype || 'audio/ogg; codecs=opus';

            const transcription = await transcriptionService.transcribeBuffer(
              audioBuffer,
              mimeType
            );

            messageText = transcription.text;
            isTranscribedAudio = true;
          } catch (error) {
            logger.error('Failed to transcribe audio', {
              error: error instanceof Error ? error.message : String(error),
            });

            const socket = connection.getSocket();
            if (socket) {
              try {
                const errorMsg = await socket.sendMessage(message.chatId, {
                  text: `🎤 I received your voice message but couldn't transcribe it. Please try sending a text message instead.`,
                });
                if (errorMsg?.key?.id) {
                  connection.registerSentMessage(errorMsg.key.id);
                }
              } catch (sendError) {
                logger.error('Failed to send transcription error message', {
                  error: String(sendError),
                });
              }
            }
          }
        } else {
          const socket = connection.getSocket();
          if (socket) {
            try {
              const infoMsg = await socket.sendMessage(message.chatId, {
                text: `🎤 Voice messages are currently not supported. Please send a text message instead.`,
              });
              if (infoMsg?.key?.id) {
                connection.registerSentMessage(infoMsg.key.id);
              }
            } catch (sendError) {
              logger.error('Failed to send audio not supported message', {
                error: String(sendError),
              });
            }
          }
        }
      }

      // Process with AI if should respond
      if (shouldRespond && messageText) {
        try {
          const contextKey = `whatsapp:${message.chatId}`;
          const sessionTitle = message.isGroup
            ? `WhatsApp Group: ${message.chatId}`
            : `WhatsApp DM: ${message.senderPhone}`;

          const progressResult = await processWithProgress(
            async () => {
              const prompt = isTranscribedAudio
                ? `[Voice message transcription]: ${messageText}`
                : messageText!;
              return openCodeClient.chat(contextKey, prompt, {
                sessionTitle,
                agent: 'pm-assistant',
              });
            },
            {
              onReact: async (emoji: string) => {
                const socket = connection.getSocket();
                if (socket) {
                  const rawKey = message.rawMessage?.key;
                  if (!rawKey) return;

                  await socket.sendMessage(message.chatId, {
                    react: { text: emoji, key: rawKey },
                  });
                }
              },
              onSendMessage: async (progressText: string) => {
                const socket = connection.getSocket();
                if (socket) {
                  const progressMsg = await socket.sendMessage(message.chatId, {
                    text: progressText,
                  });
                  if (progressMsg?.key?.id) {
                    connection.registerSentMessage(progressMsg.key.id);
                  }
                }
              },
            }
          );

          const result = progressResult.result;

          // Send response
          const socket = connection.getSocket();
          if (socket && result.response) {
            const audioTag = isTranscribedAudio ? '🎤 ' : '';
            const responseText =
              result.response +
              `\n\n_${audioTag}${result.model} • ${result.toolsUsed.length > 0 ? result.toolsUsed.join(', ') : 'no tools'}_`;

            const sentMsg = await socket.sendMessage(message.chatId, { text: responseText });

            if (sentMsg?.key?.id) {
              connection.registerSentMessage(sentMsg.key.id);
            }

            // Store outgoing message
            try {
              await messageDb.storeOutgoingMessage(
                `out_${Date.now()}`,
                message.chatId,
                'bot',
                responseText,
                message.isGroup,
                message.isGroup ? message.chatId : undefined
              );
            } catch (storeError) {
              logger.warn('Failed to store outgoing message', { error: String(storeError) });
            }
          }
        } catch (error) {
          logger.error('Failed to process with OpenCode', { error: String(error) });

          const socket = connection.getSocket();
          if (socket) {
            try {
              const errorMsg = await socket.sendMessage(message.chatId, {
                text: `❌ Sorry, I encountered an error processing your message. Please try again.`,
              });
              if (errorMsg?.key?.id) {
                connection.registerSentMessage(errorMsg.key.id);
              }
            } catch (sendError) {
              logger.error('Failed to send error message', { error: String(sendError) });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error handling message', { error: String(error) });
    }
  });

  // Connect to WhatsApp
  await connection.connect();

  logger.info('WhatsApp integration initialized successfully');

  // Return connection, router, and shutdown function
  return {
    connection,
    router,
    shutdown: async () => {
      logger.info('Shutting down WhatsApp integration...');
      await connection.disconnect();
      logger.info('WhatsApp integration shutdown complete');
    },
  };
}
