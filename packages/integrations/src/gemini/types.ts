/**
 * Gemini Integration Types
 *
 * Type definitions for Google Gemini API integration,
 * specifically for Nano Banana image generation.
 */

/**
 * Configuration for Gemini API client
 */
export interface GeminiConfig {
  /** API key for authentication */
  apiKey: string;
  /** Model to use for image generation (default: gemini-2.0-flash-exp) */
  imageModel?: string;
}

/**
 * Supported variation types for mascot generation
 */
export type MascotVariationType =
  | 'pose'
  | 'expression'
  | 'background'
  | 'seasonal'
  | 'accessory'
  | 'style'
  | 'custom';

/**
 * Input for mascot variation generation
 */
export interface MascotVariationInput {
  /** Type of variation to generate */
  variationType: MascotVariationType;
  /** Detailed prompt describing the variation */
  prompt: string;
  /** Optional output filename (without extension) */
  outputName?: string;
}

/**
 * Result of mascot variation generation
 */
export interface MascotVariationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Generated image as base64 (for saving to disk) */
  imageBase64?: string;
  /** Image MIME type */
  mimeType?: string;
  /** URL to access the generated image (set after saving) */
  imageUrl?: string;
  /** File path where the image was saved (set after saving) */
  imagePath?: string;
  /** Description of the generated variation */
  variationDescription?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of image generation
 */
export interface ImageGenerationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Generated image as base64 */
  imageBase64?: string;
  /** Image MIME type */
  mimeType?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Gemini service interface for tool context
 */
export interface GeminiServiceInterface {
  /** Generate an image from a text prompt */
  generateImage: (prompt: string) => Promise<ImageGenerationResult>;
  /** Edit an existing image with a prompt */
  editImage: (imageBuffer: Buffer, prompt: string) => Promise<ImageGenerationResult>;
  /** Generate a mascot variation */
  generateMascotVariation: (
    baseImageBuffer: Buffer,
    input: MascotVariationInput
  ) => Promise<MascotVariationResult>;
  /** Generate a video from a text prompt (Veo API) */
  generateVideo: (input: VideoGenerationInput) => Promise<VideoGenerationResult>;
}

/**
 * Video aspect ratio options
 */
export type VideoAspectRatio = '16:9' | '9:16' | '1:1';

/**
 * Video generation quality/speed tradeoff
 */
export type VideoGenerationMode = 'fast' | 'quality';

/**
 * Input for video generation
 */
export interface VideoGenerationInput {
  /** Text prompt describing the video to generate */
  prompt: string;
  /** Optional negative prompt to avoid certain elements */
  negativePrompt?: string;
  /** Aspect ratio (default: 16:9) */
  aspectRatio?: VideoAspectRatio;
  /** Duration in seconds (default: 5, max: 8 for fast mode, 16 for quality) */
  durationSeconds?: number;
  /** Generation mode - fast for quicker results, quality for better output */
  mode?: VideoGenerationMode;
  /** Optional reference image to guide style/content */
  referenceImage?: Buffer;
  /** Optional output filename (without extension) */
  outputName?: string;
  /** Whether to generate audio with the video (Veo 3+ feature) */
  generateAudio?: boolean;
}

/**
 * Result of video generation
 */
export interface VideoGenerationResult {
  /** Whether generation was successful */
  success: boolean;
  /** Generated video as base64 */
  videoBase64?: string;
  /** Video MIME type */
  mimeType?: string;
  /** File path where the video was saved (if saved) */
  videoPath?: string;
  /** URL to access the generated video (if hosted) */
  videoUrl?: string;
  /** Duration of generated video in seconds */
  durationSeconds?: number;
  /** Error message if failed */
  error?: string;
}
