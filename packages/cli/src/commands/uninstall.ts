/**
 * Uninstall Command
 *
 * Safely uninstall Orient with options to preserve data.
 */

import { Command } from 'commander';
import { execSync, spawnSync } from 'child_process';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as readline from 'readline';

const ORIENT_HOME = process.env.ORIENT_HOME || join(homedir(), '.orient');

async function promptUninstallMode(): Promise<'full' | 'keep-data' | 'cancel'> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('');
    console.log('How would you like to uninstall Orient?');
    console.log('');
    console.log('  1. Full wipe - Remove everything including data');
    console.log('  2. Keep data - Remove code but preserve database and config');
    console.log('  3. Cancel');
    console.log('');

    rl.question('Choose an option [1/2/3]: ', (answer) => {
      rl.close();
      switch (answer.trim()) {
        case '1':
          resolve('full');
          break;
        case '2':
          resolve('keep-data');
          break;
        default:
          resolve('cancel');
      }
    });
  });
}

async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} Type 'yes' to confirm: `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

function stopPM2Processes(): void {
  console.log('Stopping Orient services...');
  try {
    spawnSync('pm2', ['stop', 'all'], { stdio: 'pipe' });
    spawnSync('pm2', ['delete', 'all'], { stdio: 'pipe' });
  } catch {
    // PM2 might not be running, ignore errors
  }
}

function removeOrientFull(): void {
  console.log('Removing all Orient files...');
  if (existsSync(ORIENT_HOME)) {
    rmSync(ORIENT_HOME, { recursive: true, force: true });
  }
}

function removeOrientKeepData(): void {
  console.log('Removing Orient code but preserving data...');

  // Remove code and binaries but keep data directory and .env
  const toRemove = [
    join(ORIENT_HOME, 'orient'),
    join(ORIENT_HOME, 'bin'),
    join(ORIENT_HOME, 'logs'),
    join(ORIENT_HOME, 'ecosystem.config.cjs'),
    join(ORIENT_HOME, '.orient-version'),
  ];

  for (const path of toRemove) {
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
    }
  }

  console.log(`Data preserved in ${join(ORIENT_HOME, 'data')}`);
  console.log(`Configuration preserved in ${join(ORIENT_HOME, '.env')}`);
}

function cleanShellProfile(): void {
  console.log('Cleaning shell profile...');

  const rcFiles = [
    join(homedir(), '.zshrc'),
    join(homedir(), '.bashrc'),
    join(homedir(), '.profile'),
  ];

  for (const rcFile of rcFiles) {
    if (existsSync(rcFile)) {
      try {
        let content = readFileSync(rcFile, 'utf8');
        const lines = content.split('\n');
        const filteredLines = lines.filter(
          (line) => !line.includes('# Orient') && !line.includes('ORIENT_HOME')
        );

        if (filteredLines.length !== lines.length) {
          writeFileSync(rcFile, filteredLines.join('\n'));
        }
      } catch {
        // Ignore errors when cleaning shell profile
      }
    }
  }
}

export const uninstallCommand = new Command('uninstall')
  .description('Uninstall Orient')
  .option('--keep-data', 'Preserve database and media files')
  .option('--force', 'Skip confirmation prompts')
  .action(async (options) => {
    // Check if Orient is installed
    if (!existsSync(ORIENT_HOME)) {
      console.log('Orient is not installed.');
      return;
    }

    let keepData = options.keepData || false;

    // Get confirmation unless --force is specified
    if (!options.force) {
      const choice = await promptUninstallMode();

      if (choice === 'cancel') {
        console.log('Uninstall cancelled.');
        return;
      }

      keepData = choice === 'keep-data';

      // Double-confirm for full wipe
      if (!keepData) {
        const confirmed = await confirmAction(
          '\nThis will permanently delete ALL Orient data including your database. '
        );
        if (!confirmed) {
          console.log('Uninstall cancelled.');
          return;
        }
      }
    }

    // Stop PM2 processes
    stopPM2Processes();

    // Remove files based on mode
    if (keepData) {
      removeOrientKeepData();
    } else {
      removeOrientFull();
    }

    // Clean shell profile
    cleanShellProfile();

    console.log('');
    console.log('Orient has been uninstalled.');

    if (keepData) {
      console.log('');
      console.log('Your data and configuration have been preserved.');
      console.log('To completely remove Orient, run: rm -rf ~/.orient');
    }
  });
