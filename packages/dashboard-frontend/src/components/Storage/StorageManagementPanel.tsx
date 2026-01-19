import { useState } from 'react';
import { previewStorageCleanup, cleanupOldMessages, type CleanupPreview } from '../../api';

interface Props {
  onRefresh: () => void;
}

export function StorageManagementPanel({ onRefresh }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [cleanupDate, setCleanupDate] = useState<string>(() => {
    // Default to 90 days ago
    const date = new Date();
    date.setDate(date.getDate() - 90);
    return date.toISOString().split('T')[0];
  });
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!cleanupDate) return;

    setLoadingPreview(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await previewStorageCleanup(cleanupDate);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview cleanup');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCleanup = async () => {
    if (!cleanupDate || !preview || preview.messagesCount === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${preview.messagesCount.toLocaleString()} messages from before ${cleanupDate}?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setCleaning(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await cleanupOldMessages(cleanupDate);
      if (result.success) {
        setSuccess(`Successfully deleted ${result.deletedCount.toLocaleString()} messages`);
        setPreview(null);
        onRefresh();
      } else {
        setError(result.error || 'Failed to delete messages');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cleanup messages');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-red-600 dark:text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">Manage Storage</h3>
            <p className="text-xs text-muted-foreground">Clean up old data and free up space</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="p-5 pt-0 space-y-4">
          {/* Delete old messages */}
          <div className="p-4 rounded-lg border border-border">
            <h4 className="font-medium mb-3">Delete Old Messages</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Remove messages older than a specific date to free up database space.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Delete messages before
                </label>
                <input
                  type="date"
                  value={cleanupDate}
                  onChange={(e) => {
                    setCleanupDate(e.target.value);
                    setPreview(null);
                    setSuccess(null);
                    setError(null);
                  }}
                  max={new Date().toISOString().split('T')[0]}
                  className="input w-full"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={handlePreview}
                  disabled={loadingPreview || !cleanupDate}
                  className="btn btn-secondary"
                >
                  {loadingPreview ? (
                    <span className="spinner w-4 h-4" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                  Preview
                </button>
              </div>
            </div>

            {/* Preview results */}
            {preview && (
              <div className="mt-4 p-3 rounded-lg bg-secondary">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Messages to delete</span>
                  <span
                    className={`text-lg font-mono font-bold ${
                      preview.messagesCount > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {preview.messagesCount.toLocaleString()}
                  </span>
                </div>
                {preview.messagesCount > 0 && (
                  <>
                    {preview.oldestMessage && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Oldest message</span>
                        <span>{new Date(preview.oldestMessage).toLocaleDateString()}</span>
                      </div>
                    )}
                    {preview.newestAffected && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Newest affected</span>
                        <span>{new Date(preview.newestAffected).toLocaleDateString()}</span>
                      </div>
                    )}
                    <button
                      onClick={handleCleanup}
                      disabled={cleaning}
                      className="btn btn-destructive w-full mt-3"
                    >
                      {cleaning ? (
                        <>
                          <span className="spinner w-4 h-4" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                          Delete {preview.messagesCount.toLocaleString()} Messages
                        </>
                      )}
                    </button>
                  </>
                )}
                {preview.messagesCount === 0 && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    No messages found before this date.
                  </p>
                )}
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              </div>
            )}

            {/* Success message */}
            {success && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p>
                </div>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
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
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">Caution</p>
                <p className="text-amber-700 dark:text-amber-400">
                  Deleted data cannot be recovered. Make sure you have backups before performing
                  cleanup operations.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
