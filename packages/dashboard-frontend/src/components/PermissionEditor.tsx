import { useState, useEffect } from 'react';
import type { ChatWithPermission, ChatPermission, StoredGroup } from '../api';
import { getGroup } from '../api';
import PermissionBadge from './PermissionBadge';

interface PermissionEditorProps {
  chat: ChatWithPermission;
  onClose: () => void;
  onSave: (permission: ChatPermission, displayName?: string, notes?: string) => Promise<void>;
}

const permissionOptions: { value: ChatPermission; label: string; description: string }[] = [
  {
    value: 'read_write',
    label: 'Read + Write',
    description: 'Store messages and respond to the admin in this chat',
  },
  {
    value: 'read_only',
    label: 'Read Only',
    description: 'Store messages but never respond (monitoring only)',
  },
  {
    value: 'ignored',
    label: 'Ignored',
    description: 'Do not store messages or respond (completely ignored)',
  },
];

export default function PermissionEditor({ chat, onClose, onSave }: PermissionEditorProps) {
  const [permission, setPermission] = useState<ChatPermission>(chat.permission || 'read_only');
  const [displayName, setDisplayName] = useState(chat.displayName || '');
  const [notes, setNotes] = useState(chat.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupInfo, setGroupInfo] = useState<StoredGroup | null>(null);
  const [showGroupWarning, setShowGroupWarning] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<ChatPermission | null>(null);

  // Fetch group info when component mounts (only for groups)
  useEffect(() => {
    if (chat.chatType === 'group') {
      getGroup(chat.chatId).then((group) => {
        setGroupInfo(group);
      });
    }
  }, [chat.chatId, chat.chatType]);

  const isMultiMemberGroup =
    chat.chatType === 'group' && (groupInfo === null || (groupInfo.participant_count ?? 0) !== 1);

  const handlePermissionChange = (newPermission: ChatPermission) => {
    // Check if selecting read_write for a multi-member group
    if (newPermission === 'read_write' && isMultiMemberGroup && chat.permission !== 'read_write') {
      setPendingPermission(newPermission);
      setShowGroupWarning(true);
    } else {
      setPermission(newPermission);
    }
  };

  const handleConfirmGroupWarning = () => {
    if (pendingPermission) {
      setPermission(pendingPermission);
    }
    setShowGroupWarning(false);
    setPendingPermission(null);
  };

  const handleCancelGroupWarning = () => {
    setShowGroupWarning(false);
    setPendingPermission(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await onSave(permission, displayName || undefined, notes || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setIsSaving(false);
    }
  };

  const formatChatId = (chatId: string): string => {
    if (chatId.endsWith('@g.us')) {
      return chatId.replace('@g.us', '');
    }
    if (chatId.endsWith('@s.whatsapp.net')) {
      return '+' + chatId.replace('@s.whatsapp.net', '');
    }
    return chatId;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6 shadow-lg animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                chat.chatType === 'group'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
              }`}
            >
              {chat.chatType === 'group' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold">Edit Permission</h2>
              <p className="text-xs text-muted-foreground font-mono">{formatChatId(chat.chatId)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
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

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Current permission */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Current: <PermissionBadge permission={chat.permission} />
          </div>

          {/* Permission selector */}
          <div>
            <label className="block text-sm font-medium mb-2">Permission Level</label>
            <div className="space-y-2">
              {permissionOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                    permission === option.value
                      ? 'bg-primary/5 border-primary'
                      : 'bg-card border-border hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="permission"
                    value={option.value}
                    checked={permission === option.value}
                    onChange={() => handlePermissionChange(option.value)}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 ${
                      permission === option.value
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground'
                    }`}
                  >
                    {permission === option.value && (
                      <svg
                        className="w-2.5 h-2.5 text-primary-foreground"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-medium ${permission === option.value ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {option.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Display name */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium mb-1.5">
              Display Name <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., Orient Task Force"
              className="input"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium mb-1.5">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this chat..."
              rows={2}
              className="input h-auto resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="btn btn-primary flex-1">
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Multi-member group warning dialog */}
      {showGroupWarning && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
          onClick={handleCancelGroupWarning}
        >
          <div
            className="card w-full max-w-md p-6 shadow-lg animate-scale-in border-amber-500/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning icon and title */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Warning: Multi-Member Group
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {groupInfo?.participant_count
                    ? `This group has ${groupInfo.participant_count} members.`
                    : 'This group has multiple members.'}
                </p>
              </div>
            </div>

            {/* Warning message */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-5">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Orient will respond to <strong>anyone</strong> who sends a message to this group,
                not just you. This could lead to unintended interactions or expose the bot to other
                users.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancelGroupWarning}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmGroupWarning}
                className="btn flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              >
                I Understand, Enable Write Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
