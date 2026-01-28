/**
 * PM2 Process Management Commands
 *
 * Start, stop, restart, and check status of Orient services.
 */

import { Command } from 'commander';
import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { getOrientHome } from '@orientbot/core';

const ORIENT_HOME = getOrientHome();
const ECOSYSTEM_PATH = join(ORIENT_HOME, 'ecosystem.config.cjs');

function checkPM2(): boolean {
  try {
    execSync('pm2 -v', { stdio: 'pipe' });
    return true;
  } catch {
    console.error('PM2 is not installed. Install with: npm install -g pm2');
    return false;
  }
}

function checkEcosystem(): boolean {
  if (!existsSync(ECOSYSTEM_PATH)) {
    console.error(`Ecosystem config not found at ${ECOSYSTEM_PATH}`);
    console.error('Run "orient onboard" first to set up Orient.');
    return false;
  }
  return true;
}

export const startCommand = new Command('start')
  .description('Start all Orient services')
  .option('--only <service>', 'Start only a specific service')
  .action((options) => {
    if (!checkPM2() || !checkEcosystem()) {
      process.exit(1);
    }

    console.log('Starting Orient services...');

    try {
      if (options.only) {
        spawnSync('pm2', ['start', ECOSYSTEM_PATH, '--only', options.only], {
          stdio: 'inherit',
          env: { ...process.env, ORIENT_HOME },
        });
      } else {
        spawnSync('pm2', ['start', ECOSYSTEM_PATH], {
          stdio: 'inherit',
          env: { ...process.env, ORIENT_HOME },
        });
      }

      // Save the process list
      spawnSync('pm2', ['save'], { stdio: 'inherit' });

      console.log('');
      console.log('Services started. Run "orient status" to check status.');
    } catch (error) {
      console.error('Failed to start services:', error);
      process.exit(1);
    }
  });

export const stopCommand = new Command('stop')
  .description('Stop all Orient services')
  .option('--only <service>', 'Stop only a specific service')
  .action((options) => {
    if (!checkPM2()) {
      process.exit(1);
    }

    console.log('Stopping Orient services...');

    try {
      if (options.only) {
        spawnSync('pm2', ['stop', options.only], { stdio: 'inherit' });
      } else {
        spawnSync('pm2', ['stop', 'all'], { stdio: 'inherit' });
      }
    } catch (error) {
      console.error('Failed to stop services:', error);
      process.exit(1);
    }
  });

export const restartCommand = new Command('restart')
  .description('Restart all Orient services')
  .option('--only <service>', 'Restart only a specific service')
  .action((options) => {
    if (!checkPM2()) {
      process.exit(1);
    }

    console.log('Restarting Orient services...');

    try {
      if (options.only) {
        spawnSync('pm2', ['restart', options.only], { stdio: 'inherit' });
      } else {
        spawnSync('pm2', ['restart', 'all'], { stdio: 'inherit' });
      }
    } catch (error) {
      console.error('Failed to restart services:', error);
      process.exit(1);
    }
  });

export const statusCommand = new Command('status')
  .description('Show status of Orient services')
  .action(() => {
    if (!checkPM2()) {
      process.exit(1);
    }

    spawnSync('pm2', ['status'], { stdio: 'inherit' });
  });
