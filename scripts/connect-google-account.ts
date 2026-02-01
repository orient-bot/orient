#!/usr/bin/env npx ts-node
/**
 * Script to connect a Google account via OAuth
 *
 * Usage: npx ts-node scripts/connect-google-account.ts
 */

import { createGoogleOAuthService, DEFAULT_SCOPES } from '@orient-bot/integrations/google';

async function main() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set');
    console.error('');
    console.error('Set them in your environment:');
    console.error('  export GOOGLE_OAUTH_CLIENT_ID="your-client-id"');
    console.error('  export GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"');
    process.exit(1);
  }

  console.log('🔐 Google OAuth Connection Script');
  console.log('==================================');
  console.log('');
  console.log('This script will open your browser to connect a Google account.');
  console.log('');
  console.log('Scopes requested:');
  for (const scope of DEFAULT_SCOPES) {
    console.log(`  - ${scope.split('/').pop()}`);
  }
  console.log('');

  const oauthService = createGoogleOAuthService({
    clientId,
    clientSecret,
    callbackPort: 8766,
  });

  try {
    const email = await oauthService.connectAccount(DEFAULT_SCOPES);
    console.log('');
    console.log('✅ Successfully connected Google account:', email);
    console.log('');
    console.log('You can now run the e2e tests:');
    console.log('  npm test -- --run src/services/__tests__/googleServices.e2e.test.ts');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Failed to connect account:', error);
    process.exit(1);
  }
}

main();
