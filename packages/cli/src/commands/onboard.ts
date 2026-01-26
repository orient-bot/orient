/**
 * Onboard Command
 *
 * Interactive setup wizard for new Orient installations.
 */

import { Command } from 'commander';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import * as readline from 'readline';
import { randomBytes } from 'crypto';

const ORIENT_HOME = process.env.ORIENT_HOME || join(homedir(), '.orient');

export const onboardCommand = new Command('onboard')
  .description('Interactive setup wizard for Orient')
  .option('--skip-prompts', 'Skip interactive prompts and use defaults')
  .option('--database <type>', 'Database type (sqlite only)', 'sqlite')
  .option('--storage <type>', 'Storage type: local or s3', 'local')
  .action(async (options) => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║            Orient Onboarding Wizard                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    // Check prerequisites
    console.log('Checking prerequisites...');
    if (!checkPrerequisites()) {
      process.exit(1);
    }

    // Create directory structure
    console.log('');
    console.log(`Setting up Orient in ${ORIENT_HOME}...`);
    createDirectories();

    // Configure environment
    console.log('');
    const config = options.skipPrompts ? getDefaultConfig(options) : await promptForConfig(options);

    writeEnvFile(config);

    // Setup PM2
    console.log('');
    console.log('Setting up PM2 process manager...');
    setupPM2();

    // Initialize database
    console.log('');
    console.log('Initializing database...');
    initializeDatabase(config);

    // Print success message
    console.log('');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ Onboarding complete!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Next steps:');
    console.log('');
    console.log('    orient start      # Start all services');
    console.log('    orient status     # Check service status');
    console.log('    orient logs       # View logs');
    console.log('');
    console.log('  Dashboard: http://localhost:4098');
    console.log('  WhatsApp:  http://localhost:4097/qr');
    console.log('');
  });

function checkPrerequisites(): boolean {
  let success = true;

  // Check Node.js
  try {
    const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
    const major = parseInt(nodeVersion.replace('v', '').split('.')[0]);
    if (major >= 20) {
      console.log(`  ✓ Node.js ${nodeVersion}`);
    } else {
      console.log(`  ✗ Node.js ${nodeVersion} (requires 20+)`);
      success = false;
    }
  } catch {
    console.log('  ✗ Node.js not found');
    success = false;
  }

  // Check pnpm
  try {
    const pnpmVersion = execSync('pnpm -v', { encoding: 'utf8' }).trim();
    console.log(`  ✓ pnpm ${pnpmVersion}`);
  } catch {
    console.log('  ✗ pnpm not found (install with: npm install -g pnpm)');
    success = false;
  }

  // Check git
  try {
    execSync('git --version', { encoding: 'utf8' });
    console.log('  ✓ git');
  } catch {
    console.log('  ✗ git not found');
    success = false;
  }

  return success;
}

function createDirectories(): void {
  const dirs = [
    ORIENT_HOME,
    join(ORIENT_HOME, 'data', 'sqlite'),
    join(ORIENT_HOME, 'data', 'media'),
    join(ORIENT_HOME, 'data', 'whatsapp-auth'),
    join(ORIENT_HOME, 'logs'),
    join(ORIENT_HOME, 'bin'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`  Created ${dir}`);
    }
  }
}

interface OrientConfig {
  databaseType: 'sqlite';
  storageType: 'local' | 's3';
  anthropicKey?: string;
  masterKey: string;
  jwtSecret: string;
}

function getDefaultConfig(options: { database: string; storage: string }): OrientConfig {
  return {
    databaseType: 'sqlite', // SQLite-only
    storageType: options.storage as 'local' | 's3',
    masterKey: randomBytes(32).toString('hex'),
    jwtSecret: randomBytes(32).toString('hex'),
  };
}

async function promptForConfig(options: {
  database: string;
  storage: string;
}): Promise<OrientConfig> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log('Configuration:');
  console.log('');

  // Database type (SQLite-only now)
  console.log('  Database: SQLite (default)');
  const databaseType = 'sqlite' as const;

  // Storage type
  const stType = await question(`Storage type [local/s3] (${options.storage}): `);
  const storageType = (stType.trim() || options.storage) as 'local' | 's3';

  // Anthropic API key
  const anthropicKey = await question('Anthropic API key (optional, for AI features): ');

  rl.close();

  return {
    databaseType,
    storageType,
    anthropicKey: anthropicKey.trim() || undefined,
    masterKey: randomBytes(32).toString('hex'),
    jwtSecret: randomBytes(32).toString('hex'),
  };
}

function writeEnvFile(config: OrientConfig): void {
  const envPath = join(ORIENT_HOME, '.env');

  // Check for existing config
  if (existsSync(envPath)) {
    console.log('  Existing configuration found, preserving...');
    return;
  }

  const sqlitePath = join(ORIENT_HOME, 'data', 'sqlite', 'orient.db');
  const storagePath = join(ORIENT_HOME, 'data', 'media');

  const envContent = `# =============================================================================
# Orient Configuration
# Generated: ${new Date().toISOString()}
# =============================================================================

# Environment
NODE_ENV=production
LOG_LEVEL=info

# Database (SQLite)
DATABASE_TYPE=sqlite
SQLITE_DATABASE=${sqlitePath}

# Storage
STORAGE_TYPE=${config.storageType}
${config.storageType === 'local' ? `STORAGE_PATH=${storagePath}` : '# S3_BUCKET=your-bucket'}

# Security
ORIENT_MASTER_KEY=${config.masterKey}
DASHBOARD_JWT_SECRET=${config.jwtSecret}

# Dashboard
DASHBOARD_PORT=4098
BASE_URL=http://localhost:4098

# AI Provider
${config.anthropicKey ? `ANTHROPIC_API_KEY=${config.anthropicKey}` : '# ANTHROPIC_API_KEY=your-api-key'}
`;

  writeFileSync(envPath, envContent);
  chmodSync(envPath, 0o600);
  console.log(`  Configuration written to ${envPath}`);
}

function setupPM2(): void {
  // Check if PM2 is installed
  try {
    execSync('pm2 -v', { encoding: 'utf8' });
  } catch {
    console.log('  Installing PM2...');
    execSync('npm install -g pm2', { stdio: 'inherit' });
  }

  // Create ecosystem config
  const ecosystemPath = join(ORIENT_HOME, 'ecosystem.config.cjs');
  const ecosystemContent = `const path = require('path');
const ORIENT_HOME = process.env.ORIENT_HOME || \`\${process.env.HOME}/.orient\`;

module.exports = {
  apps: [
    {
      name: 'orient-dashboard',
      cwd: path.join(ORIENT_HOME, 'orient'),
      script: 'dist/packages/dashboard/src/main.js',
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/dashboard-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/dashboard-out.log'),
      max_memory_restart: '500M',
    },
    {
      name: 'orient-whatsapp',
      cwd: path.join(ORIENT_HOME, 'orient'),
      script: 'dist/packages/bot-whatsapp/src/main.js',
      env_file: path.join(ORIENT_HOME, '.env'),
      error_file: path.join(ORIENT_HOME, 'logs/whatsapp-error.log'),
      out_file: path.join(ORIENT_HOME, 'logs/whatsapp-out.log'),
      max_memory_restart: '500M',
    },
  ],
};
`;

  writeFileSync(ecosystemPath, ecosystemContent);
  console.log(`  PM2 ecosystem config written to ${ecosystemPath}`);
}

function initializeDatabase(_config: OrientConfig): void {
  const sqlitePath = join(ORIENT_HOME, 'data', 'sqlite', 'orient.db');
  const sqliteDir = dirname(sqlitePath);

  if (!existsSync(sqliteDir)) {
    mkdirSync(sqliteDir, { recursive: true });
  }

  console.log(`  SQLite database will be created at ${sqlitePath}`);
}
