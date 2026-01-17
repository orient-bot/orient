#!/usr/bin/env npx ts-node
/**
 * Test script for the Billing Service
 * 
 * Tests all provider integrations and displays results.
 * Run with: npx ts-node scripts/test-billing.ts
 * Or: npm run test:billing
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
dotenv.config({ path: resolve(__dirname, '../.env') });

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log();
  log(`${'='.repeat(60)}`, colors.cyan);
  log(` ${title}`, colors.bright);
  log(`${'='.repeat(60)}`, colors.cyan);
}

function logResult(provider: string, success: boolean, message: string, cost?: number) {
  const icon = success ? '✅' : '❌';
  const costStr = cost !== undefined ? ` - $${cost.toFixed(2)}` : '';
  log(`${icon} ${provider}: ${message}${costStr}`, success ? colors.green : colors.red);
}

async function testAnthropicBilling(): Promise<{ success: boolean; cost: number; message: string }> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  
  if (!adminKey) {
    return { success: false, cost: 0, message: 'ANTHROPIC_ADMIN_KEY not configured' };
  }
  
  if (!adminKey.startsWith('sk-ant-admin')) {
    return { success: false, cost: 0, message: 'Invalid key format - must start with sk-ant-admin' };
  }
  
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const url = `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${startDate.toISOString()}&group_by[]=model&limit=31`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': adminKey,
        'content-type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, cost: 0, message: `API error ${response.status}: ${errorText.slice(0, 100)}` };
    }
    
    const data = await response.json() as { data?: Array<{ results?: Array<{ input_tokens?: number; output_tokens?: number }> }> };
    
    // Count total tokens
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    
    if (data.data && Array.isArray(data.data)) {
      for (const bucket of data.data) {
        const results = bucket.results || [bucket];
        for (const record of results as Array<Record<string, unknown>>) {
          totalInputTokens += (record.input_tokens as number) || (record.uncached_input_tokens as number) || 0;
          totalOutputTokens += (record.output_tokens as number) || 0;
        }
      }
    }
    
    // Rough cost estimate ($3/M input, $15/M output for Claude 3.5 Sonnet)
    const estimatedCost = (totalInputTokens / 1000000) * 3 + (totalOutputTokens / 1000000) * 15;
    
    return { 
      success: true, 
      cost: Math.round(estimatedCost * 100) / 100,
      message: `Connected! ${totalInputTokens + totalOutputTokens} tokens used`
    };
  } catch (error) {
    return { success: false, cost: 0, message: `Error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function testOpenAIBilling(): Promise<{ success: boolean; cost: number; message: string }> {
  // Use dedicated billing key if available, fallback to regular API key
  const apiKey = process.env.OPENAI_BILLING_KEY || process.env.OPENAI_API_KEY;
  const keySource = process.env.OPENAI_BILLING_KEY ? 'OPENAI_BILLING_KEY' : 'OPENAI_API_KEY';
  
  if (!apiKey) {
    return { success: false, cost: 0, message: 'Neither OPENAI_BILLING_KEY nor OPENAI_API_KEY configured' };
  }
  
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    
    // Try completions usage endpoint
    const url = `https://api.openai.com/v1/organization/usage/completions?start_time=${startTimestamp}&bucket_width=1d`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      // Check for specific error types
      if (response.status === 403) {
        return { success: false, cost: 0, message: 'API key lacks organization usage permissions (need org admin API key)' };
      }
      if (response.status === 404) {
        return { success: false, cost: 0, message: 'Usage API not available - may need Organization Owner API key' };
      }
      return { success: false, cost: 0, message: `API error ${response.status}: ${errorText.slice(0, 100)}` };
    }
    
    const data = await response.json() as { data?: Array<Record<string, unknown>> };
    
    // Count total tokens/usage
    let totalTokens = 0;
    
    if (data.data && Array.isArray(data.data)) {
      for (const bucket of data.data) {
        const results = (bucket.results || [bucket]) as Array<Record<string, unknown>>;
        for (const record of results) {
          totalTokens += (record.input_tokens as number) || (record.n_context_tokens_total as number) || 0;
          totalTokens += (record.output_tokens as number) || (record.n_generated_tokens_total as number) || 0;
        }
      }
    }
    
    // Try to get actual costs
    const costsUrl = `https://api.openai.com/v1/organization/costs?start_time=${startTimestamp}&bucket_width=1d`;
    const costsResponse = await fetch(costsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    let actualCost = 0;
    if (costsResponse.ok) {
      const costsData = await costsResponse.json() as { data?: Array<Record<string, unknown>> };
      if (costsData.data && Array.isArray(costsData.data)) {
        for (const record of costsData.data) {
          if (record.results) {
            for (const result of record.results as Array<Record<string, unknown>>) {
              const amount = result.amount as Record<string, unknown> | undefined;
              actualCost += ((amount?.value as number) || 0) / 100; // Convert cents to dollars
            }
          }
        }
      }
    }
    
    return { 
      success: true, 
      cost: Math.round(actualCost * 100) / 100,
      message: `Connected via ${keySource}! ${totalTokens} tokens used`
    };
  } catch (error) {
    return { success: false, cost: 0, message: `Error (${keySource}): ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function testCloudflareBilling(): Promise<{ success: boolean; cost: number; message: string }> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  
  if (!apiToken) {
    return { success: false, cost: 0, message: 'CLOUDFLARE_API_TOKEN not configured' };
  }
  
  if (!accountId) {
    return { success: false, cost: 0, message: 'CLOUDFLARE_ACCOUNT_ID not configured' };
  }
  
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();
    
    const buckets = (process.env.BILLING_R2_BUCKETS || process.env.S3_BUCKET || '').split(',').map(s => s.trim()).filter(Boolean);
    const bucketFilter = buckets.length > 0 ? `, bucketName_in: [${buckets.map(b => `"${b}"`).join(', ')}]` : '';
    
    const query = `
      query {
        viewer {
          accounts(filter: { accountTag: "${accountId}" }) {
            r2OperationsAdaptiveGroups(
              limit: 100
              filter: {
                datetime_geq: "${startDate.toISOString()}"
                datetime_lt: "${endDate.toISOString()}"
                ${bucketFilter}
              }
            ) {
              sum {
                requests
              }
              dimensions {
                actionType
              }
            }
            r2StorageAdaptiveGroups(
              limit: 100
              filter: {
                datetime_geq: "${startDate.toISOString()}"
                datetime_lt: "${endDate.toISOString()}"
                ${bucketFilter}
              }
            ) {
              max {
                payloadSize
              }
            }
          }
        }
      }
    `;
    
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, cost: 0, message: `API error ${response.status}: ${errorText.slice(0, 100)}` };
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as { data?: { viewer?: { accounts?: any[] } }; errors?: Array<{ message: string }> };
    
    if (data.errors && data.errors.length > 0) {
      return { success: false, cost: 0, message: `GraphQL error: ${data.errors[0].message}` };
    }
    
    let classAOperations = 0;
    let classBOperations = 0;
    let storageBytes = 0;
    
    if (data.data?.viewer?.accounts?.[0]) {
      const account = data.data.viewer.accounts[0];
      
      if (account.r2OperationsAdaptiveGroups) {
        for (const group of account.r2OperationsAdaptiveGroups) {
          const actionType = (group.dimensions?.actionType || '').toLowerCase();
          const requests = group.sum?.requests || 0;
          
          if (['put', 'post', 'list', 'delete'].includes(actionType)) {
            classAOperations += requests;
          } else if (['get', 'head'].includes(actionType)) {
            classBOperations += requests;
          }
        }
      }
      
      if (account.r2StorageAdaptiveGroups) {
        for (const group of account.r2StorageAdaptiveGroups) {
          storageBytes = Math.max(storageBytes, group.max?.payloadSize || 0);
        }
      }
    }
    
    // Calculate costs
    const storageGB = storageBytes / (1024 * 1024 * 1024);
    const storageCost = storageGB * 0.015; // $0.015/GB/month
    const classACost = (classAOperations / 1000000) * 4.50; // $4.50/M
    const classBCost = (classBOperations / 1000000) * 0.36; // $0.36/M
    const totalCost = Math.round((storageCost + classACost + classBCost) * 100) / 100;
    
    return { 
      success: true, 
      cost: totalCost,
      message: `Connected! ${storageGB.toFixed(2)}GB storage, ${classAOperations + classBOperations} operations`
    };
  } catch (error) {
    return { success: false, cost: 0, message: `Error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function testOracleBilling(): Promise<{ success: boolean; cost: number; message: string }> {
  const tenancyOcid = process.env.OCI_TENANCY_OCID;
  const userOcid = process.env.OCI_USER_OCID;
  const fingerprint = process.env.OCI_FINGERPRINT;
  const privateKeyPath = process.env.OCI_PRIVATE_KEY_PATH;
  const region = process.env.OCI_REGION;

  if (!tenancyOcid || !userOcid || !fingerprint || !privateKeyPath || !region) {
    return { success: false, cost: 0, message: 'OCI credentials not fully configured (OCI_TENANCY_OCID, OCI_USER_OCID, OCI_FINGERPRINT, OCI_PRIVATE_KEY_PATH, OCI_REGION)' };
  }

  try {
    // Import the BillingService dynamically to test the actual implementation
    const { BillingService } = await import('../dist/services/billingService.js');
    const billingService = new BillingService();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    const result = await billingService.getOracleBilling(startDate, endDate);

    if (!result.available) {
      return { success: false, cost: 0, message: result.error || 'Unknown error' };
    }

    const serviceCount = result.breakdown?.length || 0;
    return {
      success: true,
      cost: result.cost,
      message: `Connected! ${serviceCount} services used`
    };
  } catch (error) {
    return { success: false, cost: 0, message: `Error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function main() {
  log(`\n🧾 Billing Service Test`, colors.bright);
  log(`Testing all billing integrations...`, colors.dim);
  
  // Show configuration
  logSection('Configuration');
  
  const projectName = process.env.BILLING_PROJECT_NAME || 'All Resources';
  const anthropicKeyIds = process.env.BILLING_ANTHROPIC_KEY_IDS?.split(',').filter(Boolean) || [];
  const r2Buckets = (process.env.BILLING_R2_BUCKETS || process.env.S3_BUCKET || '').split(',').filter(Boolean);
  
  log(`Project: ${projectName}`);
  log(`Anthropic Admin Key: ${process.env.ANTHROPIC_ADMIN_KEY ? '✅ Configured' : '❌ Not set'}`);
  log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not set'}`);
  log(`OpenAI Billing Key: ${process.env.OPENAI_BILLING_KEY ? '✅ Configured (will use for billing)' : '⚪ Not set (using OPENAI_API_KEY)'}`);
  log(`Cloudflare API Token: ${process.env.CLOUDFLARE_API_TOKEN ? '✅ Configured' : '❌ Not set'}`);
  log(`Cloudflare Account ID: ${process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '❌ Not set'}`);
  log(`OCI Credentials: ${process.env.OCI_TENANCY_OCID ? '✅ Configured' : '❌ Not set'}`);
  
  if (anthropicKeyIds.length > 0) {
    log(`Anthropic Key Filter: ${anthropicKeyIds.join(', ')}`, colors.yellow);
  }
  if (r2Buckets.length > 0) {
    log(`R2 Bucket Filter: ${r2Buckets.join(', ')}`, colors.yellow);
  }
  
  // Run tests
  logSection('Testing Providers');
  
  const results: Array<{ provider: string; success: boolean; cost: number; message: string }> = [];
  
  // Anthropic
  log('\nTesting Anthropic...', colors.dim);
  const anthropicResult = await testAnthropicBilling();
  results.push({ provider: 'Anthropic', ...anthropicResult });
  logResult('Anthropic', anthropicResult.success, anthropicResult.message, anthropicResult.cost);
  
  // OpenAI
  log('\nTesting OpenAI...', colors.dim);
  const openaiResult = await testOpenAIBilling();
  results.push({ provider: 'OpenAI', ...openaiResult });
  logResult('OpenAI', openaiResult.success, openaiResult.message, openaiResult.cost);
  
  // Cloudflare
  log('\nTesting Cloudflare R2...', colors.dim);
  const cloudflareResult = await testCloudflareBilling();
  results.push({ provider: 'Cloudflare R2', ...cloudflareResult });
  logResult('Cloudflare R2', cloudflareResult.success, cloudflareResult.message, cloudflareResult.cost);
  
  // Oracle
  log('\nTesting Oracle Cloud...', colors.dim);
  const oracleResult = await testOracleBilling();
  results.push({ provider: 'Oracle Cloud', ...oracleResult });
  logResult('Oracle Cloud', oracleResult.success, oracleResult.message, oracleResult.cost);
  
  // Summary
  logSection('Summary');
  
  const successCount = results.filter(r => r.success).length;
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
  
  log(`Providers Connected: ${successCount}/${results.length}`);
  log(`Total Estimated Cost (last 30 days): $${totalCost.toFixed(2)}`);
  
  if (successCount < results.length) {
    log(`\n⚠️  Some providers failed. Check the configuration above.`, colors.yellow);
  } else {
    log(`\n✅ All providers connected successfully!`, colors.green);
  }
  
  console.log();
}

main().catch(console.error);

