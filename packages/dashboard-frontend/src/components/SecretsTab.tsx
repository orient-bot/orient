import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteSecret, getSecret, invalidateSecretsCache, listSecrets, setSecret, type SecretMetadata } from '../api';

type SecretFormState = {
  key: string;
  value: string;
  category: string;
  description: string;
};

const EMPTY_FORM: SecretFormState = {
  key: '',
  value: '',
  category: '',
  description: '',
};

export default function SecretsTab() {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<SecretFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(secrets.map((secret) => secret.category).filter(Boolean))) as string[],
    [secrets]
  );

  const loadSecrets = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await listSecrets();
      setSecrets(result.secrets);
      setError(null);
    } catch (err) {
      console.error('Failed to load secrets', err);
      setError('Failed to load secrets. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const handleInputChange = (field: keyof SecretFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.key.trim() || !formState.value.trim()) {
      setError('Key and value are required.');
      return;
    }

    setSaving(true);
    try {
      await setSecret(formState.key.trim(), {
        value: formState.value.trim(),
        category: formState.category.trim() || undefined,
        description: formState.description.trim() || undefined,
      });
      setFormState(EMPTY_FORM);
      await loadSecrets();
      setError(null);
    } catch (err) {
      console.error('Failed to save secret', err);
      setError('Failed to save secret. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete secret ${key}?`)) return;
    try {
      await deleteSecret(key);
      if (revealedKey === key) {
        setRevealedKey(null);
        setRevealedValue(null);
      }
      await loadSecrets();
    } catch (err) {
      console.error('Failed to delete secret', err);
      setError('Failed to delete secret. Please try again.');
    }
  };

  const handleReveal = async (key: string) => {
    if (revealedKey === key) {
      setRevealedKey(null);
      setRevealedValue(null);
      return;
    }
    setRevealing(true);
    try {
      const result = await getSecret(key, true);
      setRevealedKey(key);
      setRevealedValue(result.value);
    } catch (err) {
      console.error('Failed to reveal secret', err);
      setError('Failed to reveal secret. Please try again.');
    } finally {
      setRevealing(false);
    }
  };

  const handleInvalidate = async () => {
    try {
      await invalidateSecretsCache();
    } catch (err) {
      console.error('Failed to invalidate cache', err);
      setError('Failed to invalidate cache. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Secrets</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage encrypted secrets stored in the workspace database.
            </p>
          </div>
          <button
            onClick={handleInvalidate}
            className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
          >
            Invalidate Cache
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground">Add Secret</h3>
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Key</label>
              <input
                className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring font-mono"
                value={formState.key}
                onChange={handleInputChange('key')}
                placeholder="SLACK_BOT_TOKEN"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Category</label>
              <input
                className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
                value={formState.category}
                onChange={handleInputChange('category')}
                placeholder="slack"
                list="secret-categories"
              />
              <datalist id="secret-categories">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Description</label>
            <input
              className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring"
              value={formState.description}
              onChange={handleInputChange('description')}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase">Value</label>
            <input
              type="password"
              className="mt-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring font-mono"
              value={formState.value}
              onChange={handleInputChange('value')}
              placeholder="Enter secret value"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Secret'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Stored Secrets</h3>
          <button
            onClick={loadSecrets}
            className="h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 rounded-md border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={4}>
                    Loading secrets...
                  </td>
                </tr>
              ) : secrets.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={4}>
                    No secrets stored yet.
                  </td>
                </tr>
              ) : (
                secrets.map((secret) => (
                  <tr key={secret.key} className="border-b border-border hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-sm">{secret.key}</td>
                    <td className="px-4 py-3 text-sm">{secret.category || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {new Date(secret.updatedAt).toISOString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReveal(secret.key)}
                          disabled={revealing && revealedKey !== secret.key}
                          className="h-8 px-3 rounded-md border border-border bg-background text-foreground text-xs font-medium hover:bg-muted"
                        >
                          {revealedKey === secret.key ? 'Hide' : 'Reveal'}
                        </button>
                        <button
                          onClick={() => handleDelete(secret.key)}
                          className="h-8 px-3 rounded-md border border-border bg-background text-destructive text-xs font-medium hover:bg-muted"
                        >
                          Delete
                        </button>
                      </div>
                      {revealedKey === secret.key && (
                        <div className="mt-2 text-xs font-mono text-muted-foreground break-all">
                          {revealedValue}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
