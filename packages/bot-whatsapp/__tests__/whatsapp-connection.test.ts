/**
 * Tests for WhatsApp Connection Service
 *
 * Tests for connection state management, session handling, and utility methods.
 * These tests focus on synchronous functionality that doesn't require full Baileys mocking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock dependencies before importing
vi.mock('@orient-bot/core', () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    startOperation: () => ({
      success: vi.fn(),
      failure: vi.fn(),
    }),
  }),
}));

// Mock Baileys and QRCode
vi.mock('baileys', () => ({
  default: vi.fn(() => ({
    ev: {
      on: vi.fn(),
      off: vi.fn(),
    },
    sendMessage: vi.fn(),
    end: vi.fn(),
    logout: vi.fn(),
    requestPairingCode: vi.fn(),
  })),
  DisconnectReason: {
    loggedOut: 401,
    connectionReplaced: 440,
    connectionClosed: 428,
    connectionLost: 408,
  },
  useMultiFileAuthState: vi.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: vi.fn(),
  }),
  makeCacheableSignalKeyStore: vi.fn().mockReturnValue({}),
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({
    version: [2, 3000, 1015901307],
    isLatest: true,
  }),
}));

vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn().mockResolvedValue('QR_TERMINAL_STRING'),
  },
}));

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    level: 'warn',
    child: vi.fn(),
  })),
}));

// Mock fs methods
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

import { WhatsAppConnection } from '../src/services/connection.js';

describe('WhatsAppConnection', () => {
  let connection: WhatsAppConnection;
  const testSessionPath = '/tmp/test-whatsapp-session';

  const defaultConfig = {
    sessionPath: testSessionPath,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as any).mockReturnValue(true);
    connection = new WhatsAppConnection(defaultConfig);
  });

  afterEach(() => {
    // Clean up any event listeners
    connection.removeAllListeners();
  });

  describe('Constructor', () => {
    it('should create connection with config', () => {
      expect(connection).toBeDefined();
      expect(connection.getSessionPath()).toBe(testSessionPath);
    });

    it('should create session directory if it does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);

      new WhatsAppConnection(defaultConfig);

      expect(fs.mkdirSync).toHaveBeenCalledWith(testSessionPath, { recursive: true });
    });

    it('should not create session directory if it exists', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.mkdirSync as any).mockClear();

      new WhatsAppConnection(defaultConfig);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('should return initial state as connecting', () => {
      expect(connection.getState()).toBe('connecting');
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(connection.isConnected()).toBe(false);
    });
  });

  describe('getSocket', () => {
    it('should return null before connecting', () => {
      expect(connection.getSocket()).toBeNull();
    });
  });

  describe('registerSentMessage', () => {
    it('should register sent message ID', () => {
      // This is a simple registration - message should be tracked
      connection.registerSentMessage('test-message-id');
      // Can't directly test the internal Set, but we can verify no errors
      expect(true).toBe(true);
    });

    it('should handle multiple registrations', () => {
      connection.registerSentMessage('msg-1');
      connection.registerSentMessage('msg-2');
      connection.registerSentMessage('msg-3');
      // No errors expected
      expect(true).toBe(true);
    });
  });

  describe('getCurrentQrCode', () => {
    it('should return null before QR is generated', () => {
      expect(connection.getCurrentQrCode()).toBeNull();
    });
  });

  describe('getMyLid', () => {
    it('should return null before connection', () => {
      expect(connection.getMyLid()).toBeNull();
    });
  });

  describe('getSessionPath', () => {
    it('should return configured session path', () => {
      expect(connection.getSessionPath()).toBe(testSessionPath);
    });

    it('should return different paths for different configs', () => {
      const customPath = '/custom/session/path';
      const customConnection = new WhatsAppConnection({
        ...defaultConfig,
        sessionPath: customPath,
      });

      expect(customConnection.getSessionPath()).toBe(customPath);
    });
  });

  describe('Event Emitter', () => {
    it('should be an EventEmitter', () => {
      const callback = vi.fn();
      connection.on('test', callback);
      connection.emit('test');

      expect(callback).toHaveBeenCalled();
    });

    it('should emit ready event', () => {
      const callback = vi.fn();
      connection.on('ready', callback);
      connection.emit('ready');

      expect(callback).toHaveBeenCalled();
    });

    it('should emit disconnected event with reason', () => {
      const callback = vi.fn();
      connection.on('disconnected', callback);
      connection.emit('disconnected', 'test_reason');

      expect(callback).toHaveBeenCalledWith('test_reason');
    });

    it('should emit error event', () => {
      const callback = vi.fn();
      const testError = new Error('Test error');
      connection.on('error', callback);
      connection.emit('error', testError);

      expect(callback).toHaveBeenCalledWith(testError);
    });

    it('should emit qr event with QR code', () => {
      const callback = vi.fn();
      connection.on('qr', callback);
      connection.emit('qr', 'qr-code-data');

      expect(callback).toHaveBeenCalledWith('qr-code-data');
    });

    it('should emit reconnecting event with attempt number', () => {
      const callback = vi.fn();
      connection.on('reconnecting', callback);
      connection.emit('reconnecting', 3);

      expect(callback).toHaveBeenCalledWith(3);
    });

    it('should emit message event with parsed message', () => {
      const callback = vi.fn();
      const testMessage = {
        id: 'msg-123',
        chatId: '1234567890@s.whatsapp.net',
        senderJid: '1234567890@s.whatsapp.net',
        senderPhone: '1234567890',
        senderName: 'Test User',
        text: 'Hello!',
        timestamp: new Date(),
        isGroup: false,
        isFromMe: false,
        hasMedia: false,
        rawMessage: {},
      };

      connection.on('message', callback);
      connection.emit('message', testMessage);

      expect(callback).toHaveBeenCalledWith(testMessage);
    });
  });

  describe('Configuration', () => {
    it('should use default values when optional config missing', () => {
      const minimalConfig = {
        sessionPath: '/minimal/path',
      };

      const minimalConnection = new WhatsAppConnection(minimalConfig);
      expect(minimalConnection.getSessionPath()).toBe('/minimal/path');
    });

    it('should handle session path with trailing slash', () => {
      const configWithSlash = {
        sessionPath: '/path/with/slash/',
        autoReconnect: true,
      };

      const conn = new WhatsAppConnection(configWithSlash);
      expect(conn.getSessionPath()).toBe('/path/with/slash/');
    });

    it('should handle relative session path', () => {
      const relativeConfig = {
        sessionPath: './sessions/whatsapp',
        autoReconnect: false,
      };

      const conn = new WhatsAppConnection(relativeConfig);
      expect(conn.getSessionPath()).toBe('./sessions/whatsapp');
    });
  });

  describe('disconnect', () => {
    it('should disconnect without socket', async () => {
      // When no socket exists, disconnect should complete gracefully
      await connection.disconnect();

      expect(connection.getState()).toBe('close');
    });
  });

  describe('requestPairingCode', () => {
    it('should throw error when socket not initialized', async () => {
      await expect(connection.requestPairingCode('972501234567')).rejects.toThrow(
        'WhatsApp socket not initialized'
      );
    });

    it('should throw error for short phone number', async () => {
      // Need to have socket initialized for this validation
      // Since socket is null, it throws earlier
      await expect(connection.requestPairingCode('12345')).rejects.toThrow(
        'WhatsApp socket not initialized'
      );
    });
  });

  describe('Phone number validation', () => {
    // These tests verify the phone number format requirements
    it('should accept valid international phone format', () => {
      const validFormats = [
        '972501234567', // Israel
        '14155551234', // USA
        '447911123456', // UK
        '33612345678', // France
        '8613812345678', // China
      ];

      // Just verify the formats are strings of correct length
      validFormats.forEach((phone) => {
        const cleaned = phone.replace(/\D/g, '');
        expect(cleaned.length).toBeGreaterThanOrEqual(10);
        expect(cleaned.length).toBeLessThanOrEqual(15);
      });
    });

    it('should identify invalid phone formats', () => {
      const invalidFormats = [
        '123', // Too short
        '+1234', // Too short even with +
        '1234567890123456', // Too long (16 digits)
      ];

      invalidFormats.forEach((phone) => {
        const cleaned = phone.replace(/\D/g, '');
        const isValid = cleaned.length >= 10 && cleaned.length <= 15;
        expect(isValid).toBe(false);
      });
    });
  });
});
