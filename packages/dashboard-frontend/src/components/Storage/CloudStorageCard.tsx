import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';
import type { CloudStorageStats } from '../../api';

interface Props {
  stats: CloudStorageStats;
}

export function CloudStorageCard({ stats }: Props) {
  const cloudflare = stats.cloudflare;
  const google = stats.google;
  const anyConfigured = cloudflare.available || google.available;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-orange-600 dark:text-orange-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">Cloud Storage</h3>
            <p className="text-xs text-muted-foreground">R2 and Google Cloud</p>
          </div>
        </div>
        <Link
          to={ROUTES.BILLING}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          View Billing
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </Link>
      </div>

      <div className="space-y-3">
        {/* Cloudflare R2 */}
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 6.5l-3.5 3.5 3.5 3.5 1.5-1.5-2-2 2-2zM7.5 6.5l-1.5 1.5 2 2-2 2 1.5 1.5 3.5-3.5z" />
              </svg>
              <span className="text-sm font-medium">Cloudflare R2</span>
            </div>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                cloudflare.available
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
              }`}
            >
              {cloudflare.available ? 'Active' : 'Not configured'}
            </span>
          </div>
          {cloudflare.available ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Storage used</span>
              <span className="text-sm font-mono font-semibold">
                {cloudflare.storageGB !== undefined
                  ? `${cloudflare.storageGB.toFixed(2)} GB`
                  : 'N/A'}
              </span>
            </div>
          ) : cloudflare.error ? (
            <p className="text-xs text-red-600 dark:text-red-400">{cloudflare.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Configure in Settings to enable</p>
          )}
        </div>

        {/* Google Cloud */}
        <div className="p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.65 4.34a4.87 4.87 0 0 1 3.85 3.15l2.02.47a7.34 7.34 0 0 0-14.04-.01l2.02-.47a4.87 4.87 0 0 1 6.15-3.14zm-6.88 5.2l-1.66.7a5.2 5.2 0 0 0 9.78 0l-1.66-.7a3.47 3.47 0 0 1-6.46 0z" />
                <path d="M6.5 11.5v5.54a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V11.5" />
              </svg>
              <span className="text-sm font-medium">Google Cloud</span>
            </div>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                google.available
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
              }`}
            >
              {google.available ? 'Active' : 'Not configured'}
            </span>
          </div>
          {google.available ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Storage used</span>
              <span className="text-sm font-mono font-semibold">
                {google.storageGB !== undefined ? `${google.storageGB.toFixed(2)} GB` : 'N/A'}
              </span>
            </div>
          ) : google.error ? (
            <p className="text-xs text-red-600 dark:text-red-400">{google.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Configure in Settings to enable</p>
          )}
        </div>
      </div>

      {!anyConfigured && (
        <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                Cloud storage is not configured.
              </p>
              <Link
                to={ROUTES.SETTINGS}
                className="text-sm text-blue-600 dark:text-blue-300 hover:underline"
              >
                Configure in Settings
              </Link>
            </div>
          </div>
        </div>
      )}

      {anyConfigured && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total cloud storage</span>
            <span className="font-mono font-semibold">
              {((cloudflare.storageGB || 0) + (google.storageGB || 0)).toFixed(2)} GB
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
