import { useVersionCheck } from '../../hooks/useVersionCheck';

export function UpdatesPage() {
  const { status, preferences, loading, error, toggleNotifications, refreshStatus } =
    useVersionCheck();

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Updates</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage version update notifications.</p>
      </div>

      {/* Current Version Card */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-foreground mb-4">Version Information</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Current Version</span>
            <span className="text-sm font-mono font-medium text-foreground">
              {loading ? '...' : status?.currentVersion || 'Unknown'}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Latest Version</span>
            <span className="text-sm font-mono font-medium text-foreground">
              {loading
                ? '...'
                : status?.latestVersion || (status?.error ? 'Unable to check' : 'Unknown')}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Last Checked</span>
            <span className="text-sm text-foreground">
              {loading ? '...' : formatDate(status?.lastChecked || null)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Status</span>
            {loading ? (
              <span className="text-sm text-muted-foreground">Checking...</span>
            ) : status?.updateAvailable ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
                Update Available
              </span>
            ) : status?.error ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
                Check Failed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Up to Date
              </span>
            )}
          </div>
        </div>

        {/* Check Now Button */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={refreshStatus}
            disabled={loading}
            className="btn btn-secondary"
          >
            {loading ? 'Checking...' : 'Check Now'}
          </button>

          {status?.changelogUrl && (
            <a
              href={status.changelogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost inline-flex items-center gap-1.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" x2="21" y1="14" y2="3" />
              </svg>
              View Changelog
            </a>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {/* Notification Preferences Card */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-foreground mb-4">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Configure how you receive notifications about new Orient versions.
        </p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Show a banner when a new version is available
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={preferences?.notificationsEnabled ?? true}
              onChange={(e) => toggleNotifications(e.target.checked)}
              disabled={loading}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
          </label>
        </div>

        {preferences?.dismissedVersions && preferences.dismissedVersions.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Dismissed versions: {preferences.dismissedVersions.join(', ')}
            </p>
          </div>
        )}

        {preferences?.remindLaterUntil && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Notifications snoozed until: {formatDate(preferences.remindLaterUntil)}
            </p>
          </div>
        )}
      </div>

      {/* Update Instructions Card */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-foreground mb-4">How to Update</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Orient runs via Docker Compose. To update to the latest version:
        </p>

        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>
            Pull the latest changes:{' '}
            <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">git pull</code>
          </li>
          <li>
            Rebuild the containers:{' '}
            <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">docker-compose build</code>
          </li>
          <li>
            Restart the services:{' '}
            <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">docker-compose up -d</code>
          </li>
        </ol>

        <p className="text-xs text-muted-foreground mt-4">
          For detailed instructions and release notes, visit the{' '}
          <a
            href="https://github.com/orient-bot/orient/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            GitHub releases page
          </a>
          .
        </p>
      </div>
    </div>
  );
}
