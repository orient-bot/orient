/**
 * Unit Tests for WhatsApp sendImage functionality
 *
 * Tests the /send-image API endpoint contract and the sendImage service behavior.
 * Uses mock HTTP servers (same pattern as qr-api-endpoints.test.ts) to test
 * without importing source modules that have unresolvable cross-package dependencies.
 *
 * Tests:
 * 1. /send-image endpoint - route handling, validation, image resolution, error responses
 * 2. sendImage service behavior - permission checks, socket calls, error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'http';

// ============================================================
// Mock WhatsApp Service with sendImage
// ============================================================

interface MockWhatsAppService {
  currentJid: string | null;
  isConnected: boolean;
  permissionDenied: boolean;
  sendImage: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock API server that simulates the /send-image endpoint behavior.
 * Mirrors the contract from whatsappApiServer.ts handleSendImage.
 */
function createMockApiServer(mockService: MockWhatsAppService) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/send-image' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => (body += chunk.toString()));
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const jid = parsed.jid || mockService.currentJid;

          if (!jid) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'No JID provided and no current chat context' }));
            return;
          }

          if (!parsed.imageUrl && !parsed.imagePath) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Either imageUrl or imagePath is required' }));
            return;
          }

          if (mockService.permissionDenied) {
            res.writeHead(403);
            res.end(
              JSON.stringify({
                error: 'Write permission denied',
                chatId: jid,
                permission: 'read_only',
                message:
                  'This chat does not have write permission. Enable "Read + Write" in the admin dashboard to allow bot messages.',
              })
            );
            return;
          }

          if (!mockService.isConnected) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'WhatsApp not connected' }));
            return;
          }

          // Simulate image resolution and sending
          const imageBuffer = parsed.imageUrl
            ? Buffer.from('fetched-image')
            : Buffer.from('file-image');

          const result = await mockService.sendImage(jid, imageBuffer, {
            caption: parsed.caption,
          });

          res.writeHead(200);
          res.end(JSON.stringify({ success: true, messageId: result?.key?.id }));
        } catch (error: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message || 'Failed to send image' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

function startServer(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      resolve(address.port);
    });
  });
}

function makeRequest(
  port: number,
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: any) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode || 0,
            body: data ? JSON.parse(data) : null,
          });
        } catch {
          resolve({ status: res.statusCode || 0, body: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ============================================================
// Unit Tests: sendImage Service Behavior
// ============================================================

describe('WhatsApp sendImage Service Behavior', () => {
  describe('permission checks', () => {
    it('should deny when write permission is not granted', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: true,
        sendImage: vi.fn(),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Write permission denied');
        expect(response.body.permission).toBe('read_only');
        expect(response.body.message).toContain('Read + Write');
        expect(mockService.sendImage).not.toHaveBeenCalled();
      } finally {
        server.close();
      }
    });

    it('should allow when write permission is granted', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockResolvedValue({ key: { id: 'img-001' } }),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
          caption: 'Test',
        });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockService.sendImage).toHaveBeenCalledWith(
          '1234567890@s.whatsapp.net',
          expect.any(Buffer),
          { caption: 'Test' }
        );
      } finally {
        server.close();
      }
    });
  });

  describe('connection state', () => {
    it('should return error when not connected', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: false,
        permissionDenied: false,
        sendImage: vi.fn(),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('not connected');
      } finally {
        server.close();
      }
    });
  });

  describe('socket errors', () => {
    it('should return error when socket sendMessage fails', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockRejectedValue(new Error('Socket closed unexpectedly')),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('Socket closed unexpectedly');
      } finally {
        server.close();
      }
    });
  });

  describe('image source handling', () => {
    it('should send image from URL', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockResolvedValue({ key: { id: 'url-img' } }),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/photo.jpg',
          caption: 'URL image',
        });

        expect(response.status).toBe(200);
        expect(response.body.messageId).toBe('url-img');
      } finally {
        server.close();
      }
    });

    it('should send image from file path', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockResolvedValue({ key: { id: 'file-img' } }),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imagePath: '/tmp/photo.jpg',
          caption: 'File image',
        });

        expect(response.status).toBe(200);
        expect(response.body.messageId).toBe('file-img');
      } finally {
        server.close();
      }
    });

    it('should send image without caption', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockResolvedValue({ key: { id: 'no-cap-img' } }),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/photo.jpg',
        });

        expect(response.status).toBe(200);
        expect(mockService.sendImage).toHaveBeenCalledWith(
          '1234567890@s.whatsapp.net',
          expect.any(Buffer),
          { caption: undefined }
        );
      } finally {
        server.close();
      }
    });
  });
});

// ============================================================
// Unit Tests: /send-image API Endpoint Validation
// ============================================================

describe('/send-image API Endpoint', () => {
  describe('input validation', () => {
    it('should return 400 when no JID and no current context', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: null,
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn(),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('No JID');
      } finally {
        server.close();
      }
    });

    it('should return 400 when neither imageUrl nor imagePath provided', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn(),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          caption: 'No image source',
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('imageUrl or imagePath');
      } finally {
        server.close();
      }
    });

    it('should return 400 when body is empty', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn(),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {});

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('imageUrl or imagePath');
      } finally {
        server.close();
      }
    });
  });

  describe('JID resolution', () => {
    it('should use explicit JID when provided', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: 'default@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockResolvedValue({ key: { id: 'jid-img' } }),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          jid: 'explicit@s.whatsapp.net',
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(200);
        expect(mockService.sendImage).toHaveBeenCalledWith(
          'explicit@s.whatsapp.net',
          expect.any(Buffer),
          expect.any(Object)
        );
      } finally {
        server.close();
      }
    });

    it('should fall back to current JID when none provided', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: 'fallback@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockResolvedValue({ key: { id: 'fallback-img' } }),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(200);
        expect(mockService.sendImage).toHaveBeenCalledWith(
          'fallback@s.whatsapp.net',
          expect.any(Buffer),
          expect.any(Object)
        );
      } finally {
        server.close();
      }
    });

    it('should use group JID correctly', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '120363000000000000@g.us',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockResolvedValue({ key: { id: 'group-img' } }),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(200);
        expect(mockService.sendImage).toHaveBeenCalledWith(
          '120363000000000000@g.us',
          expect.any(Buffer),
          expect.any(Object)
        );
      } finally {
        server.close();
      }
    });
  });

  describe('response format', () => {
    it('should return success with messageId on success', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: false,
        sendImage: vi.fn().mockResolvedValue({ key: { id: 'resp-img-123' } }),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          messageId: 'resp-img-123',
        });
      } finally {
        server.close();
      }
    });

    it('should return 403 with permission details on denial', async () => {
      const mockService: MockWhatsAppService = {
        currentJid: '1234567890@s.whatsapp.net',
        isConnected: true,
        permissionDenied: true,
        sendImage: vi.fn(),
      };

      const server = createMockApiServer(mockService);
      const port = await startServer(server);

      try {
        const response = await makeRequest(port, 'POST', '/send-image', {
          imageUrl: 'https://example.com/image.png',
        });

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('chatId');
        expect(response.body).toHaveProperty('permission');
      } finally {
        server.close();
      }
    });
  });
});
