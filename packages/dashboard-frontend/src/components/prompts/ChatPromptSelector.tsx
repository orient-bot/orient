/**
 * ChatPromptSelector Component
 *
 * Modal for selecting a chat to customize its prompt.
 */

import { useState, useEffect } from 'react';
import type { PromptPlatform } from '../../api';
import type { ChatOption } from './usePrompts';

interface ChatPromptSelectorProps {
  platform: PromptPlatform;
  availableChats: ChatOption[];
  loadingChats: boolean;
  onSelectChat: (chat: ChatOption) => void;
  onPlatformChange: (platform: PromptPlatform) => void;
  onClose: () => void;
}

export function ChatPromptSelector({
  platform,
  availableChats,
  loadingChats,
  onSelectChat,
  onPlatformChange,
  onClose,
}: ChatPromptSelectorProps) {
  const [selectedChat, setSelectedChat] = useState<ChatOption | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Reset selection when platform changes
  useEffect(() => {
    setSelectedChat(null);
    setSearchQuery('');
  }, [platform]);

  const filteredChats = availableChats.filter((chat) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return chat.name.toLowerCase().includes(query) || chat.id.toLowerCase().includes(query);
  });

  const handleNext = () => {
    if (selectedChat) {
      onSelectChat(selectedChat);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        <div className="relative bg-card rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden border border-border animate-scale-in">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Create Custom Prompt</h2>
              <p className="text-sm text-muted-foreground">
                Select a chat to customize its system prompt
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
            {/* Platform Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">Platform</label>
              <div className="flex gap-2">
                <button
                  onClick={() => onPlatformChange('whatsapp')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                    platform === 'whatsapp'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  </svg>
                  WhatsApp
                </button>
                <button
                  onClick={() => onPlatformChange('slack')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                    platform === 'slack'
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                  </svg>
                  Slack
                </button>
              </div>
            </div>

            {/* Chat Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                Select {platform === 'whatsapp' ? 'Chat/Group' : 'Channel'}
              </label>

              {loadingChats ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
                </div>
              ) : availableChats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg">
                  <p className="text-sm">
                    No {platform === 'whatsapp' ? 'chats' : 'channels'} available.
                    <br />
                    All existing chats may already have custom prompts.
                  </p>
                </div>
              ) : (
                <>
                  {/* Search Input */}
                  <div className="relative mb-2">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Search ${platform === 'whatsapp' ? 'chats' : 'channels'}...`}
                      className="w-full pl-10 pr-4 py-2 border border-border bg-background text-foreground rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Chat List */}
                  <div className="max-h-64 overflow-y-auto border border-border rounded-lg bg-background">
                    {filteredChats.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <p className="text-sm">No matches for "{searchQuery}"</p>
                      </div>
                    ) : (
                      filteredChats.map((chat) => (
                        <button
                          key={chat.id}
                          onClick={() => setSelectedChat(chat)}
                          className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${
                            selectedChat?.id === chat.id ? 'bg-primary/10 border-primary/20' : ''
                          }`}
                        >
                          <div className="font-medium text-foreground text-sm">{chat.name}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {chat.id}
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  {/* Result count */}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {filteredChats.length} of {availableChats.length}{' '}
                    {platform === 'whatsapp' ? 'chats' : 'channels'}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
            <button onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button onClick={handleNext} className="btn btn-primary" disabled={!selectedChat}>
              Next: Edit Prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
