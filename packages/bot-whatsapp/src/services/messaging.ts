/**
 * WhatsApp Messaging Service
 *
 * Handles sending and receiving WhatsApp messages using Baileys.
 * Supports text, images, audio, documents, polls, and reactions.
 */

import type { WASocket, proto, WAMessage } from 'baileys';
import { downloadMediaMessage } from 'baileys';
import { createServiceLogger } from '@orient-bot/core';
import type { ParsedMessage, WhatsAppMediaType, WhatsAppAudioType } from '../types.js';

const logger = createServiceLogger('whatsapp-messaging');

export interface MessageOptions {
  quoted?: WAMessage;
  caption?: string;
  mimetype?: string;
  fileName?: string;
}

/**
 * WhatsApp Messaging Handler
 *
 * Provides methods for sending different types of messages:
 * - Text messages
 * - Images with captions
 * - Audio (voice notes and files)
 * - Documents
 * - Polls
 * - Reactions
 */
export class WhatsAppMessaging {
  private socket: WASocket | null = null;
  private writePermissionChecker: ((jid: string) => Promise<boolean>) | null = null;

  /**
   * Set the socket connection (from WhatsAppConnection)
   */
  setSocket(socket: WASocket | null): void {
    this.socket = socket;
  }

  /**
   * Set the write permission checker
   */
  setWritePermissionChecker(checker: (jid: string) => Promise<boolean>): void {
    this.writePermissionChecker = checker;
  }

  /**
   * Check write permission before sending
   */
  private async checkPermission(jid: string): Promise<void> {
    if (this.writePermissionChecker) {
      const allowed = await this.writePermissionChecker(jid);
      if (!allowed) {
        throw new Error(`Write permission denied for ${jid}`);
      }
    }
  }

  /**
   * Ensure socket is connected
   */
  private requireSocket(): WASocket {
    if (!this.socket) {
      throw new Error('WhatsApp socket not connected');
    }
    return this.socket;
  }

  /**
   * Send a text message
   */
  async sendText(
    jid: string,
    text: string,
    options?: MessageOptions
  ): Promise<WAMessage | undefined> {
    const op = logger.startOperation('sendText');
    await this.checkPermission(jid);

    try {
      const socket = this.requireSocket();
      const result = await socket.sendMessage(
        jid,
        {
          text,
        },
        {
          quoted: options?.quoted,
        }
      );

      op.success('Text message sent');
      return result;
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Send an image message
   */
  async sendImage(
    jid: string,
    image: Buffer | string,
    options?: MessageOptions
  ): Promise<WAMessage | undefined> {
    const op = logger.startOperation('sendImage');
    await this.checkPermission(jid);

    try {
      const socket = this.requireSocket();
      const content: any =
        typeof image === 'string'
          ? { image: { url: image }, caption: options?.caption }
          : { image, caption: options?.caption, mimetype: options?.mimetype || 'image/jpeg' };

      const result = await socket.sendMessage(jid, content, {
        quoted: options?.quoted,
      });

      op.success('Image message sent');
      return result;
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Send an audio message (voice note or file)
   */
  async sendAudio(
    jid: string,
    audio: Buffer | string,
    type: WhatsAppAudioType = 'voice',
    options?: MessageOptions
  ): Promise<WAMessage | undefined> {
    const op = logger.startOperation('sendAudio');
    await this.checkPermission(jid);

    try {
      const socket = this.requireSocket();
      const ptt = type === 'voice';
      const content: any =
        typeof audio === 'string'
          ? { audio: { url: audio }, ptt, mimetype: options?.mimetype || 'audio/ogg; codecs=opus' }
          : { audio, ptt, mimetype: options?.mimetype || 'audio/ogg; codecs=opus' };

      const result = await socket.sendMessage(jid, content, {
        quoted: options?.quoted,
      });

      op.success('Audio message sent', { type });
      return result;
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Send a document
   */
  async sendDocument(
    jid: string,
    document: Buffer | string,
    fileName: string,
    options?: MessageOptions
  ): Promise<WAMessage | undefined> {
    const op = logger.startOperation('sendDocument');
    await this.checkPermission(jid);

    try {
      const socket = this.requireSocket();
      const content: any =
        typeof document === 'string'
          ? {
              document: { url: document },
              fileName,
              mimetype: options?.mimetype || 'application/octet-stream',
            }
          : { document, fileName, mimetype: options?.mimetype || 'application/octet-stream' };

      const result = await socket.sendMessage(jid, content, {
        quoted: options?.quoted,
      });

      op.success('Document sent', { fileName });
      return result;
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Send a poll
   */
  async sendPoll(
    jid: string,
    name: string,
    pollOptions: string[],
    selectableCount: number = 1
  ): Promise<WAMessage | undefined> {
    const op = logger.startOperation('sendPoll');
    await this.checkPermission(jid);

    try {
      const socket = this.requireSocket();
      const result = await socket.sendMessage(jid, {
        poll: {
          name,
          values: pollOptions,
          selectableCount,
        },
      });

      op.success('Poll sent', { name, optionCount: pollOptions.length });
      return result;
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * React to a message
   */
  async react(
    jid: string,
    messageId: string,
    emoji: string,
    options?: { isGroup?: boolean; senderJid?: string }
  ): Promise<WAMessage | undefined> {
    const op = logger.startOperation('react');
    await this.checkPermission(jid);

    try {
      const socket = this.requireSocket();
      const result = await socket.sendMessage(jid, {
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

      op.success('Reaction sent', { emoji });
      return result;
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Download media from a message
   */
  async downloadMedia(message: WAMessage, type: WhatsAppMediaType): Promise<Buffer> {
    const op = logger.startOperation('downloadMedia');

    try {
      const buffer = await downloadMediaMessage(
        message,
        'buffer',
        {},
        {
          logger: undefined as any,
          reuploadRequest: this.socket!.updateMediaMessage,
        }
      );

      op.success('Media downloaded', { type });
      return buffer as Buffer;
    } catch (error) {
      op.failure(error as Error);
      throw error;
    }
  }

  /**
   * Parse a raw Baileys message into our standard format
   */
  parseMessage(msg: proto.IWebMessageInfo, myLid?: string | null): ParsedMessage | null {
    const key = msg.key;
    if (!key || !key.remoteJid || !msg.message) {
      return null;
    }

    const remoteJid = key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const messageContent = msg.message;

    // Determine message type and extract text
    let text = '';
    let mediaType: WhatsAppMediaType | undefined;
    let hasMedia = false;

    if (messageContent.conversation) {
      text = messageContent.conversation;
    } else if (messageContent.extendedTextMessage?.text) {
      text = messageContent.extendedTextMessage.text;
    } else if (messageContent.imageMessage) {
      text = messageContent.imageMessage.caption || '';
      mediaType = 'image';
      hasMedia = true;
    } else if (messageContent.audioMessage) {
      mediaType = messageContent.audioMessage.ptt ? 'audio' : 'audio';
      hasMedia = true;
    } else if (messageContent.videoMessage) {
      text = messageContent.videoMessage.caption || '';
      mediaType = 'video';
      hasMedia = true;
    } else if (messageContent.documentMessage) {
      text = messageContent.documentMessage.caption || '';
      mediaType = 'document';
      hasMedia = true;
    }

    // Get sender info
    const senderJid = isGroup ? key.participant || remoteJid : remoteJid;
    const senderPhone = senderJid ? senderJid.replace(/@.*/, '') : '';

    // Check if this is from ourselves
    const isFromMe = key.fromMe || (myLid && senderPhone.includes(myLid));

    return {
      id: key.id || '',
      chatId: remoteJid,
      senderJid: senderJid || remoteJid,
      senderPhone,
      senderName: msg.pushName || senderPhone,
      text,
      timestamp: new Date((msg.messageTimestamp as number) * 1000),
      isGroup,
      isFromMe: !!isFromMe,
      hasMedia,
      mediaType,
      rawMessage: msg,
    };
  }
}
