#!/usr/bin/env npx tsx
/**
 * Sync Seed Agents to opencode.json
 *
 * Reads the defaultAgents array from data/seeds/agents.ts and writes them
 * into both opencode.json (root) and docker/opencode.json.
 *
 * Conversion:
 * - mode: 'primary' → "mode": "primary"
 * - mode: 'specialized' → "mode": "subagent"
 * - basePrompt → "prompt"
 * - description → "description"
 * - denyTools → "tools": { "toolName": false }
 * - allowTools (non-pattern) → "tools": { "toolName": true }
 *
 * Preserves existing non-agent config (mcp, permission, model, $schema)
 * and keeps OpenCode-specific agents (build, plan) that aren't in seeds.
 *
 * Usage:
 *   npx tsx scripts/sync-agents-to-opencode.ts [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// We import the seed data inline to avoid database dependencies
// The defaultAgents array is not exported, so we define the same structure here
// and import it. We'll use a dynamic approach to read from the seed file.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OPENCODE_FILES = [
  path.join(ROOT_DIR, 'opencode.json'),
  path.join(ROOT_DIR, 'docker', 'opencode.json'),
];

// OpenCode-specific agents to preserve (not from seed data)
const OPENCODE_ONLY_AGENTS = ['build', 'plan'];

interface SeedAgent {
  id: string;
  name: string;
  description: string;
  mode: 'primary' | 'specialized';
  modelDefault: string;
  modelFallback: string;
  basePrompt: string;
  enabled: boolean;
  skills: string[];
  allowTools: string[];
  denyTools: string[];
}

interface OpenCodeAgent {
  mode: string;
  description: string;
  prompt?: string;
  tools?: Record<string, boolean>;
}

interface OpenCodeConfig {
  $schema?: string;
  default_agent?: string;
  model?: string;
  permission?: Record<string, string>;
  mcp?: Record<string, unknown>;
  agent?: Record<string, OpenCodeAgent>;
  [key: string]: unknown;
}

/**
 * Convert a seed agent to OpenCode agent format
 */
function seedToOpenCode(agent: SeedAgent): OpenCodeAgent {
  const openCodeAgent: OpenCodeAgent = {
    mode: agent.mode === 'specialized' ? 'subagent' : 'primary',
    description: agent.description,
    prompt: agent.basePrompt,
  };

  // Build tools map from deny and allow lists
  const tools: Record<string, boolean> = {};

  // Add denied tools (non-pattern entries only)
  for (const pattern of agent.denyTools) {
    if (!pattern.includes('*')) {
      tools[pattern] = false;
    }
  }

  // Add allowed tools (non-pattern entries only)
  for (const pattern of agent.allowTools) {
    if (!pattern.includes('*')) {
      tools[pattern] = true;
    }
  }

  if (Object.keys(tools).length > 0) {
    openCodeAgent.tools = tools;
  }

  return openCodeAgent;
}

/**
 * Get default agents from seed data.
 * We dynamically import to avoid requiring database setup.
 */
async function getSeedAgents(): Promise<SeedAgent[]> {
  // Read the seed file and extract the defaultAgents array
  const seedFile = path.join(ROOT_DIR, 'data', 'seeds', 'agents.ts');
  const content = fs.readFileSync(seedFile, 'utf-8');

  // Extract the defaultAgents array using a regex approach
  // We need to find the array and evaluate it
  // Since the file has database imports that would fail, we use a simpler approach:
  // parse the TypeScript source to extract agent definitions

  const agents: SeedAgent[] = [];

  // Match each agent object in the array
  const agentBlocks = content.split(/\n  \{/g).slice(1); // Split on agent boundaries

  for (const block of agentBlocks) {
    // Only process agent blocks (they have 'id:' field)
    if (!block.includes("id: '")) continue;

    const getId = (field: string): string => {
      const match = block.match(new RegExp(`${field}:\\s*'([^']*)'`));
      return match ? match[1] : '';
    };

    const getQuotedField = (field: string): string => {
      // Match both single-line and multiline string values
      const singleLine = block.match(new RegExp(`${field}:\\s*'([^']*)'`));
      if (singleLine) return singleLine[1];

      const multiLine = block.match(new RegExp(`${field}:\\s*\n\\s*'([^']*)'`));
      if (multiLine) return multiLine[1];

      return '';
    };

    const id = getId('id');
    if (!id) continue;

    // Extract basePrompt (template literal)
    const promptMatch = block.match(/basePrompt:\s*`([\s\S]*?)`/);
    const basePrompt = promptMatch ? promptMatch[1] : '';

    // Extract description (may span lines)
    const descMatch = block.match(/description:\s*\n?\s*'([^']*)'/);
    const descSingleMatch = block.match(/description:\s*'([^']*)'/);
    const description = descMatch?.[1] || descSingleMatch?.[1] || '';

    // Extract arrays
    const extractArray = (field: string): string[] => {
      const arrayMatch = block.match(new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\]`));
      if (!arrayMatch) return [];
      return arrayMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean);
    };

    agents.push({
      id,
      name: getQuotedField('name') || getId('name'),
      description,
      mode: (getId('mode') as 'primary' | 'specialized') || 'primary',
      modelDefault: getId('modelDefault'),
      modelFallback: getId('modelFallback'),
      basePrompt,
      enabled: true,
      skills: extractArray('skills'),
      allowTools: extractArray('allowTools'),
      denyTools: extractArray('denyTools'),
    });
  }

  return agents;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  console.log('🔄 Syncing seed agents to opencode.json files');
  if (dryRun) console.log('   (dry run - no files will be modified)\n');

  // Get seed agents
  const seedAgents = await getSeedAgents();
  console.log(
    `📦 Found ${seedAgents.length} seed agents: ${seedAgents.map((a) => a.id).join(', ')}`
  );

  for (const filePath of OPENCODE_FILES) {
    const relativePath = path.relative(ROOT_DIR, filePath);
    console.log(`\n📄 Processing ${relativePath}...`);

    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️ File not found, skipping`);
      continue;
    }

    // Read existing config
    const existing: OpenCodeConfig = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const existingAgents = existing.agent || {};

    // Preserve OpenCode-only agents
    const preserved: Record<string, OpenCodeAgent> = {};
    for (const agentId of OPENCODE_ONLY_AGENTS) {
      if (existingAgents[agentId]) {
        preserved[agentId] = existingAgents[agentId];
      }
    }

    // Build new agent map: preserved + seed agents
    const newAgents: Record<string, OpenCodeAgent> = { ...preserved };
    for (const agent of seedAgents) {
      newAgents[agent.id] = seedToOpenCode(agent);
    }

    // Build updated config
    const updated: OpenCodeConfig = {
      ...existing,
      default_agent: 'ori',
      agent: newAgents,
    };

    // Fix model in docker/opencode.json if it's still gpt-4o-mini
    if (filePath.includes('docker') && existing.model?.includes('gpt-4o-mini')) {
      updated.model = 'anthropic/claude-haiku-4-5-20251001';
      console.log(`   🔧 Fixed model: ${existing.model} → ${updated.model}`);
    }

    // Report changes
    const removedAgents = Object.keys(existingAgents).filter((id) => !newAgents[id]);
    const addedAgents = Object.keys(newAgents).filter((id) => !existingAgents[id]);
    const updatedAgents = Object.keys(newAgents).filter(
      (id) => existingAgents[id] && !OPENCODE_ONLY_AGENTS.includes(id)
    );

    if (addedAgents.length) console.log(`   ➕ Added: ${addedAgents.join(', ')}`);
    if (updatedAgents.length) console.log(`   🔄 Updated: ${updatedAgents.join(', ')}`);
    if (removedAgents.length) console.log(`   ➖ Removed: ${removedAgents.join(', ')}`);
    console.log(`   🎯 default_agent: ${updated.default_agent}`);

    if (!dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + '\n');
      console.log(`   ✅ Written`);
    }
  }

  console.log('\n✨ Sync complete!');
}

main().catch((err) => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
