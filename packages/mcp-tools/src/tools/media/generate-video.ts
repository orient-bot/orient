/**
 * Generate Video Tool
 *
 * Creates videos using Google's Veo API via the Gemini SDK.
 * Supports text-to-video and image-to-video generation.
 */

import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

/**
 * Video aspect ratio options
 */
const AspectRatioSchema = z.enum(['16:9', '9:16', '1:1']);

/**
 * Video generation mode
 */
const GenerationModeSchema = z.enum(['fast', 'quality']);

interface Input {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  duration_seconds?: number;
  mode?: 'fast' | 'quality';
  output_name?: string;
  generate_audio?: boolean;
  reference_image_path?: string;
}

interface Output {
  success: boolean;
  message?: string;
  path?: string;
  fullPath?: string;
  durationSeconds?: number;
  error?: string;
}

/**
 * Default output directory for generated videos
 */
const DEFAULT_OUTPUT_DIR = 'website/static/video';

export class GenerateVideoTool extends MCPTool<Input, Output> {
  name = 'ai_first_generate_video';
  description = `Generate a video using Google's Veo API. Supports text-to-video and image-to-video generation with optional audio. Great for creating demo videos, marketing content, or product showcases.`;

  category = 'media' as const;

  keywords = [
    'video',
    'generate',
    'veo',
    'animation',
    'demo',
    'clip',
    'movie',
    'motion',
    'ai video',
    'text to video',
  ];

  useCases = [
    'Generate a demo video for the website',
    'Create an animated product showcase',
    'Generate short clips for social media',
    'Create video content from text descriptions',
    'Animate a static image into a video',
  ];

  examples = [
    {
      description: 'Generate a demo video showing Orient in action',
      input: {
        prompt:
          'A smartphone showing a WhatsApp chat where a user asks an AI assistant to schedule a meeting. The assistant responds and shows a calendar notification appearing.',
        aspect_ratio: '16:9',
        duration_seconds: 8,
        mode: 'quality',
        output_name: 'ori-demo',
        generate_audio: true,
      },
    },
    {
      description: 'Generate a quick social media clip',
      input: {
        prompt: 'A friendly cartoon border collie dog waving at the camera with a blue bandana',
        aspect_ratio: '9:16',
        duration_seconds: 5,
        mode: 'fast',
        output_name: 'social-clip',
      },
    },
  ];

  inputSchema = z.object({
    prompt: z
      .string()
      .min(10)
      .describe(
        'Detailed description of the video to generate. Be specific about scenes, actions, style, and mood.'
      ),
    negative_prompt: z
      .string()
      .optional()
      .describe(
        'Things to avoid in the generated video (e.g., "blurry, low quality, text overlay")'
      ),
    aspect_ratio: AspectRatioSchema.optional()
      .default('16:9')
      .describe('Video aspect ratio: 16:9 (landscape/web), 9:16 (portrait/mobile), 1:1 (square)'),
    duration_seconds: z
      .number()
      .min(3)
      .max(16)
      .optional()
      .default(5)
      .describe('Video duration in seconds (3-8 for fast mode, 3-16 for quality mode)'),
    mode: GenerationModeSchema.optional()
      .default('quality')
      .describe(
        'Generation mode: "fast" for quicker results (lower quality), "quality" for better output (slower)'
      ),
    output_name: z
      .string()
      .optional()
      .describe('Output filename without extension. Defaults to "video-{timestamp}"'),
    generate_audio: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to generate synchronized audio with the video (Veo 3+ feature)'),
    reference_image_path: z
      .string()
      .optional()
      .describe('Optional path to a reference image to guide the video style/content'),
  });

  async execute(input: Input, context: ToolContext): Promise<Output> {
    try {
      // Check if Gemini service is available
      if (!context.getGeminiService) {
        return {
          success: false,
          error: 'Gemini service not available. Ensure GEMINI_API_KEY is configured.',
        };
      }

      const geminiService = (await context.getGeminiService()) as {
        generateVideo: (input: {
          prompt: string;
          negativePrompt?: string;
          aspectRatio?: '16:9' | '9:16' | '1:1';
          durationSeconds?: number;
          mode?: 'fast' | 'quality';
          generateAudio?: boolean;
          referenceImage?: Buffer;
        }) => Promise<{
          success: boolean;
          videoBase64?: string;
          mimeType?: string;
          durationSeconds?: number;
          error?: string;
        }>;
      };

      // Load reference image if provided
      let referenceImage: Buffer | undefined;
      if (input.reference_image_path) {
        const imagePath = path.isAbsolute(input.reference_image_path)
          ? input.reference_image_path
          : path.join(process.cwd(), input.reference_image_path);

        try {
          referenceImage = await fs.readFile(imagePath);
          this.logger.info('Loaded reference image', { path: imagePath });
        } catch (err) {
          this.logger.warn('Failed to load reference image', {
            path: imagePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.logger.info('Starting video generation', {
        promptPreview: input.prompt.substring(0, 100) + (input.prompt.length > 100 ? '...' : ''),
        aspectRatio: input.aspect_ratio,
        duration: input.duration_seconds,
        mode: input.mode,
        hasReferenceImage: !!referenceImage,
        generateAudio: input.generate_audio,
      });

      // Generate the video
      const result = await geminiService.generateVideo({
        prompt: input.prompt,
        negativePrompt: input.negative_prompt,
        aspectRatio: input.aspect_ratio,
        durationSeconds: input.duration_seconds,
        mode: input.mode,
        generateAudio: input.generate_audio,
        referenceImage,
      });

      if (!result.success || !result.videoBase64) {
        return {
          success: false,
          error: result.error || 'Failed to generate video',
        };
      }

      // Generate filename
      const timestamp = Date.now();
      const filename = input.output_name ? `${input.output_name}.mp4` : `video-${timestamp}.mp4`;

      // Determine output path
      const outputDir = path.join(process.cwd(), DEFAULT_OUTPUT_DIR);
      const outputPath = path.join(outputDir, filename);

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Write the video
      const videoBuffer = Buffer.from(result.videoBase64, 'base64');
      await fs.writeFile(outputPath, videoBuffer);

      // Generate URL (relative to website static folder)
      const videoUrl = `/video/${filename}`;

      this.logger.info('Video generated successfully', {
        filename,
        path: outputPath,
        duration: result.durationSeconds,
        sizeBytes: videoBuffer.length,
      });

      return {
        success: true,
        message: `Video "${filename}" generated successfully (${result.durationSeconds}s)`,
        path: videoUrl,
        fullPath: outputPath,
        durationSeconds: result.durationSeconds,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to generate video', { error: errorMessage });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

export const generateVideoTool = new GenerateVideoTool();
