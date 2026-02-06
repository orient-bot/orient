/**
 * Logs Command
 *
 * View logs from Orient services.
 */

import { Command } from 'commander';
import { execSync, spawnSync } from 'child_process';

function checkPM2(): boolean {
  try {
    execSync('pm2 -v', { stdio: 'pipe' });
    return true;
  } catch {
    console.error('PM2 is not installed. Install with: npm install -g pm2');
    return false;
  }
}

export const logsCommand = new Command('logs')
  .description('View Orient service logs')
  .argument('[service]', 'Service name (dashboard, opencode, whatsapp, slack)')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action((service, options) => {
    if (!checkPM2()) {
      process.exit(1);
    }

    const args = ['logs'];

    // Map friendly names to PM2 process names
    if (service) {
      const serviceMap: Record<string, string> = {
        dashboard: 'orient',
        opencode: 'orient-opencode',
        whatsapp: 'orient-whatsapp',
        slack: 'orient-slack',
      };
      args.push(serviceMap[service] || service);
    }

    args.push('--lines', options.lines);

    if (!options.follow) {
      args.push('--nostream');
    }

    spawnSync('pm2', args, { stdio: 'inherit' });
  });
