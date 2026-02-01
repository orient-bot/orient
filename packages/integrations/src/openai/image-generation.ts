/**
 * OpenAI Image Generation
 *
 * Image generation using DALL-E models.
 * Provides support for transparent background generation.
 */

import OpenAI from 'openai';
import { createServiceLogger, getEnvWithSecrets } from '@orient-bot/core';

const logger = createServiceLogger('openai-image');

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = getEnvWithSecrets('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export interface OpenAIImageGenerationInput {
  prompt: string;
  model?: 'gpt-image-1' | 'dall-e-2' | 'dall-e-3';
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  transparent?: boolean;
}

export interface OpenAIImageGenerationResult {
  success: boolean;
  imageBase64?: string;
  imageUrl?: string;
  error?: string;
}

/**
 * Generate an image using OpenAI image models
 * Note: We request transparency and use post-processing to ensure alpha.
 */
export async function generateImageWithOpenAI(
  input: OpenAIImageGenerationInput
): Promise<OpenAIImageGenerationResult> {
  const op = logger.startOperation('generateImageWithOpenAI');

  try {
    const client = getOpenAIClient();
    const model = input.model || 'gpt-image-1';
    const size = input.size || '1024x1024';
    const quality = input.quality || 'hd';

    // Build prompt with transparency request if needed
    let prompt = input.prompt;
    if (input.transparent) {
      prompt = `${prompt} The image must have a completely transparent background. No background color, no gradient, only the subject should be visible with full transparency around it.`;
    }

    logger.info('Generating image with OpenAI', {
      model,
      size,
      quality,
      hasTransparency: input.transparent,
    });

    const response = await client.images.generate({
      model,
      prompt,
      size: size as any,
      quality: quality as any,
      n: 1,
      response_format: 'b64_json', // Get base64 response for transparency processing
    });

    const imageData = response.data?.[0];
    if (!imageData || !('b64_json' in imageData) || !imageData.b64_json) {
      op.failure(new Error('No image data in response'));
      return {
        success: false,
        error: 'No image was generated in the response',
      };
    }

    op.success('Image generated with OpenAI');
    return {
      success: true,
      imageBase64: imageData.b64_json,
      imageUrl: imageData.url,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    op.failure(error instanceof Error ? error : new Error(errorMessage));
    return {
      success: false,
      error: errorMessage,
    };
  }
}
