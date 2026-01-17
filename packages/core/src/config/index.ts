/**
 * Configuration Module
 *
 * Central export for all configuration-related functionality.
 */

// Export loader functions
export {
  loadConfig,
  getConfig,
  clearConfigCache,
  getLegacyConfig,
  getRawConfig,
  clearAllConfigCaches,
  invalidateConfigCache,
  getConfigVersion,
  getEnvWithSecrets,
  setSecretOverrides,
  clearSecretOverrides,
  removeSecretOverride,
  deepSubstituteEnvVars,
} from './loader.js';

export { startConfigPoller, stopConfigPoller } from './poller.js';

// Export schema and types
export * from './schema.js';

// Export defaults
export * from './defaults.js';

// Export AI model configuration
export * from './models.js';

// Export OpenCode exclusions
export * from './opencode-exclusions.js';
