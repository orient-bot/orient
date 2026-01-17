import { useState, useEffect } from 'react';
import {
  getChats,
  discoverChats,
  updateChatPermission,
  type ChatWithPermission,
  type ChatPermission
} from '../api';
import PermissionBadge from './PermissionBadge';
import PermissionEditor from './PermissionEditor';

interface ChatListProps {
  discover: boolean;
  onUpdate: () => void;
}

export default function ChatList({ discover, onUpdate }: ChatListProps) {
  const [chats, setChats] = useState<ChatWithPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'group' | 'individual'>('all');
  const [filterPermission, setFilterPermission] = useState<'all' | ChatPermission>('all');
  const [editingChat, setEditingChat] = useState<ChatWithPermission | null>(null);
  const [_defaultPermission, setDefaultPermission] = useState<ChatPermission>('read_only');

  useEffect(() => {
    loadChats();
  }, [discover]);

  const loadChats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (discover) {
        const result = await discoverChats();
        setChats(result.chats);
        setDefaultPermission(result.defaultPermission);
      } else {
        const result = await getChats();
        setChats(result.chats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionChange = async (chat: ChatWithPermission, permission: ChatPermission) => {
    try {
      await updateChatPermission(
        chat.chatId,
        permission,
        chat.displayName,
        chat.notes
      );
      await loadChats();
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission');
    }
  };

  const handleQuickSet = async (chat: ChatWithPermission, permission: ChatPermission) => {
    await handlePermissionChange(chat, permission);
  };

  const filteredChats = chats.filter(chat => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesId = chat.chatId.toLowerCase().includes(query);
      const matchesName = chat.displayName?.toLowerCase().includes(query);
      if (!matchesId && !matchesName) return false;
    }

    if (filterType !== 'all' && chat.chatType !== filterType) return false;

    if (!discover && filterPermission !== 'all' && chat.permission !== filterPermission) return false;

    return true;
  });

  const formatChatId = (chatId: string): string => {
    if (chatId.endsWith('@g.us')) {
      return chatId.replace('@g.us', '');
    }
    if (chatId.endsWith('@s.whatsapp.net')) {
      return '+' + chatId.replace('@s.whatsapp.net', '');
    }
    return chatId;
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="card p-12 text-center">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground mt-4 text-sm">Loading chats...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-12 text-center">
        <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-destructive mt-4 text-sm font-medium">{error}</p>
        <button onClick={loadChats} className="btn btn-secondary mt-4">
          Try Again
        </button>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-muted-foreground mt-4 text-sm font-medium">
          {discover ? 'No new chats to configure' : 'No chats configured yet'}
        </p>
        {discover && (
          <p className="text-muted-foreground/70 text-sm mt-1">
            Messages from new chats will appear here automatically
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <svg className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-9 bg-background"
              />
            </div>
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="input w-auto pr-8 appearance-none bg-background cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="group">Groups</option>
              <option value="individual">Individuals</option>
            </select>
            <svg className="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Permission filter (only for configured chats) */}
          {!discover && (
            <div className="relative">
              <select
                value={filterPermission}
                onChange={(e) => setFilterPermission(e.target.value as typeof filterPermission)}
                className="input w-auto pr-8 appearance-none bg-background cursor-pointer"
              >
                <option value="all">All Permissions</option>
                <option value="read_write">Read + Write</option>
                <option value="read_only">Read Only</option>
                <option value="ignored">Ignored</option>
              </select>
              <svg className="w-4 h-4 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}

          <button onClick={loadChats} className="btn btn-secondary">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Showing {filteredChats.length} of {chats.length} chats
        </span>
        {discover && (
          <span className="text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30 px-2 py-1 rounded text-xs font-medium border border-transparent">
            Smart defaults: read all, write to private chats
          </span>
        )}
      </div>

      {/* Chat table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Chat</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Permission</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Messages</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Activity</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredChats.map((chat) => (
                <tr
                  key={chat.chatId}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        chat.chatType === 'group' 
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                      }`}>
                        {chat.chatType === 'group' ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate text-foreground">
                          {chat.displayName || formatChatId(chat.chatId)}
                        </p>
                        {chat.displayName && (
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {formatChatId(chat.chatId)}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border border-transparent ${
                      chat.chatType === 'group'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                    }`}>
                      {chat.chatType === 'group' ? 'Group' : 'Individual'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {chat.isSmartDefaultWritable ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-transparent">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Private (Auto R+W)
                      </span>
                    ) : (
                      <PermissionBadge permission={chat.permission || chat.effectivePermission || null} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="text-muted-foreground font-mono">{chat.messageCount?.toLocaleString() || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="text-muted-foreground font-mono text-xs">{formatDate(chat.lastMessageAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Quick actions for discover mode */}
                      {discover ? (
                        <>
                          <button
                            onClick={() => handleQuickSet(chat, 'read_write')}
                            className="p-2 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                            title="Set Read + Write"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleQuickSet(chat, 'read_only')}
                            className="p-2 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                            title="Set Read Only"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleQuickSet(chat, 'ignored')}
                            className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                            title="Set Ignored"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditingChat(chat)}
                          className="btn btn-secondary h-8 px-3"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permission Editor Modal */}
      {editingChat && (
        <PermissionEditor
          chat={editingChat}
          onClose={() => setEditingChat(null)}
          onSave={async (permission, displayName, notes) => {
            try {
              await updateChatPermission(editingChat.chatId, permission, displayName, notes);
              setEditingChat(null);
              await loadChats();
              onUpdate();
            } catch (err) {
              throw err;
            }
          }}
        />
      )}
    </div>
  );
}
