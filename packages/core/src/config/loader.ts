/**
 * Unified Configuration Loader
 *
 * This module provides a centralized configuration system that:
 * - Loads from .mcp.config.local.json (primary)
 * - Supports environment variable substitution (${VAR_NAME})
 * - Validates with Zod schemas
 * - Provides typed access to all configuration
 * - Maintains backward compatibility with legacy config format
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import dotenv from 'dotenv';
import { AppConfigSchema, toLegacyBotConfig, type AppConfig } from './schema.js';
import { mergeWithDefaults } from './defaults.js';

// Load environment variables
dotenv.config();

// =============================================================================
// Environment Variable Helpers
// =============================================================================

let secretOverrides: Record<string, string> = {};

/**
 * Provide secret overrides for configuration lookups.
 * Used when secrets are loaded from the database at runtime.
 * Also sets process.env for compatibility with services that read env directly.
 */
export function setSecretOverrides(overrides: Record<string, string>): void {
  secretOverrides = { ...secretOverrides, ...overrides };
  // Also set process.env for services that read environment variables directly
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

export function clearSecretOverrides(): void {
  secretOverrides = {};
}

export function removeSecretOverride(key: string): void {
  delete secretOverrides[key];
}

/**
 * Get environment variable with optional default.
 * Secrets overrides take precedence over process.env.
 */
function getEnv(name: string, defaultValue?: string): string | undefined {
  return secretOverrides[name] ?? process.env[name] ?? defaultValue;
}

/**
 * Get environment variable with secret overrides applied.
 * Exposed for services that rely on env-style configuration.
 */
export function getEnvWithSecrets(name: string, defaultValue?: string): string | undefined {
  return getEnv(name, defaultValue);
}

/**
 * Get required environment variable (throws if missing)
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Substitute environment variables in a string
 * Supports ${VAR_NAME} syntax
 */
function substituteEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      // Keep the placeholder if env var not found (allows optional vars)
      return `\${${varName}}`;
    }
    return envValue;
  });
}

/**
 * Deep substitute environment variables in an object
 */
export function deepSubstituteEnvVars<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSubstituteEnvVars) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepSubstituteEnvVars(value);
    }
    return result as T;
  }
  return obj;
}

// =============================================================================
// Config File Loading
// =============================================================================

/**
 * Find the project root by looking for package.json
 */
function findProjectRoot(): string {
  // Start from current working directory
  let currentDir = process.cwd();

  // Walk up until we find package.json
  while (currentDir !== '/') {
    if (existsSync(resolve(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }

  // Fallback to cwd
  return process.cwd();
}

/**
 * Possible config file locations (in priority order)
 */
function getConfigPaths(): string[] {
  const projectRoot = findProjectRoot();
  return [
    resolve(projectRoot, '.mcp.config.local.json'),
    resolve(projectRoot, '.mcp.config.json'),
    resolve(projectRoot, 'mcp-config.json'),
    resolve(projectRoot, 'config.json'),
    resolve(projectRoot, 'config/app.json'),
  ];
}

/**
 * Load config from JSON file
 */
function loadConfigFile(): Record<string, unknown> | null {
  for (const configPath of getConfigPaths()) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        // Apply environment variable substitution
        return deepSubstituteEnvVars(parsed);
      } catch (error) {
        console.error(`Error loading config from ${configPath}:`, error);
      }
    }
  }
  return null;
}

// =============================================================================
// Config from Environment Variables
// =============================================================================

// Type for partial integrations during config building
type PartialIntegrations = {
  jira?: {
    host: string;
    email: string;
    apiToken: string;
  };
  slack?: {
    botToken: string;
    signingSecret: string;
    appToken: string;
    standupChannel: string;
  };
  whatsapp?: {
    adminPhone: string;
    sessionPath: string;
    autoReconnect: boolean;
    messageRateLimit: number;
    allowedGroupIds: string[];
  };
  googleDocs?: {
    credentialsPath: string;
    presentationId?: string;
  };
};

/**
 * Build config from environment variables
 * This provides a fallback when no config file exists
 */
function buildConfigFromEnv(): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const integrations: PartialIntegrations = {};

  // Organization
  if (getEnv('JIRA_PROJECT_KEY') || getEnv('JIRA_COMPONENT')) {
    config.organization = {
      name: getEnv('ORG_NAME', 'My Organization') || 'My Organization',
      jiraProjectKey: getEnv('JIRA_PROJECT_KEY', 'PROJ') || 'PROJ',
      jiraComponent: getEnv('JIRA_COMPONENT'),
    };
  }

  // JIRA
  if (getEnv('JIRA_HOST') && getEnv('JIRA_EMAIL') && getEnv('JIRA_API_TOKEN')) {
    integrations.jira = {
      host: requireEnv('JIRA_HOST'),
      email: requireEnv('JIRA_EMAIL'),
      apiToken: requireEnv('JIRA_API_TOKEN'),
    };
  }

  // Slack
  if (getEnv('SLACK_BOT_TOKEN')) {
    integrations.slack = {
      botToken: requireEnv('SLACK_BOT_TOKEN'),
      signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
      appToken: requireEnv('SLACK_APP_TOKEN'),
      standupChannel: getEnv('STANDUP_CHANNEL', '#orienter-standups') || '#orienter-standups',
    };
  }

  // WhatsApp
  if (getEnv('WHATSAPP_ADMIN_PHONE')) {
    integrations.whatsapp = {
      adminPhone: requireEnv('WHATSAPP_ADMIN_PHONE'),
      sessionPath:
        getEnv('WHATSAPP_SESSION_PATH', './data/whatsapp-auth') || './data/whatsapp-auth',
      autoReconnect: getEnv('WHATSAPP_AUTO_RECONNECT') !== 'false',
      messageRateLimit: parseInt(getEnv('WHATSAPP_RATE_LIMIT', '10') || '10', 10),
      allowedGroupIds: getEnv('WHATSAPP_ALLOWED_GROUPS')?.split(',') || [],
    };
  }

  // Google Docs
  if (getEnv('GOOGLE_SLIDES_PRESENTATION_ID')) {
    integrations.googleDocs = {
      credentialsPath:
        getEnv('GOOGLE_CREDENTIALS_PATH', './credentials/service-account.json') ||
        './credentials/service-account.json',
      presentationId: getEnv('GOOGLE_SLIDES_PRESENTATION_ID'),
    };
  }

  if (Object.keys(integrations).length > 0) {
    config.integrations = integrations;
  }

  // SLA
  const slaEnabled = getEnv('ENABLE_SLA_CHECKING') !== 'false';
  config.sla = {
    enabled: slaEnabled,
    thresholds: [
      { status: 'In Progress', maxDays: parseInt(getEnv('SLA_IN_PROGRESS_DAYS', '3') || '3', 10) },
      { status: 'In Review', maxDays: parseInt(getEnv('SLA_IN_REVIEW_DAYS', '2') || '2', 10) },
      { status: 'To Do', maxDays: parseInt(getEnv('SLA_TODO_DAYS', '5') || '5', 10) },
    ],
  };

  // Board
  const backlogStatuses = getEnv('KANBAN_BACKLOG_STATUSES');
  if (backlogStatuses) {
    config.board = {
      kanbanBacklogStatuses: backlogStatuses.split(',').map((s) => s.trim()),
    };
  }

  // Cron
  config.cron = {
    standup: getEnv('STANDUP_CRON', '30 9 * * 1-5') || '30 9 * * 1-5',
    preStandup: getEnv('PRE_STANDUP_CRON', '15 9 * * 1-5') || '15 9 * * 1-5',
    staleCheck: getEnv('STALE_CHECK_CRON', '0 17 * * 1-5') || '0 17 * * 1-5',
    weeklySummary: getEnv('WEEKLY_SUMMARY_CRON', '0 16 * * 5') || '0 16 * * 5',
  };

  // Agent
  config.agent = {
    enabled: getEnv('AGENT_ENABLED') === 'true',
    anthropicApiKey: getEnv('ANTHROPIC_API_KEY'),
    model: getEnv('AGENT_MODEL', 'claude-sonnet-4-20250514') || 'claude-sonnet-4-20250514',
  };

  // Dashboard
  config.dashboard = {
    enabled: getEnv('DASHBOARD_ENABLED') !== 'false',
    port: parseInt(getEnv('DASHBOARD_PORT', '4098') || '4098', 10),
    jwtSecret: getEnv('DASHBOARD_JWT_SECRET'),
    defaultPermission:
      (getEnv('DASHBOARD_DEFAULT_PERMISSION', 'read_only') as
        | 'ignored'
        | 'read_only'
        | 'read_write') || 'read_only',
  };

  // General
  config.timezone = getEnv('TZ', 'UTC') || 'UTC';
  config.logLevel = (getEnv('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error') || 'info';

  return config;
}

// =============================================================================
// Main Config Loading
// =============================================================================

let cachedConfig: AppConfig | null = null;
let configVersion = 0;

/**
 * Deep merge utility for combining config objects
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Load and validate the application configuration
 * Combines config file, environment variables, and defaults
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Try to load from config file first
  const fileConfig = loadConfigFile();

  // Build config from environment variables
  const envConfig = buildConfigFromEnv();

  // Merge: file config takes precedence, then env, then defaults
  const mergedConfig = mergeWithDefaults({
    ...envConfig,
    ...fileConfig,
    // Deep merge integrations
    integrations: {
      ...(envConfig.integrations as Record<string, unknown>),
      ...(fileConfig?.integrations as Record<string, unknown>),
    },
  } as Partial<AppConfig>);

  // Validate with Zod
  const result = AppConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    console.error('Configuration validation failed:');
    // Zod v4 uses issues instead of errors
    const issues = result.error.issues || [];
    for (const issue of issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    throw new Error('Invalid configuration. See errors above.');
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Get the current configuration
 * Throws if config hasn't been loaded
 */
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

/**
 * Clear the cached configuration
 * Useful for testing or reloading config
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get the legacy BotConfig format for backward compatibility
 */
export function getLegacyConfig() {
  return toLegacyBotConfig(getConfig());
}

// =============================================================================
// Raw Config Access (for services needing direct config file access)
// =============================================================================

let cachedRawConfig: Record<string, unknown> | null = null;

/**
 * Get the raw config file content with environment variable substitution.
 * Use this when services need direct access to config sections that aren't
 * part of the validated AppConfig schema (e.g., opencode, transcription).
 *
 * This is useful for:
 * - WhatsApp bot: needs whatsapp, opencode, transcription, dashboard sections
 * - Slack bot: needs slack, opencode, dashboard sections
 * - MCP server: needs full raw access to all sections
 */
export function getRawConfig(): Record<string, unknown> {
  if (cachedRawConfig) {
    return cachedRawConfig;
  }

  // Load from config file with env substitution
  const fileConfig = loadConfigFile();

  // Build from environment as fallback
  const envConfig = buildConfigFromEnv();

  // Merge file config over env config
  cachedRawConfig = deepMerge(envConfig, fileConfig || {});

  return cachedRawConfig;
}

/**
 * Clear all cached configs (raw and validated)
 */
export function clearAllConfigCaches(): void {
  cachedConfig = null;
  cachedRawConfig = null;
}

export function invalidateConfigCache(): void {
  clearAllConfigCaches();
  configVersion += 1;
}

export function getConfigVersion(): number {
  return configVersion;
}
