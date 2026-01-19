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
          <button onClick={onRebuild} className="btn btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4" />
            Rebuild
          </button>

          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary flex items-center gap-2 text-sm"
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
              className="w-full btn btn-secondary flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <GitCommit className="h-4 w-4" />
                <span className="text-sm">
                  {commits.length} commit{commits.length !== 1 ? 's' : ''}
                </span>
              </div>
              <RotateCcw className="h-4 w-4" />
            </button>

            {showCommits && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto z-10">
                {commits.map((commit) => (
                  <button
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit.hash)}
                    className={`w-full px-3 py-2 text-left hover:bg-accent border-b border-border last:border-b-0 ${
                      selectedCommit === commit.hash ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">
                          {commit.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground">
                            {formatDate(commit.timestamp)}
                          </p>
                          {commit.buildSuccess ? (
                            <CheckCircle className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-destructive" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {commit.filesChanged.length} file
                          {commit.filesChanged.length !== 1 ? 's' : ''} changed
                        </p>
                      </div>
                      {selectedCommit === commit.hash && (
                        <div className="w-2 h-2 bg-primary rounded-full" />
                      )}
                    </div>
                  </button>
                ))}
                <div className="p-2 border-t border-border">
                  <button
                    onClick={() => {
                      handleRollback();
                      setShowCommits(false);
                    }}
                    disabled={selectedCommit === currentCommit}
                    className="btn btn-primary w-full text-sm"
                  >
                    Rollback to Selected
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current Commit Info */}
        <div className="px-3 py-2 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground">Current commit</p>
          <p className="text-sm font-mono text-card-foreground mt-1">
            {currentCommit.substring(0, 8)}
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 border-2 border-border rounded-lg overflow-hidden bg-card">
        <iframe src={previewUrl} className="w-full h-full" title={`Preview of ${appName}`} />
      </div>
    </div>
  );
}
