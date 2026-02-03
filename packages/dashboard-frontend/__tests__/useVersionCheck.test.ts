/**
 * Tests for useVersionCheck Hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useVersionCheck } from '../src/hooks/useVersionCheck';

// Mock the API functions
const mockGetVersionStatus = vi.fn();
const mockGetVersionPreferences = vi.fn();
const mockUpdateVersionPreferences = vi.fn();
const mockDismissVersion = vi.fn();
const mockRemindLaterVersion = vi.fn();
const mockCheckVersionNow = vi.fn();

vi.mock('../src/api', () => ({
  getVersionStatus: () => mockGetVersionStatus(),
  getVersionPreferences: () => mockGetVersionPreferences(),
  updateVersionPreferences: (prefs: { notificationsEnabled?: boolean }) =>
    mockUpdateVersionPreferences(prefs),
  dismissVersion: (version: string) => mockDismissVersion(version),
  remindLaterVersion: (hours: 1 | 24 | 168) => mockRemindLaterVersion(hours),
  checkVersionNow: () => mockCheckVersionNow(),
}));

describe('useVersionCheck', () => {
  const mockStatus = {
    currentVersion: '1.0.0',
    latestVersion: '1.1.0',
    updateAvailable: true,
    changelogUrl: 'https://github.com/orient/orient/releases',
    updateInstructions: null,
    lastChecked: new Date().toISOString(),
    shouldShowNotification: true,
  };

  const mockPreferences = {
    userId: 1,
    notificationsEnabled: true,
    dismissedVersions: [],
    remindLaterUntil: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVersionStatus.mockResolvedValue(mockStatus);
    mockGetVersionPreferences.mockResolvedValue(mockPreferences);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch status and preferences on mount', async () => {
    const { result } = renderHook(() => useVersionCheck());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetVersionStatus).toHaveBeenCalled();
    expect(mockGetVersionPreferences).toHaveBeenCalled();
    expect(result.current.status).toEqual(mockStatus);
    expect(result.current.preferences).toEqual(mockPreferences);
  });

  it('should calculate shouldShowBanner correctly when update available and notification enabled', async () => {
    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.shouldShowBanner).toBe(true);
  });

  it('should not show banner when no update available', async () => {
    mockGetVersionStatus.mockResolvedValue({
      ...mockStatus,
      updateAvailable: false,
      shouldShowNotification: false,
    });

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.shouldShowBanner).toBe(false);
  });

  it('should not show banner when shouldShowNotification is false', async () => {
    mockGetVersionStatus.mockResolvedValue({
      ...mockStatus,
      shouldShowNotification: false,
    });

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.shouldShowBanner).toBe(false);
  });

  it('should handle API errors gracefully', async () => {
    mockGetVersionStatus.mockRejectedValue(new Error('Network error'));
    mockGetVersionPreferences.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should not crash, status/preferences remain null
    expect(result.current.status).toBeNull();
    expect(result.current.preferences).toBeNull();
    expect(result.current.shouldShowBanner).toBe(false);
  });

  describe('dismissCurrentVersion', () => {
    it('should call dismissVersion API and refetch data', async () => {
      mockDismissVersion.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useVersionCheck());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.dismissCurrentVersion();
      });

      expect(mockDismissVersion).toHaveBeenCalledWith('1.1.0');
      // Should refetch data after dismissing
      expect(mockGetVersionStatus).toHaveBeenCalledTimes(2);
    });

    it('should not call API if no latest version', async () => {
      mockGetVersionStatus.mockResolvedValue({
        ...mockStatus,
        latestVersion: null,
      });

      const { result } = renderHook(() => useVersionCheck());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.dismissCurrentVersion();
      });

      expect(mockDismissVersion).not.toHaveBeenCalled();
    });
  });

  describe('remindLater', () => {
    it('should call remindLaterVersion API with correct hours', async () => {
      mockRemindLaterVersion.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useVersionCheck());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.remindLater(24);
      });

      expect(mockRemindLaterVersion).toHaveBeenCalledWith(24);
    });

    it('should refetch data after setting remind later', async () => {
      mockRemindLaterVersion.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useVersionCheck());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.remindLater(1);
      });

      expect(mockGetVersionStatus).toHaveBeenCalledTimes(2);
    });
  });

  describe('toggleNotifications', () => {
    it('should call updateVersionPreferences API', async () => {
      const updatedPrefs = { ...mockPreferences, notificationsEnabled: false };
      mockUpdateVersionPreferences.mockResolvedValue(updatedPrefs);

      const { result } = renderHook(() => useVersionCheck());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleNotifications(false);
      });

      expect(mockUpdateVersionPreferences).toHaveBeenCalledWith({
        notificationsEnabled: false,
      });
      expect(result.current.preferences?.notificationsEnabled).toBe(false);
    });
  });

  describe('refreshStatus', () => {
    it('should call checkVersionNow API', async () => {
      mockCheckVersionNow.mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useVersionCheck());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refreshStatus();
      });

      expect(mockCheckVersionNow).toHaveBeenCalled();
    });

    it('should update status with fresh data', async () => {
      const newStatus = {
        ...mockStatus,
        latestVersion: '1.2.0',
      };
      mockCheckVersionNow.mockResolvedValue(newStatus);

      const { result } = renderHook(() => useVersionCheck());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refreshStatus();
      });

      expect(result.current.status?.latestVersion).toBe('1.2.0');
    });

    it('should set error on failure', async () => {
      mockCheckVersionNow.mockRejectedValue(new Error('Failed to check'));

      const { result } = renderHook(() => useVersionCheck());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refreshStatus();
      });

      // Hook uses the error message from the thrown Error
      expect(result.current.error).toBe('Failed to check');
    });
  });
});
