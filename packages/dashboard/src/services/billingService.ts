/**
 * Billing Service
 *
 * Fetches and aggregates billing data from multiple providers:
 * - Anthropic (Admin API)
 * - OpenAI (Organization Usage API)
 * - Cloudflare R2 (GraphQL Analytics API)
 * - Oracle Cloud (OCI Cost Analysis API)
 *
 * Exported via @orient/dashboard package.
 */

import { createServiceLogger } from '@orient/core';
import { GoogleAuth } from 'google-auth-library';
import { createSecretsService, type SecretsService } from '@orient/database-services';
import * as oci from 'oci-sdk';
import * as fs from 'fs';

const logger = createServiceLogger('billing-service');

// ============================================
// Types
// ============================================

export interface ModelCost {
  model: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

export interface ServiceCost {
  service: string;
  cost: number;
  details?: Record<string, unknown>;
}

export interface ProviderBilling {
  provider: string;
  cost: number;
  available: boolean;
  error?: string;
  breakdown?: ModelCost[] | ServiceCost[];
  tokenCount?: number;
  storageGB?: number;
  operations?: number;
}

export interface DailyCost {
  date: string;
  cost: number;
  provider: string;
}

export interface BillingSummary {
  dateRange: { start: string; end: string };
  totalCost: number;
  providers: {
    google: ProviderBilling;
    anthropic: ProviderBilling;
    openai: ProviderBilling;
    cloudflare: ProviderBilling;
    oracle: ProviderBilling;
  };
  dailyCosts: DailyCost[];
  fetchedAt: string;
}

// ============================================
// Configuration
// ============================================

interface BillingConfig {
  // API keys for admin/billing access
  anthropicAdminKey?: string;
  openaiApiKey?: string;
  googleBillingProjectId?: string;
  googleServiceAccountKey?: string;
  cloudflareApiToken?: string;
  cloudflareAccountId?: string;
  ociTenancyOcid?: string;
  ociUserOcid?: string;
  ociFingerprint?: string;
  ociPrivateKeyPath?: string;
  ociRegion?: string;

  // Project scope - filter billing to specific keys/resources
  projectScope?: {
    // Anthropic: The API key ID(s) to filter by (from console.anthropic.com > Settings > API Keys)
    // Get the key ID by looking at your API key's settings
    anthropicApiKeyIds?: string[];

    // OpenAI: The API key used by the project (same as transcription key)
    // This will be the OPENAI_API_KEY used for Whisper transcription
    openaiApiKey?: string;

    // Cloudflare: The specific R2 bucket(s) to track
    // Default: 'orienter-data'
    r2Buckets?: string[];

    // Oracle: Compartment OCID to scope costs
    ociCompartmentOcid?: string;

    // Project name for display
    projectName?: string;

    // Google Cloud billing project ID for Gemini/Veo usage
    googleBillingProjectId?: string;
  };
}

// Cache for billing data (1 hour TTL)
let billingCache: { data: BillingSummary; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function normalizeSummary(summary: BillingSummary): BillingSummary {
  const providers = summary.providers as BillingSummary['providers'] &
    Record<string, ProviderBilling>;
  if (!providers.google) {
    providers.google = {
      provider: 'google',
      cost: 0,
      available: false,
      error: 'Google billing not configured',
    };
  }
  return {
    ...summary,
    providers: providers as BillingSummary['providers'],
  };
}

// ============================================
// Anthropic Pricing (per 1M tokens)
// ============================================

const ANTHROPIC_PRICING: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-4-sonnet': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-4-opus': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-5-haiku': { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-3-opus': { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-3-sonnet': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-haiku': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.3 },
};

// ============================================
// OpenAI Pricing (per 1M tokens)
// ============================================

const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  // Chat models (per 1M tokens)
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  o1: { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0 },
  // Embeddings (per 1M tokens)
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

// Whisper pricing (per minute of audio)
const OPENAI_WHISPER_PRICING = {
  'whisper-1': 0.006, // $0.006 per minute
};

// ============================================
// Google Cloud Billing (Gemini/Veo)
// ============================================

const GOOGLE_BILLING_SCOPE = 'https://www.googleapis.com/auth/cloud-billing.readonly';

// ============================================
// Cloudflare R2 Pricing
// ============================================

const CLOUDFLARE_R2_PRICING = {
  storagePerGBMonth: 0.015, // $0.015/GB/month
  classAOperationsPerMillion: 4.5, // PUT, POST, LIST
  classBOperationsPerMillion: 0.36, // GET, HEAD
};

// ============================================
// Helper Functions
// ============================================

function getAnthropicPricing(model: string) {
  const lowerModel = model.toLowerCase();
  for (const [key, pricing] of Object.entries(ANTHROPIC_PRICING)) {
    if (lowerModel.includes(key)) {
      return pricing;
    }
  }
  return ANTHROPIC_PRICING['claude-3-5-sonnet']; // Default
}

function getOpenAIPricing(model: string) {
  const lowerModel = model.toLowerCase();
  for (const [key, pricing] of Object.entries(OPENAI_PRICING)) {
    if (lowerModel.includes(key)) {
      return pricing;
    }
  }
  return OPENAI_PRICING['gpt-4o']; // Default
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDefaultStartDate(daysAgo = 30): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

// ============================================
// Anthropic API
// ============================================

async function fetchAnthropicBilling(
  adminKey: string,
  startDate: Date,
  endDate: Date,
  apiKeyIds?: string[]
): Promise<ProviderBilling> {
  const op = logger.startOperation('fetch-anthropic-billing');

  try {
    const startingAt = startDate.toISOString();

    // Build URL with optional API key filtering
    // When apiKeyIds are provided, we filter to only those keys
    let url = `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${startingAt}&group_by[]=model&limit=31`;

    // Add API key ID filter if specified
    if (apiKeyIds && apiKeyIds.length > 0) {
      // Add group_by for api_key_id to see per-key breakdown
      url += '&group_by[]=api_key_id';
      logger.debug('Filtering Anthropic billing by API key IDs', { apiKeyIds });
    }

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
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as { data?: any[] };

    // Process usage data
    const breakdown: ModelCost[] = [];
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    if (data.data && Array.isArray(data.data)) {
      for (const bucket of data.data) {
        const results = (bucket.results || [bucket]) as Array<Record<string, unknown>>;

        for (const record of results) {
          // Filter by API key ID if specified
          if (apiKeyIds && apiKeyIds.length > 0) {
            const recordKeyId = record.api_key_id as string;
            if (recordKeyId && !apiKeyIds.includes(recordKeyId)) {
              continue; // Skip records from other API keys
            }
          }

          const model = (record.model as string) || 'unknown';
          const pricing = getAnthropicPricing(model);

          const inputTokens =
            (record.uncached_input_tokens as number) || (record.input_tokens as number) || 0;
          const outputTokens = (record.output_tokens as number) || 0;
          const cacheReadTokens = (record.cache_read_input_tokens as number) || 0;

          let cacheWriteTokens = 0;
          if (record.cache_creation) {
            const cacheCreation = record.cache_creation as Record<string, unknown>;
            cacheWriteTokens =
              ((cacheCreation.ephemeral_1h_input_tokens as number) || 0) +
              ((cacheCreation.ephemeral_5m_input_tokens as number) || 0);
          }

          const cost =
            (inputTokens / 1000000) * pricing.input +
            (outputTokens / 1000000) * pricing.output +
            (cacheReadTokens / 1000000) * pricing.cacheRead +
            (cacheWriteTokens / 1000000) * pricing.cacheWrite;

          // Find or create model entry
          let modelEntry = breakdown.find((b) => b.model === model);
          if (!modelEntry) {
            modelEntry = { model, cost: 0, inputTokens: 0, outputTokens: 0, requests: 0 };
            breakdown.push(modelEntry);
          }

          modelEntry.cost += cost;
          modelEntry.inputTokens += inputTokens;
          modelEntry.outputTokens += outputTokens;
          modelEntry.requests += 1;

          totalCost += cost;
          totalInputTokens += inputTokens;
          totalOutputTokens += outputTokens;
        }
      }
    }

    // Round costs
    totalCost = Math.round(totalCost * 100) / 100;
    breakdown.forEach((b) => {
      b.cost = Math.round(b.cost * 100) / 100;
    });

    op.success('Anthropic billing fetched', { modelCount: breakdown.length, totalCost });

    return {
      provider: 'anthropic',
      cost: totalCost,
      available: true,
      breakdown,
      tokenCount: totalInputTokens + totalOutputTokens,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    op.failure(errorMsg);

    return {
      provider: 'anthropic',
      cost: 0,
      available: false,
      error: errorMsg,
    };
  }
}

// ============================================
// OpenAI API
// ============================================

async function fetchOpenAIBilling(
  apiKey: string,
  startDate: Date,
  endDate: Date
): Promise<ProviderBilling> {
  const op = logger.startOperation('fetch-openai-billing');

  try {
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const url = `https://api.openai.com/v1/organization/usage/completions?start_time=${startTimestamp}&bucket_width=1d`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as { data?: any[] };

    // Process usage data
    const breakdown: ModelCost[] = [];
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    if (data.data && Array.isArray(data.data)) {
      for (const bucket of data.data) {
        const results = (bucket.results || [bucket]) as Array<Record<string, unknown>>;

        for (const record of results) {
          const model = (record.model as string) || 'unknown';
          const pricing = getOpenAIPricing(model);

          const inputTokens =
            (record.input_tokens as number) || (record.n_context_tokens_total as number) || 0;
          const outputTokens =
            (record.output_tokens as number) || (record.n_generated_tokens_total as number) || 0;
          const requests =
            (record.num_model_requests as number) || (record.num_requests as number) || 1;

          const cost =
            (inputTokens / 1000000) * pricing.input + (outputTokens / 1000000) * pricing.output;

          // Find or create model entry
          let modelEntry = breakdown.find((b) => b.model === model);
          if (!modelEntry) {
            modelEntry = { model, cost: 0, inputTokens: 0, outputTokens: 0, requests: 0 };
            breakdown.push(modelEntry);
          }

          modelEntry.cost += cost;
          modelEntry.inputTokens += inputTokens;
          modelEntry.outputTokens += outputTokens;
          modelEntry.requests += requests;

          totalCost += cost;
          totalInputTokens += inputTokens;
          totalOutputTokens += outputTokens;
        }
      }
    }

    // Also try to fetch costs endpoint
    try {
      const costsUrl = `https://api.openai.com/v1/organization/costs?start_time=${startTimestamp}&bucket_width=1d`;
      const costsResponse = await fetch(costsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (costsResponse.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const costsData = (await costsResponse.json()) as { data?: any[] };
        if (costsData.data && Array.isArray(costsData.data)) {
          // Use actual costs if available
          let actualTotalCost = 0;
          for (const record of costsData.data as Array<Record<string, unknown>>) {
            if (record.results) {
              for (const result of record.results as Array<Record<string, unknown>>) {
                const amount = result.amount as Record<string, unknown> | undefined;
                const cost = (amount?.value as number) || 0;
                actualTotalCost += cost / 100; // Convert cents to dollars
              }
            }
          }
          if (actualTotalCost > 0) {
            totalCost = actualTotalCost;
          }
        }
      }
    } catch (costsError) {
      // Ignore costs endpoint errors, use calculated costs
      logger.debug('Could not fetch OpenAI costs endpoint, using calculated costs');
    }

    // Round costs
    totalCost = Math.round(totalCost * 100) / 100;
    breakdown.forEach((b) => {
      b.cost = Math.round(b.cost * 100) / 100;
    });

    op.success('OpenAI billing fetched', { modelCount: breakdown.length, totalCost });

    return {
      provider: 'openai',
      cost: totalCost,
      available: true,
      breakdown,
      tokenCount: totalInputTokens + totalOutputTokens,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    op.failure(errorMsg);

    return {
      provider: 'openai',
      cost: 0,
      available: false,
      error: errorMsg,
    };
  }
}

// ============================================
// Google Cloud Billing API
// ============================================

async function fetchGoogleBilling(
  config: {
    projectId: string;
    serviceAccountKey: string;
  },
  startDate: Date,
  endDate: Date
): Promise<ProviderBilling> {
  const op = logger.startOperation('fetch-google-billing');

  try {
    const credentials = JSON.parse(config.serviceAccountKey) as Record<string, unknown>;
    const auth = new GoogleAuth({
      credentials,
      scopes: [GOOGLE_BILLING_SCOPE],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken =
      typeof tokenResponse === 'string' ? tokenResponse : (tokenResponse?.token ?? null);
    if (!accessToken) {
      throw new Error('Failed to obtain Google access token');
    }

    const billingInfoResponse = await fetch(
      `https://cloudbilling.googleapis.com/v1/projects/${config.projectId}/billingInfo`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!billingInfoResponse.ok) {
      const errorText = await billingInfoResponse.text();
      throw new Error(`Billing info API returned ${billingInfoResponse.status}: ${errorText}`);
    }

    const billingInfo = (await billingInfoResponse.json()) as {
      billingAccountName?: string;
      billingEnabled?: boolean;
    };

    if (!billingInfo.billingEnabled || !billingInfo.billingAccountName) {
      return {
        provider: 'google',
        cost: 0,
        available: false,
        error: 'Google Cloud billing is not enabled for this project',
      };
    }

    const reportPayload = {
      granularity: 'DAILY',
      aggregation: {
        metric: 'COST',
        aggregationLevel: 'ACCOUNT',
      },
      timePeriod: {
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      },
      filter: {
        projects: [`projects/${config.projectId}`],
      },
    };

    const reportResponse = await fetch(
      `https://cloudbilling.googleapis.com/v1/${billingInfo.billingAccountName}/reports:query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportPayload),
      }
    );

    if (!reportResponse.ok) {
      const errorText = await reportResponse.text();
      throw new Error(`Billing reports API returned ${reportResponse.status}: ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reportData = (await reportResponse.json()) as Record<string, any>;
    const rows = Array.isArray(reportData?.rows) ? reportData.rows : [];

    let totalCost = 0;
    const breakdown: ServiceCost[] = [];

    for (const row of rows) {
      const rawCost =
        row?.cost?.amount?.value ??
        row?.cost?.amount ??
        row?.cost ??
        row?.amount?.value ??
        row?.amount ??
        0;
      const costValue = typeof rawCost === 'number' ? rawCost : Number(rawCost);
      if (Number.isFinite(costValue)) {
        totalCost += costValue;
      }
    }

    if (totalCost === 0 && rows.length === 0 && reportData?.totalCost) {
      const rawTotal = reportData.totalCost?.amount?.value ?? reportData.totalCost?.amount;
      const totalValue = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal);
      if (Number.isFinite(totalValue)) {
        totalCost = totalValue;
      }
    }

    totalCost = Math.round(totalCost * 100) / 100;

    if (totalCost > 0) {
      breakdown.push({ service: 'Google Cloud (Project total)', cost: totalCost });
    }

    op.success('Google billing fetched', { totalCost });

    return {
      provider: 'google',
      cost: totalCost,
      available: true,
      breakdown,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    op.failure(errorMsg);

    return {
      provider: 'google',
      cost: 0,
      available: false,
      error: errorMsg,
    };
  }
}

// ============================================
// Cloudflare R2 API
// ============================================

async function fetchCloudflareBilling(
  apiToken: string,
  accountId: string,
  startDate: Date,
  endDate: Date,
  bucketNames?: string[]
): Promise<ProviderBilling> {
  const op = logger.startOperation('fetch-cloudflare-billing');

  try {
    // Build bucket filter if specified
    const bucketFilter =
      bucketNames && bucketNames.length > 0
        ? `, bucketName_in: [${bucketNames.map((b) => `"${b}"`).join(', ')}]`
        : '';

    if (bucketNames && bucketNames.length > 0) {
      logger.debug('Filtering R2 billing by buckets', { bucketNames });
    }

    // GraphQL query for R2 analytics
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
                responseObjectSize
              }
              dimensions {
                actionType
                bucketName
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
                objectCount
              }
              dimensions {
                bucketName
              }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as { data?: { viewer?: { accounts?: any[] } } };

    // Calculate costs
    let classAOperations = 0;
    let classBOperations = 0;
    let storageBytes = 0;

    if (data.data?.viewer?.accounts?.[0]) {
      const account = data.data.viewer.accounts[0] as Record<string, unknown>;

      // Operations
      const opsGroups = account.r2OperationsAdaptiveGroups as
        | Array<Record<string, unknown>>
        | undefined;
      if (opsGroups) {
        for (const group of opsGroups) {
          const dimensions = group.dimensions as Record<string, unknown> | undefined;
          const actionType = ((dimensions?.actionType as string) || '').toLowerCase();
          const sum = group.sum as Record<string, unknown> | undefined;
          const requests = (sum?.requests as number) || 0;

          if (['put', 'post', 'list', 'delete'].includes(actionType)) {
            classAOperations += requests;
          } else if (['get', 'head'].includes(actionType)) {
            classBOperations += requests;
          }
        }
      }

      // Storage
      const storageGroups = account.r2StorageAdaptiveGroups as
        | Array<Record<string, unknown>>
        | undefined;
      if (storageGroups) {
        for (const group of storageGroups) {
          const max = group.max as Record<string, unknown> | undefined;
          storageBytes = Math.max(storageBytes, (max?.payloadSize as number) || 0);
        }
      }
    }

    const storageGB = storageBytes / (1024 * 1024 * 1024);
    const storageCost = storageGB * CLOUDFLARE_R2_PRICING.storagePerGBMonth;
    const classACost =
      (classAOperations / 1000000) * CLOUDFLARE_R2_PRICING.classAOperationsPerMillion;
    const classBCost =
      (classBOperations / 1000000) * CLOUDFLARE_R2_PRICING.classBOperationsPerMillion;

    const totalCost = Math.round((storageCost + classACost + classBCost) * 100) / 100;

    op.success('Cloudflare billing fetched', { storageGB, totalCost });

    return {
      provider: 'cloudflare',
      cost: totalCost,
      available: true,
      storageGB: Math.round(storageGB * 100) / 100,
      operations: classAOperations + classBOperations,
      breakdown: [
        { service: 'Storage', cost: Math.round(storageCost * 100) / 100 },
        { service: 'Class A Operations', cost: Math.round(classACost * 100) / 100 },
        { service: 'Class B Operations', cost: Math.round(classBCost * 100) / 100 },
      ] as ServiceCost[],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    op.failure(errorMsg);

    return {
      provider: 'cloudflare',
      cost: 0,
      available: false,
      error: errorMsg,
    };
  }
}

// ============================================
// Oracle Cloud API
// ============================================

async function fetchOracleBilling(
  config: {
    tenancyOcid: string;
    userOcid: string;
    fingerprint: string;
    privateKeyPath: string;
    region: string;
    compartmentOcid?: string;
  },
  startDate: Date,
  endDate: Date
): Promise<ProviderBilling> {
  const op = logger.startOperation('fetch-oracle-billing');

  try {
    // Read the private key file
    const privateKey = fs.readFileSync(config.privateKeyPath, 'utf-8');

    // Create authentication provider
    const authProvider = new oci.common.SimpleAuthenticationDetailsProvider(
      config.tenancyOcid,
      config.userOcid,
      config.fingerprint,
      privateKey,
      null, // passphrase
      oci.common.Region.fromRegionId(config.region)
    );

    // Create UsageAPI client
    const usageClient = new oci.usageapi.UsageapiClient({
      authenticationDetailsProvider: authProvider,
    });

    // Set the region
    usageClient.regionId = config.region;

    // Normalize dates to UTC midnight (required by OCI Usage API)
    const normalizedStartDate = new Date(startDate);
    normalizedStartDate.setUTCHours(0, 0, 0, 0);

    const normalizedEndDate = new Date(endDate);
    normalizedEndDate.setUTCHours(0, 0, 0, 0);

    // Prepare the request
    const requestDetails: oci.usageapi.models.RequestSummarizedUsagesDetails = {
      tenantId: config.tenancyOcid,
      timeUsageStarted: normalizedStartDate,
      timeUsageEnded: normalizedEndDate,
      granularity: oci.usageapi.models.RequestSummarizedUsagesDetails.Granularity.Daily,
      queryType: oci.usageapi.models.RequestSummarizedUsagesDetails.QueryType.Cost,
      isAggregateByTime: true,
      groupBy: ['service'],
    };

    // Add compartment filter if specified
    if (config.compartmentOcid) {
      requestDetails.filter = {
        operator: oci.usageapi.models.Filter.Operator.And,
        dimensions: [
          {
            key: 'compartmentId',
            value: config.compartmentOcid,
          },
        ],
      };
    }

    const request: oci.usageapi.requests.RequestSummarizedUsagesRequest = {
      requestSummarizedUsagesDetails: requestDetails,
    };

    // Fetch usage data
    const response = await usageClient.requestSummarizedUsages(request);

    // Process the response
    const items = response.usageAggregation?.items || [];
    let totalCost = 0;
    const breakdown: ServiceCost[] = [];

    for (const item of items) {
      const serviceName = (item.service as string) || 'Unknown Service';
      const cost = (item.computedAmount as number) || 0;

      totalCost += cost;
      breakdown.push({
        service: serviceName,
        cost: Math.round(cost * 100) / 100,
      });
    }

    // Round total cost
    totalCost = Math.round(totalCost * 100) / 100;

    op.success('Oracle billing fetched', { serviceCount: breakdown.length, totalCost });

    return {
      provider: 'oracle',
      cost: totalCost,
      available: true,
      breakdown,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    op.failure(errorMsg);

    return {
      provider: 'oracle',
      cost: 0,
      available: false,
      error: errorMsg,
    };
  }
}

// ============================================
// Main Billing Service
// ============================================

export class BillingService {
  private config: BillingConfig;
  private secretsService: SecretsService;
  private inMemorySecrets?: Record<string, string>;
  private configLoadPromise: Promise<void> | null = null;
  private lastConfigLoad = 0;

  constructor(options?: { secretsService?: SecretsService; secrets?: Record<string, string> }) {
    this.secretsService = options?.secretsService ?? createSecretsService();
    this.inMemorySecrets = options?.secrets;
    this.config = {
      projectScope: {},
    };
  }

  private async loadConfig(): Promise<void> {
    if (this.configLoadPromise) {
      return this.configLoadPromise;
    }

    const now = Date.now();
    if (now - this.lastConfigLoad < 30000) {
      return;
    }

    this.configLoadPromise = (async () => {
      const secrets = this.inMemorySecrets ?? (await this.secretsService.getAllSecrets());
      const getSecret = (key: string) => secrets[key];

      this.config = {
        anthropicAdminKey: getSecret('ANTHROPIC_ADMIN_KEY'),
        openaiApiKey: getSecret('OPENAI_BILLING_KEY') || getSecret('OPENAI_API_KEY'),
        googleBillingProjectId: getSecret('GOOGLE_BILLING_PROJECT_ID'),
        googleServiceAccountKey: getSecret('GOOGLE_SERVICE_ACCOUNT_KEY'),
        cloudflareApiToken: getSecret('CLOUDFLARE_API_TOKEN'),
        cloudflareAccountId: getSecret('CLOUDFLARE_ACCOUNT_ID') || getSecret('R2_ACCOUNT_ID'),
        ociTenancyOcid: getSecret('OCI_TENANCY_OCID'),
        ociUserOcid: getSecret('OCI_USER_OCID'),
        ociFingerprint: getSecret('OCI_FINGERPRINT'),
        ociPrivateKeyPath: getSecret('OCI_PRIVATE_KEY_PATH'),
        ociRegion: getSecret('OCI_REGION'),
        projectScope: {
          projectName: getSecret('BILLING_PROJECT_NAME') || 'Local Workspace',
          anthropicApiKeyIds: getSecret('BILLING_ANTHROPIC_KEY_IDS')
            ?.split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          openaiApiKey: getSecret('OPENAI_API_KEY'),
          r2Buckets: getSecret('BILLING_R2_BUCKETS')
            ?.split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          ociCompartmentOcid: getSecret('BILLING_OCI_COMPARTMENT_OCID'),
          googleBillingProjectId: getSecret('GOOGLE_BILLING_PROJECT_ID'),
        },
      };

      this.lastConfigLoad = Date.now();

      logger.info('BillingService configuration loaded', {
        projectName: this.config.projectScope?.projectName,
        hasAnthropicKey: !!this.config.anthropicAdminKey,
        hasOpenAIKey: !!this.config.openaiApiKey,
        hasGoogleBilling: !!this.config.googleBillingProjectId,
        hasCloudflareToken: !!this.config.cloudflareApiToken,
        hasOCI: !!this.config.ociTenancyOcid,
        scopedAnthropicKeys: this.config.projectScope?.anthropicApiKeyIds?.length || 0,
        scopedR2Buckets: this.config.projectScope?.r2Buckets?.length || 0,
      });
    })();

    try {
      await this.configLoadPromise;
    } finally {
      this.configLoadPromise = null;
    }
  }

  private async ensureConfig(): Promise<BillingConfig> {
    await this.loadConfig();
    return this.config;
  }

  /**
   * Get billing summary for all providers
   */
  async getSummary(startDate?: Date, endDate?: Date, useCache = true): Promise<BillingSummary> {
    await this.ensureConfig();
    const start = startDate || getDefaultStartDate(30);
    const end = endDate || new Date();

    // Check cache
    if (useCache && billingCache && billingCache.expiresAt > Date.now()) {
      logger.debug('Returning cached billing data');
      return normalizeSummary(billingCache.data);
    }

    logger.info('Fetching billing data from all providers', {
      startDate: formatDate(start),
      endDate: formatDate(end),
    });

    // Fetch from all providers in parallel
    const [google, anthropic, openai, cloudflare, oracle] = await Promise.all([
      this.getGoogleBilling(start, end),
      this.getAnthropicBilling(start, end),
      this.getOpenAIBilling(start, end),
      this.getCloudflareBilling(start, end),
      this.getOracleBilling(start, end),
    ]);

    const totalCost = google.cost + anthropic.cost + openai.cost + cloudflare.cost + oracle.cost;

    const summary: BillingSummary = {
      dateRange: { start: formatDate(start), end: formatDate(end) },
      totalCost: Math.round(totalCost * 100) / 100,
      providers: {
        google,
        anthropic,
        openai,
        cloudflare,
        oracle,
      },
      dailyCosts: [], // TODO: Aggregate daily costs from each provider
      fetchedAt: new Date().toISOString(),
    };

    // Cache result
    billingCache = {
      data: normalizeSummary(summary),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return billingCache.data;
  }

  /**
   * Get Anthropic billing
   * Optionally filtered by API key IDs if BILLING_ANTHROPIC_KEY_IDS is configured
   */
  async getAnthropicBilling(startDate?: Date, endDate?: Date): Promise<ProviderBilling> {
    const config = await this.ensureConfig();
    const start = startDate || getDefaultStartDate(30);
    const end = endDate || new Date();

    if (!config.anthropicAdminKey) {
      return {
        provider: 'anthropic',
        cost: 0,
        available: false,
        error: 'ANTHROPIC_ADMIN_KEY not configured',
      };
    }

    if (!config.anthropicAdminKey.startsWith('sk-ant-admin')) {
      return {
        provider: 'anthropic',
        cost: 0,
        available: false,
        error: 'Invalid Anthropic Admin key. Must start with sk-ant-admin',
      };
    }

    // Pass API key IDs for filtering if configured
    const apiKeyIds = config.projectScope?.anthropicApiKeyIds;
    return fetchAnthropicBilling(config.anthropicAdminKey, start, end, apiKeyIds);
  }

  /**
   * Get OpenAI billing
   */
  async getOpenAIBilling(startDate?: Date, endDate?: Date): Promise<ProviderBilling> {
    const config = await this.ensureConfig();
    const start = startDate || getDefaultStartDate(30);
    const end = endDate || new Date();

    if (!config.openaiApiKey) {
      return {
        provider: 'openai',
        cost: 0,
        available: false,
        error: 'OPENAI_API_KEY not configured',
      };
    }

    return fetchOpenAIBilling(config.openaiApiKey, start, end);
  }

  /**
   * Get Google (Gemini/Vertex AI) billing
   */
  async getGoogleBilling(startDate?: Date, endDate?: Date): Promise<ProviderBilling> {
    const config = await this.ensureConfig();
    const start = startDate || getDefaultStartDate(30);
    const end = endDate || new Date();

    if (!config.googleBillingProjectId || !config.googleServiceAccountKey) {
      return {
        provider: 'google',
        cost: 0,
        available: false,
        error: 'GOOGLE_BILLING_PROJECT_ID or GOOGLE_SERVICE_ACCOUNT_KEY not configured',
      };
    }

    return fetchGoogleBilling(
      {
        projectId: config.googleBillingProjectId,
        serviceAccountKey: config.googleServiceAccountKey,
      },
      start,
      end
    );
  }

  /**
   * Get Cloudflare R2 billing
   * Optionally filtered by bucket names if BILLING_R2_BUCKETS is configured
   */
  async getCloudflareBilling(startDate?: Date, endDate?: Date): Promise<ProviderBilling> {
    const config = await this.ensureConfig();
    const start = startDate || getDefaultStartDate(30);
    const end = endDate || new Date();

    if (!config.cloudflareApiToken) {
      return {
        provider: 'cloudflare',
        cost: 0,
        available: false,
        error: 'CLOUDFLARE_API_TOKEN not configured',
      };
    }

    if (!config.cloudflareAccountId) {
      return {
        provider: 'cloudflare',
        cost: 0,
        available: false,
        error: 'CLOUDFLARE_ACCOUNT_ID not configured',
      };
    }

    // Pass bucket names for filtering if configured
    const bucketNames = config.projectScope?.r2Buckets;
    return fetchCloudflareBilling(
      config.cloudflareApiToken,
      config.cloudflareAccountId,
      start,
      end,
      bucketNames
    );
  }

  /**
   * Get Oracle Cloud billing
   */
  async getOracleBilling(startDate?: Date, endDate?: Date): Promise<ProviderBilling> {
    const config = await this.ensureConfig();
    const start = startDate || getDefaultStartDate(30);
    const end = endDate || new Date();

    if (
      !config.ociTenancyOcid ||
      !config.ociUserOcid ||
      !config.ociFingerprint ||
      !config.ociPrivateKeyPath ||
      !config.ociRegion
    ) {
      return {
        provider: 'oracle',
        cost: 0,
        available: false,
        error: 'OCI credentials not fully configured',
      };
    }

    return fetchOracleBilling(
      {
        tenancyOcid: config.ociTenancyOcid,
        userOcid: config.ociUserOcid,
        fingerprint: config.ociFingerprint,
        privateKeyPath: config.ociPrivateKeyPath,
        region: config.ociRegion,
        compartmentOcid: config.projectScope?.ociCompartmentOcid,
      },
      start,
      end
    );
  }

  /**
   * Clear the billing cache
   */
  clearCache(): void {
    billingCache = null;
    logger.info('Billing cache cleared');
  }

  /**
   * Get configuration status (which providers are configured)
   */
  async getConfigStatus(): Promise<Record<string, boolean>> {
    const config = await this.ensureConfig();
    return {
      google: !!config.googleBillingProjectId && !!config.googleServiceAccountKey,
      anthropic: !!config.anthropicAdminKey?.startsWith('sk-ant-admin'),
      openai: !!config.openaiApiKey,
      cloudflare: !!config.cloudflareApiToken && !!config.cloudflareAccountId,
      oracle: !!config.ociTenancyOcid && !!config.ociUserOcid,
    };
  }

  /**
   * Get project scope configuration
   * Returns what filters are applied to limit billing to specific keys/resources
   */
  async getProjectScope(): Promise<{
    projectName: string;
    filters: {
      anthropicKeyIds?: string[];
      openaiKeyConfigured: boolean;
      r2Buckets?: string[];
      ociCompartment?: string;
      googleBillingProjectId?: string;
    };
  }> {
    const config = await this.ensureConfig();
    return {
      projectName: config.projectScope?.projectName || 'All Resources',
      filters: {
        anthropicKeyIds: config.projectScope?.anthropicApiKeyIds,
        openaiKeyConfigured: !!config.projectScope?.openaiApiKey,
        r2Buckets: config.projectScope?.r2Buckets,
        ociCompartment: config.projectScope?.ociCompartmentOcid,
        googleBillingProjectId: config.projectScope?.googleBillingProjectId,
      },
    };
  }
}

// Singleton instance
let billingService: BillingService | null = null;

export function getBillingService(): BillingService {
  if (!billingService) {
    billingService = new BillingService();
  }
  return billingService;
}

export function createBillingService(): BillingService {
  return new BillingService();
}
