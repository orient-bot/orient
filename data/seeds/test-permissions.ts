/**
 * Test Permissions Seed Data
 *
 * Sample chat/channel permissions for testing the dashboard in worktrees.
 * Run with: npx tsx data/seeds/test-permissions.ts
 */

import { getDatabase } from '../../src/db/client.js';
import { chatPermissions, slackChannelPermissions } from '../../src/db/schema.js';
import { createServiceLogger } from '../../src/utils/logger.js';

const logger = createServiceLogger('test-permissions-seed');

// ============================================
// TEST WHATSAPP PERMISSIONS
// ============================================

const testWhatsAppPermissions = [
  {
    chatId: 'test-group-1@g.us',
    chatType: 'group',
    permission: 'read_write',
    displayName: 'Test Team Chat',
    notes: 'Test group for development - full read/write access',
  },
  {
    chatId: 'test-group-2@g.us',
    chatType: 'group',
    permission: 'read_only',
    displayName: 'Test Announcements',
    notes: 'Test group for read-only testing',
  },
  {
    chatId: 'test-dm-1@s.whatsapp.net',
    chatType: 'individual',
    permission: 'read_write',
    displayName: 'Test DM User',
    notes: 'Test direct message for development',
  },
];

// ============================================
// TEST SLACK PERMISSIONS
// ============================================

const testSlackPermissions = [
  {
    channelId: 'C_TEST_GENERAL',
    permission: 'read_write',
    respondToMentions: true,
    respondToDMs: true,
    notes: 'Test general channel - full access',
  },
  {
    channelId: 'C_TEST_ALERTS',
    permission: 'read_only',
    respondToMentions: false,
    respondToDMs: false,
    notes: 'Test alerts channel - read only',
  },
  {
    channelId: 'D_TEST_DM',
    permission: 'read_write',
    respondToMentions: true,
    respondToDMs: true,
    notes: 'Test DM channel',
  },
];

// ============================================
// SEED FUNCTION
// ============================================

export async function seedTestPermissions(options: { force?: boolean } = {}): Promise<void> {
  const db = getDatabase();

  logger.info('Starting test permissions seed', { force: options.force });

  // Check if chat_permissions table exists (it may not in isolated worktrees with limited migrations)
  try {
    const existingWA = await db
      .select()
      .from(chatPermissions)
      .limit(1);

    // Check if test permissions already exist
    if (existingWA.length > 0 && !options.force) {
      const testPermissions = await db
        .select()
        .from(chatPermissions)
        .where((table: typeof chatPermissions.$inferSelect) =>
          table.chatId?.startsWith?.('test-') ?? false
        );

      if (testPermissions.length > 0) {
        logger.info('Test permissions already exist, skipping seed. Use --force to override.', {
          count: testPermissions.length,
        });
        return;
      }
    }
  } catch (err) {
    // Table doesn't exist - skip seeding test permissions
    logger.warn('chat_permissions table does not exist, skipping test permissions seed. Run Drizzle push to create all tables.', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // If force, we don't clear - just use onConflictDoNothing
  // This preserves any real permissions in the database

  let waInserted = 0;
  let slackInserted = 0;

  // Insert WhatsApp test permissions
  for (const perm of testWhatsAppPermissions) {
    try {
      await db.insert(chatPermissions).values(perm).onConflictDoNothing();
      waInserted++;
      logger.info('Inserted WhatsApp permission', { chatId: perm.chatId });
    } catch (err) {
      logger.warn('Failed to insert WhatsApp permission', { chatId: perm.chatId, error: err });
    }
  }

  // Insert Slack test permissions
  for (const perm of testSlackPermissions) {
    try {
      await db.insert(slackChannelPermissions).values(perm).onConflictDoNothing();
      slackInserted++;
      logger.info('Inserted Slack permission', { channelId: perm.channelId });
    } catch (err) {
      logger.warn('Failed to insert Slack permission', { channelId: perm.channelId, error: err });
    }
  }

  logger.info('Test permissions seed complete', {
    whatsapp: waInserted,
    slack: slackInserted,
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  seedTestPermissions({ force })
    .then(() => {
      console.log('✅ Test permissions seed complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Test permissions seed failed:', err);
      process.exit(1);
    });
}
