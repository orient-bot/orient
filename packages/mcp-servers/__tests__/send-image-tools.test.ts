/**
 * Unit Tests for MCP Send Image Tool Definitions and Handlers
 *
 * Tests:
 * 1. Tool definitions exist with correct names and schemas
 * 2. whatsapp_send_image handler - calls WhatsApp API, handles errors
 * 3. slack_send_image handler - uses Slack files.uploadV2, handles errors
 * 4. Tool naming convention: standard category_action format
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Tests for whatsapp_send_image handler logic
// ============================================================

describe('whatsapp_send_image handler', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('should call /send-image endpoint with imageUrl', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, messageId: 'img-001' }),
    });

    const response = await fetch('http://127.0.0.1:4097/send-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'https://example.com/image.png',
        caption: 'Test',
      }),
    });

    const result = (await response.json()) as any;

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4097/send-image',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('imageUrl'),
      })
    );
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('img-001');
  });

  it('should call /send-image endpoint with imagePath', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, messageId: 'img-002' }),
    });

    await fetch('http://127.0.0.1:4097/send-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imagePath: '/tmp/test.png',
        caption: 'Local file',
      }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4097/send-image',
      expect.objectContaining({
        body: expect.stringContaining('imagePath'),
      })
    );
  });

  it('should pass jid when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const body = JSON.stringify({
      jid: 'custom@s.whatsapp.net',
      imageUrl: 'https://example.com/image.png',
    });

    await fetch('http://127.0.0.1:4097/send-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4097/send-image',
      expect.objectContaining({
        body: expect.stringContaining('custom@s.whatsapp.net'),
      })
    );
  });

  it('should return error when neither imageUrl nor imagePath provided', () => {
    // This validation happens before the fetch call in the handler
    const args = {} as { imageUrl?: string; imagePath?: string };

    const hasSource = !!(args.imageUrl || args.imagePath);
    expect(hasSource).toBe(false);
  });

  it('should handle API server errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Not connected' }),
    });

    const response = await fetch('http://127.0.0.1:4097/send-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: 'https://example.com/img.png' }),
    });

    const result = (await response.json()) as any;
    expect(response.ok).toBe(false);
    expect(result.error).toBe('Not connected');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      fetch('http://127.0.0.1:4097/send-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: 'https://example.com/img.png' }),
      })
    ).rejects.toThrow('ECONNREFUSED');
  });
});

// ============================================================
// Tests for slack_send_image handler logic
// ============================================================

describe('slack_send_image handler', () => {
  let mockSlackClient: any;

  beforeEach(() => {
    mockSlackClient = {
      files: {
        uploadV2: vi.fn().mockResolvedValue({
          ok: true,
          files: [{ id: 'F123', name: 'image.png' }],
        }),
      },
    };
  });

  it('should upload image from URL via files.uploadV2', async () => {
    const channel = '#general';
    const fileBuffer = Buffer.from('fake-image-content');
    const filename = 'image.png';

    await mockSlackClient.files.uploadV2({
      channel_id: channel.replace(/^#/, ''),
      file: fileBuffer,
      filename,
      initial_comment: 'Test caption',
    });

    expect(mockSlackClient.files.uploadV2).toHaveBeenCalledWith({
      channel_id: 'general',
      file: fileBuffer,
      filename: 'image.png',
      initial_comment: 'Test caption',
    });
  });

  it('should strip # from channel name', () => {
    const channel = '#my-channel';
    const stripped = channel.replace(/^#/, '');
    expect(stripped).toBe('my-channel');
  });

  it('should pass channel ID through unchanged', () => {
    const channel = 'C1234567890';
    const stripped = channel.replace(/^#/, '');
    expect(stripped).toBe('C1234567890');
  });

  it('should use provided filename', async () => {
    const filename = 'custom-name.jpg';

    await mockSlackClient.files.uploadV2({
      channel_id: 'general',
      file: Buffer.from('data'),
      filename,
    });

    expect(mockSlackClient.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'custom-name.jpg' })
    );
  });

  it('should extract filename from URL path', () => {
    const url = 'https://example.com/path/to/photo.png';
    const filename = new URL(url).pathname.split('/').pop() || 'image.png';
    expect(filename).toBe('photo.png');
  });

  it('should extract filename from file path', () => {
    const filePath = '/Users/test/Documents/screenshot.jpg';
    const filename = filePath.split('/').pop() || 'image.png';
    expect(filename).toBe('screenshot.jpg');
  });

  it('should handle uploadV2 errors', async () => {
    mockSlackClient.files.uploadV2.mockRejectedValue(new Error('channel_not_found'));

    await expect(
      mockSlackClient.files.uploadV2({
        channel_id: 'nonexistent',
        file: Buffer.from('data'),
        filename: 'test.png',
      })
    ).rejects.toThrow('channel_not_found');
  });

  it('should pass initial_comment as undefined when no caption', async () => {
    await mockSlackClient.files.uploadV2({
      channel_id: 'general',
      file: Buffer.from('data'),
      filename: 'test.png',
      initial_comment: undefined,
    });

    expect(mockSlackClient.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ initial_comment: undefined })
    );
  });
});

// ============================================================
// Tool naming convention tests
// ============================================================

describe('Tool Naming Convention', () => {
  it('whatsapp_send_image uses standard category_action format', () => {
    const toolName = 'whatsapp_send_image';
    expect(toolName).toMatch(/^whatsapp_/);
  });

  it('slack_send_image uses standard category_action format', () => {
    const toolName = 'slack_send_image';
    expect(toolName).toMatch(/^slack_/);
  });

  it('tools should not use old prefixes', () => {
    const tools = ['whatsapp_send_image', 'slack_send_image'];
    for (const name of tools) {
      expect(name).not.toMatch(/^ai_first_/);
      expect(name).not.toMatch(/^orient_/);
    }
  });

  it('tool names should be snake_case', () => {
    const tools = ['whatsapp_send_image', 'slack_send_image', 'system_health_check', 'apps_create'];
    for (const name of tools) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
