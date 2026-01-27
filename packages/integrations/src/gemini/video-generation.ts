/**
 * Gemini Veo Video Generation
 *
 * Video generation using Google's Veo models via the Gemini API.
 * Supports text-to-video and image-to-video generation.
 *
 * NOTE: The Veo API is not yet fully available in the @google/genai SDK.
 * This module provides a placeholder implementation that returns helpful errors.
 */

import { createServiceLogger } from '@orientbot/core';
import type { VideoGenerationInput, VideoGenerationResult } from './types.js';

const logger = createServiceLogger('gemini-video');

/**
 * Default Veo model for video generation
 * veo-3.1-generate-preview is the latest with audio support
 */
export const DEFAULT_VIDEO_MODEL = 'veo-3.1-generate-preview';
export const FAST_VIDEO_MODEL = 'veo-3.1-fast-generate-preview';

/**
 * Generate a video from a text prompt using Veo
 *
 * NOTE: The Veo API is not yet fully available in the @google/genai SDK.
 * This function returns an error indicating the feature is not yet supported.
 */
export async function generateVideo(input: VideoGenerationInput): Promise<VideoGenerationResult> {
  const op = logger.startOperation('generateVideo', {
    mode: input.mode || 'quality',
    aspectRatio: input.aspectRatio || '16:9',
    duration: input.durationSeconds || 5,
    hasReferenceImage: !!input.referenceImage,
    generateAudio: input.generateAudio ?? true,
  });

  // The Veo video generation API is not yet available in the @google/genai SDK
  // Return a helpful error message until the SDK is updated
  const errorMessage =
    'Veo video generation is not yet available in the @google/genai SDK. ' +
    'This feature requires direct API access which is currently in preview.';

  op.failure(new Error(errorMessage));

  return {
    success: false,
    error: errorMessage,
  };
}

/**
 * Build a demo video prompt for the Orient website
 * Shows the agentic workflow: user asks → Ori responds → action taken
 */
export function buildOrientDemoPrompt(): string {
  return `Create a smooth animated demo video showing an AI assistant workflow:

SCENE 1 (0-2s): A smartphone screen showing a WhatsApp chat interface. A user types a message: "Hey Ori, schedule a meeting with Tom tomorrow at 3pm"

SCENE 2 (2-4s): The chat shows Ori (a friendly blue border collie mascot with a blue bandana) responding with a message bubble that includes a calendar preview image showing available times.

SCENE 3 (4-6s): A notification appears showing "Meeting Scheduled ✓" and a calendar invite being sent. The WhatsApp chat shows Ori's response: "Done! I've scheduled a meeting with Tom for tomorrow at 3pm and sent the calendar invite."

STYLE: Clean, modern UI design. Soft lighting, professional product demo aesthetic. Cartoon mascot character. WhatsApp-like chat bubbles with green for user and white for Ori. Smooth transitions between scenes.

MOOD: Helpful, efficient, friendly. Demonstrate that tasks get done automatically.`;
}
