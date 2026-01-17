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
} from '../api';

interface SystemPromptsProps {
  onUpdate?: () => void;
}

type ViewMode = 'defaults' | 'custom';

interface EditingPrompt {
  platform: PromptPlatform;
  chatId: string;
  promptText: string;
  displayName?: string;
  isDefault: boolean;
  isNew?: boolean;
}

interface ChatOption {
  id: string;
  name: string;
  platform: PromptPlatform;
}

export default function SystemPrompts({ onUpdate }: SystemPromptsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('defaults');
  const [platformFilter, setPlatformFilter] = useState<PromptPlatform | 'all'>('all');
  const [prompts, setPrompts] = useState<SystemPromptWithInfo[]>([]);
  const [defaults, setDefaults] = useState<DefaultPrompts | null>(null);
  const [embeddedDefaults, setEmbeddedDefaults] = useState<DefaultPrompts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<EditingPrompt | null>(null);
  const [saving, setSaving] = useState(false);
  
  // New prompt creation state
  const [showNewPromptModal, setShowNewPromptModal] = useState(false);
  const [availableChats, setAvailableChats] = useState<ChatOption[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [selectedChatForNew, setSelectedChatForNew] = useState<ChatOption | null>(null);
  const [newPlatform, setNewPlatform] = useState<PromptPlatform>('whatsapp');
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // Memoize loadData to use in effects
  const loadDataCallback = useCallback(() => {
    loadData();
  }, [platformFilter]);

  useEffect(() => {
    loadDataCallback();
  }, [loadDataCallback]);

  // Subscribe to refresh events (e.g., when onboarder updates prompts)
  useEffect(() => {
    const unsubscribe = subscribeToRefresh('prompts', () => {
      console.log('[SystemPrompts] Refresh triggered, reloading data...');
      loadData();
    });
    return unsubscribe;
  }, []);

  // Poll for updates every 30 seconds when visible (fallback for external changes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        console.log('[SystemPrompts] Polling for updates...');
        loadData();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [platformFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [promptsData, defaultsData, embeddedData] = await Promise.all([
        listPrompts(platformFilter === 'all' ? undefined : platformFilter),
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
  };

  const loadAvailableChats = async (platform: PromptPlatform) => {
    setLoadingChats(true);
    try {
      const chats: ChatOption[] = [];
      const existingPromptChatIds = new Set(prompts.map(p => `${p.platform}:${p.chatId}`));
      
      if (platform === 'whatsapp') {
        // Get BOTH chats with permissions AND discovered chats
        const [{ chats: configuredChats }, { chats: discoveredChats }] = await Promise.all([
          getChats(),
          discoverChats(),
        ]);
        
        // Combine and deduplicate
        const allChats = [...configuredChats, ...discoveredChats];
        const seenIds = new Set<string>();
        
        for (const chat of allChats) {
          // Skip duplicates and chats that already have custom prompts
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
          // Skip channels that already have custom prompts
          if (!existingPromptChatIds.has(`slack:${channel.channelId}`)) {
            chats.push({
              id: channel.channelId,
              name: channel.channelName || channel.channelId,
              platform: 'slack',
            });
          }
        }
      }
      
      // Sort: groups with names first, then by name
      chats.sort((a, b) => {
        const aHasName = a.name !== a.id;
        const bHasName = b.name !== b.id;
        if (aHasName && !bHasName) return -1;
        if (!aHasName && bHasName) return 1;
        return a.name.localeCompare(b.name);
      });
      
      setAvailableChats(chats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const handleOpenNewPromptModal = async () => {
    setShowNewPromptModal(true);
    setSelectedChatForNew(null);
    setChatSearchQuery('');
    await loadAvailableChats(newPlatform);
  };

  const handlePlatformChangeForNew = async (platform: PromptPlatform) => {
    setNewPlatform(platform);
    setSelectedChatForNew(null);
    setChatSearchQuery('');
    await loadAvailableChats(platform);
  };

  // Filter chats based on search query
  const filteredChats = availableChats.filter(chat => {
    if (!chatSearchQuery.trim()) return true;
    const query = chatSearchQuery.toLowerCase();
    return chat.name.toLowerCase().includes(query) || chat.id.toLowerCase().includes(query);
  });

  const handleCreateNewPrompt = () => {
    if (!selectedChatForNew || !defaults) return;
    
    // Close the chat selector modal
    setShowNewPromptModal(false);
    
    // Open the prompt editor with the default prompt as starting point
    setEditingPrompt({
      platform: selectedChatForNew.platform,
      chatId: selectedChatForNew.id,
      promptText: defaults[selectedChatForNew.platform],
      displayName: selectedChatForNew.name,
      isDefault: false,
      isNew: true,
    });
  };

  const handleEditDefault = (platform: PromptPlatform) => {
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

  const handleResetToEmbedded = (platform: PromptPlatform) => {
    if (!embeddedDefaults || !editingPrompt) return;
    setEditingPrompt({
      ...editingPrompt,
      promptText: embeddedDefaults[platform],
    });
  };

  const handleSave = async () => {
    if (!editingPrompt) return;
    
    try {
      setSaving(true);
      
      if (editingPrompt.isDefault) {
        await updateDefaultPrompt(editingPrompt.platform, editingPrompt.promptText);
      } else {
        await setPromptForChat(editingPrompt.platform, editingPrompt.chatId, editingPrompt.promptText);
      }
      
      setEditingPrompt(null);
      await loadData();
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (platform: PromptPlatform, chatId: string) => {
    if (!confirm('Are you sure you want to delete this custom prompt? The chat will revert to using the platform default.')) {
      return;
    }
    
    try {
      await deletePromptForChat(platform, chatId);
      await loadData();
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete prompt');
    }
  };

  const customPrompts = prompts.filter(p => !p.isDefault);

  if (loading && !prompts.length) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex justify-between items-center">
          <span>{error}</span>
          <button 
            onClick={() => setError(null)} 
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 p-1 bg-secondary rounded-lg border border-border">
            <button
              onClick={() => setViewMode('defaults')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'defaults' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Default Prompts
            </button>
            <button
              onClick={() => setViewMode('custom')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${viewMode === 'custom' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Custom Prompts
              {customPrompts.length > 0 && (
                <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                  {customPrompts.length}
                </span>
              )}
            </button>
          </div>
          
          {/* Refresh button */}
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="btn btn-ghost h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            title="Refresh prompts"
          >
            <svg 
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {viewMode === 'custom' && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value as PromptPlatform | 'all')}
                className="input w-auto pr-8 appearance-none bg-background cursor-pointer"
              >
                <option value="all">All Platforms</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="slack">Slack</option>
              </select>
              <svg className="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <button
              onClick={handleOpenNewPromptModal}
              className="btn btn-primary text-sm py-1.5 px-3 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Custom Prompt
            </button>
          </div>
        )}
      </div>

      {/* Default Prompts View */}
      {viewMode === 'defaults' && defaults && (
        <div className="grid gap-6 md:grid-cols-2">
          {(['whatsapp', 'slack'] as PromptPlatform[]).map((platform) => (
            <div key={platform} className="card p-6 border-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {platform === 'whatsapp' ? (
                    <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-emerald-700 dark:text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-violet-700 dark:text-violet-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                      </svg>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {platform === 'whatsapp' ? 'WhatsApp' : 'Slack'} Default
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Used when no custom prompt is set
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleEditDefault(platform)}
                  className="btn btn-secondary text-sm py-1.5 px-3"
                >
                  Edit
                </button>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4 max-h-48 overflow-y-auto border border-border">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {defaults[platform].slice(0, 500)}
                  {defaults[platform].length > 500 && '...'}
                </pre>
              </div>
              
              <div className="mt-3 text-xs text-muted-foreground">
                {defaults[platform].length.toLocaleString()} characters
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom Prompts View */}
      {viewMode === 'custom' && (
        <div className="card overflow-hidden">
          {customPrompts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium mb-1">No custom prompts</p>
              <p className="text-sm mb-4">
                All chats are using the platform default prompts.
              </p>
              <button
                onClick={handleOpenNewPromptModal}
                className="btn btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Custom Prompt
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Chat
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Prompt Preview
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customPrompts.map((prompt) => (
                  <tr key={`${prompt.platform}-${prompt.chatId}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-transparent ${
                        prompt.platform === 'whatsapp' 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                      }`}>
                        {prompt.platform === 'whatsapp' ? 'WhatsApp' : 'Slack'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground text-sm">
                        {prompt.displayName || prompt.chatId}
                      </div>
                      {prompt.displayName && (
                        <div className="text-xs text-muted-foreground font-mono truncate max-w-xs">
                          {prompt.chatId}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-muted-foreground truncate max-w-md font-mono">
                        {prompt.promptText.slice(0, 100)}
                        {prompt.promptText.length > 100 && '...'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                      {new Date(prompt.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditCustom(prompt)}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(prompt.platform, prompt.chatId)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
                          title="Delete (revert to default)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingPrompt && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div 
              className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
              onClick={() => setEditingPrompt(null)}
            />
            
            <div className="relative bg-card rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-border animate-scale-in">
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {editingPrompt.isDefault ? 'Edit Default Prompt' : 'Edit Custom Prompt'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {editingPrompt.displayName}
                    {!editingPrompt.isDefault && (
                      <span className="ml-2 font-mono text-xs">
                        ({editingPrompt.chatId})
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setEditingPrompt(null)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    System Prompt
                  </label>
                  <textarea
                    value={editingPrompt.promptText}
                    onChange={(e) => setEditingPrompt({ ...editingPrompt, promptText: e.target.value })}
                    rows={16}
                    className="w-full px-3 py-2 border border-border bg-background text-foreground rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Enter the system prompt..."
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{editingPrompt.promptText.length.toLocaleString()} characters</span>
                    {editingPrompt.isDefault && embeddedDefaults && (
                      <button
                        onClick={() => handleResetToEmbedded(editingPrompt.platform)}
                        className="text-primary hover:underline"
                      >
                        Reset to original default
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
                <button
                  onClick={() => setEditingPrompt(null)}
                  className="btn btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="btn btn-primary"
                  disabled={saving || !editingPrompt.promptText.trim()}
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Saving...
                    </span>
                  ) : (editingPrompt.isNew ? 'Create Prompt' : 'Save Changes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Prompt Chat Selection Modal */}
      {showNewPromptModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div 
              className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
              onClick={() => setShowNewPromptModal(false)}
            />
            
            <div className="relative bg-card rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden border border-border animate-scale-in">
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Create Custom Prompt
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Select a chat to customize its system prompt
                  </p>
                </div>
                <button
                  onClick={() => setShowNewPromptModal(false)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6">
                {/* Platform Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Platform
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePlatformChangeForNew('whatsapp')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                        newPlatform === 'whatsapp'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                          : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
                      }`}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      </svg>
                      WhatsApp
                    </button>
                    <button
                      onClick={() => handlePlatformChangeForNew('slack')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                        newPlatform === 'slack'
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400'
                          : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                      </svg>
                      Slack
                    </button>
                  </div>
                </div>

                {/* Chat Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Select {newPlatform === 'whatsapp' ? 'Chat/Group' : 'Channel'}
                  </label>
                  
                  {loadingChats ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
                    </div>
                  ) : availableChats.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg">
                      <p className="text-sm">
                        No {newPlatform === 'whatsapp' ? 'chats' : 'channels'} available.
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
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={chatSearchQuery}
                          onChange={(e) => setChatSearchQuery(e.target.value)}
                          placeholder={`Search ${newPlatform === 'whatsapp' ? 'chats' : 'channels'}...`}
                          className="w-full pl-10 pr-4 py-2 border border-border bg-background text-foreground rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                        {chatSearchQuery && (
                          <button
                            onClick={() => setChatSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      
                      {/* Chat List */}
                      <div className="max-h-64 overflow-y-auto border border-border rounded-lg bg-background">
                        {filteredChats.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <p className="text-sm">No matches for "{chatSearchQuery}"</p>
                          </div>
                        ) : (
                          filteredChats.map((chat) => (
                            <button
                              key={chat.id}
                              onClick={() => setSelectedChatForNew(chat)}
                              className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${
                                selectedChatForNew?.id === chat.id
                                  ? 'bg-primary/10 border-primary/20'
                                  : ''
                              }`}
                            >
                              <div className="font-medium text-foreground text-sm">
                                {chat.name}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono truncate">
                                {chat.id}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                      
                      {/* Result count */}
                      <div className="mt-2 text-xs text-muted-foreground">
                        {filteredChats.length} of {availableChats.length} {newPlatform === 'whatsapp' ? 'chats' : 'channels'}
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
                <button
                  onClick={() => setShowNewPromptModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNewPrompt}
                  className="btn btn-primary"
                  disabled={!selectedChatForNew}
                >
                  Next: Edit Prompt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
