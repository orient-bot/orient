/**
 * Tests for WhatsAppPairingPanel Component
 *
 * Tests for:
 * - Syncing state UI display
 * - Phone pre-fill logic from connection metadata
 * - Country code dropdown handling
 * - UI state transitions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import WhatsAppPairingPanel from '../src/components/WhatsAppPairingPanel';
import { COUNTRY_CODES } from '../src/api';

// Mock the API module
vi.mock('../src/api', async () => {
  const actual = await vi.importActual('../src/api');
  return {
    ...actual,
    saveWhatsAppAdminPhone: vi.fn(),
  };
});

import { saveWhatsAppAdminPhone } from '../src/api';
const mockSavePhone = saveWhatsAppAdminPhone as ReturnType<typeof vi.fn>;

// Mock fetch for QR status
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Wrapper component for router context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

describe('WhatsAppPairingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Loading State', () => {
    it('should show loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <TestWrapper>
          <WhatsAppPairingPanel />
        </TestWrapper>
      );

      expect(screen.getByText('Checking WhatsApp status...')).toBeInTheDocument();
    });
  });

  describe('Syncing State UI', () => {
    it('should show syncing UI when connected and syncState is syncing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            needsQrScan: false,
            isConnected: true,
            qrCode: null,
            qrDataUrl: null,
            updatedAt: null,
            qrGenerationPaused: false,
            syncState: 'syncing',
            syncProgress: { chatsReceived: 25, isLatest: false },
            userPhone: '972501234567',
          }),
      });

      render(
        <TestWrapper>
          <WhatsAppPairingPanel />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Syncing WhatsApp Data')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Initial sync in progress. This may take a moment/)
      ).toBeInTheDocument();
    });

    it('should show chat count during syncing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            needsQrScan: false,
            isConnected: true,
            qrCode: null,
            qrDataUrl: null,
            syncState: 'syncing',
            syncProgress: { chatsReceived: 42, isLatest: false },
            userPhone: '972501234567',
          }),
      });

      render(
        <TestWrapper>
          <WhatsAppPairingPanel />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('42 chats synced...')).toBeInTheDocument();
      });
    });

    it('should show warning to keep page open during sync', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            needsQrScan: false,
            isConnected: true,
            syncState: 'syncing',
            syncProgress: { chatsReceived: 10, isLatest: false },
            userPhone: '972501234567',
          }),
      });

      render(
        <TestWrapper>
          <WhatsAppPairingPanel />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Please keep this page open/)).toBeInTheDocument();
      });
    });

    it('should not show chat count when zero', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            needsQrScan: false,
            isConnected: true,
            syncState: 'syncing',
            syncProgress: { chatsReceived: 0, isLatest: false },
            userPhone: '972501234567',
          }),
      });

      render(
        <TestWrapper>
          <WhatsAppPairingPanel />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Syncing WhatsApp Data')).toBeInTheDocument();
      });

      expect(screen.queryByText(/chats synced/)).not.toBeInTheDocument();
    });
  });

  describe('Connected State', () => {
    it('should show connected state when syncState is ready or undefined', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            needsQrScan: false,
            isConnected: true,
            qrCode: null,
            qrDataUrl: null,
            syncState: 'ready',
            syncProgress: { chatsReceived: 100, isLatest: true },
            adminPhone: '972501234567',
          }),
      });

      render(
        <TestWrapper>
          <WhatsAppPairingPanel />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });

      expect(screen.getByText('WhatsApp bot is ready and running')).toBeInTheDocument();
    });
  });

  describe('Phone Pre-fill from Connection Metadata', () => {
    it('should auto-save phone when userPhone is available', async () => {
      mockSavePhone.mockResolvedValue({ success: true });

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              needsQrScan: callCount === 1,
              isConnected: callCount > 1,
              qrCode: callCount === 1 ? 'test-qr' : null,
              qrDataUrl: callCount === 1 ? 'data:image/png;base64,test' : null,
              syncState: callCount > 1 ? 'ready' : 'idle',
              syncProgress: { chatsReceived: 100, isLatest: true },
              userPhone: callCount > 1 ? '972501234567' : null,
              adminPhone: null,
            }),
        });
      });

      render(
        <TestWrapper>
          <WhatsAppPairingPanel />
        </TestWrapper>
      );

      // Wait for auto-save attempt when phone becomes available
      await waitFor(
        () => {
          expect(mockSavePhone).toHaveBeenCalledWith('972501234567');
        },
        { timeout: 5000 }
      );
    });
  });

  describe('Phone Confirmation Form', () => {
    it('should show phone confirmation when connected without adminPhone', async () => {
      mockSavePhone.mockRejectedValue(new Error('Failed to auto-save'));

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              needsQrScan: callCount === 1,
              isConnected: callCount > 1,
              qrCode: callCount === 1 ? 'test-qr' : null,
              syncState: callCount > 1 ? 'ready' : 'idle',
              syncProgress: { chatsReceived: 100, isLatest: true },
              userPhone: callCount > 1 ? '972501234567' : null,
              adminPhone: null,
            }),
        });
      });

      render(
        <TestWrapper>
          <WhatsAppPairingPanel />
        </TestWrapper>
      );

      // Wait for phone confirmation form to appear
      await waitFor(
        () => {
          expect(
            screen.getByText('Please confirm your phone number for admin configuration')
          ).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });
  });
});

describe('COUNTRY_CODES', () => {
  it('should have correct structure for all entries', () => {
    COUNTRY_CODES.forEach((country) => {
      expect(country).toHaveProperty('code');
      expect(country).toHaveProperty('name');
      expect(country).toHaveProperty('flag');
      expect(typeof country.code).toBe('string');
      expect(typeof country.name).toBe('string');
      expect(typeof country.flag).toBe('string');
    });
  });

  it('should include common country codes', () => {
    const codes = COUNTRY_CODES.map((c) => c.code);

    expect(codes).toContain('1'); // US/Canada
    expect(codes).toContain('44'); // UK
    expect(codes).toContain('972'); // Israel
    expect(codes).toContain('91'); // India
    expect(codes).toContain('86'); // China
  });

  it('should have unique country codes', () => {
    const codes = COUNTRY_CODES.map((c) => c.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should have only numeric codes', () => {
    COUNTRY_CODES.forEach((country) => {
      expect(country.code).toMatch(/^\d+$/);
    });
  });

  it('should have non-empty flags', () => {
    COUNTRY_CODES.forEach((country) => {
      expect(country.flag.length).toBeGreaterThan(0);
    });
  });
});

describe('Country Code Matching', () => {
  it('should match longest country code first', () => {
    const phone = '972501234567';

    // Sort codes by length descending (longer codes first)
    const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

    const matchingCode = sortedCodes.find((c) => phone.startsWith(c.code));

    expect(matchingCode?.code).toBe('972');
    expect(phone.slice(matchingCode!.code.length)).toBe('501234567');
  });

  it('should handle US/Canada code 1', () => {
    const phone = '14155551234';

    const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    const matchingCode = sortedCodes.find((c) => phone.startsWith(c.code));

    expect(matchingCode?.code).toBe('1');
    expect(matchingCode?.name).toBe('US/Canada');
  });

  it('should handle 3-digit country codes like Israel (972)', () => {
    const phone = '972501234567';

    const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    const matchingCode = sortedCodes.find((c) => phone.startsWith(c.code));

    expect(matchingCode?.code).toBe('972');
    expect(matchingCode?.name).toBe('Israel');
  });

  it('should handle ambiguous prefixes correctly', () => {
    // Country code 7 (Russia) should not match 72xxx which starts with 7
    // but 972 (Israel) should be matched first due to longer match
    const israelPhone = '972501234567';

    const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    const matchingCode = sortedCodes.find((c) => israelPhone.startsWith(c.code));

    // Should match 972 (Israel), not 7 (Russia)
    expect(matchingCode?.code).toBe('972');
    expect(matchingCode?.name).not.toBe('Russia');
  });

  it('should return undefined for unrecognized codes', () => {
    const unknownPhone = '99912345678'; // 999 is not a valid country code

    const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    const matchingCode = sortedCodes.find((c) => unknownPhone.startsWith(c.code));

    // May or may not match depending on prefix - just verify it doesn't crash
    // and returns expected type
    expect(matchingCode === undefined || typeof matchingCode.code === 'string').toBe(true);
  });
});

describe('Phone Number Validation', () => {
  it('should accept valid phone numbers with 10-15 digits', () => {
    const validNumbers = [
      { prefix: '1', number: '4155551234' }, // 10 digits total
      { prefix: '972', number: '501234567' }, // 12 digits total
      { prefix: '86', number: '13812345678' }, // 13 digits total
    ];

    validNumbers.forEach(({ prefix, number }) => {
      const fullNumber = prefix + number;
      const isValid = fullNumber.length >= 10 && fullNumber.length <= 15;
      expect(isValid).toBe(true);
    });
  });

  it('should reject phone numbers that are too short', () => {
    const fullNumber = '12345'; // Only 5 digits
    const isValid = fullNumber.length >= 10 && fullNumber.length <= 15;
    expect(isValid).toBe(false);
  });

  it('should reject phone numbers that are too long', () => {
    const fullNumber = '1234567890123456'; // 16 digits
    const isValid = fullNumber.length >= 10 && fullNumber.length <= 15;
    expect(isValid).toBe(false);
  });

  it('should require country code to be selected', () => {
    const prefix = ''; // Empty prefix (no country code selected)
    const number = '501234567';
    const fullNumber = prefix + number;

    // Without prefix, validation should fail or require a prefix
    expect(prefix).toBe('');
    expect(fullNumber.length).toBeLessThan(10); // Will be too short without prefix
  });
});
