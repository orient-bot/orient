/**
 * Upgrade Command
 *
 * Update Orient to the latest version.
 */

import { Command } from 'commander';
import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const ORIENT_HOME = process.env.ORIENT_HOME || join(homedir(), '.orient');
const ORIENT_REPO = join(ORIENT_HOME, 'orient');

export const upgradeCommand = new Command('upgrade')
  .description('Update Orient to the latest version')
  .option('--check', 'Check for updates without installing')
  .option('--force', 'Force upgrade even if already on latest')
  .action(async (options) => {
    if (!existsSync(ORIENT_REPO)) {
      console.error(`Orient installation not found at ${ORIENT_REPO}`);
      console.error('Run "orient onboard" first to install Orient.');
      process.exit(1);
    }

    console.log('Checking for updates...');

    // Fetch latest from remote
    try {
      execSync('git fetch origin', { cwd: ORIENT_REPO, stdio: 'pipe' });
    } catch (error) {
      console.error('Failed to fetch updates from remote');
      process.exit(1);
    }

    // Get current and remote version
    const currentCommit = execSync('git rev-parse HEAD', {
      cwd: ORIENT_REPO,
      encoding: 'utf8',
    }).trim();

    const remoteCommit = execSync('git rev-parse origin/main', {
      cwd: ORIENT_REPO,
      encoding: 'utf8',
    }).trim();

    if (currentCommit === remoteCommit && !options.force) {
      console.log('✓ Already up to date!');
      return;
    }

    // Get commit count difference
    const behindCount = execSync(`git rev-list --count ${currentCommit}..${remoteCommit}`, {
      cwd: ORIENT_REPO,
      encoding: 'utf8',
    }).trim();

    console.log(`Found ${behindCount} new commits`);

    if (options.check) {
      console.log('');
      console.log('Recent changes:');
      const recentCommits = execSync(
        `git log ${currentCommit}..${remoteCommit} --oneline --max-count=10`,
        { cwd: ORIENT_REPO, encoding: 'utf8' }
      );
      console.log(recentCommits);
      console.log('Run "orient upgrade" to install updates.');
      return;
    }

    console.log('');
    console.log('Upgrading Orient...');
    console.log('');

    // Stop services
    console.log('Stopping services...');
    try {
      execSync('pm2 stop all', { stdio: 'pipe' });
    } catch {
      // Ignore if no services running
    }

    // Pull latest
    console.log('Pulling latest changes...');
    try {
      spawnSync('git', ['checkout', 'main'], { cwd: ORIENT_REPO, stdio: 'inherit' });
      spawnSync('git', ['pull', 'origin', 'main'], { cwd: ORIENT_REPO, stdio: 'inherit' });
    } catch (error) {
      console.error('Failed to pull latest changes');
      process.exit(1);
    }

    // Install dependencies
    console.log('');
    console.log('Installing dependencies...');
    spawnSync('pnpm', ['install', '--frozen-lockfile'], {
      cwd: ORIENT_REPO,
      stdio: 'inherit',
    });

    // Build
    console.log('');
    console.log('Building packages...');
    spawnSync('pnpm', ['run', 'build'], { cwd: ORIENT_REPO, stdio: 'inherit' });

    // Build dashboard
    console.log('');
    console.log('Building dashboard...');
    spawnSync('pnpm', ['run', 'dashboard:build'], { cwd: ORIENT_REPO, stdio: 'inherit' });

    // Update version file
    try {
      const packageJson = JSON.parse(readFileSync(join(ORIENT_REPO, 'package.json'), 'utf8'));
      writeFileSync(join(ORIENT_HOME, '.orient-version'), packageJson.version || 'unknown');
    } catch {
      // Ignore version file errors
    }

    console.log('');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('✓ Upgrade complete!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Run "orient start" to start services with the new version.');
    console.log('');
  });
