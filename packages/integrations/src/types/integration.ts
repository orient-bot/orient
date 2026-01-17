/**
 * Integration Types
 *
 * Type definitions for the integration catalog system.
 * Integrations are defined via INTEGRATION.yaml manifests.
 */

/**
 * OAuth configuration for an integration
 */
export interface IntegrationOAuthConfig {
  /** OAuth type */
  type: 'oauth2' | 'oauth2-pkce';
  /** Authorization URL */
  authorizationUrl: string;
  /** Token exchange URL */
  tokenUrl: string;
  /** Required scopes */
  scopes: string[];
  /** Human-readable scope descriptions */
  scopeDescriptions?: Record<string, string>;
  /** Optional: Revocation URL */
  revocationUrl?: string;
  /** Optional: User info URL for profile fetching */
  userInfoUrl?: string;
}

/**
 * Required secret configuration
 */
export interface IntegrationSecret {
  /** Secret name (e.g., 'GITHUB_CLIENT_ID') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Secret category */
  category: 'oauth' | 'api_key' | 'webhook';
  /** Whether this secret is required (default: true) */
  required?: boolean;
}

/**
 * Tool definition within an integration
 */
export interface IntegrationTool {
  /** Tool name (e.g., 'issues.list') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tool category for organization */
  category: string;
  /** Required scopes for this tool */
  requiredScopes?: string[];
}

/**
 * Webhook configuration for integrations that support webhooks
 */
export interface IntegrationWebhookConfig {
  /** Webhook events this integration can receive */
  events: string[];
  /** Secret header for verification (e.g., 'X-Hub-Signature-256') */
  signatureHeader?: string;
  /** Signature algorithm */
  signatureAlgorithm?: 'hmac-sha256' | 'hmac-sha1';
}

/**
 * Integration manifest - the complete definition of an integration
 */
export interface IntegrationManifest {
  /** Unique integration identifier (e.g., 'github', 'linear') */
  name: string;
  /** Display title (e.g., 'GitHub', 'Linear') */
  title: string;
  /** Description (minimum 50 characters) */
  description: string;
  /** Semantic version */
  version: string;
  /** Author or organization */
  author?: string;
  /** Path to icon (relative to catalog directory) */
  icon?: string;

  /** OAuth configuration */
  oauth: IntegrationOAuthConfig;

  /** Required secrets for this integration */
  requiredSecrets: IntegrationSecret[];

  /** Available tools when connected */
  tools: IntegrationTool[];

  /** Optional webhook configuration */
  webhooks?: IntegrationWebhookConfig;

  /** Integration status */
  status: 'stable' | 'beta' | 'experimental';

  /** Documentation URL */
  docsUrl?: string;

  /** API base URL */
  apiBaseUrl?: string;
}

/**
 * Connection status for an integration
 */
export type IntegrationConnectionStatus = 'connected' | 'pending' | 'error' | 'disconnected';

/**
 * Stored integration connection
 */
export interface IntegrationConnection {
  /** Unique connection ID */
  id: number;
  /** Integration name (references manifest) */
  integrationName: string;
  /** User ID if user-scoped */
  userId?: string;
  /** Connection status */
  status: IntegrationConnectionStatus;
  /** When the connection was established */
  connectedAt?: Date;
  /** Last time the integration was used */
  lastUsed?: Date;
  /** Connection metadata (scopes, account info) */
  metadata?: {
    scopes?: string[];
    accountId?: string;
    accountEmail?: string;
    accountName?: string;
  };
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Integration audit log entry
 */
export interface IntegrationAuditEntry {
  /** Entry ID */
  id: number;
  /** Integration name */
  integrationName: string;
  /** Action performed */
  action: 'connected' | 'disconnected' | 'refreshed' | 'error' | 'used';
  /** Additional details */
  details?: string;
  /** Who performed the action */
  performedBy?: string;
  /** When the action was performed */
  performedAt: Date;
}

/**
 * Catalog entry - manifest combined with connection status
 */
export interface IntegrationCatalogEntry {
  /** The integration manifest */
  manifest: IntegrationManifest;
  /** Current connection (if any) */
  connection?: IntegrationConnection;
  /** Whether all required secrets are configured */
  secretsConfigured: boolean;
}

/**
 * Validate an integration manifest
 */
export function validateManifest(manifest: Partial<IntegrationManifest>): string[] {
  const errors: string[] = [];

  if (!manifest.name) {
    errors.push('name is required');
  } else if (!/^[a-z][a-z0-9-]*$/.test(manifest.name)) {
    errors.push('name must be lowercase alphanumeric with hyphens, starting with a letter');
  }

  if (!manifest.title) {
    errors.push('title is required');
  }

  if (!manifest.description) {
    errors.push('description is required');
  } else if (manifest.description.length < 50) {
    errors.push('description must be at least 50 characters');
  }

  if (!manifest.version) {
    errors.push('version is required');
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('version must be a valid semver (e.g., 1.0.0)');
  }

  if (!manifest.oauth) {
    errors.push('oauth configuration is required');
  } else {
    if (!['oauth2', 'oauth2-pkce'].includes(manifest.oauth.type)) {
      errors.push('oauth.type must be oauth2 or oauth2-pkce');
    }
    if (!manifest.oauth.authorizationUrl) {
      errors.push('oauth.authorizationUrl is required');
    }
    if (!manifest.oauth.tokenUrl) {
      errors.push('oauth.tokenUrl is required');
    }
    if (!manifest.oauth.scopes || manifest.oauth.scopes.length === 0) {
      errors.push('oauth.scopes must have at least one scope');
    }
  }

  if (!manifest.requiredSecrets || manifest.requiredSecrets.length === 0) {
    errors.push('requiredSecrets must have at least one entry');
  }

  if (!manifest.tools || manifest.tools.length === 0) {
    errors.push('tools must have at least one entry');
  }

  if (!manifest.status || !['stable', 'beta', 'experimental'].includes(manifest.status)) {
    errors.push('status must be stable, beta, or experimental');
  }

  return errors;
}
