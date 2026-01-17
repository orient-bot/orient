/**
 * Message Test Factories
 *
 * Create test data for WhatsApp and Slack messages.
 */

export interface TestWhatsAppMessage {
  id: string;
  jid: string;
  phone: string;
  text: string;
  isGroup: boolean;
  pushName?: string;
  timestamp: Date;
}

export interface TestSlackMessage {
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
}

let messageCounter = 1;

/**
 * Create a mock WhatsApp message
 */
export function createWhatsAppMessage(
  overrides: Partial<TestWhatsAppMessage> = {}
): TestWhatsAppMessage {
  const id = messageCounter++;
  return {
    id: `msg-${id}`,
    jid: '1234567890@s.whatsapp.net',
    phone: '1234567890',
    text: `Test message ${id}`,
    isGroup: false,
    pushName: 'Test User',
    timestamp: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock WhatsApp group message
 */
export function createWhatsAppGroupMessage(
  overrides: Partial<TestWhatsAppMessage> = {}
): TestWhatsAppMessage {
  return createWhatsAppMessage({
    jid: '1234567890-1234567890@g.us',
    isGroup: true,
    ...overrides,
  });
}

/**
 * Create a mock Slack message
 */
export function createSlackMessage(overrides: Partial<TestSlackMessage> = {}): TestSlackMessage {
  const id = messageCounter++;
  return {
    channel: 'C12345678',
    user: 'U12345678',
    text: `Test message ${id}`,
    ts: `${Date.now() / 1000}.000${id}`,
    ...overrides,
  };
}

/**
 * Create a mock Slack thread message
 */
export function createSlackThreadMessage(
  parentTs: string,
  overrides: Partial<TestSlackMessage> = {}
): TestSlackMessage {
  return createSlackMessage({
    thread_ts: parentTs,
    ...overrides,
  });
}

/**
 * Reset the message counter
 */
export function resetMessageCounter(): void {
  messageCounter = 1;
}
