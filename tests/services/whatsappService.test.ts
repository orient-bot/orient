import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WhatsAppService, WritePermissionDeniedError } from '@orient-bot/bot-whatsapp';

function createConfig() {
  const sessionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-session-'));
  return {
    adminPhone: '15551234567',
    sessionPath,
    autoReconnect: false,
  };
}

describe('WhatsAppService', () => {
  it('blocks sendMessage when no write permission checker configured', async () => {
    const service = new WhatsAppService(createConfig());

    await expect(service.sendMessage('123@s.whatsapp.net', 'Hello')).rejects.toBeInstanceOf(
      WritePermissionDeniedError
    );
  });

  it('throws when not connected even if permission allowed', async () => {
    const service = new WhatsAppService(createConfig());
    service.setWritePermissionChecker(async () => ({
      allowed: true,
      permission: 'read_write',
    }));

    await expect(service.sendMessage('123@s.whatsapp.net', 'Hello')).rejects.toThrow(
      'WhatsApp not connected'
    );
  });
});
