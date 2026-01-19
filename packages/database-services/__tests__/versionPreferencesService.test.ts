/**
 * Version Preferences Service Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mock pool instance that will be shared
const mockPoolInstance = {
  query: vi.fn(),
  end: vi.fn(),
};

// Mock pg module with a proper class that supports `new`
vi.mock('pg', () => {
  // Use a class to properly support `new Pool()`
  class MockPool {
    query = mockPoolInstance.query;
    end = mockPoolInstance.end;
  }
  return {
    default: {
      Pool: MockPool,
    },
    Pool: MockPool,
  };
});

import {
  VersionPreferencesService,
  createVersionPreferencesService,
  type UserVersionPreferences,
} from '../src/versionPreferencesService.js';

describe('VersionPreferencesService', () => {
  let service: VersionPreferencesService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolInstance.query.mockReset();
    mockPoolInstance.end.mockReset();
    service = createVersionPreferencesService('postgresql://test:test@localhost/test');
  });

  describe('getPreferences', () => {
    it('should return existing preferences', async () => {
      const mockPrefs = {
        user_id: 1,
        notifications_enabled: true,
        dismissed_versions: ['1.0.0'],
        remind_later_until: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockPoolInstance.query.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await service.getPreferences(1);

      expect(result).toEqual({
        userId: 1,
        notificationsEnabled: true,
        dismissedVersions: ['1.0.0'],
        remindLaterUntil: null,
        createdAt: mockPrefs.created_at,
        updatedAt: mockPrefs.updated_at,
      });
    });

    it('should create default preferences if none exist', async () => {
      // First query returns no rows
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      // Insert returns new row
      const mockNewPrefs = {
        user_id: 1,
        notifications_enabled: true,
        dismissed_versions: [],
        remind_later_until: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [mockNewPrefs] });

      const result = await service.getPreferences(1);

      expect(result.notificationsEnabled).toBe(true);
      expect(result.dismissedVersions).toEqual([]);
    });

    it('should handle race condition during creation', async () => {
      // First query returns no rows
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      // Insert returns empty (conflict)
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      // Retry select returns the row
      const mockPrefs = {
        user_id: 1,
        notifications_enabled: true,
        dismissed_versions: [],
        remind_later_until: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await service.getPreferences(1);

      expect(result.userId).toBe(1);
      expect(mockPoolInstance.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('updatePreferences', () => {
    it('should update notifications enabled', async () => {
      // getPreferences first
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: [],
            remind_later_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      // Update query
      const updatedPrefs = {
        user_id: 1,
        notifications_enabled: false,
        dismissed_versions: [],
        remind_later_until: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [updatedPrefs] });

      const result = await service.updatePreferences(1, { notificationsEnabled: false });

      expect(result.notificationsEnabled).toBe(false);
      expect(mockPoolInstance.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('dismissVersion', () => {
    it('should add version to dismissed list', async () => {
      // getPreferences
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: [],
            remind_later_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      // Update query
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.dismissVersion(1, '1.1.0');

      // Check the update query was called with the version
      expect(mockPoolInstance.query).toHaveBeenCalledTimes(2);
      const updateCall = mockPoolInstance.query.mock.calls[1];
      expect(updateCall[0]).toContain('array_append');
      expect(updateCall[1]).toContain('1.1.0');
    });

    it('should clear remind_later_until when dismissing', async () => {
      // getPreferences
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: [],
            remind_later_until: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      // Update query
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.dismissVersion(1, '1.1.0');

      const updateCall = mockPoolInstance.query.mock.calls[1];
      expect(updateCall[0]).toContain('remind_later_until = NULL');
    });
  });

  describe('remindLater', () => {
    it('should set remind_later_until to specified hours from now', async () => {
      // getPreferences
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: [],
            remind_later_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      // Update query
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      const beforeCall = Date.now();
      await service.remindLater(1, 24);
      const afterCall = Date.now();

      const updateCall = mockPoolInstance.query.mock.calls[1];
      const remindUntilArg = updateCall[1][1] as Date;

      // Should be approximately 24 hours from now
      const expectedMin = beforeCall + 24 * 60 * 60 * 1000;
      const expectedMax = afterCall + 24 * 60 * 60 * 1000;

      expect(remindUntilArg.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(remindUntilArg.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('isVersionDismissed', () => {
    it('should return true if version is in dismissed list', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: ['1.0.0', '1.1.0'],
            remind_later_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const result = await service.isVersionDismissed(1, '1.1.0');
      expect(result).toBe(true);
    });

    it('should return false if version is not in dismissed list', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: ['1.0.0'],
            remind_later_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const result = await service.isVersionDismissed(1, '1.1.0');
      expect(result).toBe(false);
    });
  });

  describe('shouldShowNotification', () => {
    it('should return false if notifications are disabled', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: false,
            dismissed_versions: [],
            remind_later_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const result = await service.shouldShowNotification(1, '1.1.0');
      expect(result).toBe(false);
    });

    it('should return false if version is dismissed', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: ['1.1.0'],
            remind_later_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const result = await service.shouldShowNotification(1, '1.1.0');
      expect(result).toBe(false);
    });

    it('should return false if in remind-later period', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour in future
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: [],
            remind_later_until: futureDate,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const result = await service.shouldShowNotification(1, '1.1.0');
      expect(result).toBe(false);
    });

    it('should return true if all conditions pass', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: [],
            remind_later_until: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const result = await service.shouldShowNotification(1, '1.1.0');
      expect(result).toBe(true);
    });

    it('should return true if remind-later has expired', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour in past
      mockPoolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 1,
            notifications_enabled: true,
            dismissed_versions: [],
            remind_later_until: pastDate,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const result = await service.shouldShowNotification(1, '1.1.0');
      expect(result).toBe(true);
    });
  });

  describe('close', () => {
    it('should close the database pool', async () => {
      await service.close();
      expect(mockPoolInstance.end).toHaveBeenCalled();
    });
  });
});
