#!/usr/bin/env npx tsx
/**
 * Generate transparent mascot images using OpenAI
 * 
 * Usage: npx tsx scripts/generate-transparent-mascots.ts
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

// Mascots to generate
const mascots = [
  {
    name: 'ori-attentive',
    prompt: 'full body sitting attentively, alert friendly expression, ready to help, ears perked up, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'ori-waving',
    prompt: 'friendly waving pose with paw raised in greeting, happy expression, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'ori-thinking',
    prompt: 'thinking pose with paw on chin, looking upward thoughtfully, contemplative expression, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'ori-celebrating',
    prompt: 'celebrating with happy expression, wearing party hat, excited and joyful, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'ori-working',
    prompt: 'focused working pose, wearing headphones, looking at laptop or screen, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'loading',
    prompt: 'thinking expression with eyes looking up, contemplative, waiting pose, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'error',
    prompt: 'apologetic expression, slightly worried but helpful look, head tilted, full body, border collie dog with blue bandana, cartoon style, clean lines',
  },
  {
    name: 'welcome',
    prompt: 'welcoming pose with open paws, warm friendly smile, inviting gesture, full body, border collie dog with blue bandana, cartoon style, clean lines',
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

  console.log('\nGenerating transparent mascot images...\n');

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
