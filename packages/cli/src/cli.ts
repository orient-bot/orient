#!/usr/bin/env node
/**
 * Orient CLI
 *
 * Command-line interface for managing Orient installations.
 *
 * Usage:
 *   orient <command> [options]
 *
 * Commands:
 *   onboard   Interactive setup wizard
 *   start     Start all services
 *   stop      Stop all services
 *   restart   Restart all services
 *   status    Show service status
 *   logs      View service logs
 *   doctor    Run diagnostics
 *   config    Manage configuration
 *   upgrade   Update to latest version
 */

import { Command } from 'commander';
import { onboardCommand } from './commands/onboard.js';
import { startCommand, stopCommand, restartCommand, statusCommand } from './commands/pm2.js';
import { logsCommand } from './commands/logs.js';
import { doctorCommand } from './commands/doctor.js';
import { configCommand } from './commands/config.js';
import { upgradeCommand } from './commands/upgrade.js';

const program = new Command();

program
  .name('orient')
  .description('Orient CLI - Manage your AI assistant installation')
  .version('0.1.1');

// Add commands
program.addCommand(onboardCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(restartCommand);
program.addCommand(statusCommand);
program.addCommand(logsCommand);
program.addCommand(doctorCommand);
program.addCommand(configCommand);
program.addCommand(upgradeCommand);

// Parse arguments
program.parse();
