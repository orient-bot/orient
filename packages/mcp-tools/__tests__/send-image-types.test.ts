/**
 * Unit Tests for Send Image Type Interfaces
 *
 * Verifies that WhatsAppServiceInterface and SlackServiceInterface
 * include the sendImage/uploadAndShareImage methods.
 */

import { describe, it, expect } from 'vitest';
import type { WhatsAppServiceInterface, SlackServiceInterface } from '../src/types.js';

describe('Service Interface Types', () => {
  describe('WhatsAppServiceInterface', () => {
    it('should accept an implementation with sendImage', () => {
      const service: WhatsAppServiceInterface = {
        sendText: async () => ({ key: { id: 'test' } }),
        sendPoll: async () => ({ key: { id: 'test' } }),
        sendImage: async () => ({ key: { id: 'img-test' } }),
      };

      expect(service.sendImage).toBeDefined();
      expect(typeof service.sendImage).toBe('function');
    });

    it('sendImage should accept Buffer', async () => {
      const service: WhatsAppServiceInterface = {
        sendText: async () => ({ key: { id: 'test' } }),
        sendPoll: async () => ({ key: { id: 'test' } }),
        sendImage: async (jid, image, options) => {
          // Verify parameters are correctly typed
          expect(typeof jid).toBe('string');
          expect(image).toBeInstanceOf(Buffer);
          return { key: { id: 'buf-result' } };
        },
      };

      const result = await service.sendImage('test@s.whatsapp.net', Buffer.from('img'), {
        caption: 'test',
      });
      expect(result).toEqual({ key: { id: 'buf-result' } });
    });

    it('sendImage should accept string URL', async () => {
      const service: WhatsAppServiceInterface = {
        sendText: async () => ({ key: { id: 'test' } }),
        sendPoll: async () => ({ key: { id: 'test' } }),
        sendImage: async (jid, image) => {
          expect(typeof image).toBe('string');
          return { key: { id: 'url-result' } };
        },
      };

      const result = await service.sendImage('test@s.whatsapp.net', 'https://example.com/img.png');
      expect(result).toEqual({ key: { id: 'url-result' } });
    });

    it('sendImage should allow returning null', async () => {
      const service: WhatsAppServiceInterface = {
        sendText: async () => ({ key: { id: 'test' } }),
        sendPoll: async () => ({ key: { id: 'test' } }),
        sendImage: async () => null,
      };

      const result = await service.sendImage('test@s.whatsapp.net', Buffer.from('data'));
      expect(result).toBeNull();
    });

    it('sendImage options should be optional', async () => {
      const service: WhatsAppServiceInterface = {
        sendText: async () => ({ key: { id: 'test' } }),
        sendPoll: async () => ({ key: { id: 'test' } }),
        sendImage: async () => ({ key: { id: 'no-opts' } }),
      };

      // Call without options
      const result = await service.sendImage('test@s.whatsapp.net', Buffer.from('data'));
      expect(result).toEqual({ key: { id: 'no-opts' } });
    });
  });

  describe('SlackServiceInterface', () => {
    it('should accept an implementation with uploadAndShareImage', () => {
      const service: SlackServiceInterface = {
        lookupUserByEmail: async () => null,
        sendDirectMessage: async () => ({ ts: '123', channel: 'C123' }),
        postMessage: async () => ({ ts: '123', channel: 'C123' }),
        getUserInfo: async () => null,
        uploadAndShareImage: async () => ({ ts: '456', channel: 'C123' }),
      };

      expect(service.uploadAndShareImage).toBeDefined();
      expect(typeof service.uploadAndShareImage).toBe('function');
    });

    it('uploadAndShareImage should accept channel and imageSource', async () => {
      const service: SlackServiceInterface = {
        lookupUserByEmail: async () => null,
        sendDirectMessage: async () => ({ ts: '123', channel: 'C123' }),
        postMessage: async () => ({ ts: '123', channel: 'C123' }),
        getUserInfo: async () => null,
        uploadAndShareImage: async (channel, imageSource, options) => {
          expect(typeof channel).toBe('string');
          expect(typeof imageSource).toBe('string');
          return { ts: 'upload-ts', channel };
        },
      };

      const result = await service.uploadAndShareImage('#general', 'https://example.com/img.png', {
        filename: 'test.png',
        caption: 'Test image',
      });
      expect(result).toEqual({ ts: 'upload-ts', channel: '#general' });
    });

    it('uploadAndShareImage options should be optional', async () => {
      const service: SlackServiceInterface = {
        lookupUserByEmail: async () => null,
        sendDirectMessage: async () => ({ ts: '123', channel: 'C123' }),
        postMessage: async () => ({ ts: '123', channel: 'C123' }),
        getUserInfo: async () => null,
        uploadAndShareImage: async () => ({ ts: 'no-opts', channel: 'C123' }),
      };

      // Call without options
      const result = await service.uploadAndShareImage('#general', 'https://example.com/img.png');
      expect(result).toEqual({ ts: 'no-opts', channel: 'C123' });
    });
  });
});
