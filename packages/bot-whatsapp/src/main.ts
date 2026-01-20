#!/usr/bin/env node
/**
 * WhatsApp Bot Container Entry Point
 *
 * This is the main entry point when running as a Docker container.
 * It initializes all services and starts the WhatsApp bot with full message handling.
 */

import { WhatsAppConnection, createWhatsAppApiServer } from './services/index.js';
import {
  createServiceLogger,
  loadConfig,
  getConfig,
  setSecretOverrides,
  startConfigPoller,
} from '@orient/core';
import {
  createSecretsService,
  MessageDatabase,
  createChatPermissionService,
} from '@orient/database-services';
import { createOpenCodeClient } from '@orient/agents';
import { downloadMediaMessage } from 'baileys';
import { TranscriptionService } from './services/index.js';
import type { WhatsAppBotConfig } from './types.js';

const logger = createServiceLogger('whatsapp-bot');
const secretsService = createSecretsService();

// --- Inline Progressive Responder ---
// Configuration for progress updates
const PROGRESS_CONFIG = {
  initialDelayMs: 2500, // 2.5 seconds before first text message
  midProgressDelayMs: 12000, // 12 seconds before mid-progress message
  reactionEmoji: '🐕', // Ori the dog mascot
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

  // Send immediate reaction if enabled
  if (PROGRESS_CONFIG.reactionEnabled && callbacks.onReact) {
    try {
      logger.info('Sending immediate reaction', { emoji: PROGRESS_CONFIG.reactionEmoji });
      await callbacks.onReact(PROGRESS_CONFIG.reactionEmoji);
      reactionSent = true;
      logger.info('Reaction sent successfully');
    } catch (error) {
      logger.error('Failed to send reaction', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Set up timers for progress messages
  const timers: NodeJS.Timeout[] = [];

  // Initial message timer
  const initialTimer = setTimeout(async () => {
    if (completed) return;
    try {
      const message = INITIAL_MESSAGES[Math.floor(Math.random() * INITIAL_MESSAGES.length)];
      logger.info('Sending initial progress message', {
        message,
        elapsedMs: Date.now() - startTime,
      });
      await callbacks.onSendMessage(message);
      initialSent = true;
    } catch (error) {
      logger.error('Failed to send initial progress message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, PROGRESS_CONFIG.initialDelayMs);
  timers.push(initialTimer);

  // Mid-progress timer
  const midTimer = setTimeout(async () => {
    if (completed) return;
    try {
      const message = 'Still working on this - almost there...';
      logger.info('Sending mid-progress message', { message, elapsedMs: Date.now() - startTime });
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
    logger.info('Processing completed', {
      reactionSent,
      progressMessagesSent,
      processingTimeMs: Date.now() - startTime,
    });

    return { result, reactionSent, progressMessagesSent };
  } catch (error) {
    completed = true;
    timers.forEach((timer) => clearTimeout(timer));
    throw error;
  }
}
// --- End Inline Progressive Responder ---

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(connection: WhatsAppConnection): void {
  const shutdown = async (signal: string) => {
    logger.info('Received shutdown signal', { signal });
    try {
      await connection.disconnect();
      logger.info('WhatsApp Bot shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function loadSecretOverrides(): Promise<void> {
  try {
    const secrets = await secretsService.getAllSecrets();
    if (Object.keys(secrets).length > 0) {
      setSecretOverrides(secrets);
      logger.info('Loaded secrets from database', {
        count: Object.keys(secrets).length,
        keys: Object.keys(secrets),
      });
    } else {
      logger.info('No secrets found in database');
    }
  } catch (error) {
    logger.warn('Failed to load secrets from database', { error: String(error) });
  }
}

async function main(): Promise<void> {
  const op = logger.startOperation('startup');

  logger.info('Starting WhatsApp Bot...');

  try {
    await loadSecretOverrides();
    const pollUrl = process.env.ORIENT_CONFIG_POLL_URL;
    if (pollUrl) {
      startConfigPoller({
        url: pollUrl,
        intervalMs: parseInt(process.env.ORIENT_CONFIG_POLL_INTERVAL_MS || '30000', 10),
      });
    }

    // Load configuration
    await loadConfig();
    const config = getConfig();

    // Build WhatsApp bot config from environment or config
    const whatsappConfig = config.integrations.whatsapp;
    const personalConfig = whatsappConfig?.personal;

    const botConfig: WhatsAppBotConfig = {
      sessionPath:
        process.env.SESSION_PATH || personalConfig?.sessionPath || './data/whatsapp-auth',
      autoReconnect: personalConfig?.autoReconnect ?? true,
      maxReconnectAttempts: 10,
      reconnectDelay: 5000,
    };

    logger.info('Configuration loaded', { sessionPath: botConfig.sessionPath });

    // Initialize connection with message handling
    const connection = new WhatsAppConnection(botConfig);

    // Initialize services for message handling
    const messageDb = new MessageDatabase();

    // Admin phone for permission checks
    const adminPhone = process.env.ADMIN_PHONE || personalConfig?.adminPhone || '';

    // Initialize chat permission service for database-based permission checks
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

    // Initialize OpenCode client for AI processing
    const openCodeClient = createOpenCodeClient(openCodeUrl, 'opencode/grok-code');
    logger.info('OpenCode client initialized', { url: openCodeUrl });

    // Initialize transcription service for audio messages
    // Uses OPENAI_API_KEY from secrets database or environment
    let transcriptionService: TranscriptionService | null = null;
    try {
      transcriptionService = new TranscriptionService({});
      logger.info('Transcription service initialized successfully (OPENAI_API_KEY found)');
    } catch (error) {
      logger.warn('Transcription service not available', {
        error: error instanceof Error ? error.message : String(error),
        hint: 'Ensure OPENAI_API_KEY is set in the secrets database or environment',
      });
    }

    // Setup graceful shutdown
    setupGracefulShutdown(connection);

    // Start the API server FIRST (before connection.connect) so health endpoint is available immediately
    // This allows the dev script to detect that the bot process started successfully
    const port = parseInt(process.env.WHATSAPP_PORT || '4097', 10);
    const apiServer = createWhatsAppApiServer(connection, {
      port,
      host: '0.0.0.0',
    });

    await apiServer.start();

    logger.info('WhatsApp API server started', {
      port,
      endpoints: [
        '/',
        '/qr',
        '/qr/status',
        '/qr.png',
        '/pairing-code',
        '/health',
        '/flush-session',
        '/factory-reset',
      ],
    });

    // Listen for events
    connection.on('connected', () => {
      logger.info('WhatsApp connected successfully');
    });

    connection.on('qr', (_qr) => {
      logger.info('QR code received - scan with WhatsApp app or use /qr endpoint');
    });

    connection.on('ready', () => {
      logger.info('WhatsApp Bot is ready!');
    });

    connection.on('disconnected', (reason) => {
      logger.warn('WhatsApp disconnected', { reason });
    });

    connection.on('error', (error) => {
      logger.error('WhatsApp error', { error: String(error) });
    });

    // Set up message handling
    connection.on('message', async (message) => {
      try {
        logger.info('Received message', {
          from: message.chatId,
          senderPhone: message.senderPhone,
          text: message.text?.substring(0, 50),
          isGroup: message.isGroup,
        });

        // PERMISSION CHECK: Check permissions from database
        logger.info('Checking permissions for chat', { chatId: message.chatId });
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

        if (!shouldRespond) {
          logger.info('Message will not get a response (no write permission)', {
            chatId: message.chatId,
            permission,
            source,
          });
        } else {
          logger.info('Message authorized for response', {
            chatId: message.chatId,
            permission,
            source,
          });
        }

        // Store message (if permission allows)
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
          } catch (storeError) {
            logger.warn('Failed to store message', { error: String(storeError) });
          }
        }

        // Handle audio messages - transcribe first
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
              logger.info('Processing audio message', { chatId: message.chatId });

              // Download the audio from WhatsApp
              const audioBuffer = (await downloadMediaMessage(
                message.rawMessage,
                'buffer',
                {}
              )) as Buffer;

              logger.info('Audio downloaded', { size: audioBuffer.length });

              // Get mime type from the audio message
              const audioMsg = message.rawMessage.message?.audioMessage;
              const mimeType = audioMsg?.mimetype || 'audio/ogg; codecs=opus';

              // Transcribe the audio
              const transcription = await transcriptionService.transcribeBuffer(
                audioBuffer,
                mimeType
              );

              logger.info('Audio transcribed', {
                language: transcription.language,
                textLength: transcription.text.length,
                duration: transcription.duration,
              });

              // Use the transcribed text
              messageText = transcription.text;
              isTranscribedAudio = true;
            } catch (error) {
              logger.error('Failed to transcribe audio', {
                error: error instanceof Error ? error.message : String(error),
              });

              // Send error message to user
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
            logger.warn('Received audio message but transcription service not available');

            // Inform user that audio transcription is not configured
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

        // Process with AI if should respond and has text (or transcribed audio)
        if (shouldRespond && messageText) {
          try {
            logger.info('Processing message with OpenCode', {
              text: messageText.substring(0, 50),
              chatId: message.chatId,
              isTranscribedAudio,
            });

            // Create a context key for session management
            const contextKey = `whatsapp:${message.chatId}`;
            const sessionTitle = message.isGroup
              ? `WhatsApp Group: ${message.chatId}`
              : `WhatsApp DM: ${message.senderPhone}`;

            // Process with progress updates
            const progressResult = await processWithProgress(
              async () => {
                // Send to OpenCode for AI processing
                // Prefix transcribed audio with context
                const prompt = isTranscribedAudio
                  ? `[Voice message transcription]: ${messageText}`
                  : messageText!;
                return openCodeClient.chat(contextKey, prompt, {
                  sessionTitle,
                  agent: 'pm-assistant', // Use the PM assistant agent
                });
              },
              {
                onReact: async (emoji: string) => {
                  // React to the original message with an emoji (immediate acknowledgment)
                  const socket = connection.getSocket();
                  if (socket) {
                    try {
                      // Use the exact original message key for accurate reaction
                      // This is critical - WhatsApp requires the exact key to react correctly
                      const rawKey = message.rawMessage?.key;

                      if (!rawKey) {
                        logger.warn('No raw message key available for reaction');
                        return;
                      }

                      logger.info('Reacting to message with emoji', {
                        chatId: message.chatId,
                        messageId: message.id,
                        emoji,
                      });

                      await socket.sendMessage(message.chatId, {
                        react: {
                          text: emoji,
                          key: rawKey, // Use the exact original key
                        },
                      });
                      logger.info('Reaction sent successfully', {
                        chatId: message.chatId,
                        emoji,
                      });
                    } catch (err) {
                      logger.error('Failed to react to message', {
                        error: err instanceof Error ? err.message : String(err),
                        chatId: message.chatId,
                      });
                    }
                  }
                },
                onSendMessage: async (progressText: string) => {
                  // Send progress message to user
                  const socket = connection.getSocket();
                  if (socket) {
                    try {
                      logger.info('Sending progress message', {
                        chatId: message.chatId,
                        text: progressText,
                      });
                      const progressMsg = await socket.sendMessage(message.chatId, {
                        text: progressText,
                      });
                      if (progressMsg?.key?.id) {
                        connection.registerSentMessage(progressMsg.key.id);
                      }
                      logger.info('Progress message sent', { chatId: message.chatId });
                    } catch (err) {
                      logger.error('Failed to send progress message', {
                        error: err instanceof Error ? err.message : String(err),
                        chatId: message.chatId,
                      });
                    }
                  }
                },
              }
            );

            const result = progressResult.result;

            logger.info('OpenCode response received', {
              chatId: message.chatId,
              responseLength: result.response.length,
              model: result.model,
              toolsUsed: result.toolsUsed,
              reactionSent: progressResult.reactionSent,
              progressMessagesSent: progressResult.progressMessagesSent,
            });

            // Send response back via WhatsApp
            const socket = connection.getSocket();
            if (socket && result.response) {
              // Add a small footer with model info
              const audioTag = isTranscribedAudio ? '🎤 ' : '';
              const responseText =
                result.response +
                `\n\n_${audioTag}${result.model} • ${result.toolsUsed.length > 0 ? result.toolsUsed.join(', ') : 'no tools'}_`;

              const sentMsg = await socket.sendMessage(message.chatId, { text: responseText });

              // Register the sent message ID to avoid processing it in upsert
              if (sentMsg?.key?.id) {
                connection.registerSentMessage(sentMsg.key.id);
              }

              logger.info('Sent AI response', { to: message.chatId, messageId: sentMsg?.key?.id });

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

            // Send error message to user
            try {
              const socket = connection.getSocket();
              if (socket) {
                const errorMsg = await socket.sendMessage(message.chatId, {
                  text: `❌ Sorry, I encountered an error processing your message. Please try again.`,
                });
                if (errorMsg?.key?.id) {
                  connection.registerSentMessage(errorMsg.key.id);
                }
              }
            } catch (sendError) {
              logger.error('Failed to send error message', { error: String(sendError) });
            }
          }
        }
      } catch (error) {
        logger.error('Error handling message', { error: String(error) });
      }
    });

    // Start the bot connection (API server already started above)
    await connection.connect();

    op.success('WhatsApp Bot started successfully');

    // Keep the process alive
    logger.info('WhatsApp Bot running. Press Ctrl+C to stop.');
  } catch (error) {
    op.failure(error as Error);
    logger.error('Failed to start WhatsApp Bot', { error: String(error) });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main', { error: String(error) });
  process.exit(1);
});
