/**
 * Gmail Service
 *
 * Provides functionality to interact with Gmail using OAuth 2.0.
 * Supports reading emails, searching, sending, and managing drafts.
 *
 * Exported via @orient-bot/integrations package.
 */

import { google, gmail_v1 } from 'googleapis';
import { createServiceLogger } from '@orient-bot/core';
import { getGoogleOAuthService } from './oauth.js';

const logger = createServiceLogger('gmail-service');

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface GmailMessage {
  /** Message ID */
  id: string;
  /** Thread ID */
  threadId: string;
  /** Email subject */
  subject: string;
  /** From address */
  from: string;
  /** To addresses */
  to: string[];
  /** CC addresses */
  cc?: string[];
  /** Date received/sent */
  date: Date;
  /** Message snippet (preview) */
  snippet: string;
  /** Labels applied to the message */
  labels: string[];
  /** Whether the message is unread */
  isUnread: boolean;
  /** Whether the message has attachments */
  hasAttachments: boolean;
}

export interface GmailMessageDetails extends GmailMessage {
  /** Full message body (plain text) */
  body: string;
  /** HTML body if available */
  htmlBody?: string;
  /** Attachment info */
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

export interface GmailSearchOptions {
  /** Search query (Gmail search syntax) */
  query?: string;
  /** Max results to return */
  maxResults?: number;
  /** Only include unread messages */
  unreadOnly?: boolean;
  /** Label to filter by */
  label?: string;
  /** From address to filter by */
  from?: string;
  /** Date range start */
  after?: Date;
  /** Date range end */
  before?: Date;
}

export interface GmailSendOptions {
  /** Recipient email address */
  to: string;
  /** Email subject */
  subject: string;
  /** Plain text body */
  body: string;
  /** HTML body (optional) */
  htmlBody?: string;
  /** CC addresses */
  cc?: string[];
  /** BCC addresses */
  bcc?: string[];
  /** Reply to message ID (for threading) */
  replyTo?: string;
  /** Thread ID (for threading) */
  threadId?: string;
}

export interface GmailDraftOptions {
  /** Recipient email address */
  to: string;
  /** Email subject */
  subject: string;
  /** Plain text body */
  body: string;
  /** HTML body (optional) */
  htmlBody?: string;
  /** CC addresses */
  cc?: string[];
}

export interface GmailLabel {
  /** Label ID */
  id: string;
  /** Label name */
  name: string;
  /** Message count with this label */
  messagesTotal: number;
  /** Unread message count with this label */
  messagesUnread: number;
  /** Label type (system or user) */
  type: 'system' | 'user';
}

// =============================================================================
// GmailService Class
// =============================================================================

export class GmailService {
  private gmail: gmail_v1.Gmail | null = null;
  private currentEmail: string | null = null;

  constructor() {
    logger.debug('GmailService instance created');
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Get or create Gmail client for an account.
   */
  private async getClient(accountEmail?: string): Promise<gmail_v1.Gmail> {
    const oauthService = getGoogleOAuthService();

    // Determine which account to use
    const email = accountEmail || oauthService.getDefaultAccount();
    if (!email) {
      throw new Error(
        'No Google account connected. Use google_oauth_connect to connect an account.'
      );
    }

    // If we already have a client for this email, reuse it
    if (this.gmail && this.currentEmail === email) {
      return this.gmail;
    }

    // Get authenticated client
    const authClient = await oauthService.getAuthClient(email);
    this.gmail = google.gmail({ version: 'v1', auth: authClient });
    this.currentEmail = email;

    return this.gmail;
  }

  /**
   * Parse email headers from a message.
   */
  private parseHeaders(
    headers: gmail_v1.Schema$MessagePartHeader[] | undefined
  ): Record<string, string> {
    const result: Record<string, string> = {};
    if (headers) {
      for (const header of headers) {
        if (header.name && header.value) {
          result[header.name.toLowerCase()] = header.value;
        }
      }
    }
    return result;
  }

  /**
   * Parse a Gmail message into our format.
   */
  private parseMessage(msg: gmail_v1.Schema$Message): GmailMessage {
    const headers = this.parseHeaders(msg.payload?.headers);
    const labels = msg.labelIds || [];

    return {
      id: msg.id || '',
      threadId: msg.threadId || '',
      subject: headers['subject'] || '(no subject)',
      from: headers['from'] || '',
      to: (headers['to'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      cc: headers['cc']
        ? headers['cc']
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      date: new Date(parseInt(msg.internalDate || '0', 10)),
      snippet: msg.snippet || '',
      labels,
      isUnread: labels.includes('UNREAD'),
      hasAttachments: this.hasAttachments(msg.payload),
    };
  }

  /**
   * Check if a message has attachments.
   */
  private hasAttachments(payload: gmail_v1.Schema$MessagePart | undefined): boolean {
    if (!payload) return false;

    const checkPart = (part: gmail_v1.Schema$MessagePart): boolean => {
      if (part.filename && part.filename.length > 0) return true;
      if (part.parts) {
        return part.parts.some(checkPart);
      }
      return false;
    };

    return checkPart(payload);
  }

  /**
   * Extract message body from payload.
   */
  private extractBody(payload: gmail_v1.Schema$MessagePart | undefined): {
    text: string;
    html?: string;
  } {
    if (!payload) return { text: '' };

    let text = '';
    let html: string | undefined;

    const extractFromPart = (part: gmail_v1.Schema$MessagePart): void => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        part.parts.forEach(extractFromPart);
      }
    };

    extractFromPart(payload);

    // If no text body, try to extract from HTML
    if (!text && html) {
      text = html.replace(/<[^>]*>/g, '').trim();
    }

    return { text, html };
  }

  /**
   * Extract attachment info from payload.
   */
  private extractAttachments(payload: gmail_v1.Schema$MessagePart | undefined): Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    if (!payload) return [];

    const attachments: Array<{
      id: string;
      filename: string;
      mimeType: string;
      size: number;
    }> = [];

    const extractFromPart = (part: gmail_v1.Schema$MessagePart): void => {
      if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        part.parts.forEach(extractFromPart);
      }
    };

    extractFromPart(payload);
    return attachments;
  }

  /**
   * Build search query from options.
   */
  private buildSearchQuery(options: GmailSearchOptions): string {
    const parts: string[] = [];

    if (options.query) {
      parts.push(options.query);
    }
    if (options.unreadOnly) {
      parts.push('is:unread');
    }
    if (options.label) {
      parts.push(`label:${options.label}`);
    }
    if (options.from) {
      parts.push(`from:${options.from}`);
    }
    if (options.after) {
      parts.push(`after:${Math.floor(options.after.getTime() / 1000)}`);
    }
    if (options.before) {
      parts.push(`before:${Math.floor(options.before.getTime() / 1000)}`);
    }

    return parts.join(' ');
  }

  /**
   * Create a raw email message.
   */
  private createRawMessage(options: GmailSendOptions): string {
    const lines: string[] = [];

    lines.push(`To: ${options.to}`);
    if (options.cc && options.cc.length > 0) {
      lines.push(`Cc: ${options.cc.join(', ')}`);
    }
    if (options.bcc && options.bcc.length > 0) {
      lines.push(`Bcc: ${options.bcc.join(', ')}`);
    }
    lines.push(`Subject: ${options.subject}`);

    if (options.htmlBody) {
      const boundary = `boundary_${Date.now()}`;
      lines.push('MIME-Version: 1.0');
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      lines.push('');
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/plain; charset="UTF-8"');
      lines.push('');
      lines.push(options.body);
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/html; charset="UTF-8"');
      lines.push('');
      lines.push(options.htmlBody);
      lines.push(`--${boundary}--`);
    } else {
      lines.push('Content-Type: text/plain; charset="UTF-8"');
      lines.push('');
      lines.push(options.body);
    }

    const email = lines.join('\r\n');
    return Buffer.from(email).toString('base64url');
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * List/search emails.
   */
  async listMessages(
    options: GmailSearchOptions = {},
    accountEmail?: string
  ): Promise<GmailMessage[]> {
    const op = logger.startOperation('listMessages', { options });

    const gmail = await this.getClient(accountEmail);
    const query = this.buildSearchQuery(options);

    try {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query || undefined,
        maxResults: options.maxResults || 20,
      });

      const messages: GmailMessage[] = [];

      if (response.data.messages) {
        // Fetch details for each message
        for (const msg of response.data.messages) {
          if (msg.id) {
            const details = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'To', 'Cc', 'Date'],
            });

            messages.push(this.parseMessage(details.data));
          }
        }
      }

      op.success('Messages listed', { count: messages.length });
      return messages;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get a specific message with full details.
   */
  async getMessage(messageId: string, accountEmail?: string): Promise<GmailMessageDetails> {
    const op = logger.startOperation('getMessage', { messageId });

    const gmail = await this.getClient(accountEmail);

    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const baseMessage = this.parseMessage(response.data);
      const { text, html } = this.extractBody(response.data.payload);
      const attachments = this.extractAttachments(response.data.payload);

      const result: GmailMessageDetails = {
        ...baseMessage,
        body: text,
        htmlBody: html,
        attachments,
      };

      op.success('Message retrieved', { messageId, hasBody: !!text });
      return result;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Send an email.
   */
  async sendMessage(options: GmailSendOptions, accountEmail?: string): Promise<string> {
    const op = logger.startOperation('sendMessage', { to: options.to, subject: options.subject });

    const gmail = await this.getClient(accountEmail);

    try {
      const raw = this.createRawMessage(options);

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId: options.threadId,
        },
      });

      const messageId = response.data.id || '';
      op.success('Message sent', { messageId });
      return messageId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Create a draft email.
   */
  async createDraft(options: GmailDraftOptions, accountEmail?: string): Promise<string> {
    const op = logger.startOperation('createDraft', { to: options.to, subject: options.subject });

    const gmail = await this.getClient(accountEmail);

    try {
      const raw = this.createRawMessage({
        to: options.to,
        subject: options.subject,
        body: options.body,
        htmlBody: options.htmlBody,
        cc: options.cc,
      });

      const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: { raw },
        },
      });

      const draftId = response.data.id || '';
      op.success('Draft created', { draftId });
      return draftId;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * List labels.
   */
  async listLabels(accountEmail?: string): Promise<GmailLabel[]> {
    const op = logger.startOperation('listLabels');

    const gmail = await this.getClient(accountEmail);

    try {
      const response = await gmail.users.labels.list({
        userId: 'me',
      });

      const labels: GmailLabel[] = [];

      if (response.data.labels) {
        for (const label of response.data.labels) {
          if (label.id) {
            const details = await gmail.users.labels.get({
              userId: 'me',
              id: label.id,
            });

            labels.push({
              id: details.data.id || '',
              name: details.data.name || '',
              messagesTotal: details.data.messagesTotal || 0,
              messagesUnread: details.data.messagesUnread || 0,
              type: details.data.type === 'system' ? 'system' : 'user',
            });
          }
        }
      }

      op.success('Labels listed', { count: labels.length });
      return labels;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Mark a message as read.
   */
  async markAsRead(messageId: string, accountEmail?: string): Promise<void> {
    const op = logger.startOperation('markAsRead', { messageId });

    const gmail = await this.getClient(accountEmail);

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });

      op.success('Message marked as read');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Mark a message as unread.
   */
  async markAsUnread(messageId: string, accountEmail?: string): Promise<void> {
    const op = logger.startOperation('markAsUnread', { messageId });

    const gmail = await this.getClient(accountEmail);

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: ['UNREAD'],
        },
      });

      op.success('Message marked as unread');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Archive a message (remove from inbox).
   */
  async archiveMessage(messageId: string, accountEmail?: string): Promise<void> {
    const op = logger.startOperation('archiveMessage', { messageId });

    const gmail = await this.getClient(accountEmail);

    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['INBOX'],
        },
      });

      op.success('Message archived');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Trash a message.
   */
  async trashMessage(messageId: string, accountEmail?: string): Promise<void> {
    const op = logger.startOperation('trashMessage', { messageId });

    const gmail = await this.getClient(accountEmail);

    try {
      await gmail.users.messages.trash({
        userId: 'me',
        id: messageId,
      });

      op.success('Message trashed');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Get inbox summary (unread count, recent messages).
   */
  async getInboxSummary(accountEmail?: string): Promise<{
    totalUnread: number;
    recentMessages: GmailMessage[];
  }> {
    const op = logger.startOperation('getInboxSummary');

    const gmail = await this.getClient(accountEmail);

    try {
      // Get unread count from INBOX label
      const inboxLabel = await gmail.users.labels.get({
        userId: 'me',
        id: 'INBOX',
      });

      const totalUnread = inboxLabel.data.messagesUnread || 0;

      // Get recent messages
      const recentMessages = await this.listMessages(
        {
          label: 'INBOX',
          maxResults: 10,
        },
        accountEmail
      );

      op.success('Inbox summary retrieved', { totalUnread, recentCount: recentMessages.length });

      return {
        totalUnread,
        recentMessages,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let gmailService: GmailService | null = null;

/**
 * Get or create the GmailService singleton.
 */
export function getGmailService(): GmailService {
  if (!gmailService) {
    gmailService = new GmailService();
  }
  return gmailService;
}

/**
 * Create a new GmailService instance.
 */
export function createGmailService(): GmailService {
  return new GmailService();
}
