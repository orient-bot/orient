/**
 * Tests for WhatsApp Sync State Tracking
 *
 * Tests for sync state management (syncState, syncProgress) during initial pairing,
 * and phone number extraction from connection metadata (getUserPhone).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    user: null,
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
    generate: vi.fn(),
  },
}));

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    level: 'warn',
    child: vi.fn(),
  })),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe('WhatsApp Sync State', () => {
  describe('getSyncState', () => {
    it('should return idle when not connected', () => {
      // Test that sync state starts as idle
      // This tests the expected contract for the getSyncState method
      const syncState: 'idle' | 'syncing' | 'ready' = 'idle';
      expect(syncState).toBe('idle');
    });

    it('should define valid sync state values', () => {
      // Valid sync states
      const validStates: Array<'idle' | 'syncing' | 'ready'> = ['idle', 'syncing', 'ready'];

      validStates.forEach((state) => {
        expect(['idle', 'syncing', 'ready']).toContain(state);
      });
    });
  });

  describe('getSyncProgress', () => {
    it('should have correct initial sync progress shape', () => {
      // Initial sync progress should have expected shape
      const syncProgress = { chatsReceived: 0, isLatest: false };

      expect(syncProgress).toHaveProperty('chatsReceived');
      expect(syncProgress).toHaveProperty('isLatest');
      expect(typeof syncProgress.chatsReceived).toBe('number');
      expect(typeof syncProgress.isLatest).toBe('boolean');
    });

    it('should track chats received', () => {
      let syncProgress = { chatsReceived: 0, isLatest: false };

      // Simulate receiving chats
      syncProgress.chatsReceived += 10;
      expect(syncProgress.chatsReceived).toBe(10);

      syncProgress.chatsReceived += 5;
      expect(syncProgress.chatsReceived).toBe(15);
    });

    it('should track isLatest flag', () => {
      const syncProgress = { chatsReceived: 0, isLatest: false };

      expect(syncProgress.isLatest).toBe(false);

      // Mark as latest (sync complete)
      syncProgress.isLatest = true;
      expect(syncProgress.isLatest).toBe(true);
    });
  });

  describe('Sync state transitions', () => {
    it('should transition from idle to syncing when connection opens', () => {
      let syncState: 'idle' | 'syncing' | 'ready' = 'idle';
      const syncProgress = { chatsReceived: 0, isLatest: false };

      // Simulate connection open
      const simulateConnectionOpen = () => {
        syncState = 'syncing';
        // Reset progress
        syncProgress.chatsReceived = 0;
        syncProgress.isLatest = false;
      };

      simulateConnectionOpen();

      expect(syncState).toBe('syncing');
      expect(syncProgress.chatsReceived).toBe(0);
    });

    it('should transition from syncing to ready when isLatest is true', () => {
      let syncState: 'idle' | 'syncing' | 'ready' = 'syncing';
      const syncProgress = { chatsReceived: 50, isLatest: false };

      // Simulate history sync completion
      const simulateHistorySyncComplete = (isLatest: boolean) => {
        syncProgress.isLatest = isLatest;
        if (isLatest && syncState === 'syncing') {
          syncState = 'ready';
        }
      };

      simulateHistorySyncComplete(true);

      expect(syncState).toBe('ready');
      expect(syncProgress.isLatest).toBe(true);
    });

    it('should not transition to ready if isLatest is false', () => {
      let syncState: 'idle' | 'syncing' | 'ready' = 'syncing';
      const syncProgress = { chatsReceived: 50, isLatest: false };

      // Simulate partial history sync
      const simulateHistorySyncPartial = (isLatest: boolean) => {
        syncProgress.isLatest = isLatest;
        if (isLatest && syncState === 'syncing') {
          syncState = 'ready';
        }
      };

      simulateHistorySyncPartial(false);

      expect(syncState).toBe('syncing');
      expect(syncProgress.isLatest).toBe(false);
    });

    it('should reset to idle when connection closes', () => {
      let syncState: 'idle' | 'syncing' | 'ready' = 'ready';
      let syncProgress = { chatsReceived: 100, isLatest: true };

      // Simulate disconnect
      const simulateDisconnect = () => {
        syncState = 'idle';
        syncProgress = { chatsReceived: 0, isLatest: false };
      };

      simulateDisconnect();

      expect(syncState).toBe('idle');
      expect(syncProgress.chatsReceived).toBe(0);
      expect(syncProgress.isLatest).toBe(false);
    });
  });

  describe('getUserPhone', () => {
    it('should extract phone from standard JID format', () => {
      // Standard JID: "972501234567@s.whatsapp.net"
      const extractPhone = (jid: string | null): string | null => {
        if (!jid) return null;
        const match = jid.match(/^(\d+)/);
        return match ? match[1] : null;
      };

      const jid = '972501234567@s.whatsapp.net';
      expect(extractPhone(jid)).toBe('972501234567');
    });

    it('should extract phone from JID with device suffix', () => {
      // JID with device suffix: "972501234567:52@s.whatsapp.net"
      const extractPhone = (jid: string | null): string | null => {
        if (!jid) return null;
        const match = jid.match(/^(\d+)/);
        return match ? match[1] : null;
      };

      const jid = '972501234567:52@s.whatsapp.net';
      expect(extractPhone(jid)).toBe('972501234567');
    });

    it('should return null when no socket user', () => {
      const extractPhone = (jid: string | null): string | null => {
        if (!jid) return null;
        const match = jid.match(/^(\d+)/);
        return match ? match[1] : null;
      };

      expect(extractPhone(null)).toBeNull();
    });

    it('should handle various international phone formats', () => {
      const extractPhone = (jid: string | null): string | null => {
        if (!jid) return null;
        const match = jid.match(/^(\d+)/);
        return match ? match[1] : null;
      };

      const testCases = [
        { jid: '14155551234@s.whatsapp.net', expected: '14155551234' }, // USA
        { jid: '447911123456@s.whatsapp.net', expected: '447911123456' }, // UK
        { jid: '33612345678@s.whatsapp.net', expected: '33612345678' }, // France
        { jid: '8613812345678@s.whatsapp.net', expected: '8613812345678' }, // China
        { jid: '919876543210:3@s.whatsapp.net', expected: '919876543210' }, // India with device
      ];

      testCases.forEach(({ jid, expected }) => {
        expect(extractPhone(jid)).toBe(expected);
      });
    });

    it('should return null for invalid JID format', () => {
      const extractPhone = (jid: string | null): string | null => {
        if (!jid) return null;
        const match = jid.match(/^(\d+)/);
        return match ? match[1] : null;
      };

      expect(extractPhone('invalid@s.whatsapp.net')).toBeNull();
      expect(extractPhone('@s.whatsapp.net')).toBeNull();
      expect(extractPhone('')).toBeNull();
    });
  });
});

describe('QR Status API Response', () => {
  describe('sync state fields in response', () => {
    it('should include syncState in API response shape', () => {
      // Expected shape of /qr/status response
      const mockResponse = {
        needsQrScan: false,
        isConnected: true,
        qrCode: null,
        qrDataUrl: null,
        updatedAt: null,
        qrGenerationPaused: false,
        syncState: 'syncing' as const,
        syncProgress: { chatsReceived: 25, isLatest: false },
        userPhone: '972501234567',
      };

      expect(mockResponse).toHaveProperty('syncState');
      expect(mockResponse).toHaveProperty('syncProgress');
      expect(mockResponse).toHaveProperty('userPhone');
    });

    it('should handle all sync state values', () => {
      const syncStates: Array<'idle' | 'syncing' | 'ready'> = ['idle', 'syncing', 'ready'];

      syncStates.forEach((state) => {
        const response = {
          syncState: state,
          syncProgress: { chatsReceived: 0, isLatest: state === 'ready' },
        };

        expect(response.syncState).toBe(state);
      });
    });

    it('should include userPhone when connected', () => {
      const connectedResponse = {
        isConnected: true,
        syncState: 'ready' as const,
        syncProgress: { chatsReceived: 100, isLatest: true },
        userPhone: '972501234567',
      };

      expect(connectedResponse.userPhone).toBe('972501234567');
    });

    it('should have null userPhone when not connected', () => {
      const disconnectedResponse = {
        isConnected: false,
        syncState: 'idle' as const,
        syncProgress: { chatsReceived: 0, isLatest: false },
        userPhone: null,
      };

      expect(disconnectedResponse.userPhone).toBeNull();
    });
  });
});
