#!/usr/bin/env tsx
/**
 * Store Google OAuth Credentials in Secrets Database
 *
 * This script reads Google OAuth credentials from .env and stores them
 * in the encrypted secrets database.
 *
 * Usage: tsx scripts/store-google-secrets.ts
 */

import { SecretsService } from '@orientbot/database-services';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

async function storeGoogleSecrets() {
  const secrets = new SecretsService();

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      '❌ Error: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET not found in .env'
    );
    process.exit(1);
  }

  try {
    console.log('📦 Storing Google OAuth credentials in secrets database...\n');

    await secrets.setSecret('GOOGLE_OAUTH_CLIENT_ID', clientId, {
      category: 'oauth',
      description: 'Google OAuth 2.0 Client ID for dashboard authentication',
      changedBy: 'setup-script',
    });

    await secrets.setSecret('GOOGLE_OAUTH_CLIENT_SECRET', clientSecret, {
      category: 'oauth',
      description: 'Google OAuth 2.0 Client Secret for dashboard authentication',
      changedBy: 'setup-script',
    });

    console.log('✅ GOOGLE_OAUTH_CLIENT_ID stored');
    console.log('✅ GOOGLE_OAUTH_CLIENT_SECRET stored\n');

    // Verify
    const storedClientId = await secrets.getSecret('GOOGLE_OAUTH_CLIENT_ID');
    const storedClientSecret = await secrets.getSecret('GOOGLE_OAUTH_CLIENT_SECRET');

    if (storedClientId && storedClientSecret) {
      console.log('✅ Verification successful!');
      console.log('   Client ID:', storedClientId.substring(0, 20) + '...');
      console.log('   Client Secret:', storedClientSecret.substring(0, 10) + '...\n');

      console.log('✨ Google OAuth credentials are now stored in the encrypted secrets database.');
      console.log('💡 You can now remove these from your .env file for better security.\n');
    } else {
      console.error('❌ Verification failed - could not retrieve stored secrets');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error storing secrets:', error);
    process.exit(1);
  }
}

storeGoogleSecrets();
