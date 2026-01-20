import type { SessionStorageStats } from '../../api';

interface Props {
  stats: SessionStorageStats;
}

export function SessionStorageCard({ stats }: Props) {
  const statusConfig = {
    connected: {
      label: 'Connected',
      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    disconnected: {
      label: 'Disconnected',
      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ),
    },
    unknown: {
      label: 'Unknown',
      color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  };

  const config = statusConfig[stats.status];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7 14h2m6 0h2" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">Session Storage</h3>
            <p className="text-xs text-muted-foreground">WhatsApp auth state</p>
          </div>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 ${config.color}`}
        >
          {config.icon}
          {config.label}
        </span>
      </div>

      <div className="space-y-3">
        {/* Existence status */}
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">Session exists</span>
          <span
            className={`text-sm font-medium ${stats.exists ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {stats.exists ? 'Yes' : 'No'}
          </span>
        </div>

        {/* Path */}
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">Path</span>
          <code
            className="text-xs bg-secondary px-2 py-1 rounded truncate max-w-[200px]"
            title={stats.path}
          >
            {stats.path || 'N/A'}
          </code>
        </div>

        {/* Size */}
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">Size</span>
          <span className="text-sm font-mono font-semibold">
            {stats.sizeMB > 0 ? `${stats.sizeMB.toFixed(2)} MB` : 'N/A'}
          </span>
        </div>

        {/* Last modified */}
        {stats.lastModified && (
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Last modified</span>
            <span className="text-sm">{new Date(stats.lastModified).toLocaleString()}</span>
          </div>
        )}
      </div>

      {!stats.exists && (
        <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Session directory not found. WhatsApp may need to be paired.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
