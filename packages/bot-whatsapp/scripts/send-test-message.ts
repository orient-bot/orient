#!/usr/bin/env npx tsx
/**
 * Simple script to send a test message to a WhatsApp chat
 * 
 * Usage: 
 *   TEST_GROUP_JID=120363000000000001@g.us npx tsx scripts/send-test-message.ts
 *   
 * Or set TEST_GROUP_JID in your .env file
 */

import { WhatsAppConnection } from '../src/services/connection.js';
import { createServiceLogger } from '@orient/core';

const logger = createServiceLogger('test-sender');

// Get test group JID from environment - must be explicitly provided
const TEST_GROUP_JID = process.env.TEST_GROUP_JID;

if (!TEST_GROUP_JID) {
  console.error('❌ Error: TEST_GROUP_JID environment variable is required');
  console.error('Usage: TEST_GROUP_JID=your-group@g.us npx tsx scripts/send-test-message.ts');
  process.exit(1);
}

const TEST_MESSAGE = '🧪 Test message from bot at ' + new Date().toLocaleTimeString();

async function main() {
  logger.info('Starting test message sender...');
  
  const connection = new WhatsAppConnection({
    sessionPath: process.env.SESSION_PATH || './data/whatsapp-auth',
    autoReconnect: false,
  });

  try {
    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);
      
      connection.on('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      connection.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      
      connection.connect().catch(reject);
    });

    logger.info('Connected! Sending test message...');
    
    const socket = connection.getSocket();
    if (!socket) {
      throw new Error('No socket available');
    }

    // Send the test message
    const result = await socket.sendMessage(TEST_GROUP_JID, { 
      text: TEST_MESSAGE 
    });
    
    logger.info('Message sent successfully!', {
      messageId: result?.key?.id,
      to: TEST_GROUP_JID,
      text: TEST_MESSAGE,
    });

    // Wait a moment for the message to be delivered
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Disconnect
    await connection.disconnect();
    logger.info('Disconnected. Test complete!');
    
  } catch (error) {
    logger.error('Failed to send message', { error: String(error) });
    await connection.disconnect();
    process.exit(1);
  }
}

main().catch(console.error);
