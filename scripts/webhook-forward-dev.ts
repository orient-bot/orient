#!/usr/bin/env npx tsx
/**
 * Webhook Forward Dev Registration Script
 * 
 * Registers local development environment with production to receive
 * webhook forwarding. Automatically renews registration and handles
 * graceful shutdown.
 * 
 * Usage:
 *   npx tsx scripts/webhook-forward-dev.ts [options]
 * 
 * Options:
 *   --url <url>         Local webhook URL (default: auto-detect ngrok)
 *   --production <url>  Production API URL (default: from PRODUCTION_URL env)
 *   --production <url>  Production API URL (default: from PRODUCTION_URL env)
 *   --ttl <seconds>     TTL in seconds (default: 1800 = 30 min)
 *   --secret <secret>   Forward secret (default: from WEBHOOK_FORWARD_SECRET env)
 *   --description <d>   Description for this dev instance
 * 
 * Examples:
 *   # Auto-detect ngrok and register
 *   npx tsx scripts/webhook-forward-dev.ts
 * 
 *   # Specify URL explicitly
 *   npx tsx scripts/webhook-forward-dev.ts --url https://abc123.ngrok-free.app/webhooks/whatsapp
 */

import dotenv from 'dotenv';
dotenv.config();

// =============================================================================
// Configuration
// =============================================================================

interface Config {
  localUrl: string;
  productionUrl: string;
  secret: string;
  ttlSeconds: number;
  description: string;
}

function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const config: Partial<Config> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--url':
        config.localUrl = next;
        i++;
        break;
      case '--production':
        config.productionUrl = next;
        i++;
        break;
      case '--ttl':
        config.ttlSeconds = parseInt(next, 10);
        i++;
        break;
      case '--secret':
        config.secret = next;
        i++;
        break;
      case '--description':
        config.description = next;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
Webhook Forward Dev Registration Script

Registers local development environment with production to receive
webhook forwarding. Automatically renews registration and handles
graceful shutdown.

Usage:
  npx tsx scripts/webhook-forward-dev.ts [options]

Options:
  --url <url>         Local webhook URL (default: auto-detect ngrok)
  --production <url>  Production API URL (default: https://app.example.com)
  --ttl <seconds>     TTL in seconds (default: 1800 = 30 min)
  --secret <secret>   Forward secret (default: from WEBHOOK_FORWARD_SECRET env)
  --description <d>   Description for this dev instance

Environment Variables:
  WEBHOOK_FORWARD_SECRET  Shared secret for registration (required)
  PRODUCTION_URL          Production URL override

Examples:
  # Auto-detect ngrok and register
  npx tsx scripts/webhook-forward-dev.ts

  # Specify URL explicitly
  npx tsx scripts/webhook-forward-dev.ts --url https://abc123.ngrok-free.app/webhooks/whatsapp
  `);
}

// =============================================================================
// Ngrok Auto-Detection
// =============================================================================

async function detectNgrokUrl(): Promise<string | null> {
  try {
    // Ngrok exposes a local API at http://127.0.0.1:4040/api/tunnels
    const response = await fetch('http://127.0.0.1:4040/api/tunnels');
    if (!response.ok) return null;

    const data = await response.json() as { 
      tunnels: Array<{ 
        public_url: string; 
        config: { addr: string };
        proto: string;
      }> 
    };

    // Find HTTPS tunnel
    const httpsTunnel = data.tunnels.find(t => t.proto === 'https');
    if (httpsTunnel) {
      return `${httpsTunnel.public_url}/webhooks/whatsapp`;
    }

    // Fall back to first tunnel
    if (data.tunnels.length > 0) {
      return `${data.tunnels[0].public_url}/webhooks/whatsapp`;
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// Registration Client
// =============================================================================

class ForwardRegistrationClient {
  private productionUrl: string;
  private secret: string;
  private registrationId: string | null = null;
  private renewInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(productionUrl: string, secret: string) {
    this.productionUrl = productionUrl.replace(/\/$/, '');
    this.secret = secret;
  }

  async register(
    url: string, 
    ttlSeconds: number, 
    description?: string
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.productionUrl}/api/webhook-forward/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forward-Secret': this.secret,
        },
        body: JSON.stringify({
          url,
          ttlSeconds,
          description,
        }),
      });

      const result = await response.json() as { 
        success: boolean; 
        id?: string; 
        expiresAt?: string;
        error?: string;
      };

      if (result.success && result.id) {
        this.registrationId = result.id;
        console.log(`✅ Registered with production`);
        console.log(`   Registration ID: ${result.id}`);
        console.log(`   Expires at: ${result.expiresAt}`);
        return true;
      } else {
        console.error(`❌ Registration failed: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Failed to connect to production:`, error);
      return false;
    }
  }

  async renew(ttlSeconds: number): Promise<boolean> {
    if (!this.registrationId) return false;

    try {
      const response = await fetch(`${this.productionUrl}/api/webhook-forward/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forward-Secret': this.secret,
        },
        body: JSON.stringify({
          id: this.registrationId,
          ttlSeconds,
        }),
      });

      const result = await response.json() as { 
        success: boolean; 
        expiresAt?: string;
        error?: string;
      };

      if (result.success) {
        console.log(`🔄 Renewed registration, expires: ${result.expiresAt}`);
        return true;
      } else {
        console.error(`⚠️  Renewal failed: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error(`⚠️  Renewal request failed:`, error);
      return false;
    }
  }

  async deregister(): Promise<void> {
    if (!this.registrationId) return;

    try {
      await fetch(`${this.productionUrl}/api/webhook-forward/deregister`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forward-Secret': this.secret,
        },
        body: JSON.stringify({
          id: this.registrationId,
        }),
      });
      console.log(`👋 Deregistered from production`);
    } catch {
      // Ignore errors during shutdown
    }
  }

  startHeartbeat(ttlSeconds: number): void {
    // Renew at half the TTL interval
    const intervalMs = (ttlSeconds / 2) * 1000;
    
    this.renewInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.renew(ttlSeconds);
    }, intervalMs);

    console.log(`💓 Heartbeat started (every ${intervalMs / 1000}s)`);
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.renewInterval) {
      clearInterval(this.renewInterval);
      this.renewInterval = null;
    }

    await this.deregister();
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Webhook Forward - Local Dev Registration                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const args = parseArgs();

  // Get secret
  const secret = args.secret || process.env.WEBHOOK_FORWARD_SECRET;
  if (!secret || secret.length < 16) {
    console.error('❌ Error: WEBHOOK_FORWARD_SECRET must be at least 16 characters');
    console.error('   Set it in your .env file or use --secret flag');
    process.exit(1);
  }

  // Get production URL
  const productionUrl = args.productionUrl || process.env.PRODUCTION_URL || '';
  if (!productionUrl) {
    console.error('❌ Error: PRODUCTION_URL must be set or provided via --production');
    process.exit(1);
  }

  // Get local URL (auto-detect ngrok if not specified)
  let localUrl = args.localUrl;
  if (!localUrl) {
    console.log('🔍 Detecting ngrok tunnel...');
    localUrl = await detectNgrokUrl();
    
    if (!localUrl) {
      console.error('❌ Error: Could not detect ngrok tunnel');
      console.error('   Make sure ngrok is running: ngrok http 4097');
      console.error('   Or specify URL with --url flag');
      process.exit(1);
    }
    
    console.log(`   Found: ${localUrl}`);
  }

  // Get TTL and description
  const ttlSeconds = args.ttlSeconds || 1800; // 30 minutes default
  const description = args.description || `Local dev (${process.env.USER || 'unknown'})`;

  console.log('');
  console.log('📋 Configuration:');
  console.log(`   Production: ${productionUrl}`);
  console.log(`   Local URL:  ${localUrl}`);
  console.log(`   TTL:        ${ttlSeconds}s (${ttlSeconds / 60} min)`);
  console.log(`   Description: ${description}`);
  console.log('');

  // Create client and register
  const client = new ForwardRegistrationClient(productionUrl, secret);

  const registered = await client.register(localUrl, ttlSeconds, description);
  if (!registered) {
    process.exit(1);
  }

  // Start heartbeat
  client.startHeartbeat(ttlSeconds);

  console.log('');
  console.log('📡 Listening for forwarded webhooks...');
  console.log('   Press Ctrl+C to stop');
  console.log('');

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('');
    console.log('🛑 Shutting down...');
    await client.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
  await new Promise(() => {}); // Never resolves
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


