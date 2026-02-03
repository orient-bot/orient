/**
 * Gemini Image Generation
 *
 * Image generation and editing functions using Nano Banana models.
 * Provides specialized support for mascot variation generation.
 */

import { createServiceLogger, getEnvWithSecrets } from '@orient-bot/core';
import { getGeminiClient, getImageModel } from './client.js';
import type {
  ImageGenerationResult,
  MascotVariationInput,
  MascotVariationResult,
  MascotVariationType,
} from './types.js';
import sharp from 'sharp';
import { generateImageWithOpenAI } from '../openai/image-generation.js';

const logger = createServiceLogger('gemini-image');

/**
 * Process image to remove background and ensure transparency
 */
async function processForTransparency(imageBuffer: Buffer): Promise<string> {
  logger.info('Post-processing image to remove background for transparency');

  // Get image metadata and raw pixel data
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha() // Ensure alpha channel exists
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Process pixels: make white/light pixels transparent
  // Threshold for considering a pixel as "background" (white/light)
  const threshold = 245; // Pixels brighter than this become transparent
  const edgeThreshold = 5; // Pixels within this many pixels of edge

  for (let i = 0; i < data.length; i += info.channels) {
    const pixelIndex = i / info.channels;
    const x = pixelIndex % info.width;
    const y = Math.floor(pixelIndex / info.width);

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const avg = (r + g + b) / 3;

    // Check if pixel is near edges (likely background)
    const isNearEdge =
      x < edgeThreshold ||
      x > info.width - edgeThreshold ||
      y < edgeThreshold ||
      y > info.height - edgeThreshold;

    // Make white/light pixels transparent, especially near edges
    if (avg > threshold) {
      // More aggressive for edge pixels, less aggressive for center
      const transparencyThreshold = isNearEdge ? threshold : threshold + 5;
      if (avg > transparencyThreshold) {
        data[i + 3] = 0; // Set alpha to 0 (fully transparent)
      } else {
        // Partial transparency for near-threshold pixels
        const alpha = Math.floor(255 * (1 - (avg - threshold) / 10));
        data[i + 3] = Math.max(0, alpha);
      }
    }
  }

  // Reconstruct image with transparency
  const processedBuffer = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  logger.info('Background removal post-processing completed');
  return processedBuffer.toString('base64');
}

/**
 * Prompt templates for different mascot variation types
 */
const VARIATION_PROMPTS: Record<MascotVariationType, string> = {
  pose: 'Maintain the exact same cartoon border collie dog character with blue bandana. Change the pose to:',
  expression:
    'Maintain the exact same cartoon border collie dog character with blue bandana. Change the facial expression to:',
  background:
    'Keep the exact same cartoon border collie dog character with blue bandana in the foreground. Change the background to:',
  seasonal:
    'Keep the exact same cartoon border collie dog character with blue bandana. Add seasonal/holiday elements:',
  accessory:
    'Keep the exact same cartoon border collie dog character with blue bandana. Add the following accessory:',
  style:
    'Transform this cartoon border collie dog character with blue bandana into a different art style:',
  custom: 'Using this cartoon border collie dog mascot with blue bandana as reference:',
};

/**
 * Generate an image from a text prompt
 */
export async function generateImage(prompt: string): Promise<ImageGenerationResult> {
  const op = logger.startOperation('generateImage');

  try {
    const client = getGeminiClient();
    const model = getImageModel();

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: `Generate an image: ${prompt}` }],
        },
      ],
      config: {
        responseModalities: ['image', 'text'],
      },
    });

    // Extract image from response
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        op.success('Image generated');
        return {
          success: true,
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        };
      }
    }

    op.failure(new Error('No image in response'));
    return {
      success: false,
      error: 'No image was generated in the response',
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

/**
 * Edit an existing image with a text prompt
 */
export async function editImage(
  imageBuffer: Buffer,
  prompt: string
): Promise<ImageGenerationResult> {
  const op = logger.startOperation('editImage');

  try {
    const client = getGeminiClient();
    const model = getImageModel();

    const imageBase64 = imageBuffer.toString('base64');

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBase64,
              },
            },
            { text: `Edit this image: ${prompt}` },
          ],
        },
      ],
      config: {
        responseModalities: ['image', 'text'],
      },
    });

    // Extract image from response
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        op.success('Image edited');
        return {
          success: true,
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        };
      }
    }

    op.failure(new Error('No image in response'));
    return {
      success: false,
      error: 'No image was generated in the response',
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

/**
 * Generate a mascot variation based on the base mascot image
 */
export async function generateMascotVariation(
  baseImageBuffer: Buffer,
  input: MascotVariationInput
): Promise<MascotVariationResult> {
  const op = logger.startOperation('generateMascotVariation', {
    variationType: input.variationType,
  });

  try {
    // Check if transparency is requested
    const promptLower = input.prompt.toLowerCase();
    const wantsTransparent =
      promptLower.includes('transparent') ||
      promptLower.includes('no background') ||
      promptLower.includes('alpha channel') ||
      promptLower.includes('transparency');

    // Use OpenAI gpt-image-1 for transparency requests when available
    if (wantsTransparent && getEnvWithSecrets('OPENAI_API_KEY')) {
      logger.info('Using OpenAI gpt-image-1 for transparent image generation');

      // Build the prompt based on variation type
      const templatePrompt = VARIATION_PROMPTS[input.variationType];
      let fullPrompt = `${templatePrompt} ${input.prompt}. 

A cartoon illustration of a border collie dog with blue bandana. Keep the same cartoon illustration style with clean lines and flat colors. The character should be clearly recognizable as the same mascot.`;

      // Add transparency instructions if requested
      if (wantsTransparent) {
        fullPrompt += ` The image must have a completely transparent background with no color, no gradient, and no solid fill. Only the character itself should be visible.`;
      } else {
        fullPrompt += ` Generate a high-quality image suitable for use as an app mascot or avatar.`;
      }

      const openaiResult = await generateImageWithOpenAI({
        prompt: fullPrompt,
        model: 'gpt-image-1',
        size: '1024x1024',
        quality: 'hd',
        transparent: wantsTransparent,
      });

      if (!openaiResult.success || !openaiResult.imageBase64) {
        logger.warn('OpenAI generation failed, falling back to Gemini', {
          error: openaiResult.error,
        });
        // Fall through to Gemini generation
      } else {
        // Post-process OpenAI image to ensure transparency if requested
        let finalImageBase64 = openaiResult.imageBase64;
        if (wantsTransparent) {
          try {
            logger.info('Post-processing OpenAI image to ensure transparency');
            const imageBuffer = Buffer.from(openaiResult.imageBase64, 'base64');
            finalImageBase64 = await processForTransparency(imageBuffer);
          } catch (bgError) {
            logger.warn('Transparency post-processing failed, using original', {
              error: bgError instanceof Error ? bgError.message : String(bgError),
            });
          }
        }

        op.success('Mascot variation generated with OpenAI gpt-image-1');
        return {
          success: true,
          imageBase64: finalImageBase64,
          mimeType: 'image/png',
          variationDescription: `${input.variationType}: ${input.prompt}`,
        };
      }
    }

    // Fall back to Gemini for non-transparent or if OpenAI fails
    const client = getGeminiClient();
    const model = getImageModel();

    // Build the prompt based on variation type
    const templatePrompt = VARIATION_PROMPTS[input.variationType];

    // Build base prompt
    let fullPrompt = `${templatePrompt} ${input.prompt}. 
    
Keep the same cartoon illustration style with clean lines and flat colors. 
The character should be clearly recognizable as the same mascot.`;

    // Add explicit transparency instructions if requested
    if (wantsTransparent) {
      fullPrompt += ` 

CRITICAL: Generate this image with a completely transparent background. The background must be fully transparent with no color, no gradient, and no solid fill. Only the character itself should be visible. The image must have a true alpha channel for transparency.`;
    }

    fullPrompt += ` 

Generate a high-quality image suitable for use as an app mascot or avatar.`;

    const imageBase64 = baseImageBuffer.toString('base64');

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBase64,
              },
            },
            { text: fullPrompt },
          ],
        },
      ],
      config: {
        responseModalities: ['image', 'text'],
      },
    });

    // Extract image from response
    const parts = response.candidates?.[0]?.content?.parts || [];
    let generatedImageBase64: string | undefined;
    let mimeType = 'image/png';

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        generatedImageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType;
        break;
      }
    }

    if (!generatedImageBase64) {
      op.failure(new Error('No image in response'));
      return {
        success: false,
        error: 'No image was generated in the response',
      };
    }

    // Post-process to remove background if transparency was requested
    let finalImageBase64 = generatedImageBase64;
    if (wantsTransparent) {
      try {
        const imageBuffer = Buffer.from(generatedImageBase64, 'base64');
        finalImageBase64 = await processForTransparency(imageBuffer);
      } catch (bgError) {
        logger.warn('Background removal failed, using original image', {
          error: bgError instanceof Error ? bgError.message : String(bgError),
        });
        // Continue with original image if background removal fails
      }
    }

    op.success('Mascot variation generated');
    return {
      success: true,
      imageBase64: finalImageBase64,
      mimeType,
      variationDescription: `${input.variationType}: ${input.prompt}`,
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
