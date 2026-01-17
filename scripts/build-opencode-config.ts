#!/usr/bin/env npx tsx
/**
 * Build OpenCode Configuration
 *
 * This script generates environment-specific opencode.json files and skills manifests
 * based on the exclusion configuration in src/config/opencode-exclusions.ts
 *
 * Usage: npx tsx scripts/build-opencode-config.ts
 *
 * Outputs:
 * - docker/opencode.local.json - Config for local Docker with exclusions applied
 * - docker/opencode.prod.json - Config for production with exclusions applied
 * - docker/.skills-exclusions.json - Manifest of skills to exclude per environment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project paths
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'docker');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'src', 'config');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

// Template and output paths
const TEMPLATE_PATH = path.join(DOCKER_DIR, 'opencode.json');
const LOCAL_OUTPUT_PATH = path.join(DOCKER_DIR, 'opencode.local.json');
const PROD_OUTPUT_PATH = path.join(DOCKER_DIR, 'opencode.prod.json');
const SKILLS_MANIFEST_PATH = path.join(DOCKER_DIR, '.skills-exclusions.json');

interface ExcludedItems {
  excludeSkills: string[];
  excludeMcps: string[];
}

interface OpenCodeExclusionConfig {
  localDockerExclusions: ExcludedItems;
  prodExclusions: ExcludedItems;
}

interface OpenCodeConfig {
  $schema?: string;
  default_agent?: string;
  model?: string;
  permission?: Record<string, string>;
  mcp?: Record<string, {
    type: string;
    command?: string[];
    url?: string;
    enabled?: boolean;
    environment?: Record<string, string>;
  }>;
  agent?: Record<string, unknown>;
}

interface SkillsExclusionManifest {
  generated: string;
  availableSkills: string[];
  local: {
    excludeSkills: string[];
    includedSkills: string[];
  };
  prod: {
    excludeSkills: string[];
    includedSkills: string[];
  };
}

/**
 * Load the exclusions config dynamically
 */
async function loadExclusionsConfig(): Promise<OpenCodeExclusionConfig> {
  const configPath = path.join(CONFIG_DIR, 'opencode-exclusions.ts');
  
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Exclusions config not found: ${configPath}`);
    process.exit(1);
  }

  // Import the config module
  const configModule = await import(configPath);
  return configModule.openCodeExclusions;
}

/**
 * Load the template opencode.json
 */
function loadTemplate(): OpenCodeConfig {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`❌ Template not found: ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Get list of available skill directories
 */
function getAvailableSkills(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.warn(`⚠️  Skills directory not found: ${SKILLS_DIR}`);
    return [];
  }

  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

/**
 * Apply exclusions to an opencode config
 */
function applyExclusions(
  template: OpenCodeConfig,
  exclusions: ExcludedItems
): OpenCodeConfig {
  const config = JSON.parse(JSON.stringify(template)) as OpenCodeConfig;

  // Remove excluded MCPs
  if (config.mcp && exclusions.excludeMcps.length > 0) {
    for (const mcpName of exclusions.excludeMcps) {
      if (config.mcp[mcpName]) {
        delete config.mcp[mcpName];
        console.log(`  📦 Excluded MCP: ${mcpName}`);
      } else {
        console.warn(`  ⚠️  MCP not found (already excluded or doesn't exist): ${mcpName}`);
      }
    }
  }

  return config;
}

/**
 * Write a config file with pretty formatting
 */
function writeConfig(filePath: string, config: OpenCodeConfig): void {
  const content = JSON.stringify(config, null, 2) + '\n';
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`  ✅ Written: ${path.relative(PROJECT_ROOT, filePath)}`);
}

/**
 * Generate the skills exclusion manifest
 */
function generateSkillsManifest(
  availableSkills: string[],
  exclusions: OpenCodeExclusionConfig
): SkillsExclusionManifest {
  const localExcluded = exclusions.localDockerExclusions.excludeSkills;
  const prodExcluded = exclusions.prodExclusions.excludeSkills;

  // Validate that excluded skills actually exist
  const allExcluded = [...new Set([...localExcluded, ...prodExcluded])];
  for (const skill of allExcluded) {
    if (!availableSkills.includes(skill)) {
      console.warn(`  ⚠️  Skill not found: ${skill} (check spelling in exclusions config)`);
    }
  }

  return {
    generated: new Date().toISOString(),
    availableSkills,
    local: {
      excludeSkills: localExcluded,
      includedSkills: availableSkills.filter(s => !localExcluded.includes(s)),
    },
    prod: {
      excludeSkills: prodExcluded,
      includedSkills: availableSkills.filter(s => !prodExcluded.includes(s)),
    },
  };
}

/**
 * Main build function
 */
async function main(): Promise<void> {
  console.log('🔧 Building OpenCode configurations...\n');

  // Load exclusions config
  console.log('📋 Loading exclusions config...');
  const exclusions = await loadExclusionsConfig();
  console.log(`  Local Docker exclusions: ${exclusions.localDockerExclusions.excludeSkills.length} skills, ${exclusions.localDockerExclusions.excludeMcps.length} MCPs`);
  console.log(`  Prod exclusions: ${exclusions.prodExclusions.excludeSkills.length} skills, ${exclusions.prodExclusions.excludeMcps.length} MCPs`);

  // Load template
  console.log('\n📄 Loading template...');
  const template = loadTemplate();
  const mcpCount = template.mcp ? Object.keys(template.mcp).length : 0;
  console.log(`  Template has ${mcpCount} MCPs configured`);

  // Get available skills
  console.log('\n📚 Scanning skills...');
  const availableSkills = getAvailableSkills();
  console.log(`  Found ${availableSkills.length} skills: ${availableSkills.join(', ')}`);

  // Generate local config
  console.log('\n🏠 Generating local Docker config...');
  const localConfig = applyExclusions(template, exclusions.localDockerExclusions);
  writeConfig(LOCAL_OUTPUT_PATH, localConfig);

  // Generate prod config
  console.log('\n🚀 Generating production config...');
  const prodConfig = applyExclusions(template, exclusions.prodExclusions);
  writeConfig(PROD_OUTPUT_PATH, prodConfig);

  // Generate skills manifest
  console.log('\n📝 Generating skills exclusion manifest...');
  const manifest = generateSkillsManifest(availableSkills, exclusions);
  fs.writeFileSync(SKILLS_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`  ✅ Written: ${path.relative(PROJECT_ROOT, SKILLS_MANIFEST_PATH)}`);
  console.log(`  Local includes ${manifest.local.includedSkills.length} skills`);
  console.log(`  Prod includes ${manifest.prod.includedSkills.length} skills`);

  console.log('\n✨ Build complete!\n');
  console.log('Next steps:');
  console.log('  - For local Docker: docker-compose -f docker/docker-compose.local.yml build');
  console.log('  - For production: docker-compose -f docker/docker-compose.prod.yml build');
}

// Run main
main().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});


