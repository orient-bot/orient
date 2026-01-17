import { useState, useEffect } from 'react';
import { getAuditLog, type AuditEntry } from '../api';
import PermissionBadge from './PermissionBadge';

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAuditLog();
  }, []);

  const loadAuditLog = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAuditLog(100);
      setEntries(result.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setIsLoading(false);
    }
  };

  const formatChatId = (chatId: string): string => {
    if (chatId.endsWith('@g.us')) {
      return chatId.replace('@g.us', ' (Group)');
    }
    if (chatId.endsWith('@s.whatsapp.net')) {
      return '+' + chatId.replace('@s.whatsapp.net', '');
    }
    return chatId;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="card p-12 text-center">
        <div className="spinner mx-auto" />
        <p className="text-surface-500 mt-4 text-sm">Loading audit log...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-12 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-red-600 mt-4 text-sm font-medium">{error}</p>
        <button onClick={loadAuditLog} className="btn btn-secondary mt-4">
          Try Again
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-surface-600 mt-4 text-sm font-medium">No permission changes yet</p>
        <p className="text-surface-400 text-sm mt-1">
          Changes will appear here when you modify chat permissions
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-200">
              <th className="table-header">Date</th>
              <th className="table-header">Chat</th>
              <th className="table-header">Change</th>
              <th className="table-header">Changed By</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="table-row"
              >
                <td className="table-cell">
                  <span className="text-surface-600 text-sm">{formatDate(entry.changedAt)}</span>
                </td>
                <td className="table-cell">
                  <span className="font-mono text-sm text-surface-700">
                    {formatChatId(entry.chatId)}
                  </span>
                </td>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    {entry.oldPermission ? (
                      <>
                        <PermissionBadge permission={entry.oldPermission} size="sm" />
                        <svg className="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </>
                    ) : (
                      <span className="text-surface-400 text-xs">Created</span>
                    )}
                    <PermissionBadge
                      permission={entry.newPermission === 'deleted' ? null : entry.newPermission}
                      size="sm"
                    />
                  </div>
                </td>
                <td className="table-cell">
                  <span className="text-surface-500 text-sm">
                    {entry.changedBy || 'System'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}



