/**
 * MiniAppEditorModal
 *
 * Main modal for AI-powered miniapp editing.
 * Integrates prompt input, code generation, preview, and rollback functionality.
 */

import { useState, useEffect } from 'react';
import { X, Sparkles, ExternalLink, Check } from 'lucide-react';
import AppEditorForm from './AppEditorForm';
import GenerationProgress from './GenerationProgress';
import PreviewPanel from './PreviewPanel';
import { editApp, getHistory, rollbackToCommit, closeSession } from '../../api';

interface MiniAppEditorModalProps {
  appName: string;
  createNew?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface EditSession {
  sessionId: string;
  portalUrl: string;
  commitHash: string;
  buildSuccess: boolean;
}

interface Commit {
  hash: string;
  message: string;
  timestamp: Date;
  filesChanged: string[];
  buildSuccess: boolean;
}

export default function MiniAppEditorModal({
  appName,
  createNew = false,
  onClose,
  onSuccess,
}: MiniAppEditorModalProps) {
  const [session, setSession] = useState<EditSession | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [buildStatus, setBuildStatus] = useState<{
    success: boolean;
    output: string;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load commit history when session is established
  useEffect(() => {
    if (session) {
      loadHistory();
    }
  }, [session]);

  const loadHistory = async () => {
    if (!session) return;
    try {
      const response = await getHistory(appName, session.sessionId);
      if (response.success) {
        setCommits(response.commits);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const handleSubmitPrompt = async (prompt: string) => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await editApp(appName, prompt, createNew, session?.sessionId);

      if (response.success) {
        setSession({
          sessionId: response.sessionId,
          portalUrl: response.portalUrl,
          commitHash: response.commitHash,
          buildSuccess: response.buildStatus.success,
        });
        setBuildStatus(response.buildStatus);

        // Reload history after successful edit
        setTimeout(() => loadHistory(), 500);
      } else {
        setError(response.error || 'Failed to generate code');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRollback = async (commitHash: string) => {
    if (!session) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await rollbackToCommit(appName, session.sessionId, commitHash);
      if (response.success) {
        // Update current commit
        setSession({ ...session, commitHash });
        // Reload preview by reloading history
        loadHistory();
      } else {
        setError(response.error || 'Failed to rollback');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAcceptAndClose = async () => {
    if (!session) {
      onClose();
      return;
    }

    try {
      // Skip PR creation on localhost - merge directly instead
      const isLocalhost =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const shouldMerge = !isLocalhost; // Only create PR in production

      await closeSession(appName, session.sessionId, shouldMerge);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close session');
    }
  };

  const handleDiscard = async () => {
    if (session) {
      try {
        await closeSession(appName, session.sessionId, false); // merge=false just cleanup
      } catch (err) {
        console.error('Failed to cleanup session:', err);
      }
    }
    onClose();
  };

  const handleOpenInOpenCode = () => {
    if (session) {
      window.open(session.portalUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {createNew ? 'Create New App' : `Edit ${appName}`}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI-powered code generation with OpenCode
              </p>
            </div>
          </div>
          <button onClick={handleDiscard} className="text-muted-foreground hover:text-foreground">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left Panel: Form & Progress */}
          <div className="w-full md:w-1/2 p-6 border-r border-border overflow-y-auto">
            <AppEditorForm
              onSubmit={handleSubmitPrompt}
              disabled={isGenerating}
              initialPrompt={createNew ? '' : undefined}
            />

            {isGenerating && <GenerationProgress />}

            {error && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {buildStatus && (
              <div
                className={`mt-4 p-4 rounded-lg ${
                  buildStatus.success
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    buildStatus.success
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {buildStatus.success ? '✓ Build successful' : '✗ Build failed'}
                </p>
                {buildStatus.error && (
                  <pre className="mt-2 text-xs text-red-600 dark:text-red-400 overflow-x-auto">
                    {buildStatus.error}
                  </pre>
                )}
              </div>
            )}

            {session && (
              <div className="mt-6 pt-6 border-t border-border">
                <button
                  onClick={handleOpenInOpenCode}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/90"
                >
                  <ExternalLink className="h-4 w-4" />
                  Continue editing in OpenCode
                </button>
              </div>
            )}
          </div>

          {/* Right Panel: Preview */}
          <div className="w-full md:w-1/2 p-6 overflow-y-auto">
            {session ? (
              <PreviewPanel
                appName={appName}
                currentCommit={session.commitHash}
                commits={commits}
                onRollback={handleRollback}
                onRebuild={loadHistory}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                <div className="text-center">
                  <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Enter a prompt to start generating code</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border">
          <div className="text-sm text-muted-foreground">
            {session && (
              <>
                Session:{' '}
                <span className="font-mono text-xs">{session.sessionId.slice(0, 16)}...</span>
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={handleDiscard} className="btn btn-ghost">
              Discard
            </button>
            <button
              onClick={handleAcceptAndClose}
              disabled={!session || isGenerating}
              className="btn btn-primary flex items-center gap-2"
            >
              <Check className="h-4 w-4" />
              Accept & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
