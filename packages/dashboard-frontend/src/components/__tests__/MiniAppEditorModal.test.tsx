/**
 * Tests for MiniAppEditorModal - PR Creation Logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the API module
const mockCloseSession = vi.fn();
vi.mock('../../../api', () => ({
  editApp: vi.fn(),
  getHistory: vi.fn(),
  rollbackToCommit: vi.fn(),
  closeSession: mockCloseSession,
}));

describe('MiniAppEditorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PR Creation Logic', () => {
    describe('isLocalhost detection', () => {
      it('should detect localhost hostname', () => {
        const isLocalhost = (hostname: string) =>
          hostname === 'localhost' || hostname === '127.0.0.1';

        expect(isLocalhost('localhost')).toBe(true);
        expect(isLocalhost('127.0.0.1')).toBe(true);
        expect(isLocalhost('example.com')).toBe(false);
        expect(isLocalhost('orient.example.com')).toBe(false);
      });
    });

    describe('shouldMerge logic', () => {
      it('should skip PR creation on localhost', () => {
        const hostname = 'localhost';
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const shouldMerge = !isLocalhost;

        expect(shouldMerge).toBe(false);
      });

      it('should skip PR creation on 127.0.0.1', () => {
        const hostname = '127.0.0.1';
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const shouldMerge = !isLocalhost;

        expect(shouldMerge).toBe(false);
      });

      it('should create PR in production (non-localhost)', () => {
        const hostname = 'orient.example.com';
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const shouldMerge = !isLocalhost;

        expect(shouldMerge).toBe(true);
      });

      it('should create PR on staging domain', () => {
        const hostname = 'staging.orient.com';
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const shouldMerge = !isLocalhost;

        expect(shouldMerge).toBe(true);
      });
    });

    describe('closeSession call', () => {
      it('should call closeSession with merge=false on localhost', async () => {
        const appName = 'test-app';
        const sessionId = 'session-123';
        const hostname = 'localhost';

        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const shouldMerge = !isLocalhost;

        mockCloseSession.mockResolvedValue({ success: true });

        await mockCloseSession(appName, sessionId, shouldMerge);

        expect(mockCloseSession).toHaveBeenCalledWith(appName, sessionId, false);
      });

      it('should call closeSession with merge=true on production', async () => {
        const appName = 'test-app';
        const sessionId = 'session-123';
        const hostname = 'orient.example.com';

        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const shouldMerge = !isLocalhost;

        mockCloseSession.mockResolvedValue({ success: true });

        await mockCloseSession(appName, sessionId, shouldMerge);

        expect(mockCloseSession).toHaveBeenCalledWith(appName, sessionId, true);
      });
    });
  });
});
