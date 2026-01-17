/**
 * Sample System Prompts Seed Data
 *
 * Example system prompts for testing different chat configurations.
 * Run with: npx tsx data/seeds/sample-prompts.ts
 */

import { getDatabase, eq, and } from '../../src/db/client.js';
import { systemPrompts } from '../../src/db/schema.js';
import { createServiceLogger } from '../../src/utils/logger.js';

const logger = createServiceLogger('sample-prompts-seed');

// ============================================
// SAMPLE PROMPTS
// ============================================

const sampleSystemPrompts = [
  // WhatsApp test group prompt
  {
    chatId: 'test-group-1@g.us',
    platform: 'whatsapp',
    promptText: `You are a helpful PM assistant for the Test Team chat.

Your capabilities include:
- Managing JIRA issues (create, update, query)
- Scheduling messages and reminders
- Answering questions about project progress

Keep responses concise and action-oriented. Use emojis sparingly.`,
    isActive: true,
  },
  // Slack test channel prompt
  {
    chatId: 'C_TEST_GENERAL',
    platform: 'slack',
    promptText: `You are a Slack bot assistant for the Test General channel.

IMPORTANT: Use Slack mrkdwn formatting:
- Bold: *single asterisks*
- Italic: _underscores_
- Code: \`backticks\`
- Links: <url|display text>

Keep messages well-formatted and professional.`,
    isActive: true,
  },
  // Platform default for WhatsApp (special chatId)
  {
    chatId: '__default__',
    platform: 'whatsapp',
    promptText: `You are the Orient Task Force PM Assistant on WhatsApp.

You help the team with:
- JIRA issue management
- Meeting coordination
- Weekly workflow tracking
- Presentation updates

Always be helpful and concise. Format responses for mobile readability.`,
    isActive: true,
  },
  // Platform default for Slack (special chatId)
  {
    chatId: '__default__',
    platform: 'slack',
    promptText: `You are the Orient Task Force PM Assistant on Slack.

You help the team with:
- JIRA issue management
- Meeting coordination
- Weekly workflow tracking
- Presentation updates

ALWAYS use Slack mrkdwn formatting:
- Bold: *text* (single asterisks)
- Italic: _text_ (underscores)
- Strikethrough: ~text~
- Code: \`inline\` or \`\`\`block\`\`\`
- Links: <url|text>
- Lists: Start lines with • or numbered lists with 1.

Never use Markdown formatting (no **double asterisks**).`,
    isActive: true,
  },
];

// ============================================
// SEED FUNCTION
// ============================================

export async function seedSamplePrompts(options: { force?: boolean } = {}): Promise<void> {
  const db = getDatabase();

  logger.info('Starting sample prompts seed', { force: options.force });

  // Check if system_prompts table exists (it may not in isolated worktrees with limited migrations)
  try {
    const existingPrompts = await db
      .select()
      .from(systemPrompts)
      .where(eq(systemPrompts.chatId, 'test-group-1@g.us'));

    if (existingPrompts.length > 0 && !options.force) {
      logger.info('Sample prompts already exist, skipping seed. Use --force to override.', {
        count: existingPrompts.length,
      });
      return;
    }
  } catch (err) {
    // Table doesn't exist - skip seeding sample prompts
    logger.warn('system_prompts table does not exist, skipping sample prompts seed. Run Drizzle push to create all tables.', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let inserted = 0;

  for (const prompt of sampleSystemPrompts) {
    try {
      // Check if this specific prompt exists
      const existing = await db
        .select()
        .from(systemPrompts)
        .where(
          and(
            eq(systemPrompts.chatId, prompt.chatId),
            eq(systemPrompts.platform, prompt.platform)
          )
        );

      if (existing.length > 0 && !options.force) {
        logger.info('Prompt already exists, skipping', {
          chatId: prompt.chatId,
          platform: prompt.platform,
        });
        continue;
      }

      if (existing.length > 0 && options.force) {
        // Delete existing to replace
        await db
          .delete(systemPrompts)
          .where(
            and(
              eq(systemPrompts.chatId, prompt.chatId),
              eq(systemPrompts.platform, prompt.platform)
            )
          );
      }

      await db.insert(systemPrompts).values(prompt);
      inserted++;
      logger.info('Inserted sample prompt', {
        chatId: prompt.chatId,
        platform: prompt.platform,
      });
    } catch (err) {
      logger.warn('Failed to insert sample prompt', {
        chatId: prompt.chatId,
        platform: prompt.platform,
        error: err,
      });
    }
  }

  logger.info('Sample prompts seed complete', { inserted });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  seedSamplePrompts({ force })
    .then(() => {
      console.log('✅ Sample prompts seed complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Sample prompts seed failed:', err);
      process.exit(1);
    });
}
