#!/usr/bin/env npx tsx
/**
 * Generate Demo Video for Orient Website
 *
 * This script uses the Veo API via Google's Gemini SDK to generate
 * a demo video showing Orient's agentic capabilities.
 *
 * Usage:
 *   npx tsx scripts/generate-demo-video.ts
 *
 * Requirements:
 *   - GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY environment variable
 *   - @google/genai package installed
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';
import * as path from 'path';

// Configuration
const OUTPUT_DIR = 'website/static/video';
const OUTPUT_FILENAME = 'ori-demo.mp4';
const POSTER_PATH = 'website/static/img/screenshots/demo-poster.png';

// Veo model - use 3.1 for audio support
const VEO_MODEL = 'veo-3.1-generate-preview';

// Get API key
const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ Error: GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY not set');
  process.exit(1);
}

// Demo video prompt
const DEMO_PROMPT = `Create a smooth, professional demo video showing an AI assistant workflow on a smartphone:

SCENE 1 (0-2 seconds):
A smartphone screen displaying a WhatsApp chat interface. The contact name shows "Ori 🐕" with a blue dot indicating online status. A user is typing a message that appears: "Hey Ori, schedule a meeting with Tom tomorrow at 3pm"

SCENE 2 (2-4 seconds):
The typing indicator shows Ori is responding. Then Ori's message appears with a friendly cartoon border collie avatar (blue bandana). The response shows: "I'll check Tom's availability..." followed by a small calendar preview card embedded in the chat showing tomorrow's schedule with available slots highlighted in green.

SCENE 3 (4-6 seconds):
A new message from Ori appears: "Done! ✓ Meeting scheduled for tomorrow 3pm with Tom. Calendar invite sent to both of you." A small notification animation slides in from the top showing "📅 Meeting Scheduled - Tomorrow 3:00 PM".

SCENE 4 (6-8 seconds):
The chat scrolls up slightly to show the full conversation. A subtle glow effect highlights the confirmation. The phone screen transitions to show a clean calendar view with the new meeting entry highlighted.

VISUAL STYLE:
- Clean, modern smartphone UI (iPhone-style bezels)
- WhatsApp-like chat bubbles: green for user messages, white for Ori
- Smooth, fluid animations between scenes
- Soft, professional lighting on the phone
- Cartoon mascot avatar for Ori (friendly blue border collie with bandana)
- Neutral, blurred background suggesting a professional workspace

AUDIO:
- Subtle WhatsApp-like message send/receive sounds
- Soft "ding" when meeting is confirmed
- Light ambient background music (professional, optimistic tone)

MOOD: Efficient, helpful, friendly. Demonstrate that complex tasks happen automatically through simple conversation.`;

const NEGATIVE_PROMPT = 'blurry, low quality, distorted text, unreadable UI, pixelated, amateur, dark, scary, violent';

async function main() {
  console.log('🎬 Orient Demo Video Generator');
  console.log('================================\n');

  const client = new GoogleGenAI({ apiKey });

  // Create output directory
  const outputDir = path.join(process.cwd(), OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });

  console.log('📝 Video Configuration:');
  console.log(`   Model: ${VEO_MODEL}`);
  console.log(`   Aspect Ratio: 16:9`);
  console.log(`   Output: ${OUTPUT_DIR}/${OUTPUT_FILENAME}\n`);

  console.log('🚀 Starting video generation...');
  console.log('   This may take several minutes.\n');

  try {
    // Check if we can load a reference image for style consistency
    let referenceImageBase64: string | undefined;
    try {
      const posterBuffer = await fs.readFile(path.join(process.cwd(), POSTER_PATH));
      referenceImageBase64 = posterBuffer.toString('base64');
      console.log('✅ Loaded reference image from demo poster\n');
    } catch {
      console.log('ℹ️  No reference image found, generating without style reference\n');
    }

    // Start video generation
    const generateConfig: Record<string, unknown> = {
      aspectRatio: '16:9',
      numberOfVideos: 1,
      // Note: durationSeconds, generateAudio may not be supported in all models
    };

    // The Veo API uses generateVideos
    console.log('📡 Calling Veo API...\n');

    // Note: The @google/genai SDK API for videos may differ
    // This is a best-effort implementation based on documentation
    let response: any;
    try {
      response = await (client.models as any).generateVideos({
        model: VEO_MODEL,
        prompt: DEMO_PROMPT,
        config: generateConfig,
      });
    } catch (apiError) {
      // Try alternative method - some SDK versions use different syntax
      console.log('ℹ️  Trying alternative API method...\n');
      response = await (client as any).generateVideo({
        model: VEO_MODEL,
        prompt: DEMO_PROMPT,
        ...generateConfig,
      });
    }

    console.log('📊 API Response received. Processing...');
    console.log(`   Response type: ${typeof response}`);
    console.log(`   Has done property: ${response?.done !== undefined}`);
    console.log(`   Has name property: ${response?.name !== undefined}`);
    console.log(`   Has result property: ${response?.result !== undefined}`);
    console.log('');

    // Poll for completion if this is an async operation
    let operation = response;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes
    const pollInterval = 5000; // 5 seconds

    // Check if we need to poll (async operation)
    if (operation.name && !operation.done) {
      console.log('⏳ Video generation is async. Polling for completion...\n');
      
      while (!operation.done && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        attempts++;

        const elapsed = Math.floor((attempts * pollInterval) / 1000);
        process.stdout.write(`\r⏳ Generating... ${elapsed}s elapsed`);

        try {
          operation = await (client.operations as any).get({ name: operation.name });
        } catch (pollError) {
          console.log(`\n⚠️  Poll error: ${pollError instanceof Error ? pollError.message : pollError}`);
        }
      }
      console.log('\n');
    } else if (operation.done === undefined) {
      // If done is undefined, the response might already contain the video
      console.log('ℹ️  Response appears to be synchronous.\n');
    }

    if (operation.done === false) {
      console.error('❌ Video generation timed out after 10 minutes');
      process.exit(1);
    }

    if (operation.error) {
      console.error('❌ Generation failed:', operation.error.message || JSON.stringify(operation.error));
      process.exit(1);
    }

    // Get the video - could be in different places depending on API version
    const result = operation.result || operation;
    const generatedVideos = result?.generatedVideos || result?.videos || [];
    
    if (!generatedVideos.length) {
      console.log('📋 Response structure:');
      console.log(JSON.stringify(result, null, 2).substring(0, 1000));
      console.error('\n❌ No video was generated');
      process.exit(1);
    }

    const generatedVideo = generatedVideos[0];
    console.log('✅ Video generated successfully!\n');
    console.log(`   Video object keys: ${Object.keys(generatedVideo).join(', ')}`);

    // Download the video
    console.log('📥 Downloading video...');

    const videoRef = generatedVideo.video || generatedVideo.file || generatedVideo;
    if (videoRef) {
      let videoBuffer: Buffer | null = null;
      
      // Try different methods to get the video data
      if (typeof videoRef === 'string' && videoRef.startsWith('http')) {
        // It's a URL - fetch it
        const fetchResponse = await fetch(videoRef);
        const arrayBuffer = await fetchResponse.arrayBuffer();
        videoBuffer = Buffer.from(arrayBuffer);
      } else if (videoRef.uri) {
        // It has a URI - fetch it
        const fetchResponse = await fetch(videoRef.uri);
        const arrayBuffer = await fetchResponse.arrayBuffer();
        videoBuffer = Buffer.from(arrayBuffer);
      } else if (videoRef.data) {
        // It has base64 data
        videoBuffer = Buffer.from(videoRef.data, 'base64');
      } else {
        // Try to download via files API
        try {
          const videoFile = await (client.files as any).download({ file: videoRef });
          if (videoFile instanceof Buffer) {
            videoBuffer = videoFile;
          } else if (videoFile?.data) {
            videoBuffer = Buffer.from(videoFile.data);
          }
        } catch (downloadError) {
          console.log(`⚠️  Download via files API failed: ${downloadError instanceof Error ? downloadError.message : downloadError}`);
        }
      }

      if (videoBuffer) {
        const outputPath = path.join(outputDir, OUTPUT_FILENAME);
        await fs.writeFile(outputPath, videoBuffer);

        const stats = await fs.stat(outputPath);
        console.log(`✅ Video saved to: ${outputPath}`);
        console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);
      } else {
        console.error('❌ Could not extract video data from response');
        console.log('   Video reference:', JSON.stringify(videoRef, null, 2).substring(0, 500));
        process.exit(1);
      }
    } else {
      console.error('❌ No video reference in response');
      process.exit(1);
    }

    console.log('🎉 Demo video generation complete!');
    console.log(`\nThe video is ready at: ${OUTPUT_DIR}/${OUTPUT_FILENAME}`);
    console.log('You can now view it on the Orient website.');
  } catch (error) {
    console.error('\n❌ Error during video generation:');
    
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      
      if (error.message.includes('not found') || error.message.includes('404')) {
        console.error('\n💡 The Veo API may not be available for your account.');
        console.error('   Veo requires specific API access. See:');
        console.error('   https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos');
      }
      
      if (error.message.includes('quota') || error.message.includes('rate')) {
        console.error('\n💡 API quota exceeded. Try again later.');
      }
    } else {
      console.error(`   ${String(error)}`);
    }
    
    process.exit(1);
  }
}

main();
