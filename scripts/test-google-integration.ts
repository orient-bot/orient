/**
 * Full Google Integration E2E Test
 * Tests Calendar, Gmail, and Tasks - simulating what the Slack/WhatsApp agent would do
 */

import {
  getCalendarService,
  getGmailService,
  getTasksService,
  getGoogleOAuthService,
} from '@orientbot/integrations/google';

async function testFullIntegration() {
  console.log('\n🔗 Google Integration E2E Test');
  console.log('================================\n');

  const oauthService = getGoogleOAuthService();
  const accounts = oauthService.getConnectedAccounts();

  if (accounts.length === 0) {
    console.log('❌ No Google accounts connected!');
    return;
  }

  const email = accounts[0].email;
  console.log(`✅ Using account: ${email}\n`);

  // Test 1: Calendar - "What's on my schedule this week?"
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📅 TEST 1: Calendar - "What major events this week?"');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const calendarService = getCalendarService();
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const events = await calendarService.listEvents(
      {
        calendarId: 'primary',
        timeMin: now,
        timeMax: endOfWeek,
        maxResults: 10,
      },
      email
    );

    console.log(`Agent Response:\n`);
    if (events.length === 0) {
      console.log('You have no events scheduled for this week.');
    } else {
      console.log(`You have ${events.length} event(s) this week:`);
      for (const event of events.slice(0, 5)) {
        const date = event.start
          ? new Date(event.start).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
          : 'All day';
        console.log(`  • ${event.title} (${date})`);
      }
    }
    console.log('\n✅ Calendar test passed!\n');
  } catch (error) {
    console.error('❌ Calendar test failed:', error);
  }

  // Test 2: Gmail - "Any important emails?"
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 TEST 2: Gmail - "Any important unread emails?"');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const gmailService = getGmailService();
    const summary = await gmailService.getInboxSummary(email);

    console.log(`Agent Response:\n`);
    console.log(`You have ${summary.totalUnread} unread emails.`);

    if (summary.recentMessages.length > 0) {
      console.log(`\nRecent messages:`);
      for (const msg of summary.recentMessages.slice(0, 3)) {
        const from = msg.from?.split('<')[0]?.trim() || 'Unknown';
        console.log(`  • From: ${from}`);
        console.log(`    Subject: ${msg.subject}`);
      }
    }
    console.log('\n✅ Gmail test passed!\n');
  } catch (error) {
    console.error('❌ Gmail test failed:', error);
  }

  // Test 3: Tasks - "What tasks do I have?"
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ TEST 3: Tasks - "What are my pending tasks?"');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const tasksService = getTasksService();
    const taskLists = await tasksService.listTaskLists(email);

    console.log(`Agent Response:\n`);
    console.log(`You have ${taskLists.length} task list(s):`);

    for (const list of taskLists) {
      console.log(`\n📋 ${list.title}:`);

      const tasks = await tasksService.listTasks(
        {
          taskListId: list.id,
          showCompleted: false,
        },
        email
      );

      if (tasks.length === 0) {
        console.log('   No pending tasks.');
      } else {
        for (const task of tasks.slice(0, 5)) {
          const status = task.status === 'completed' ? '✓' : '○';
          console.log(`   ${status} ${task.title}`);
        }
        if (tasks.length > 5) {
          console.log(`   ... and ${tasks.length - 5} more`);
        }
      }
    }
    console.log('\n✅ Tasks test passed!\n');
  } catch (error) {
    console.error('❌ Tasks test failed:', error);
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 E2E INTEGRATION TEST COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('The agent can now respond to queries like:');
  console.log('  • "What events do I have this week?"');
  console.log('  • "Do I have any unread emails?"');
  console.log('  • "What are my pending tasks?"');
  console.log('\nTry messaging the Slack bot with these questions!');
}

testFullIntegration().catch(console.error);
