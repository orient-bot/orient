/**
 * Generate Mascot Variation Tool
 *
 * Creates variations of the Orient mascot using either:
 * - OpenAI gpt-image-1 (recommended for transparent backgrounds)
 * - Gemini Nano Banana (faster, but no reliable transparency)
 */

import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getEnvWithSecrets } from '@orient-bot/core';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

/**
 * Variation types supported by the mascot generator
 */
const VariationType = z.enum([
  'pose',
  'expression',
  'background',
  'seasonal',
  'accessory',
  'style',
  'custom',
]);

type VariationTypeValue = z.infer<typeof VariationType>;

interface Input {
  variation_type: VariationTypeValue;
  prompt: string;
  output_name?: string;
  transparent?: boolean;
}

interface Output {
  success: boolean;
  message?: string;
  path?: string;
  fullPath?: string;
  variationType?: string;
  prompt?: string;
  error?: string;
}

/**
 * Default output directory for generated mascot variations
 */
const DEFAULT_OUTPUT_DIR = 'packages/dashboard-frontend/public/mascot/variations';

/**
 * Base mascot image path
 */
const BASE_MASCOT_PATH = 'packages/dashboard-frontend/public/mascot/base.png';

export class GenerateMascotTool extends MCPTool<Input, Output> {
  name = 'media_generate_mascot';
  description = `Generate a variation of the Orient mascot (border collie dog with blue bandana). Supports different poses, expressions, backgrounds, seasonal themes, accessories, and art styles. Uses Gemini Nano Banana for image generation.`;

  category = 'media' as const;

  keywords = [
    'mascot',
    'avatar',
    'image',
    'generate',
    'variation',
    'dog',
    'border collie',
    'picture',
    'art',
    'visual',
    'transparent',
  ];

  useCases = [
    'Generate a mascot variation for a specific feature or page',
    'Create seasonal mascot images (holiday themes)',
    'Generate mascot with different expressions for UI states',
    'Create mascot variations for marketing materials',
    'Generate custom mascot poses for documentation',
    'Generate mascot with transparent background for web use',
  ];

  examples = [
    {
      description: 'Generate a celebrating mascot for release announcements',
      input: {
        variation_type: 'accessory',
        prompt: 'wearing a party hat, celebrating with confetti',
        output_name: 'celebration',
      },
    },
    {
      description: 'Generate a thinking mascot for loading states',
      input: {
        variation_type: 'expression',
        prompt: 'thinking deeply, with a thought bubble',
        output_name: 'thinking',
      },
    },
    {
      description: 'Generate a mascot with transparent background for web use',
      input: {
        variation_type: 'pose',
        prompt: 'friendly waving pose, clean cartoon style',
        output_name: 'waving-transparent',
        transparent: true,
      },
    },
  ];

  inputSchema = z.object({
    variation_type: VariationType.describe(
      'Type of variation: pose (sitting, running, waving), expression (happy, thinking, excited), background (office, outdoors), seasonal (holiday themes), accessory (hats, glasses, tools), style (pixel art, watercolor, minimalist), or custom'
    ),
    prompt: z
      .string()
      .describe(
        'Detailed description of the desired variation (e.g., "sitting and waving happily", "wearing a Santa hat with snowy background")'
      ),
    output_name: z
      .string()
      .optional()
      .describe(
        'Optional filename for the generated image (without extension). If not provided, uses variation_type-timestamp.png'
      ),
    transparent: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Generate with transparent background using OpenAI gpt-image-1. Requires OPENAI_API_KEY. Recommended for web/UI use.'
      ),
  });

  async execute(input: Input, context: ToolContext): Promise<Output> {
    // Check if base mascot image getter is available
    if (!context.getMascotBaseImage) {
      return {
        success: false,
        error: 'Base mascot image not available. Ensure mascot/base.png exists.',
      };
    }

    try {
      // Get the base mascot image
      const baseImageBuffer = await context.getMascotBaseImage();

      // Generate filename
      const timestamp = Date.now();
      const filename = input.output_name
        ? `${input.output_name}.png`
        : `${input.variation_type}-${timestamp}.png`;

      // Determine output path
      const outputDir = path.join(process.cwd(), DEFAULT_OUTPUT_DIR);
      const outputPath = path.join(outputDir, filename);

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      let imageBuffer: Buffer;
      let variationDescription: string;

      if (input.transparent) {
        // Use OpenAI for transparent backgrounds
        imageBuffer = await this.generateWithOpenAI(baseImageBuffer, input);
        variationDescription = `${input.variation_type}: ${input.prompt} (transparent background)`;
      } else {
        // Use Gemini for regular images
        if (!context.getGeminiService) {
          return {
            success: false,
            error: 'Gemini service not available. Ensure GEMINI_API_KEY is configured.',
          };
        }

        const geminiService = (await context.getGeminiService()) as {
          generateMascotVariation: (
            baseImage: Buffer,
            input: { variationType: string; prompt: string; outputName?: string }
          ) => Promise<{
            success: boolean;
            imageBase64?: string;
            mimeType?: string;
            variationDescription?: string;
            error?: string;
          }>;
        };

        const result = await geminiService.generateMascotVariation(baseImageBuffer, {
          variationType: input.variation_type,
          prompt: input.prompt,
          outputName: input.output_name,
        });

        if (!result.success || !result.imageBase64) {
          return {
            success: false,
            error: result.error || 'Failed to generate mascot variation with Gemini',
          };
        }

        imageBuffer = Buffer.from(result.imageBase64, 'base64');
        variationDescription =
          result.variationDescription || `${input.variation_type}: ${input.prompt}`;
      }

      // Write the image
      await fs.writeFile(outputPath, imageBuffer);

      // Generate URL (relative to dashboard public folder)
      const imageUrl = `/mascot/variations/${filename}`;

      this.logger.info('Mascot variation generated', {
        variationType: input.variation_type,
        filename,
        path: outputPath,
        transparent: input.transparent || false,
      });

      return {
        success: true,
        message: `Mascot variation "${input.output_name || filename}" generated successfully`,
        path: imageUrl,
        fullPath: outputPath,
        variationType: input.variation_type,
        prompt: input.prompt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to generate mascot variation', { error: errorMessage });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate mascot variation using OpenAI gpt-image-1 with transparent background
   */
  private async generateWithOpenAI(baseImage: Buffer, input: Input): Promise<Buffer> {
    const apiKey = getEnvWithSecrets('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set. Required for transparent background generation.');
    }

    // Dynamic import to avoid issues if openai is not installed
    const OpenAI = await import('openai');
    const client = new OpenAI.default({ apiKey });

    // Use OpenAI's toFile utility for proper File handling
    const imageFile = await OpenAI.toFile(baseImage, 'mascot.png', { type: 'image/png' });

    // Build the prompt with mascot reference
    const fullPrompt = `Using this cartoon border collie dog mascot with blue bandana as the style reference: ${input.prompt}

CRITICAL: Generate PNG with TRANSPARENT background. Keep same cartoon style with clean lines and flat colors. No background elements.`;

    this.logger.info('Generating mascot with OpenAI (transparent)', {
      variationType: input.variation_type,
      prompt: input.prompt,
    });

    const response = await client.images.edit({
      model: 'gpt-image-1',
      image: imageFile,
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      background: 'transparent',
    });

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      throw new Error('No image data returned from OpenAI');
    }

    return Buffer.from(imageData.b64_json, 'base64');
  }
}

export const generateMascotTool = new GenerateMascotTool();
