/**
 * PromptEditor Component
 *
 * Modal for editing prompt text.
 */

import { useState, useEffect } from 'react';
import type { PromptPlatform, DefaultPrompts } from '../../api';

export interface EditingPrompt {
  platform: PromptPlatform;
  chatId: string;
  promptText: string;
  displayName?: string;
  isDefault: boolean;
  isNew?: boolean;
}

interface PromptEditorProps {
  prompt: EditingPrompt;
  embeddedDefaults: DefaultPrompts | null;
  saving: boolean;
  onSave: (promptText: string) => void;
  onClose: () => void;
}

export function PromptEditor({
  prompt,
  embeddedDefaults,
  saving,
  onSave,
  onClose,
}: PromptEditorProps) {
  const [promptText, setPromptText] = useState(prompt.promptText);

  useEffect(() => {
    setPromptText(prompt.promptText);
  }, [prompt.promptText]);

  const handleResetToEmbedded = () => {
    if (embeddedDefaults) {
      setPromptText(embeddedDefaults[prompt.platform]);
    }
  };

  const handleSave = () => {
    onSave(promptText);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        <div className="relative bg-card rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-border animate-scale-in">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {prompt.isDefault ? 'Edit Default Prompt' : 'Edit Custom Prompt'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {prompt.displayName}
                {!prompt.isDefault && (
                  <span className="ml-2 font-mono text-xs">({prompt.chatId})</span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                System Prompt
              </label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={16}
                className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Enter the system prompt..."
              />
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{promptText.length.toLocaleString()} characters</span>
                {prompt.isDefault && embeddedDefaults && (
                  <button onClick={handleResetToEmbedded} className="text-primary hover:underline">
                    Reset to original default
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
            <button onClick={onClose} className="btn btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn btn-primary"
              disabled={saving || !promptText.trim()}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Saving...
                </span>
              ) : prompt.isNew ? (
                'Create Prompt'
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
