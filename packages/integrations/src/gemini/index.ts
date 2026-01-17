/**
 * Gemini Integration
 *
 * Google Gemini API integration for image and video generation.
 * - Image generation using Nano Banana models
 * - Video generation using Veo models
 *
 * @example
 * import {
 *   initializeGeminiClient,
 *   generateImage,
 *   generateMascotVariation,
 *   generateVideo,
 * } from '@orient/integrations/gemini';
 *
 * // Initialize the client
 * initializeGeminiClient({ apiKey: process.env.GEMINI_API_KEY });
 *
 * // Generate a mascot variation
 * const result = await generateMascotVariation(baseImageBuffer, {
 *   variationType: 'pose',
 *   prompt: 'sitting and waving',
 * });
 *
 * // Generate a video
 * const videoResult = await generateVideo({
 *   prompt: 'A demo of an AI assistant helping schedule a meeting',
 *   aspectRatio: '16:9',
 *   durationSeconds: 8,
 * });
 */

// Re-export types
export type {
  GeminiConfig,
  GeminiServiceInterface,
  ImageGenerationResult,
  MascotVariationInput,
  MascotVariationResult,
  MascotVariationType,
  VideoGenerationInput,
  VideoGenerationResult,
  VideoAspectRatio,
  VideoGenerationMode,
} from './types.js';

// Re-export client functions
export {
  initializeGeminiClient,
  getGeminiClient,
  getImageModel,
  isGeminiInitialized,
  resetGeminiClient,
  DEFAULT_IMAGE_MODEL,
} from './client.js';

// Re-export image generation functions
export { generateImage, editImage, generateMascotVariation } from './image-generation.js';

// Re-export video generation functions
export {
  generateVideo,
  buildOrientDemoPrompt,
  DEFAULT_VIDEO_MODEL,
  FAST_VIDEO_MODEL,
} from './video-generation.js';

// Import for createGeminiService
import {
  generateImage as genImage,
  editImage as edImage,
  generateMascotVariation as genMascot,
} from './image-generation.js';
import { generateVideo as genVideo } from './video-generation.js';

/**
 * Create a Gemini service instance that implements GeminiServiceInterface
 */
export function createGeminiService(): import('./types.js').GeminiServiceInterface {
  return {
    generateImage: genImage,
    editImage: edImage,
    generateMascotVariation: genMascot,
    generateVideo: genVideo,
  };
}
