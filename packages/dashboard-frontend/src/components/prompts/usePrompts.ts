/**
 * usePrompts Hook
 *
 * Hook for managing prompt state and API calls.
 * Provides loading, error handling, caching, and refresh functionality.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listPrompts,
  getDefaultPrompts,
  getEmbeddedDefaults,
  updateDefaultPrompt,
  setPromptForChat,
  deletePromptForChat,
  discoverChats,
  getChats,
  getSlackChannels,
  subscribeToRefresh,
  type SystemPromptWithInfo,
  type PromptPlatform,
  type DefaultPrompts,
} from '../../api';

export interface ChatOption {
  id: string;
  name: string;
  platform: PromptPlatform;
}

export interface UsePromptsOptions {
  platform?: PromptPlatform;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onUpdate?: () => void;
}

export interface UsePromptsResult {
  // Data
  prompts: SystemPromptWithInfo[];
  customPrompts: SystemPromptWithInfo[];
  defaults: DefaultPrompts | null;
  embeddedDefaults: DefaultPrompts | null;

  // Loading states
  loading: boolean;
  loadingChats: boolean;
  saving: boolean;

  // Error state
  error: string | null;
  clearError: () => void;

  // Actions
  refresh: () => Promise<void>;
  loadAvailableChats: (platform: PromptPlatform) => Promise<ChatOption[]>;
  updateDefault: (platform: PromptPlatform, promptText: string) => Promise<void>;
  setCustomPrompt: (platform: PromptPlatform, chatId: string, promptText: string) => Promise<void>;
  deleteCustomPrompt: (platform: PromptPlatform, chatId: string) => Promise<void>;
}

export function usePrompts(options: UsePromptsOptions = {}): UsePromptsResult {
  const { platform, autoRefresh = true, refreshInterval = 30000, onUpdate } = options;

  const [prompts, setPrompts] = useState<SystemPromptWithInfo[]>([]);
  const [defaults, setDefaults] = useState<DefaultPrompts | null>(null);
  const [embeddedDefaults, setEmbeddedDefaults] = useState<DefaultPrompts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [promptsData, defaultsData, embeddedData] = await Promise.all([
        listPrompts(platform),
        getDefaultPrompts(),
        getEmbeddedDefaults(),
      ]);

      setPrompts(promptsData);
      setDefaults(defaultsData);
      setEmbeddedDefaults(embeddedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoading(false);
    }
  }, [platform]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to refresh events (e.g., when onboarder updates prompts)
  useEffect(() => {
    const unsubscribe = subscribeToRefresh('prompts', () => {
      console.log('[usePrompts] Refresh triggered, reloading data...');
      refresh();
    });
    return unsubscribe;
  }, [refresh]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (!document.hidden) {
        console.log('[usePrompts] Polling for updates...');
        refresh();
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refresh]);

  const loadAvailableChats = useCallback(
    async (targetPlatform: PromptPlatform): Promise<ChatOption[]> => {
      setLoadingChats(true);
      try {
        const chats: ChatOption[] = [];
        const existingPromptChatIds = new Set(prompts.map((p) => `${p.platform}:${p.chatId}`));

        if (targetPlatform === 'whatsapp') {
          const [{ chats: configuredChats }, { chats: discoveredChats }] = await Promise.all([
            getChats(),
            discoverChats(),
          ]);

          const allChats = [...configuredChats, ...discoveredChats];
          const seenIds = new Set<string>();

          for (const chat of allChats) {
            if (seenIds.has(chat.chatId)) continue;
            if (existingPromptChatIds.has(`whatsapp:${chat.chatId}`)) continue;

            seenIds.add(chat.chatId);
            chats.push({
              id: chat.chatId,
              name: chat.displayName || chat.chatId,
              platform: 'whatsapp',
            });
          }
        } else {
          const { channels } = await getSlackChannels();
          for (const channel of channels) {
            if (!existingPromptChatIds.has(`slack:${channel.channelId}`)) {
              chats.push({
                id: channel.channelId,
                name: channel.channelName || channel.channelId,
                platform: 'slack',
              });
            }
          }
        }

        // Sort: chats with names first, then by name
        chats.sort((a, b) => {
          const aHasName = a.name !== a.id;
          const bHasName = b.name !== b.id;
          if (aHasName && !bHasName) return -1;
          if (!aHasName && bHasName) return 1;
          return a.name.localeCompare(b.name);
        });

        return chats;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chats');
        return [];
      } finally {
        setLoadingChats(false);
      }
    },
    [prompts]
  );

  const updateDefault = useCallback(
    async (targetPlatform: PromptPlatform, promptText: string) => {
      try {
        setSaving(true);
        await updateDefaultPrompt(targetPlatform, promptText);
        await refresh();
        onUpdate?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save prompt');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [refresh, onUpdate]
  );

  const setCustomPrompt = useCallback(
    async (targetPlatform: PromptPlatform, chatId: string, promptText: string) => {
      try {
        setSaving(true);
        await setPromptForChat(targetPlatform, chatId, promptText);
        await refresh();
        onUpdate?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save prompt');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [refresh, onUpdate]
  );

  const deleteCustomPrompt = useCallback(
    async (targetPlatform: PromptPlatform, chatId: string) => {
      try {
        await deletePromptForChat(targetPlatform, chatId);
        await refresh();
        onUpdate?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete prompt');
        throw err;
      }
    },
    [refresh, onUpdate]
  );

  const customPrompts = prompts.filter((p) => !p.isDefault);

  return {
    prompts,
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
  };
}

export type { SystemPromptWithInfo, PromptPlatform, DefaultPrompts };
