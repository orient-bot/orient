/**
 * Integration Credential Modal
 *
 * Modal component for inline credential entry when connecting integrations.
 * Supports both single auth method and dual-auth (e.g., JIRA with API token or OAuth).
 */

import React, { useState, useEffect } from 'react';
import { saveIntegrationCredentials, type IntegrationManifest, type AuthMethod } from '../api';
import { X, Eye, EyeOff, KeyRound, ShieldCheck, Loader2 } from 'lucide-react';

interface IntegrationCredentialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: {
    manifest: IntegrationManifest;
    secretsConfigured: boolean;
  } | null;
  onCredentialsSaved: (authMethod?: string) => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}

export function IntegrationCredentialModal({
  open,
  onOpenChange,
  integration,
  onCredentialsSaved,
  onError,
  onSuccess,
}: IntegrationCredentialModalProps) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<string>('');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset form when modal opens with new integration
  useEffect(() => {
    if (open && integration) {
      setCredentials({});
      setShowPasswords({});
      setFormError(null);
      // Default to first auth method if available
      if (integration.manifest.authMethods && integration.manifest.authMethods.length > 0) {
        setSelectedAuthMethod(integration.manifest.authMethods[0].type);
      } else {
        setSelectedAuthMethod('');
      }
    }
  }, [open, integration?.manifest.name]);

  if (!open || !integration) return null;

  const { manifest } = integration;
  const hasMultipleAuthMethods = manifest.authMethods && manifest.authMethods.length > 1;

  // Get required secrets for current auth method
  const getRequiredSecrets = () => {
    if (hasMultipleAuthMethods && selectedAuthMethod) {
      // Filter secrets by selected auth method
      return manifest.requiredSecrets.filter(
        (s) => s.authMethod === selectedAuthMethod || !s.authMethod
      );
    }
    // Return all required secrets for integrations without multiple auth methods
    return manifest.requiredSecrets.filter((s) => s.required !== false);
  };

  const requiredSecrets = getRequiredSecrets();

  const handleInputChange = (name: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const togglePasswordVisibility = (name: string) => {
    setShowPasswords((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const isFormValid = () => {
    return requiredSecrets.every(
      (secret) => credentials[secret.name] && credentials[secret.name].trim() !== ''
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const result = await saveIntegrationCredentials(
        manifest.name,
        credentials,
        selectedAuthMethod || undefined
      );

      if (result.success) {
        onSuccess?.('Credentials saved successfully');
        onOpenChange(false);
        // Notify parent to proceed with connection
        onCredentialsSaved(selectedAuthMethod || undefined);
      } else {
        setFormError(result.message || 'Failed to save credentials');
        onError?.(result.message || 'Failed to save credentials');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save credentials';
      setFormError(message);
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-[500px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Configure {manifest.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Enter your credentials to connect. These will be securely stored.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {formError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
              </div>
            )}

            {/* Auth Method Tabs */}
            {hasMultipleAuthMethods && (
              <div className="space-y-4">
                <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
                  {manifest.authMethods!.map((method: AuthMethod) => (
                    <button
                      key={method.type}
                      type="button"
                      onClick={() => setSelectedAuthMethod(method.type)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        selectedAuthMethod === method.type
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      {method.type === 'api_token' ? (
                        <KeyRound className="h-4 w-4" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      {method.name}
                    </button>
                  ))}
                </div>

                {/* Auth method description */}
                {manifest.authMethods!.map(
                  (method: AuthMethod) =>
                    selectedAuthMethod === method.type && (
                      <p key={method.type} className="text-sm text-gray-500 dark:text-gray-400">
                        {method.description}
                      </p>
                    )
                )}
              </div>
            )}

            {/* Credential Fields */}
            <div className="space-y-4">
              {requiredSecrets.map((secret) => {
                const isPassword =
                  secret.name.toLowerCase().includes('secret') ||
                  secret.name.toLowerCase().includes('token') ||
                  secret.name.toLowerCase().includes('password');
                const showPassword = showPasswords[secret.name];

                return (
                  <div key={secret.name} className="space-y-2">
                    <label
                      htmlFor={secret.name}
                      className="block text-sm font-medium text-gray-900 dark:text-white"
                    >
                      {secret.name}
                    </label>
                    <div className="relative">
                      <input
                        id={secret.name}
                        type={isPassword && !showPassword ? 'password' : 'text'}
                        placeholder={secret.description}
                        value={credentials[secret.name] || ''}
                        onChange={(e) => handleInputChange(secret.name, e.target.value)}
                        className="input w-full pr-10"
                      />
                      {isPassword && (
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(secret.name)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{secret.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="btn btn-primary flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save & Connect'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
