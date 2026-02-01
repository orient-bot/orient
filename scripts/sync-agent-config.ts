#!/usr/bin/env npx tsx
/**
 * Agent Config Sync Script
 *
 * Syncs agent configuration from the database to the filesystem.
 * Used by OpenCode entrypoint to prepare skills before starting.
 *
 * Usage:
 *   npx tsx scripts/sync-agent-config.ts [options]
 *
 * Options:
 *   --env <environment>     Environment (local, prod). Default: from DEPLOY_ENV or 'local'
 *   --project-dir <path>    Project directory. Default: cwd
 *   --skills-source <path>  Source skills directory. Default: <project-dir>/.claude/skills
 *   --skills-target <path>  Target skills directory. Default: <project-dir>/.claude/skills
 *   --dry-run               Show what would be done without making changes
 *   --verbose               Enable verbose logging
 *   --seed                  Run seed data before sync (creates agents if not exist)
 *   --force-seed            Force re-seed even if agents exist
 */

import { getAgentRegistry } from '@orient-bot/agents';
import { createServiceLogger, getBuiltinSkillsPath, getUserSkillsPath } from '@orient-bot/core';
import { closeDatabase } from '@orient-bot/database';
import { seedAgents } from '../data/seeds/agents.js';
import path from 'path';
import fs from 'fs/promises';

const logger = createServiceLogger('sync-agent-config');

interface SyncOptions {
  environment: string;
  projectDir: string;
  skillsSourceDir: string;
  userSkillsSourceDir: string;
  skillsTargetDir: string;
  dryRun: boolean;
  verbose: boolean;
  seed: boolean;
  forceSeed: boolean;
}

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const options: SyncOptions = {
    environment: process.env.DEPLOY_ENV || 'local',
    projectDir: process.cwd(),
    skillsSourceDir: '',
    userSkillsSourceDir: '',
    skillsTargetDir: '',
    dryRun: false,
    verbose: false,
    seed: false,
    forceSeed: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--env':
        options.environment = args[++i];
        break;
      case '--project-dir':
        options.projectDir = args[++i];
        break;
      case '--skills-source':
        options.skillsSourceDir = args[++i];
        break;
      case '--skills-target':
        options.skillsTargetDir = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--seed':
        options.seed = true;
        break;
      case '--force-seed':
        options.forceSeed = true;
        options.seed = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  // Set defaults for skills directories
  if (!options.skillsSourceDir) {
    options.skillsSourceDir = getBuiltinSkillsPath(options.projectDir);
  }
  if (!options.userSkillsSourceDir) {
    options.userSkillsSourceDir = getUserSkillsPath();
  }
  if (!options.skillsTargetDir) {
    options.skillsTargetDir = path.join(options.projectDir, '.claude', 'skills');
  }

  return options;
}

function printHelp(): void {
  console.log(`
Agent Config Sync Script

Syncs agent configuration from the database to the filesystem.
Used by OpenCode entrypoint to prepare skills before starting.

Usage:
  npx tsx scripts/sync-agent-config.ts [options]

Options:
  --env <environment>     Environment (local, prod). Default: from DEPLOY_ENV or 'local'
  --project-dir <path>    Project directory. Default: cwd
  --skills-source <path>  Source skills directory. Default: <project-dir>/.claude/skills
  --skills-target <path>  Target skills directory. Default: <project-dir>/.claude/skills
  --dry-run               Show what would be done without making changes
  --verbose               Enable verbose logging
  --seed                  Run seed data before sync (creates agents if not exist)
  --force-seed            Force re-seed even if agents exist
  --help                  Show this help message

Examples:
  # Sync for production environment
  npx tsx scripts/sync-agent-config.ts --env prod

  # Dry run to see what would be synced
  npx tsx scripts/sync-agent-config.ts --dry-run --verbose

  # Seed and sync
  npx tsx scripts/sync-agent-config.ts --seed

  # Force re-seed and sync
  npx tsx scripts/sync-agent-config.ts --force-seed
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('🔄 Agent Config Sync');
  console.log('═══════════════════════════════════════');
  console.log(`Environment:    ${options.environment}`);
  console.log(`Project Dir:    ${options.projectDir}`);
  console.log(`Skills Source:  ${options.skillsSourceDir}`);
  console.log(`User Skills:    ${options.userSkillsSourceDir}`);
  console.log(`Skills Target:  ${options.skillsTargetDir}`);
  console.log(`Dry Run:        ${options.dryRun}`);
  console.log(`Seed:           ${options.seed}${options.forceSeed ? ' (force)' : ''}`);
  console.log('═══════════════════════════════════════');
  console.log('');

  try {
    const registry = getAgentRegistry();

    // Run seed if requested
    if (options.seed) {
      console.log('📦 Running agent seed...');
      await seedAgents({ force: options.forceSeed });
      console.log('✅ Seed complete\n');
    }

    // Get registry stats
    const stats = await registry.getStats();
    console.log(`📊 Registry Status:`);
    console.log(`   Agents: ${stats.enabledAgents}/${stats.totalAgents} enabled`);
    console.log(`   Skills: ${stats.totalSkills} assignments`);
    console.log(`   Rules:  ${stats.totalContextRules} context rules`);
    console.log('');

    // Get agent context for this environment
    const agentContext = await registry.getAgentForContext({
      environment: options.environment,
    });

    if (agentContext) {
      console.log(`🤖 Active Agent: ${agentContext.agent.name} (${agentContext.agent.id})`);
      console.log(`   Model: ${agentContext.model}`);
      console.log(`   Skills: ${agentContext.skills.length} enabled`);
      if (options.verbose) {
        agentContext.skills.forEach((skill) => console.log(`     - ${skill}`));
      }
      console.log(`   Allowed Tools: ${agentContext.allowedTools.length} patterns`);
      if (options.verbose) {
        agentContext.allowedTools.forEach((pattern) => console.log(`     + ${pattern}`));
      }
      console.log(`   Denied Tools: ${agentContext.deniedTools.length} patterns`);
      if (options.verbose) {
        agentContext.deniedTools.forEach((pattern) => console.log(`     - ${pattern}`));
      }
      console.log('');
    }

    // Sync to filesystem
    if (options.dryRun) {
      console.log('🔍 Dry run - no changes will be made\n');

      // List what would be synced
      const builtinSkills = await registry.listAvailableSkills(options.skillsSourceDir);
      const userSkills = await registry.listAvailableSkills(options.userSkillsSourceDir);
      const enabledSkills = agentContext?.skills || [];

      const mergedSkills = new Set([...builtinSkills, ...userSkills]);

      console.log('Skills that would be synced:');
      for (const skill of mergedSkills) {
        const enabled = enabledSkills.includes(skill);
        const source = userSkills.includes(skill)
          ? 'user'
          : builtinSkills.includes(skill)
            ? 'builtin'
            : 'unknown';
        console.log(`  ${enabled ? '✓' : '✗'} ${skill} (${source})`);
      }
    } else {
      console.log('🔧 Syncing to filesystem...');
      await syncSkillsToFilesystem(
        options.skillsSourceDir,
        options.userSkillsSourceDir,
        options.skillsTargetDir
      );
      await registry.syncToFilesystem({
        projectDir: options.projectDir,
        environment: options.environment,
        skillsSourceDir: options.skillsSourceDir,
        skillsTargetDir: options.skillsTargetDir,
      });
      console.log('✅ Filesystem sync complete');
    }

    console.log('\n✨ Agent config sync finished successfully');
  } catch (error) {
    console.error('\n❌ Sync failed:', error instanceof Error ? error.message : String(error));
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

async function syncSkillsToFilesystem(
  builtinSkillsDir: string,
  userSkillsDir: string,
  targetDir: string
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  await copyDirectory(builtinSkillsDir, targetDir);
  await copyDirectory(userSkillsDir, targetDir);
}

async function copyDirectory(source: string, target: string): Promise<void> {
  try {
    const entries = await fs.readdir(source, { withFileTypes: true });
    await fs.mkdir(target, { recursive: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  } catch {
    // Skip missing source directories
  }
}

// Run
main();
