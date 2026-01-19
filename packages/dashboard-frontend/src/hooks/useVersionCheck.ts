import { useCallback, useEffect, useState } from 'react';
import {
  getVersionStatus,
  getVersionPreferences,
  updateVersionPreferences,
  dismissVersion,
  remindLaterVersion,
  checkVersionNow,
  type VersionCheckResult,
  type UserVersionPreferences,
} from '../api';

interface UseVersionCheckReturn {
  /** Current version check status */
  status: VersionCheckResult | null;
  /** User's notification preferences */
  preferences: UserVersionPreferences | null;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether to show the update banner */
  shouldShowBanner: boolean;

  /** Dismiss the current version notification */
  dismissCurrentVersion: () => Promise<void>;
  /** Snooze notification for specified hours */
  remindLater: (hours: 1 | 24 | 168) => Promise<void>;
  /** Toggle notifications enabled/disabled */
  toggleNotifications: (enabled: boolean) => Promise<void>;
  /** Force a version check (bypass cache) */
  refreshStatus: () => Promise<void>;
}

export function useVersionCheck(): UseVersionCheckReturn {
  const [status, setStatus] = useState<VersionCheckResult | null>(null);
  const [preferences, setPreferences] = useState<UserVersionPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial status and preferences
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statusData, prefsData] = await Promise.all([
        getVersionStatus().catch((err) => {
          // Don't fail completely if version check fails
          console.warn('Version check failed:', err);
          return null;
        }),
        getVersionPreferences().catch((err) => {
          // Don't fail completely if preferences fail
          console.warn('Failed to load version preferences:', err);
          return null;
        }),
      ]);

      if (statusData) {
        setStatus(statusData);
      }
      if (prefsData) {
        setPreferences(prefsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Dismiss current version permanently
  const dismissCurrentVersion = useCallback(async () => {
    if (!status?.latestVersion) return;

    try {
      await dismissVersion(status.latestVersion);
      // Refresh data after dismissing
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss version');
    }
  }, [status?.latestVersion, fetchData]);

  // Snooze notification for specified hours
  const remindLater = useCallback(
    async (hours: 1 | 24 | 168) => {
      try {
        await remindLaterVersion(hours);
        // Refresh data after setting remind later
        await fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set reminder');
      }
    },
    [fetchData]
  );

  // Toggle notifications enabled/disabled
  const toggleNotifications = useCallback(async (enabled: boolean) => {
    try {
      const updated = await updateVersionPreferences({ notificationsEnabled: enabled });
      setPreferences(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
    }
  }, []);

  // Force a version check (bypass cache)
  const refreshStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const newStatus = await checkVersionNow();
      setStatus(newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate whether to show the banner
  const shouldShowBanner =
    // Has status data
    status !== null &&
    // Update is available
    status.updateAvailable &&
    // Latest version exists
    status.latestVersion !== null &&
    // Should show notification (server-side calculation based on preferences)
    status.shouldShowNotification === true;

  return {
    status,
    preferences,
    loading,
    error,
    shouldShowBanner,
    dismissCurrentVersion,
    remindLater,
    toggleNotifications,
    refreshStatus,
  };
}
