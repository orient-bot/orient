/**
 * WhatsApp Mock Service
 *
 * Provides mock responses for WhatsApp-related tools during eval execution.
 */

import { BaseMockService } from './registry.js';
import { MockResponse } from '../types.js';

/**
 * Mock WhatsApp message
 */
export interface MockWhatsAppMessage {
  id: string;
  chatId: string;
  sender: string;
  content: string;
  timestamp: string;
  isFromMe: boolean;
  messageType: 'text' | 'image' | 'document' | 'audio' | 'video';
}

/**
 * Mock WhatsApp contact/group
 */
export interface MockWhatsAppChat {
  id: string;
  name: string;
  isGroup: boolean;
  participantCount?: number;
}

/**
 * Create a mock WhatsApp message
 */
export function createMockWhatsAppMessage(
  overrides: Partial<MockWhatsAppMessage> = {}
): MockWhatsAppMessage {
  return {
    id: `msg-${Date.now()}`,
    chatId: '1234567890@c.us',
    sender: 'John Doe',
    content: 'Test message content',
    timestamp: new Date().toISOString(),
    isFromMe: false,
    messageType: 'text',
    ...overrides,
  };
}

/**
 * Create a mock WhatsApp chat
 */
export function createMockWhatsAppChat(
  overrides: Partial<MockWhatsAppChat> = {}
): MockWhatsAppChat {
  return {
    id: '1234567890@c.us',
    name: 'Test Contact',
    isGroup: false,
    ...overrides,
  };
}

/**
 * WhatsApp mock service implementation
 */
export class WhatsAppMockService extends BaseMockService {
  name = 'whatsapp';

  constructor() {
    super();
    this.setupDefaults();
  }

  private setupDefaults(): void {
    // whatsapp_search_messages - Search messages
    this.defaultResponses.set('whatsapp_search_messages', () => ({
      response: {
        messages: [],
        totalCount: 0,
      },
    }));

    // whatsapp_get_recent - Get recent messages
    this.defaultResponses.set('whatsapp_get_recent', () => ({
      response: {
        messages: [],
        hasMore: false,
      },
    }));

    // whatsapp_get_conversation - Get chat history
    this.defaultResponses.set('whatsapp_get_conversation', () => ({
      response: {
        messages: [],
        chatId: '',
        chatName: '',
      },
    }));

    // whatsapp_list_contacts - List all contacts
    this.defaultResponses.set('whatsapp_list_contacts', () => ({
      response: {
        contacts: [],
        totalCount: 0,
      },
    }));

    // whatsapp_list_groups - List groups
    this.defaultResponses.set('whatsapp_list_groups', () => ({
      response: {
        groups: [],
        totalCount: 0,
      },
    }));

    // whatsapp_get_stats - Get message statistics
    this.defaultResponses.set('whatsapp_get_stats', () => ({
      response: {
        totalMessages: 0,
        messagesByDay: {},
        topSenders: [],
        mediaStats: {
          text: 0,
          image: 0,
          document: 0,
          audio: 0,
          video: 0,
        },
      },
    }));

    // whatsapp_get_media - Get media messages
    this.defaultResponses.set('whatsapp_get_media', () => ({
      response: {
        messages: [],
        totalCount: 0,
      },
    }));

    // whatsapp_send_message - Send message
    this.defaultResponses.set('whatsapp_send_message', () => ({
      response: {
        success: true,
        messageId: `msg-${Date.now()}`,
      },
    }));

    // whatsapp_send_image - Send image
    this.defaultResponses.set('whatsapp_send_image', () => ({
      response: {
        success: true,
        messageId: `msg-${Date.now()}`,
      },
    }));
  }

  /**
   * Create a search messages response
   */
  static createSearchMessagesResponse(messages: MockWhatsAppMessage[]): MockResponse {
    return {
      response: {
        messages: messages.map((m) => ({
          id: m.id,
          chatId: m.chatId,
          sender: m.sender,
          content: m.content,
          timestamp: m.timestamp,
          isFromMe: m.isFromMe,
          messageType: m.messageType,
        })),
        totalCount: messages.length,
      },
    };
  }

  /**
   * Create a list chats response
   */
  static createListChatsResponse(chats: MockWhatsAppChat[]): MockResponse {
    return {
      response: {
        chats: chats.map((c) => ({
          id: c.id,
          name: c.name,
          isGroup: c.isGroup,
          participantCount: c.participantCount,
        })),
        totalCount: chats.length,
      },
    };
  }

  /**
   * Create a chat history response
   */
  static createChatHistoryResponse(
    chatId: string,
    chatName: string,
    messages: MockWhatsAppMessage[]
  ): MockResponse {
    return {
      response: {
        chatId,
        chatName,
        messages: messages.map((m) => ({
          id: m.id,
          sender: m.sender,
          content: m.content,
          timestamp: m.timestamp,
          isFromMe: m.isFromMe,
        })),
      },
    };
  }

  /**
   * Create message stats response
   */
  static createMessageStatsResponse(stats: {
    totalMessages: number;
    topSenders?: Array<{ name: string; count: number }>;
  }): MockResponse {
    return {
      response: {
        totalMessages: stats.totalMessages,
        messagesByDay: {},
        topSenders: stats.topSenders || [],
        mediaStats: {
          text: stats.totalMessages,
          image: 0,
          document: 0,
          audio: 0,
          video: 0,
        },
      },
    };
  }
}
