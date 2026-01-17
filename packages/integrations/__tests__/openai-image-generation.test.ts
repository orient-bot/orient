import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class OpenAI {
      images = { generate: mockGenerate };
      constructor() {}
    },
  };
});

describe('generateImageWithOpenAI', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGenerate.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('returns an error when response has no data', async () => {
    mockGenerate.mockResolvedValue({ data: undefined });
    const { generateImageWithOpenAI } = await import('../src/openai/image-generation');

    const result = await generateImageWithOpenAI({ prompt: 'test image' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No image was generated in the response');
  });

  it('returns base64 content when generation succeeds', async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: 'abc123', url: 'https://example.com/image.png' }],
    });
    const { generateImageWithOpenAI } = await import('../src/openai/image-generation');

    const result = await generateImageWithOpenAI({ prompt: 'test image' });

    expect(result.success).toBe(true);
    expect(result.imageBase64).toBe('abc123');
    expect(result.imageUrl).toBe('https://example.com/image.png');
  });
});
