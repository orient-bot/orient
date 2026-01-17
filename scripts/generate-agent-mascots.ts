#!/usr/bin/env npx tsx
/**
 * Generate transparent agent mascot images using OpenAI
 * 
 * Usage: npx tsx scripts/generate-agent-mascots.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { toFile } from 'openai';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Agent mascots to generate
const mascots = [
  {
    name: 'agent-pm-assistant',
    prompt: 'professional project manager pose, holding clipboard or tablet, organized and efficient look, wearing glasses, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'agent-communicator',
    prompt: 'friendly communication pose, speech bubbles around, holding phone or with headset, social and approachable, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'agent-scheduler',
    prompt: 'organized scheduling pose, with calendar icon, pointing to time, punctual and efficient look, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'agent-explorer',
    prompt: 'curious explorer pose, holding magnifying glass, detective-like searching expression, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'agent-app-builder',
    prompt: 'developer pose, with code symbols around, focused on building, technical and creative, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'agent-onboarder',
    prompt: 'welcoming guide pose, showing the way, helpful teacher expression, with welcome sign or pointing, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'ori-developer',
    prompt: 'developer coding pose, with laptop or terminal, focused and technical, programmer style, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'ori-messaging',
    prompt: 'messaging pose, with chat bubbles, typing or communicating, social expression, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'ori-scheduler',
    prompt: 'time management pose, with clock or calendar, organized and punctual, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'ori-support',
    prompt: 'customer support pose, wearing headset, helpful and attentive, ready to assist, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'setup-helper',
    prompt: 'helpful setup assistant pose, with tools or wrench icon, ready to configure and help, technical but friendly, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'empty-apps',
    prompt: 'curious looking around pose, slightly confused but hopeful, searching for something, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'integrations',
    prompt: 'connecting pose, with network or connection icons, linking things together, technical integration feel, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'agents',
    prompt: 'team leader pose, confident and capable, multiple skill representation, orchestrating, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
];

async function generateMascot(
  client: OpenAI,
  baseImageBuffer: Buffer,
  prompt: string,
  outputName: string
): Promise<string> {
  console.log(`Generating: ${outputName}...`);
  
  const imageFile = await toFile(baseImageBuffer, 'mascot.png', { type: 'image/png' });
  
  const fullPrompt = `Using this cartoon border collie dog mascot with blue bandana as the style reference: ${prompt}

CRITICAL: Generate PNG with TRANSPARENT background. Keep same cartoon style with clean lines and flat colors. No background elements.`;

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
    throw new Error(`No image data returned for ${outputName}`);
  }

  const outputPath = path.join(
    projectRoot,
    'packages/dashboard-frontend/public/mascot/variations',
    `${outputName}.png`
  );

  const imageBuffer = Buffer.from(imageData.b64_json, 'base64');
  fs.writeFileSync(outputPath, imageBuffer);
  
  console.log(`  ✓ Saved: ${outputPath}`);
  return outputPath;
}

async function main() {
  // Try to get API key from environment or database
  let apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log('OPENAI_API_KEY not in env, checking database...');
    try {
      const { createSecretsService } = await import('@orient/database-services');
      const secretsService = createSecretsService();
      const secret = await secretsService.getSecret('OPENAI_API_KEY');
      if (secret?.value) {
        apiKey = secret.value;
        console.log('Found API key in database');
      }
    } catch (error) {
      console.error('Failed to load from database:', error);
    }
  }

  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found in environment or database');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  // Load base mascot image
  const baseMascotPath = path.join(
    projectRoot,
    'packages/dashboard-frontend/public/mascot/base.png'
  );

  if (!fs.existsSync(baseMascotPath)) {
    console.error(`Error: Base mascot not found at ${baseMascotPath}`);
    process.exit(1);
  }

  const baseImageBuffer = fs.readFileSync(baseMascotPath);
  console.log('Loaded base mascot image');

  // Ensure output directory exists
  const outputDir = path.join(
    projectRoot,
    'packages/dashboard-frontend/public/mascot/variations'
  );
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('\nGenerating transparent agent mascot images...\n');

  const results: string[] = [];
  
  for (const mascot of mascots) {
    try {
      const outputPath = await generateMascot(
        client,
        baseImageBuffer,
        mascot.prompt,
        mascot.name
      );
      results.push(outputPath);
    } catch (error) {
      console.error(`  ✗ Failed to generate ${mascot.name}:`, error);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Generated ${results.length}/${mascots.length} mascots`);
  
  // Copy to website folder if it exists
  const websiteMascotDir = path.join(projectRoot, 'website/static/img/mascot');
  if (fs.existsSync(websiteMascotDir)) {
    console.log('\nCopying to website folder...');
    for (const resultPath of results) {
      const filename = path.basename(resultPath);
      const destPath = path.join(websiteMascotDir, filename);
      fs.copyFileSync(resultPath, destPath);
      console.log(`  ✓ Copied ${filename}`);
    }
  }

  console.log('\nDone!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
