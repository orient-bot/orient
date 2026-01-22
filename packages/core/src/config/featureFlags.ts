/**
 * Feature Flags Service
 *
 * Centralized feature flag management with environment-aware defaults.
 * This is the single source of truth for feature flag resolution across all environments.
 *
 * Priority order (highest to lowest):
 * 1. Environment variables (FEATURE_FLAG_<FLAG_ID>=true/false)
 * 2. Config file values
 * 3. Schema defaults (pre-launch safe)
 */

import type { FeatureFlagDefinition, FeaturesConfig } from './schema.js';

/**
 * Pre-launch default configuration
 * These defaults ensure a consistent, safe UI state before going live.
 * All advanced/management features are DISABLED by default.
 */
export const PRE_LAUNCH_DEFAULTS: FeaturesConfig = {
  // Backend features (not visible in UI navigation)
  slaMonitoring: { enabled: false, uiStrategy: 'hide' },
  weeklyReports: { enabled: false, uiStrategy: 'hide' },

  // Dashboard features - DISABLED by default for pre-launch
  miniApps: {
    enabled: false,
    uiStrategy: 'hide',
    route: '/apps',
    navSection: 'MANAGEMENT',
  },
  miniApps_create: { enabled: false, uiStrategy: 'hide', parentFlag: 'miniApps' },
  miniApps_editWithAI: { enabled: false, uiStrategy: 'hide', parentFlag: 'miniApps' },
  miniApps_share: { enabled: false, uiStrategy: 'hide', parentFlag: 'miniApps' },

  automation: {
    enabled: false,
    uiStrategy: 'hide',
    route: '/automation',
    navSection: 'MANAGEMENT',
  },
  automation_schedules: { enabled: false, uiStrategy: 'hide', parentFlag: 'automation' },
  automation_webhooks: { enabled: false, uiStrategy: 'hide', parentFlag: 'automation' },

  agentRegistry: {
    enabled: false,
    uiStrategy: 'hide',
    route: '/agents',
    navSection: 'MANAGEMENT',
  },
  agentRegistry_edit: { enabled: false, uiStrategy: 'hide', parentFlag: 'agentRegistry' },

  operations: {
    enabled: false,
    uiStrategy: 'hide',
    route: '/operations',
    navSection: 'MANAGEMENT',
  },
  operations_monitoring: { enabled: false, uiStrategy: 'hide', parentFlag: 'operations' },
  operations_storage: { enabled: false, uiStrategy: 'hide', parentFlag: 'operations' },
  operations_billing: { enabled: false, uiStrategy: 'hide', parentFlag: 'operations' },

  // Integration flags - disabled by default
  whatsappBot: { enabled: false, uiStrategy: 'hide' },
  slackBot: { enabled: false, uiStrategy: 'hide' },
  googleSlides: { enabled: false, uiStrategy: 'hide' },
  mcpServer: { enabled: false, uiStrategy: 'hide' },
};

/**
 * Convert environment variable name to feature flag ID
 * e.g., FEATURE_FLAG_MINI_APPS -> miniApps
 */
function envVarToFlagId(envVar: string): string {
  // Remove FEATURE_FLAG_ prefix
  const withoutPrefix = envVar.replace(/^FEATURE_FLAG_/, '');
  // Convert SNAKE_CASE to camelCase
  return withoutPrefix.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert feature flag ID to environment variable name
 * e.g., miniApps -> FEATURE_FLAG_MINI_APPS
 */
function flagIdToEnvVar(flagId: string): string {
  // Convert camelCase to SNAKE_CASE
  const snakeCase = flagId.replace(/([A-Z])/g, '_$1').toUpperCase();
  return `FEATURE_FLAG_${snakeCase}`;
}

/**
 * Read feature flag override from environment variable
 */
function getEnvOverride(flagId: string): boolean | undefined {
  const envVar = flagIdToEnvVar(flagId);
  const value = process.env[envVar];

  if (value === undefined || value === '') {
    return undefined;
  }

  // Accept various truthy/falsy values
  const normalized = value.toLowerCase().trim();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) {
    return false;
  }

  return undefined;
}

/**
 * Resolve feature flags with proper priority:
 * 1. Environment variables (highest priority)
 * 2. Config file values
 * 3. Pre-launch defaults (lowest priority)
 */
export function resolveFeatureFlags(configFlags?: Partial<FeaturesConfig>): FeaturesConfig {
  const resolved: FeaturesConfig = { ...PRE_LAUNCH_DEFAULTS };

  // Apply config file values
  if (configFlags) {
    for (const [flagId, flagValue] of Object.entries(configFlags)) {
      if (flagValue && typeof flagValue === 'object' && flagId in resolved) {
        (resolved as Record<string, FeatureFlagDefinition>)[flagId] = {
          ...PRE_LAUNCH_DEFAULTS[flagId as keyof FeaturesConfig],
          ...flagValue,
        };
      }
    }
  }

  // Apply environment variable overrides (highest priority)
  for (const flagId of Object.keys(resolved)) {
    const envOverride = getEnvOverride(flagId);
    if (envOverride !== undefined) {
      (resolved as Record<string, FeatureFlagDefinition>)[flagId] = {
        ...resolved[flagId as keyof FeaturesConfig],
        enabled: envOverride,
      };
    }
  }

  return resolved;
}

/**
 * Check if a feature is enabled, including parent chain checking
 */
export function isFeatureEnabled(flags: FeaturesConfig, flagId: string): boolean {
  const flag = flags[flagId as keyof FeaturesConfig];
  if (!flag) {
    return false;
  }

  if (!flag.enabled) {
    return false;
  }

  // Check parent chain
  if (flag.parentFlag) {
    return isFeatureEnabled(flags, flag.parentFlag);
  }

  return true;
}

/**
 * Get all feature flags as a flat record for API responses
 */
export function getFeatureFlagsForApi(
  flags: FeaturesConfig
): Record<string, FeatureFlagDefinition> {
  return { ...flags } as Record<string, FeatureFlagDefinition>;
}

/**
 * List all available feature flag IDs
 */
export function getAllFlagIds(): string[] {
  return Object.keys(PRE_LAUNCH_DEFAULTS);
}

/**
 * Get the environment variable name for a feature flag
 * Useful for documentation and debugging
 */
export function getEnvVarName(flagId: string): string {
  return flagIdToEnvVar(flagId);
}

/**
 * Generate documentation for all feature flags and their env vars
 */
export function generateFlagDocumentation(): string {
  const lines: string[] = [
    '# Feature Flags Configuration',
    '',
    'Feature flags can be controlled via:',
    '1. Environment variables (highest priority)',
    '2. config.yml file',
    '3. Default values (pre-launch safe)',
    '',
    '## Environment Variables',
    '',
    '| Flag ID | Environment Variable | Default |',
    '|---------|---------------------|---------|',
  ];

  for (const flagId of getAllFlagIds()) {
    const envVar = getEnvVarName(flagId);
    const defaultValue = PRE_LAUNCH_DEFAULTS[flagId as keyof FeaturesConfig].enabled;
    lines.push(`| ${flagId} | ${envVar} | ${defaultValue} |`);
  }

  return lines.join('\n');
}
