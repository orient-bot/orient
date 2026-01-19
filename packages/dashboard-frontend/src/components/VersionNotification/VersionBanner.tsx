import { useState } from 'react';
import type { VersionCheckResult } from '../../api';

interface VersionBannerProps {
  status: VersionCheckResult;
  onDismiss: () => Promise<void>;
  onRemindLater: (hours: 1 | 24 | 168) => Promise<void>;
}

export function VersionBanner({ status, onDismiss, onRemindLater }: VersionBannerProps) {
  const [isRemindDropdownOpen, setIsRemindDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!status.updateAvailable || !status.latestVersion) {
    return null;
  }

  const handleDismiss = async () => {
    setIsLoading(true);
    try {
      await onDismiss();
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemindLater = async (hours: 1 | 24 | 168) => {
    setIsLoading(true);
    setIsRemindDropdownOpen(false);
    try {
      await onRemindLater(hours);
    } finally {
      setIsLoading(false);
    }
  };

  const remindOptions = [
    { hours: 1 as const, label: 'In 1 hour' },
    { hours: 24 as const, label: 'In 1 day' },
    { hours: 168 as const, label: 'In 1 week' },
  ];

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500 px-4 py-3 mb-4 rounded-r-lg">
      <div className="flex items-center justify-between gap-4">
        {/* Info Icon and Message */}
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-600 dark:text-blue-400"
            >
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              New version available: {status.currentVersion} → {status.latestVersion}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* View Changelog Button */}
          <a
            href={status.changelogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900 rounded-md transition-colors"
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

          {/* Remind Later Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRemindDropdownOpen(!isRemindDropdownOpen)}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
            >
              Remind Later
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
                className={`transition-transform ${isRemindDropdownOpen ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {isRemindDropdownOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10">
                {remindOptions.map((option) => (
                  <button
                    key={option.hours}
                    type="button"
                    onClick={() => handleRemindLater(option.hours)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 first:rounded-t-md last:rounded-b-md"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dismiss Button */}
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isLoading}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="Dismiss"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {isRemindDropdownOpen && (
        <div className="fixed inset-0 z-0" onClick={() => setIsRemindDropdownOpen(false)} />
      )}
    </div>
  );
}
