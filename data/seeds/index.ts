/**
 * Unified Seed Runner
 *
 * Runs all seed files in the correct order.
 * Run with: npx tsx data/seeds/index.ts [--force]
 *
 * For worktree setup, this ensures all required data is present.
 */

import { seedAgents } from './agents.js';
import { seedTestPermissions } from './test-permissions.js';
import { seedSamplePrompts } from './sample-prompts.js';

export interface SeedOptions {
  force?: boolean;
  verbose?: boolean;
  skipAgents?: boolean;
  skipPermissions?: boolean;
  skipPrompts?: boolean;
}

/**
 * Run all seeds in the correct order
 */
export async function seedAll(options: SeedOptions = {}): Promise<void> {
  const { force = false, verbose = false } = options;

  console.log('🌱 Starting unified seed process...');
  console.log(`   Force mode: ${force ? 'yes' : 'no'}`);

  // 1. Seed agents first (required for context rules)
  if (!options.skipAgents) {
    console.log('\n📦 Step 1/3: Seeding agents...');
    try {
      await seedAgents({ force });
      console.log('   ✅ Agents seeded');
    } catch (err) {
      console.error('   ❌ Agent seed failed:', err);
      throw err;
    }
  } else {
    console.log('\n📦 Step 1/3: Skipping agents (--skip-agents)');
  }

  // 2. Seed test permissions
  if (!options.skipPermissions) {
    console.log('\n🔐 Step 2/3: Seeding test permissions...');
    try {
      await seedTestPermissions({ force });
      console.log('   ✅ Test permissions seeded');
    } catch (err) {
      console.error('   ❌ Test permissions seed failed:', err);
      throw err;
    }
  } else {
    console.log('\n🔐 Step 2/3: Skipping permissions (--skip-permissions)');
  }

  // 3. Seed sample prompts
  if (!options.skipPrompts) {
    console.log('\n💬 Step 3/3: Seeding sample prompts...');
    try {
      await seedSamplePrompts({ force });
      console.log('   ✅ Sample prompts seeded');
    } catch (err) {
      console.error('   ❌ Sample prompts seed failed:', err);
      throw err;
    }
  } else {
    console.log('\n💬 Step 3/3: Skipping prompts (--skip-prompts)');
  }

  console.log('\n✅ All seeds complete!');
  console.log(
    '💡 Tip: Run `npx tsx scripts/sync-agents-to-opencode.ts` to sync agents into opencode.json files'
  );
}

/**
 * Parse CLI arguments
 */
function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force') || args.includes('-f'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    skipAgents: args.includes('--skip-agents'),
    skipPermissions: args.includes('--skip-permissions'),
    skipPrompts: args.includes('--skip-prompts'),
  };
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();

  console.log('╔════════════════════════════════════════╗');
  console.log('║     Orient Bot - Unified Seeder      ║');
  console.log('╚════════════════════════════════════════╝');

  seedAll(options)
    .then(() => {
      console.log('\n🎉 Database ready for development!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n💥 Seed process failed:', err);
      process.exit(1);
    });
}
