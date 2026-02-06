/**
 * Doctor Command
 *
 * Run diagnostics to check Orient installation health.
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { getOrientHome } from '@orient-bot/core';
import * as net from 'net';

const ORIENT_HOME = getOrientHome();

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function checkOk(label: string): void {
  console.log(`  ${GREEN}✓${RESET} ${label}`);
}

function checkFail(label: string, hint?: string): void {
  console.log(`  ${RED}✗${RESET} ${label}`);
  if (hint) {
    console.log(`    ${YELLOW}→ ${hint}${RESET}`);
  }
}

function checkWarn(label: string, hint?: string): void {
  console.log(`  ${YELLOW}!${RESET} ${label}`);
  if (hint) {
    console.log(`    ${YELLOW}→ ${hint}${RESET}`);
  }
}

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

export const doctorCommand = new Command('doctor')
  .description('Run diagnostics to check Orient installation')
  .action(async () => {
    console.log('');
    console.log('Orient Diagnostics');
    console.log('==================');
    console.log('');

    // === Prerequisites ===
    console.log('Prerequisites:');

    // Node.js
    try {
      const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
      const major = parseInt(nodeVersion.replace('v', '').split('.')[0]);
      if (major >= 20) {
        checkOk(`Node.js ${nodeVersion}`);
      } else {
        checkFail(`Node.js ${nodeVersion}`, 'Version 20+ required');
      }
    } catch {
      checkFail('Node.js not found', 'Install with: brew install node@20');
    }

    // pnpm
    try {
      const pnpmVersion = execSync('pnpm -v', { encoding: 'utf8' }).trim();
      checkOk(`pnpm ${pnpmVersion}`);
    } catch {
      checkFail('pnpm not found', 'Install with: npm install -g pnpm');
    }

    // PM2
    try {
      const pm2Version = execSync('pm2 -v', { encoding: 'utf8' }).trim();
      checkOk(`PM2 ${pm2Version}`);
    } catch {
      checkFail('PM2 not found', 'Install with: npm install -g pm2');
    }

    // git
    try {
      execSync('git --version', { encoding: 'utf8' });
      checkOk('git');
    } catch {
      checkFail('git not found', 'Install with: brew install git');
    }

    console.log('');

    // === Configuration ===
    console.log('Configuration:');

    // ORIENT_HOME
    if (existsSync(ORIENT_HOME)) {
      checkOk(`ORIENT_HOME: ${ORIENT_HOME}`);
    } else {
      checkFail(`ORIENT_HOME: ${ORIENT_HOME}`, 'Directory does not exist. Run "orient onboard"');
    }

    // .env file
    const envPath = join(ORIENT_HOME, '.env');
    if (existsSync(envPath)) {
      checkOk('.env file exists');

      // Check for required variables
      const envContent = readFileSync(envPath, 'utf8');

      if (
        envContent.includes('ORIENT_MASTER_KEY=') &&
        !envContent.includes('ORIENT_MASTER_KEY=\n')
      ) {
        checkOk('ORIENT_MASTER_KEY configured');
      } else {
        checkFail('ORIENT_MASTER_KEY not set');
      }

      if (
        envContent.includes('DASHBOARD_JWT_SECRET=') &&
        !envContent.includes('DASHBOARD_JWT_SECRET=\n')
      ) {
        checkOk('DASHBOARD_JWT_SECRET configured');
      } else {
        checkFail('DASHBOARD_JWT_SECRET not set');
      }

      if (
        envContent.includes('ANTHROPIC_API_KEY=') &&
        !envContent.includes('ANTHROPIC_API_KEY=\n') &&
        !envContent.includes('# ANTHROPIC_API_KEY')
      ) {
        checkOk('ANTHROPIC_API_KEY configured');
      } else {
        checkWarn('ANTHROPIC_API_KEY not configured', 'AI features will not work');
      }
    } else {
      checkFail('.env file missing', 'Run "orient onboard" to create configuration');
    }

    // ecosystem.config.cjs
    const ecosystemPath = join(ORIENT_HOME, 'ecosystem.config.cjs');
    if (existsSync(ecosystemPath)) {
      checkOk('PM2 ecosystem config exists');
    } else {
      checkFail('PM2 ecosystem config missing', 'Run "orient onboard"');
    }

    console.log('');

    // === Database ===
    console.log('Database:');

    // Parse DATABASE_TYPE from .env file (process.env may not have it loaded)
    const envFileContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const dbTypeMatch = envFileContent.match(/^DATABASE_TYPE=(\S+)/m);
    const databaseType = dbTypeMatch ? dbTypeMatch[1] : process.env.DATABASE_TYPE || 'postgres';
    console.log(`  Type: ${databaseType}`);

    if (databaseType === 'sqlite') {
      const sqliteMatch = envFileContent.match(/^SQLITE_DATABASE=(\S+)/m);
      const sqlitePath = sqliteMatch
        ? sqliteMatch[1]
        : process.env.SQLITE_DATABASE || join(ORIENT_HOME, 'data', 'sqlite', 'orient.db');
      if (existsSync(sqlitePath)) {
        const stats = statSync(sqlitePath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        checkOk(`SQLite database exists (${sizeMB} MB)`);
      } else {
        checkWarn('SQLite database not initialized', 'Will be created on first run');
      }
    } else {
      const dbUrlMatch = envFileContent.match(/^DATABASE_URL=(\S+)/m);
      const dbUrl = dbUrlMatch ? dbUrlMatch[1] : process.env.DATABASE_URL;
      if (dbUrl) {
        checkOk('DATABASE_URL configured');
      } else {
        checkFail('DATABASE_URL not configured');
      }
    }

    console.log('');

    // === Ports ===
    console.log('Port Availability:');

    const ports = [
      { port: 4097, service: 'WhatsApp bot' },
      { port: 4098, service: 'Dashboard' },
      { port: 4100, service: 'API Gateway' },
    ];

    for (const { port, service } of ports) {
      const available = await checkPort(port);
      if (available) {
        checkOk(`Port ${port} (${service}) - available`);
      } else {
        checkWarn(`Port ${port} (${service}) - in use`);
      }
    }

    console.log('');

    // === Services ===
    console.log('Services:');

    try {
      const pm2List = execSync('pm2 jlist', { encoding: 'utf8' });
      const processes = JSON.parse(pm2List);

      const orientProcesses = processes.filter(
        (p: { name: string }) => p.name === 'orient' || p.name.startsWith('orient-')
      );

      if (orientProcesses.length === 0) {
        checkWarn('No Orient services running', 'Run "orient start" to start services');
      } else {
        for (const proc of orientProcesses) {
          const status = proc.pm2_env.status;
          const memory = (proc.monit?.memory / 1024 / 1024).toFixed(0);
          const uptime = proc.pm2_env.pm_uptime
            ? formatUptime(Date.now() - proc.pm2_env.pm_uptime)
            : 'N/A';

          if (status === 'online') {
            checkOk(`${proc.name}: online (${memory}MB, uptime: ${uptime})`);
          } else if (status === 'stopped') {
            checkWarn(`${proc.name}: stopped`);
          } else {
            checkFail(`${proc.name}: ${status}`);
          }
        }
      }
    } catch {
      checkWarn('Could not check PM2 processes');
    }

    console.log('');
    console.log('Diagnostics complete.');
    console.log('');
  });

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
