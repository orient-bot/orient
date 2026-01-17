/**
 * PreviewPanel
 *
 * Shows app preview in iframe with rollback controls and build status.
 */

import { useState } from 'react';
import { RotateCcw, RefreshCw, ExternalLink, GitCommit, CheckCircle, XCircle } from 'lucide-react';

interface Commit {
  hash: string;
  message: string;
  timestamp: Date;
  filesChanged: string[];
  buildSuccess: boolean;
}

interface PreviewPanelProps {
  appName: string;
  currentCommit: string;
  commits: Commit[];
  onRollback: (commitHash: string) => void;
  onRebuild: () => void;
}

export default function PreviewPanel({
  appName,
  currentCommit,
  commits,
  onRollback,
  onRebuild,
}: PreviewPanelProps) {
  const [selectedCommit, setSelectedCommit] = useState(currentCommit);
  const [showCommits, setShowCommits] = useState(false);

  const previewUrl = `/apps/${appName}/`;

  const handleRollback = () => {
    if (selectedCommit !== currentCommit) {
      onRollback(selectedCommit);
    }
  };

  const formatDate = (timestamp: Date) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onRebuild}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Rebuild
          </button>

          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open in New Tab
          </a>
        </div>

        {/* Rollback Controls */}
        {commits.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowCommits(!showCommits)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <div className="flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {commits.length} commit{commits.length !== 1 ? 's' : ''}
                </span>
              </div>
              <RotateCcw className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>

            {showCommits && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto z-10">
                {commits.map((commit) => (
                  <button
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit.hash)}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                      selectedCommit === commit.hash ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {commit.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(commit.timestamp)}
                          </p>
                          {commit.buildSuccess ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {commit.filesChanged.length} file{commit.filesChanged.length !== 1 ? 's' : ''} changed
                        </p>
                      </div>
                      {selectedCommit === commit.hash && (
                        <div className="w-2 h-2 bg-purple-500 rounded-full" />
                      )}
                    </div>
                  </button>
                ))}
                <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => {
                      handleRollback();
                      setShowCommits(false);
                    }}
                    disabled={selectedCommit === currentCommit}
                    className="w-full px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Rollback to Selected
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current Commit Info */}
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">Current commit</p>
          <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mt-1">
            {currentCommit.substring(0, 8)}
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <iframe
          src={previewUrl}
          className="w-full h-full"
          title={`Preview of ${appName}`}
        />
      </div>
    </div>
  );
}
