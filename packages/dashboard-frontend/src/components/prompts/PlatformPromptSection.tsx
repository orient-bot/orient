/**
 * PlatformPromptSection Component
 *
 * Main container showing default + custom prompts for a specific platform.
 * Designed to be embedded in WhatsApp and Slack service pages.
 */

import { useState, useCallback } from 'react';
import { usePrompts, type ChatOption } from './usePrompts';
import { PromptCard } from './PromptCard';
import { PromptEditor, type EditingPrompt } from './PromptEditor';
import { ChatPromptSelector } from './ChatPromptSelector';
import type { PromptPlatform, SystemPromptWithInfo } from '../../api';

interface PlatformPromptSectionProps {
  platform: PromptPlatform;
  onUpdate?: () => void;
}

export function PlatformPromptSection({ platform, onUpdate }: PlatformPromptSectionProps) {
  const {
    customPrompts,
    defaults,
    embeddedDefaults,
    loading,
    loadingChats,
    saving,
    error,
    clearError,
    refresh,
    loadAvailableChats,
    updateDefault,
    setCustomPrompt,
    deleteCustomPrompt,
  } = usePrompts({ platform, onUpdate });

  const [editingPrompt, setEditingPrompt] = useState<EditingPrompt | null>(null);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [availableChats, setAvailableChats] = useState<ChatOption[]>([]);
  const [selectorPlatform, setSelectorPlatform] = useState<PromptPlatform>(platform);

  // Get prompts for this platform
  const platformCustomPrompts = customPrompts.filter((p) => p.platform === platform);

  const handleEditDefault = () => {
    if (!defaults) return;
    setEditingPrompt({
      platform,
      chatId: '*',
      promptText: defaults[platform],
      displayName: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Default`,
      isDefault: true,
    });
  };

  const handleEditCustom = (prompt: SystemPromptWithInfo) => {
    setEditingPrompt({
      platform: prompt.platform,
      chatId: prompt.chatId,
      promptText: prompt.promptText,
      displayName: prompt.displayName || prompt.chatId,
      isDefault: false,
    });
  };

  const handleOpenChatSelector = useCallback(async () => {
    setShowChatSelector(true);
    setSelectorPlatform(platform);
    const chats = await loadAvailableChats(platform);
    setAvailableChats(chats);
  }, [platform, loadAvailableChats]);

  const handlePlatformChange = useCallback(
    async (newPlatform: PromptPlatform) => {
      setSelectorPlatform(newPlatform);
      const chats = await loadAvailableChats(newPlatform);
      setAvailableChats(chats);
    },
    [loadAvailableChats]
  );

  const handleSelectChat = (chat: ChatOption) => {
    if (!defaults) return;

    setShowChatSelector(false);
    setEditingPrompt({
      platform: chat.platform,
      chatId: chat.id,
      promptText: defaults[chat.platform],
      displayName: chat.name,
      isDefault: false,
      isNew: true,
    });
  };

  const handleSave = async (promptText: string) => {
    if (!editingPrompt) return;

    try {
      if (editingPrompt.isDefault) {
        await updateDefault(editingPrompt.platform, promptText);
      } else {
        await setCustomPrompt(editingPrompt.platform, editingPrompt.chatId, promptText);
      }
      setEditingPrompt(null);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleDelete = async (promptPlatform: PromptPlatform, chatId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this custom prompt? The chat will revert to using the platform default.'
      )
    ) {
      return;
    }

    try {
      await deleteCustomPrompt(promptPlatform, chatId);
    } catch {
      // Error is handled by the hook
    }
  };

  if (loading && !defaults) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={clearError} className="ml-2 underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Default Prompt */}
      {defaults && (
        <PromptCard
          platform={platform}
          promptText={defaults[platform]}
          isDefault={true}
          onEdit={handleEditDefault}
        />
      )}

      {/* Custom Prompts Section */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-foreground">Custom Prompts</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="btn btn-ghost h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Refresh"
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            <button
              onClick={handleOpenChatSelector}
              className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Custom
            </button>
          </div>
        </div>

        {platformCustomPrompts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center bg-muted/30 rounded-lg">
            All {platform === 'whatsapp' ? 'chats' : 'channels'} use the default prompt.
          </p>
        ) : (
          <div className="space-y-2">
            {platformCustomPrompts.map((prompt) => (
              <div
                key={`${prompt.platform}-${prompt.chatId}`}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">
                    {prompt.displayName || prompt.chatId}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {prompt.chatId}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleEditCustom(prompt)}
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(prompt.platform, prompt.chatId)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingPrompt && (
        <PromptEditor
          prompt={editingPrompt}
          embeddedDefaults={embeddedDefaults}
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditingPrompt(null)}
        />
      )}

      {/* Chat Selector Modal */}
      {showChatSelector && (
        <ChatPromptSelector
          platform={selectorPlatform}
          availableChats={availableChats}
          loadingChats={loadingChats}
          onSelectChat={handleSelectChat}
          onPlatformChange={handlePlatformChange}
          onClose={() => setShowChatSelector(false)}
        />
      )}
    </div>
  );
}
