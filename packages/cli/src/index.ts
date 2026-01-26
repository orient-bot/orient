/**
 * @orient/cli
 *
 * Command-line tools for Orient.
 *
 * Main entry point for the CLI is in ./cli.ts
 * This file exports utilities for programmatic use.
 */

export const CLI_VERSION = '0.1.1';

// Export command modules for programmatic use
export { onboardCommand } from './commands/onboard.js';
export { startCommand, stopCommand, restartCommand, statusCommand } from './commands/pm2.js';
export { logsCommand } from './commands/logs.js';
export { doctorCommand } from './commands/doctor.js';
export { configCommand } from './commands/config.js';
export { upgradeCommand } from './commands/upgrade.js';
