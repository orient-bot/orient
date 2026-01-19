import { useState, useEffect } from 'react';
import {
  getSlackChannels,
  updateSlackChannelPermission,
  type SlackChannelWithPermission,
  type SlackChannelPermission,
} from '../api';
import PermissionBadge from './PermissionBadge';
import { PlatformPromptSection } from './prompts';

interface SlackChannelsProps {
  onUpdate?: () => void;
}

export default function SlackChannels({ onUpdate }: SlackChannelsProps) {
  const [channels, setChannels] = useState<SlackChannelWithPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'channel' | 'dm' | 'group_dm' | 'private'>(
    'all'
  );
  const [filterPermission, setFilterPermission] = useState<'all' | SlackChannelPermission>('all');
  // TODO: Implement channel editing modal
  const [_editingChannel, _setEditingChannel] = useState<SlackChannelWithPermission | null>(null);
  const [promptsExpanded, setPromptsExpanded] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const channelsResult = await getSlackChannels();

      // Defensive parsing: production/backend versions may return either:
      // - { channels: SlackChannelWithPermission[] }
      // - SlackChannelWithPermission[]
      // Never allow `channels` state to become undefined, otherwise render will crash on `.filter()`.
      const resultAny = channelsResult as unknown as {
        channels?: unknown;
      };
      const nextChannels = Array.isArray(resultAny?.channels)
        ? (resultAny.channels as SlackChannelWithPermission[])
        : Array.isArray(channelsResult)
          ? (channelsResult as unknown as SlackChannelWithPermission[])
          : [];

      setChannels(nextChannels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Slack data');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionChange = async (
    channel: SlackChannelWithPermission,
    permission: SlackChannelPermission
  ) => {
    try {
      await updateSlackChannelPermission(channel.channelId, permission, {
        respondToMentions: channel.respondToMentions,
        respondToDMs: channel.respondToDMs,
        notes: channel.notes,
      });
      await loadData();
      onUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission');
    }
  };

  const filteredChannels = (channels ?? []).filter((channel) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesId = channel.channelId.toLowerCase().includes(query);
      const matchesName = channel.channelName?.toLowerCase().includes(query);
      if (!matchesId && !matchesName) return false;
    }

    if (filterType !== 'all' && channel.channelType !== filterType) return false;
    if (filterPermission !== 'all' && channel.permission !== filterPermission) return false;

    return true;
  });

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

  const getChannelTypeDisplay = (
    type: string
  ): { label: string; bgColor: string; textColor: string } => {
    const types: Record<string, { label: string; bgColor: string; textColor: string }> = {
      channel: { label: 'Channel', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
      dm: { label: 'DM', bgColor: 'bg-violet-50', textColor: 'text-violet-700' },
      group_dm: { label: 'Group DM', bgColor: 'bg-indigo-50', textColor: 'text-indigo-700' },
      private: { label: 'Private', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
    };
    return types[type] || { label: type, bgColor: 'bg-surface-50', textColor: 'text-surface-700' };
  };

  if (isLoading) {
    return (
      <div className="card p-12 text-center">
        <div className="spinner mx-auto" />
        <p className="text-surface-500 mt-4 text-sm">Loading Slack channels...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-12 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <svg
            className="w-6 h-6 text-red-500"
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
        </div>
        <p className="text-red-600 mt-4 text-sm font-medium">{error}</p>
        <button onClick={loadData} className="btn btn-secondary mt-4">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Collapsible System Prompt Section */}
      <details
        className="card border-border"
        open={promptsExpanded}
        onToggle={(e) => setPromptsExpanded((e.target as HTMLDetailsElement).open)}
      >
        <summary className="px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-lg">
          <div className="flex items-center gap-3">
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform ${promptsExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-violet-600 dark:text-violet-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                />
              </svg>
              <span className="font-medium text-foreground">System Prompt</span>
              <span className="text-xs text-muted-foreground">(customize AI behavior)</span>
            </div>
          </div>
        </summary>
        <div className="px-4 pb-4 pt-2 border-t border-border mt-2">
          <PlatformPromptSection platform="slack" onUpdate={onUpdate} />
        </div>
      </details>

      {/* No channels message */}
      {channels.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mx-auto">
            <svg
              className="w-6 h-6 text-surface-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
              />
            </svg>
          </div>
          <p className="text-surface-600 mt-4 text-sm font-medium">No Slack channels found</p>
          <p className="text-surface-400 text-sm mt-1">
            Channels will appear here once the Slack bot receives messages
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="card p-4">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <svg
                    className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2"
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
                    placeholder="Search by name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input pl-9"
                  />
                </div>
              </div>

              {/* Type filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                className="input w-auto"
              >
                <option value="all">All Types</option>
                <option value="channel">Channels</option>
                <option value="dm">Direct Messages</option>
                <option value="group_dm">Group DMs</option>
                <option value="private">Private</option>
              </select>

              {/* Permission filter */}
              <select
                value={filterPermission}
                onChange={(e) => setFilterPermission(e.target.value as typeof filterPermission)}
                className="input w-auto"
              >
                <option value="all">All Permissions</option>
                <option value="read_write">Read + Write</option>
                <option value="read_only">Read Only</option>
                <option value="ignored">Ignored</option>
              </select>

              <button onClick={loadData} className="btn btn-secondary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-surface-500">
              Showing {filteredChannels.length} of {channels.length} channels
            </span>
          </div>

          {/* Channel table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="table-header">Channel</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Permission</th>
                    <th className="table-header">Messages</th>
                    <th className="table-header">Last Activity</th>
                    <th className="table-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChannels.map((channel) => {
                    const typeInfo = getChannelTypeDisplay(channel.channelType);
                    return (
                      <tr key={channel.channelId} className="table-row">
                        <td className="table-cell">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center ${typeInfo.bgColor}`}
                            >
                              {channel.channelType === 'dm' ? (
                                <svg
                                  className={`w-4 h-4 ${typeInfo.textColor}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className={`w-4 h-4 ${typeInfo.textColor}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                                  />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-surface-900 truncate">
                                {channel.channelName
                                  ? `#${channel.channelName}`
                                  : channel.channelId}
                              </p>
                              {channel.channelName && (
                                <p className="text-xs text-surface-400 font-mono truncate">
                                  {channel.channelId}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="table-cell">
                          <span
                            className={`text-xs px-2 py-1 rounded font-medium ${typeInfo.bgColor} ${typeInfo.textColor}`}
                          >
                            {typeInfo.label}
                          </span>
                        </td>
                        <td className="table-cell">
                          <PermissionBadge permission={channel.permission} />
                        </td>
                        <td className="table-cell">
                          <span className="text-surface-600 tabular-nums">
                            {channel.messageCount?.toLocaleString() || '-'}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className="text-surface-500 text-sm">
                            {formatDate(channel.lastMessageAt)}
                          </span>
                        </td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handlePermissionChange(channel, 'read_write')}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Set Read + Write"
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
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handlePermissionChange(channel, 'read_only')}
                              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Set Read Only"
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
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handlePermissionChange(channel, 'ignored')}
                              className="p-2 text-surface-400 hover:bg-surface-100 rounded-lg transition-colors"
                              title="Set Ignored"
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
                                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
