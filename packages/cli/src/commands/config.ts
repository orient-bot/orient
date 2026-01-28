/**
 * Config Command
 *
 * Manage Orient configuration.
 */

import { Command } from 'commander';
import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getOrientHome } from '@orientbot/core';

const ORIENT_HOME = getOrientHome();
const ENV_PATH = join(ORIENT_HOME, '.env');

export const configCommand = new Command('config')
  .description('Manage Orient configuration')
  .argument('[action]', 'Action: edit, show, get, set')
  .argument('[key]', 'Configuration key (for get/set)')
  .argument('[value]', 'Configuration value (for set)')
  .action((action, key, value) => {
    switch (action) {
      case 'edit':
        editConfig();
        break;
      case 'show':
        showConfig();
        break;
      case 'get':
        if (!key) {
          console.error('Usage: orient config get <key>');
          process.exit(1);
        }
        getConfigValue(key);
        break;
      case 'set':
        if (!key || value === undefined) {
          console.error('Usage: orient config set <key> <value>');
          process.exit(1);
        }
        setConfigValue(key, value);
        break;
      default:
        // Default to edit
        editConfig();
    }
  });

function editConfig(): void {
  if (!existsSync(ENV_PATH)) {
    console.error(`Configuration file not found at ${ENV_PATH}`);
    console.error('Run "orient onboard" first.');
    process.exit(1);
  }

  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
  console.log(`Opening ${ENV_PATH} in ${editor}...`);
  spawnSync(editor, [ENV_PATH], { stdio: 'inherit' });
}

function showConfig(): void {
  if (!existsSync(ENV_PATH)) {
    console.error(`Configuration file not found at ${ENV_PATH}`);
    process.exit(1);
  }

  const content = readFileSync(ENV_PATH, 'utf8');

  // Mask sensitive values
  const maskedContent = content
    .split('\n')
    .map((line) => {
      const sensitiveKeys = ['KEY', 'SECRET', 'PASSWORD', 'TOKEN'];
      const isComment = line.trim().startsWith('#');
      const hasValue = line.includes('=') && !line.trim().endsWith('=');

      if (!isComment && hasValue) {
        const [keyPart] = line.split('=');
        const key = keyPart.trim().toUpperCase();
        if (sensitiveKeys.some((sk) => key.includes(sk))) {
          return `${keyPart}=********`;
        }
      }
      return line;
    })
    .join('\n');

  console.log(maskedContent);
}

function getConfigValue(key: string): void {
  if (!existsSync(ENV_PATH)) {
    console.error(`Configuration file not found at ${ENV_PATH}`);
    process.exit(1);
  }

  const content = readFileSync(ENV_PATH, 'utf8');
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      const value = line.substring(key.length + 1);
      console.log(value);
      return;
    }
  }

  console.error(`Key "${key}" not found in configuration`);
  process.exit(1);
}

function setConfigValue(key: string, value: string): void {
  if (!existsSync(ENV_PATH)) {
    console.error(`Configuration file not found at ${ENV_PATH}`);
    process.exit(1);
  }

  const content = readFileSync(ENV_PATH, 'utf8');
  const lines = content.split('\n');
  let found = false;

  const updatedLines = lines.map((line) => {
    if (line.startsWith(`${key}=`) || line.startsWith(`# ${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    // Add the new key at the end
    updatedLines.push(`${key}=${value}`);
    console.log(`Added ${key}`);
  } else {
    console.log(`Updated ${key}`);
  }

  writeFileSync(ENV_PATH, updatedLines.join('\n'));
  console.log('Configuration saved. Run "orient restart" to apply changes.');
}
