/**
 * WhatsApp Event Handlers
 *
 * This module contains the event handling logic for the WhatsApp bot.
 * Extracted from whatsapp-bot.ts for better maintainability.
 *
 * Exported via @orient-bot/bot-whatsapp package.
 */

import { proto } from 'baileys';
import { WhatsAppService } from './whatsappService.js';
import { OpenCodeWhatsAppHandler, MessageContext } from './openCodeWhatsAppHandler.js';
import {
  MessageDatabase,
  ChatPermissionService,
  type StoreMessageOptions,
} from '@orient-bot/database-services';
import { TranscriptionService } from './transcriptionService.js';
import { MediaStorageService } from './mediaStorageService.js';
import { WhatsAppApiServer } from './whatsappApiServer.js';
import type { WhatsAppMessage, PollVote, WhatsAppPoll } from '../types.js';
import { createDedicatedServiceLogger } from '@orient-bot/core';
import { getPollActionRegistry } from './pollActionRegistry.js';
import { createProgressiveResponder, formatModelName, formatToolsUsed } from '@orient-bot/agents';

// Use dedicated WhatsApp logger
const logger = createDedicatedServiceLogger('whatsapp', {
  maxSize: '20m',
  maxDays: '14d',
  compress: true,
});

// ============================================
// RESPONSE FORMATTING
// ============================================

/**
 * Format a response with metadata footer showing model and tools used
 */
export function formatResponseWithMetadata(
  response: string,
  model: string,
  provider: string,
  toolsUsed: string[]
): string {
  const parts: string[] = [response];

  // Add separator and metadata footer
  parts.push(''); // blank line
  parts.push('─────────────────────');

  // Format model info (e.g., "grok-code" -> "Grok Code")
  const modelDisplay = formatModelName(model);
  parts.push(`_${modelDisplay}_`);

  // Format tools used (if any)
  if (toolsUsed.length > 0) {
    const toolsDisplay = formatToolsUsed(toolsUsed);
    parts.push(`_Tools: ${toolsDisplay}_`);
  }

  return parts.join('\n');
}

// ============================================
// EVENT HANDLER DEPENDENCIES
// ============================================

export interface EventHandlerDependencies {
  whatsappService: WhatsAppService;
  opencodeHandler: OpenCodeWhatsAppHandler;
  messageDb: MessageDatabase;
  transcriptionService: TranscriptionService | null;
  mediaStorage: MediaStorageService;
  whatsappApiServer: WhatsAppApiServer;
  permissionService: ChatPermissionService;
}

// ============================================
// EVENT HANDLERS
// ============================================

/**
 * Set up all WhatsApp event handlers
 */
export function setupEventHandlers(deps: EventHandlerDependencies): void {
  const {
    whatsappService,
    opencodeHandler: _opencodeHandler,
    messageDb: _messageDb,
    transcriptionService: _transcriptionService,
    mediaStorage: _mediaStorage,
    whatsappApiServer: _whatsappApiServer,
    permissionService: _permissionService,
  } = deps;

  // When ready
  whatsappService.on('ready', () => handleReady(deps));

  // When QR code is generated
  whatsappService.on('qr', handleQrCode);

  // When disconnected
  whatsappService.on('disconnected', handleDisconnected);

  // When error occurs
  whatsappService.on('error', handleError);

  // When message is received
  whatsappService.on('message', (message: WhatsAppMessage) => handleMessage(message, deps));

  // Handle read-only messages (groups where bot doesn't respond)
  whatsappService.on('message_stored', (message: WhatsAppMessage) =>
    handleMessageStored(message, deps)
  );

  // Handle poll vote responses
  whatsappService.on('poll_vote', (vote: PollVote, poll: WhatsAppPoll) =>
    handlePollVote(vote, poll, deps)
  );

  // Handle history sync
  whatsappService.on(
    'history_sync',
    (data: { messages: proto.IWebMessageInfo[]; isLatest: boolean }) =>
      handleHistorySync(data, deps)
  );

  // Handle chat metadata sync (group names from history)
  whatsappService.on('chats_sync', (chats: { id: string; name?: string; isGroup: boolean }[]) =>
    handleChatsSync(chats, deps)
  );
}

/**
 * Handle ready event
 */
async function handleReady(deps: EventHandlerDependencies): Promise<void> {
  const { whatsappService, messageDb, transcriptionService } = deps;

  logger.info('WhatsApp bot is ready!');
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ✅ WhatsApp Bot Connected! (OpenCode Mode)                    ║
╠════════════════════════════════════════════════════════════════╣
║  The bot is now running and listening for messages.            ║
║  All AI processing is handled by the OpenCode server.          ║
║                                                                 ║
║  Example commands:                                              ║
║  • "What's in progress?"                                        ║
║  • "Any blockers?"                                              ║
║  • "Weekly summary"                                             ║
║  • "Sprint status"                                              ║
║  • "Show me issue PROJ-123"                                       ║
║                                                                 ║
║  Press Ctrl+C to stop the bot.                                  ║
╚════════════════════════════════════════════════════════════════╝
`);

  // Log database stats on startup (non-fatal if fails)
  try {
    const dbStats = await messageDb.getStats();
    logger.info('Message database stats', {
      totalMessages: dbStats.totalMessages,
      incoming: dbStats.incomingMessages,
      outgoing: dbStats.outgoingMessages,
      contacts: dbStats.uniqueContacts,
      groups: dbStats.uniqueGroups,
    });
    console.log(
      `📊 Database: ${dbStats.totalMessages} messages stored (${dbStats.incomingMessages} in, ${dbStats.outgoingMessages} out)`
    );
  } catch (dbError) {
    logger.warn('Failed to get database stats', {
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    console.log('📊 Database: Stats unavailable');
  }

  // Fetch and store group names for groups without metadata
  try {
    const groupsWithoutNames = await messageDb.getGroupsWithoutNames();
    if (groupsWithoutNames.length > 0) {
      logger.info('Fetching names for groups without metadata', {
        count: groupsWithoutNames.length,
      });
      console.log(`🔄 Fetching names for ${groupsWithoutNames.length} group(s)...`);

      const failedGroups: string[] = [];

      for (const groupId of groupsWithoutNames) {
        try {
          const metadata = await whatsappService.getGroupMetadata(groupId);
          if (metadata) {
            await messageDb.upsertGroup(
              metadata.id,
              metadata.subject,
              metadata.subject,
              metadata.participants
            );
            logger.debug('Fetched group metadata', {
              groupId,
              name: metadata.subject,
            });
          }
        } catch (error) {
          logger.warn('Failed to fetch group metadata', {
            groupId,
            error: error instanceof Error ? error.message : String(error),
          });
          failedGroups.push(groupId);
        }
      }

      // Retry failed groups once more with a delay (WhatsApp API rate limiting)
      if (failedGroups.length > 0) {
        logger.info('Retrying failed group metadata fetches', {
          count: failedGroups.length,
        });
        console.log(`🔄 Retrying ${failedGroups.length} failed group(s)...`);

        // Small delay before retry to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));

        for (const groupId of failedGroups) {
          try {
            const metadata = await whatsappService.getGroupMetadata(groupId);
            if (metadata) {
              await messageDb.upsertGroup(
                metadata.id,
                metadata.subject,
                metadata.subject,
                metadata.participants
              );
              logger.info('Fetched group metadata on retry', {
                groupId,
                name: metadata.subject,
              });
            }
          } catch (error) {
            logger.warn('Failed to fetch group metadata on retry', {
              groupId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          // Small delay between retries
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Log updated group count
      const groupsWithNames = await messageDb.getAllGroupsWithNames();
      console.log(`✅ Group names: ${groupsWithNames.length} groups have names`);
    }
  } catch (groupError) {
    logger.warn('Failed to fetch group metadata', {
      error: groupError instanceof Error ? groupError.message : String(groupError),
    });
  }

  // Send a startup message to the admin (skip in dev mode to avoid noise during hot-reload)
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    logger.info('Skipping startup message in dev mode');
  } else {
    try {
      const adminJid = whatsappService.getAdminJid();
      const voiceStatus = transcriptionService
        ? '🎙️ Voice messages: *Enabled* (Hebrew & English)'
        : '🎙️ Voice messages: _Disabled_';

      // Get available models info (stored for future use)
      const _modelsInfo = OpenCodeWhatsAppHandler.getAvailableModelsInfo();

      await whatsappService.sendBotResponse(
        adminJid,
        '🤖 *Bot Started! (OpenCode Mode)*\n\n' +
          'I am now online and ready to help.\n' +
          voiceStatus +
          '\n' +
          '🤖 Default AI: *Grok Code Fast 1*\n\n' +
          '📱 *Getting Started (First Time Setup):*\n' +
          '1. Create a WhatsApp group with just yourself\n' +
          '   • Name it "Orient" or whatever you like\n' +
          '   • Tip: Add someone, then remove them to create a solo group\n' +
          '2. Send any message to that group\n' +
          '3. Open the Dashboard → Chats tab\n' +
          '4. Find your group and change permission to "Read + Write"\n' +
          "5. Send another message - I'll respond!\n\n" +
          '🔒 *About Permissions:*\n' +
          "• *Read Only* - I store messages but don't respond\n" +
          '• *Read + Write* - I can respond to you in this chat\n\n' +
          '*Switch AI models:*\n' +
          '• "switch to grok" _(default)_\n' +
          '• "switch to gpt" _(GPT 5.2)_\n' +
          '• "switch to opus" _(Claude Opus 4.5)_\n' +
          '• "switch to sonnet" _(Claude Sonnet 4.5)_'
      );
      logger.info('Sent startup message to admin');
    } catch (error) {
      logger.warn('Failed to send startup message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Handle QR code event
 */
function handleQrCode(_qr: string): void {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  📱 Scan QR Code with WhatsApp                                  ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  🌐 Web Interface: http://localhost:4097                        ║
║     (Easier to scan from a browser!)                            ║
║                                                                 ║
║  Or scan from terminal above:                                   ║
║  1. Open WhatsApp on your phone                                 ║
║  2. Go to Settings → Linked Devices                             ║
║  3. Tap "Link a Device"                                         ║
║  4. Scan the QR code                                            ║
╚════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Handle disconnected event
 */
function handleDisconnected(reason: string): void {
  logger.warn('WhatsApp disconnected', { reason });
  console.log(`\n⚠️  WhatsApp disconnected: ${reason}\n`);
}

/**
 * Handle error event
 */
function handleError(error: Error): void {
  logger.error('WhatsApp error', { error: error.message });
  console.error(`\n❌ Error: ${error.message}\n`);
}

/**
 * Handle incoming message
 */
async function handleMessage(
  message: WhatsAppMessage,
  deps: EventHandlerDependencies
): Promise<void> {
  const {
    whatsappService,
    opencodeHandler,
    messageDb,
    transcriptionService,
    mediaStorage,
    whatsappApiServer,
  } = deps;

  logger.info('Received message', {
    from: message.fromPhone,
    text: message.text.substring(0, 50),
    hasImage: !!message.mediaBuffer,
    hasAudio: !!message.audioBuffer,
  });

  // Update current JID context for API server (so MCP tools know where to send polls)
  whatsappApiServer.setCurrentJid(message.from);

  // Transcribe voice messages if we have audio data and transcription service
  let messageText = message.text;
  let transcribedLanguage: string | undefined;

  if (message.isAudio && message.audioBuffer && transcriptionService) {
    try {
      logger.info('Transcribing voice message', {
        from: message.fromPhone,
        duration: message.audioDuration,
        bufferSize: message.audioBuffer.length,
      });

      // Send "processing voice message" indicator
      await whatsappService.sendMessage(message.from, '🎙️ _Transcribing voice message..._');

      const result = await transcriptionService.transcribeBuffer(
        message.audioBuffer,
        message.audioType || 'audio/ogg; codecs=opus'
      );

      messageText = result.text;
      transcribedLanguage = result.language;

      // Update message with transcription
      message.transcribedText = result.text;
      message.transcribedLanguage = result.language;

      logger.info('Voice message transcribed', {
        from: message.fromPhone,
        language: result.language,
        textLength: result.text.length,
        duration: result.duration,
        textPreview: result.text.substring(0, 100),
      });
    } catch (transcriptionError) {
      logger.error('Failed to transcribe voice message', {
        error:
          transcriptionError instanceof Error
            ? transcriptionError.message
            : String(transcriptionError),
        from: message.fromPhone,
      });

      // Notify user of transcription failure
      await whatsappService.sendBotResponse(
        message.from,
        "❌ Sorry, I couldn't transcribe your voice message. Please try again or send a text message."
      );
      return;
    }
  } else if (message.isAudio && message.audioBuffer && !transcriptionService) {
    // Audio received but transcription is not enabled
    logger.warn('Voice message received but transcription is not enabled', {
      from: message.fromPhone,
    });

    await whatsappService.sendBotResponse(
      message.from,
      '🎙️ Voice messages are not supported. Please send a text message instead.\n\n' +
        '_To enable voice messages, set the OPENAI_API_KEY environment variable._'
    );
    return;
  } else if (message.isAudio && !message.audioBuffer) {
    // Audio message but failed to download
    logger.warn('Voice message received but audio download failed', {
      from: message.fromPhone,
    });

    await whatsappService.sendBotResponse(
      message.from,
      "❌ Sorry, I couldn't download your voice message. Please try again."
    );
    return;
  }

  // Capture group metadata if this is a group message
  let groupName: string | undefined;
  if (message.isGroup && message.groupId) {
    try {
      const groupMetadata = await whatsappService.getGroupMetadata(message.groupId);
      if (groupMetadata) {
        groupName = groupMetadata.subject;
        await messageDb.upsertGroup(
          groupMetadata.id,
          groupMetadata.subject, // Group name
          groupMetadata.subject, // Subject is the same as name in WhatsApp
          groupMetadata.participants
        );
        logger.debug('Updated group metadata', {
          groupId: groupMetadata.id,
          name: groupMetadata.subject,
        });
      }
    } catch (metadataError) {
      logger.warn('Failed to fetch group metadata', {
        error: metadataError instanceof Error ? metadataError.message : String(metadataError),
      });
      // Try to get from database if fetching failed
      const storedGroup = await messageDb.getGroup(message.groupId);
      if (storedGroup?.groupName || storedGroup?.groupSubject) {
        groupName = storedGroup.groupName ?? storedGroup.groupSubject ?? undefined;
      }
    }
  }

  // Prepare storage options for media
  const storeOptions: Partial<StoreMessageOptions> = {};

  // Save image to disk if present
  if (message.mediaBuffer && message.mediaType) {
    const savedMedia = mediaStorage.saveMedia(
      message.mediaBuffer,
      message.mediaType,
      message.timestamp,
      message.id
    );
    if (savedMedia) {
      storeOptions.mediaType = 'image';
      storeOptions.mediaPath = savedMedia.filePath;
      storeOptions.mediaMimeType = savedMedia.mimeType;
      logger.info('Saved image to disk', { path: savedMedia.filePath });
    }
  }

  // Save audio to disk if present
  if (message.audioBuffer && message.audioType) {
    const savedMedia = mediaStorage.saveMedia(
      message.audioBuffer,
      message.audioType,
      message.timestamp,
      message.id
    );
    if (savedMedia) {
      storeOptions.mediaType = 'audio';
      storeOptions.mediaPath = savedMedia.filePath;
      storeOptions.mediaMimeType = savedMedia.mimeType;
      storeOptions.transcribedText = message.transcribedText;
      storeOptions.transcribedLanguage = transcribedLanguage;
      logger.info('Saved audio to disk', { path: savedMedia.filePath });
    }
  }

  // Store incoming message in database (with transcribed text if applicable)
  try {
    const textToStore = message.isAudio
      ? `[Voice message${transcribedLanguage ? ` (${transcribedLanguage})` : ''}]: ${messageText}`
      : messageText;

    await messageDb.storeIncomingMessage(
      message.id,
      message.from,
      message.fromPhone,
      textToStore,
      message.timestamp,
      message.isGroup,
      message.groupId,
      storeOptions
    );
    logger.debug('Stored incoming message', {
      messageId: message.id,
      hasMedia: !!storeOptions.mediaType,
    });
  } catch (dbError) {
    logger.error('Failed to store incoming message', {
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
  }

  try {
    // Build message context for OpenCode
    const context: MessageContext = {
      phone: message.fromPhone,
      jid: message.from,
      isGroup: message.isGroup,
      groupId: message.groupId,
      groupName: groupName,
      transcribedText: message.transcribedText,
      transcribedLanguage: transcribedLanguage,
    };

    // Prepare image data if present
    const imageData =
      message.mediaBuffer && message.mediaType
        ? {
            buffer: message.mediaBuffer,
            mimeType: message.mediaType,
          }
        : undefined;

    // Show typing indicator while processing
    await whatsappService.sendTypingIndicator(message.from);

    // Set up periodic typing indicator refresh (every 5 seconds)
    // WhatsApp typing indicator expires after ~10 seconds
    const typingInterval = setInterval(async () => {
      await whatsappService.sendTypingIndicator(message.from);
    }, 5000);

    // Create progressive responder for this request
    const progressResponder = createProgressiveResponder();

    let result;
    try {
      // Process with OpenCode, with progress updates
      const progressResult = await progressResponder.executeWithProgress(
        () => opencodeHandler.processMessage(messageText, context, imageData),
        {
          sendReaction: async (emoji: string) => {
            // React to the original message with an emoji (immediate acknowledgment)
            logger.info('Reacting to message with emoji', {
              to: message.fromPhone,
              jid: message.from,
              messageId: message.id,
              emoji,
            });
            try {
              await whatsappService.reactToMessage(message.from, message.id, emoji, {
                isGroup: message.isGroup,
                senderJid: message.from,
              });
              logger.info('Reaction sent successfully', { to: message.fromPhone, emoji });
            } catch (err) {
              logger.error('Failed to react to message', {
                error: err instanceof Error ? err.message : String(err),
                to: message.fromPhone,
              });
            }
          },
          sendMessage: async (progressText: string) => {
            // Send progress message to user
            logger.info('Sending progress message to WhatsApp', {
              to: message.fromPhone,
              jid: message.from,
              text: progressText,
            });
            try {
              await whatsappService.sendBotResponse(message.from, progressText);
              logger.info('Progress message sent successfully', { to: message.fromPhone });
            } catch (err) {
              logger.error('Failed to send progress message', {
                error: err instanceof Error ? err.message : String(err),
                to: message.fromPhone,
              });
            }
          },
        }
      );
      result = progressResult.result;

      // Log progress stats
      if (progressResult.messageCount > 0) {
        logger.info('Progress updates sent during processing', {
          messagesSent: progressResult.messageCount,
          progressSent: progressResult.progressSent,
        });
      }
    } finally {
      // Always clear the typing interval
      clearInterval(typingInterval);
      await whatsappService.clearTypingIndicator(message.from);
    }

    // Format response with metadata footer
    const formattedResponse = formatResponseWithMetadata(
      result.text,
      result.model,
      result.provider,
      result.toolsUsed
    );

    // Send response
    await whatsappService.sendBotResponse(message.from, formattedResponse);

    // Store outgoing response in database
    const outgoingMessageId = `out_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      await messageDb.storeOutgoingMessage(
        outgoingMessageId,
        message.from,
        message.fromPhone,
        formattedResponse,
        message.isGroup,
        message.groupId
      );
      logger.debug('Stored outgoing message', { messageId: outgoingMessageId });
    } catch (dbError) {
      logger.error('Failed to store outgoing message', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }

    logger.info('Sent response', {
      to: message.fromPhone,
      responseLength: formattedResponse.length,
      processedImage: !!imageData,
      cost: result.cost,
      tokens: result.tokens,
      model: result.model,
      toolsUsed: result.toolsUsed,
    });
  } catch (error) {
    logger.error('Failed to process message', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Send error message to user
    const errorResponse =
      '❌ Sorry, I encountered an error processing your request. Please try again.';
    try {
      await whatsappService.sendBotResponse(message.from, errorResponse);

      // Also store the error response
      const errorMessageId = `out_err_${Date.now()}`;
      messageDb.storeOutgoingMessage(
        errorMessageId,
        message.from,
        message.fromPhone,
        errorResponse,
        message.isGroup,
        message.groupId
      );
    } catch {
      // Ignore send error
    }
  }
}

/**
 * Handle read-only messages (groups where bot doesn't respond)
 */
async function handleMessageStored(
  message: WhatsAppMessage,
  deps: EventHandlerDependencies
): Promise<void> {
  const { whatsappService, messageDb, mediaStorage } = deps;

  logger.info('handleMessageStored called', {
    messageId: message.id,
    isGroup: message.isGroup,
    groupId: message.groupId,
    fromPhone: message.fromPhone,
  });

  // Capture group metadata for ALL groups (both read-only and writable)
  if (message.isGroup && message.groupId) {
    logger.debug('Attempting to fetch group metadata', {
      groupId: message.groupId,
    });
    try {
      const groupMetadata = await whatsappService.getGroupMetadata(message.groupId);
      if (groupMetadata) {
        logger.debug('Got group metadata', {
          groupId: message.groupId,
          subject: groupMetadata.subject,
          participants: groupMetadata.participants,
        });
        await messageDb.upsertGroup(
          groupMetadata.id,
          groupMetadata.subject,
          groupMetadata.subject,
          groupMetadata.participants || 0
        );
        logger.info('Stored group metadata from message', {
          groupId: message.groupId,
          name: groupMetadata.subject,
        });
      } else {
        logger.warn('No metadata returned for group', { groupId: message.groupId });
      }
    } catch (error) {
      logger.warn('Failed to fetch group metadata', {
        groupId: message.groupId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Prepare storage options for media (if any)
  const storeOptions: Partial<StoreMessageOptions> = {};

  if (message.mediaBuffer && message.mediaType) {
    const savedMedia = mediaStorage.saveMedia(
      message.mediaBuffer,
      message.mediaType,
      message.timestamp,
      message.id
    );
    if (savedMedia) {
      storeOptions.mediaType = 'image';
      storeOptions.mediaPath = savedMedia.filePath;
      storeOptions.mediaMimeType = savedMedia.mimeType;
    }
  }

  if (message.audioBuffer && message.audioType) {
    const savedMedia = mediaStorage.saveMedia(
      message.audioBuffer,
      message.audioType,
      message.timestamp,
      message.id
    );
    if (savedMedia) {
      storeOptions.mediaType = 'audio';
      storeOptions.mediaPath = savedMedia.filePath;
      storeOptions.mediaMimeType = savedMedia.mimeType;
    }
  }

  // Store message in database without responding
  try {
    await messageDb.storeIncomingMessage(
      message.id,
      message.from,
      message.fromPhone,
      message.text,
      message.timestamp,
      message.isGroup,
      message.groupId,
      storeOptions
    );
    logger.debug('Stored group message (read-only)', {
      messageId: message.id,
      groupId: message.groupId,
      from: message.fromPhone,
      hasMedia: !!storeOptions.mediaType,
    });
  } catch (dbError) {
    logger.error('Failed to store read-only message', {
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
  }
}

/**
 * Handle poll vote responses
 */
async function handlePollVote(
  vote: PollVote,
  poll: WhatsAppPoll,
  deps: EventHandlerDependencies
): Promise<void> {
  const { whatsappService, opencodeHandler, messageDb } = deps;

  logger.info('Received poll vote', {
    pollId: poll.id,
    question: poll.question,
    selectedOptions: vote.selectedOptions,
    voterPhone: vote.voterPhone,
    hasActionId: !!poll.context?.actionId,
    hasSessionId: !!poll.context?.sessionId,
  });

  // Show typing indicator while processing poll vote
  await whatsappService.sendTypingIndicator(poll.jid);

  // Set up periodic typing indicator refresh (every 5 seconds)
  const typingInterval = setInterval(async () => {
    await whatsappService.sendTypingIndicator(poll.jid);
  }, 5000);

  try {
    let responseText: string;
    let cost: number | undefined;
    let model: string | undefined;
    let provider: string | undefined;
    let toolsUsed: string[] = [];

    // Check if this poll has a registered action handler
    const actionRegistry = getPollActionRegistry();
    const actionId = poll.context?.actionId;

    if (actionId && actionRegistry.hasHandler(actionId)) {
      // Route through the action registry
      logger.info('Routing poll vote to action handler', { actionId, pollId: poll.id });

      const actionResult = await actionRegistry.executeAction(poll, vote);

      if (actionResult !== null) {
        // Action handler produced a response
        responseText = actionResult;
        logger.info('Action handler processed poll vote', {
          actionId,
          responseLength: responseText.length,
        });
      } else {
        // Action handler declined - fall through to OpenCode
        logger.info('Action handler declined, falling back to OpenCode', { actionId });
        const result = await opencodeHandler.handlePollVote(
          vote.voterPhone,
          poll.question,
          vote.selectedOptions,
          poll.jid,
          poll.context?.sessionId,
          poll.context?.originalQuery
        );
        responseText = result.text;
        cost = result.cost;
        model = result.model;
        provider = result.provider;
        toolsUsed = result.toolsUsed;
      }
    } else {
      // No action handler - process through OpenCode with session continuity
      const result = await opencodeHandler.handlePollVote(
        vote.voterPhone,
        poll.question,
        vote.selectedOptions,
        poll.jid,
        poll.context?.sessionId,
        poll.context?.originalQuery
      );
      responseText = result.text;
      cost = result.cost;
      model = result.model;
      provider = result.provider;
      toolsUsed = result.toolsUsed;
    }

    // Format response with metadata if we have model info (OpenCode responses)
    if (model) {
      responseText = formatResponseWithMetadata(responseText, model, provider || '', toolsUsed);
    }

    // Clear typing indicator before sending response
    clearInterval(typingInterval);
    await whatsappService.clearTypingIndicator(poll.jid);

    // Send the response
    await whatsappService.sendBotResponse(poll.jid, responseText);

    // Store the outgoing response
    const outgoingMessageId = `out_poll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      await messageDb.storeOutgoingMessage(
        outgoingMessageId,
        poll.jid,
        vote.voterPhone,
        responseText,
        poll.jid.endsWith('@g.us'),
        poll.jid.endsWith('@g.us') ? poll.jid : undefined
      );
    } catch (dbError) {
      logger.error('Failed to store poll response message', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }

    // Clear the poll now that it's been answered
    whatsappService.clearPoll(poll.id);

    logger.info('Poll vote processed and response sent', {
      pollId: poll.id,
      responseLength: responseText.length,
      cost,
      handledByAction: actionId && actionRegistry.hasHandler(actionId),
    });
  } catch (error) {
    // Always clear typing indicator on error
    clearInterval(typingInterval);
    await whatsappService.clearTypingIndicator(poll.jid);

    logger.error('Failed to process poll vote', {
      error: error instanceof Error ? error.message : String(error),
      pollId: poll.id,
    });

    // Send error message
    await whatsappService.sendBotResponse(
      poll.jid,
      '❌ Sorry, I had trouble processing your poll response. Please try again or send a text message.'
    );
  }
}

/**
 * Handle history sync (when linking a new device or reconnecting)
 */
async function handleHistorySync(
  { messages, isLatest }: { messages: proto.IWebMessageInfo[]; isLatest: boolean },
  deps: EventHandlerDependencies
): Promise<void> {
  const { whatsappService, messageDb } = deps;

  // Filter to only sync messages from the last 3 months
  const threeMonthsAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
  const recentMessages = messages.filter((msg: proto.IWebMessageInfo) => {
    const msgTimestamp = msg.messageTimestamp as number;
    return msgTimestamp && msgTimestamp > threeMonthsAgo;
  });

  logger.info('Processing history sync', {
    totalMessages: messages.length,
    recentMessages: recentMessages.length,
    isLatest,
  });
  console.log(
    `📜 History sync: Processing ${recentMessages.length} of ${messages.length} historical messages (last 3 months)...`
  );

  let storedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const msg of recentMessages) {
    try {
      // Skip if no message content or key
      if (!msg.message || !msg.key) {
        skippedCount++;
        continue;
      }

      const jid = msg.key.remoteJid;
      if (!jid) {
        skippedCount++;
        continue;
      }

      // Extract message text
      const msgContent = msg.message;
      const text =
        msgContent?.conversation ||
        msgContent?.extendedTextMessage?.text ||
        msgContent?.imageMessage?.caption ||
        msgContent?.videoMessage?.caption ||
        '';

      // Skip empty messages
      if (!text) {
        skippedCount++;
        continue;
      }

      const isGroup = jid.endsWith('@g.us');
      const messageId =
        msg.key.id || `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date((msg.messageTimestamp as number) * 1000);

      // Determine sender phone
      let senderPhone: string;
      if (isGroup) {
        const participantJid = msg.key.participant;
        if (participantJid) {
          senderPhone = participantJid.split('@')[0].split(':')[0];
        } else if (msg.key.fromMe) {
          // Message from ourselves in group
          const adminPhone = whatsappService.getAdminJid().split('@')[0].split(':')[0];
          senderPhone = adminPhone;
        } else {
          skippedCount++;
          continue;
        }
      } else {
        // Direct message
        if (msg.key.fromMe) {
          // Outgoing message - skip for now (we'll handle these differently)
          skippedCount++;
          continue;
        }
        senderPhone = jid.split('@')[0].split(':')[0];
      }

      // Store historical message with deduplication
      await messageDb.storeHistoricalMessage(
        messageId,
        jid,
        senderPhone,
        text,
        timestamp,
        isGroup,
        isGroup ? jid : undefined
      );
      storedCount++;
    } catch (error) {
      errorCount++;
      logger.debug('Failed to store historical message', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('History sync complete', {
    stored: storedCount,
    skipped: skippedCount,
    errors: errorCount,
  });
  console.log(
    `✅ History sync complete: ${storedCount} stored, ${skippedCount} skipped, ${errorCount} errors`
  );

  // Fetch group names for any new groups
  const groupsWithoutNames = await messageDb.getGroupsWithoutNames();
  if (groupsWithoutNames.length > 0) {
    logger.info('Fetching names for new groups from history sync', {
      count: groupsWithoutNames.length,
    });
    console.log(`🔄 Fetching names for ${groupsWithoutNames.length} new group(s)...`);

    for (const groupId of groupsWithoutNames) {
      try {
        const metadata = await whatsappService.getGroupMetadata(groupId);
        if (metadata) {
          await messageDb.upsertGroup(
            metadata.id,
            metadata.subject,
            metadata.subject,
            metadata.participants
          );
        }
      } catch {
        // Silently ignore - group may no longer exist
      }
    }
  }
}

/**
 * Handle chat metadata sync (saves group names from history)
 */
async function handleChatsSync(
  chats: { id: string; name?: string; isGroup: boolean }[],
  deps: EventHandlerDependencies
): Promise<void> {
  const { messageDb, whatsappService } = deps;

  const groups = chats.filter((c) => c.isGroup);
  if (groups.length === 0) return;

  logger.info('Processing chat metadata sync for group names', {
    totalGroups: groups.length,
    groupsWithNames: groups.filter((g) => g.name).length,
  });
  console.log(`📋 Syncing names for ${groups.length} group(s) from chat metadata...`);

  let updatedCount = 0;
  const groupsWithoutNames: string[] = [];

  // First, store groups with names
  for (const group of groups) {
    try {
      if (group.name) {
        // Update the group's name in the groups table
        await messageDb.upsertGroup(group.id, group.name, group.name);
        updatedCount++;
        logger.debug('Updated group name from chat sync', {
          groupId: group.id,
          name: group.name,
        });
      } else {
        // Ensure group entry exists even without name, so we can fetch metadata later
        groupsWithoutNames.push(group.id);
        await messageDb.upsertGroup(group.id, undefined, undefined, undefined);
      }
    } catch (error) {
      logger.warn('Failed to update group from chat sync', {
        groupId: group.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`✅ Updated ${updatedCount} group name(s) from chat metadata`);

  // Fetch metadata for groups without names (in background)
  if (groupsWithoutNames.length > 0 && whatsappService) {
    logger.info('Fetching metadata for groups without names', {
      count: groupsWithoutNames.length,
    });
    console.log(`🔄 Fetching names for ${groupsWithoutNames.length} group(s) without metadata...`);

    // Do this in the background to not block the chat sync
    setImmediate(async () => {
      for (const groupId of groupsWithoutNames) {
        try {
          const metadata = await whatsappService.getGroupMetadata(groupId);
          if (metadata) {
            const participantCount = Array.isArray(metadata.participants)
              ? metadata.participants.length
              : typeof metadata.participants === 'number'
                ? metadata.participants
                : 0;
            await messageDb.upsertGroup(
              metadata.id,
              metadata.subject,
              metadata.subject,
              participantCount
            );
            logger.debug('Fetched group metadata from chat sync', {
              groupId,
              name: metadata.subject,
            });
          }
        } catch (error) {
          logger.warn('Failed to fetch group metadata from chat sync', {
            groupId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
  }
}
