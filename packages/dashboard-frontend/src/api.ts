/**
 * Workspace API Client
 *
 * Handles all API calls to the workspace backend with authentication.
 */

// API base - use relative path that works whether dashboard is at root or /dashboard/
// When accessed via nginx at /dashboard/, requests go to /dashboard/api/
// When accessed directly at localhost:4098, requests go to /api/
const API_BASE = import.meta.env.DEV ? '/api' : `${import.meta.env.BASE_URL}api`.replace('//', '/');

// Asset base URL for static files like mascots
// Returns the correct base path whether we're at root or /dashboard/
export const ASSET_BASE = import.meta.env.DEV ? '' : import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Get the full URL for a static asset (e.g., mascot images)
 * Usage: assetUrl('/mascot/base.png') -> '/dashboard/mascot/base.png' in production
 */
export function assetUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${ASSET_BASE}${normalizedPath}`;
}
// Token storage
let authToken: string | null = null;

// Cookie domain for cross-subdomain sharing
// In production, cookies are shared across subdomains on the parent domain
// In development (localhost), cookies are per-origin
function getCookieDomain(): string {
  const hostname = window.location.hostname;
  // For localhost/dev or IPs, don't set domain (use origin)
  if (hostname === 'localhost' || hostname === '127.0.0.1') return '';
  if (/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(hostname)) return '';
  if (hostname.endsWith('.localhost')) return '';

  const parts = hostname.split('.');
  if (parts.length < 2) return '';

  return `.${parts.slice(-2).join('.')}`;
}

/**
 * Set a cookie with proper settings for cross-subdomain auth
 */
function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  const domain = getCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : '';
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}; expires=${expires}; path=/${domainPart}${secure}; SameSite=Lax`;
}

/**
 * Get a cookie value by name
 */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

/**
 * Delete a cookie
 */
function deleteCookie(name: string): void {
  const domain = getCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : '';
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domainPart}`;
}

/**
 * Set the auth token for subsequent requests
 * Stores in both localStorage (for fast access) and cookie (for nginx auth)
 */
export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem('dashboard_token', token);
    // Set cookie for cross-subdomain auth (valid for 1 day, matching JWT expiry)
    setCookie('auth_token', token, 1);
  } else {
    localStorage.removeItem('dashboard_token');
    deleteCookie('auth_token');
  }
}

/**
 * Get stored auth token
 * Checks localStorage first, then cookie
 */
export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('dashboard_token');
  }
  // Also check cookie if localStorage is empty
  if (!authToken) {
    authToken = getCookie('auth_token');
    // Sync to localStorage if found in cookie
    if (authToken) {
      localStorage.setItem('dashboard_token', authToken);
    }
  }
  return authToken;
}

/**
 * Clear auth token from all storage
 */
export function clearAuthToken(): void {
  authToken = null;
  localStorage.removeItem('dashboard_token');
  deleteCookie('auth_token');
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Token expired or invalid; avoid reload loops when unauthenticated.
    const hadToken = Boolean(token);
    clearAuthToken();
    if (hadToken) {
      window.location.reload();
    }
    throw new Error('Authentication expired');
  }

  // Read response body as text first (can only be consumed once)
  let responseText: string;
  try {
    responseText = await response.text();
  } catch {
    throw new Error(`Request failed: ${response.status} - could not read response`);
  }

  if (!response.ok) {
    // Try to parse JSON error from the text we already read
    let errorMessage: string;
    if (!responseText) {
      errorMessage = `Request failed: ${response.status} ${response.statusText || 'Unknown error'}`;
    } else if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
      // HTML error page from nginx or similar
      errorMessage = `Server error (${response.status}): ${response.statusText || 'Service unavailable'}`;
    } else {
      // Try to parse as JSON error
      try {
        const errorData = JSON.parse(responseText) as { error?: string; message?: string };
        errorMessage = errorData.error || errorData.message || `Request failed: ${response.status}`;
      } catch {
        // Not valid JSON - use the text directly (truncated)
        errorMessage = responseText.slice(0, 200) || `Request failed: ${response.status}`;
      }
    }
    throw new Error(errorMessage);
  }

  // Handle successful response
  if (!responseText) {
    return {} as T;
  }
  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error('Unexpected response from server (invalid JSON).');
  }
}

// ============================================
// AUTH API
// ============================================

export interface LoginResponse {
  token: string;
  username: string;
}

export interface SetupResponse {
  success: boolean;
  userId: number;
  token: string;
  message: string;
}

export interface SetupField {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  type?: 'text' | 'password';
  required: boolean;
}

export interface SetupStatus {
  needsSetup: boolean;
  missingRequired: string[];
  missingOptional: string[];
  requiredFields: SetupField[];
  optionalFields: SetupField[];
  setupOnly: boolean;
}

export interface SetupApplyResult extends SetupStatus {
  success: boolean;
  needsRestart: boolean;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return apiRequest('/setup/status');
}

export async function applySetup(values: Record<string, string>): Promise<SetupApplyResult> {
  return apiRequest('/setup/apply', {
    method: 'POST',
    body: JSON.stringify({ values }),
  });
}

/**
 * Save WhatsApp admin phone number after pairing
 */
export async function saveWhatsAppAdminPhone(phoneNumber: string): Promise<SetupApplyResult> {
  return applySetup({ WHATSAPP_ADMIN_PHONE: phoneNumber });
}

/**
 * Country codes for WhatsApp phone number input
 */
export const COUNTRY_CODES = [
  { code: '1', name: 'US/Canada', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: '44', name: 'UK', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: '49', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: '33', name: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: '39', name: 'Italy', flag: '\u{1F1EE}\u{1F1F9}' },
  { code: '34', name: 'Spain', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: '972', name: 'Israel', flag: '\u{1F1EE}\u{1F1F1}' },
  { code: '91', name: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: '86', name: 'China', flag: '\u{1F1E8}\u{1F1F3}' },
  { code: '81', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: '82', name: 'South Korea', flag: '\u{1F1F0}\u{1F1F7}' },
  { code: '55', name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: '52', name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}' },
  { code: '61', name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
  { code: '64', name: 'New Zealand', flag: '\u{1F1F3}\u{1F1FF}' },
  { code: '27', name: 'South Africa', flag: '\u{1F1FF}\u{1F1E6}' },
  { code: '971', name: 'UAE', flag: '\u{1F1E6}\u{1F1EA}' },
  { code: '966', name: 'Saudi Arabia', flag: '\u{1F1F8}\u{1F1E6}' },
  { code: '7', name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
  { code: '48', name: 'Poland', flag: '\u{1F1F5}\u{1F1F1}' },
  { code: '31', name: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}' },
  { code: '46', name: 'Sweden', flag: '\u{1F1F8}\u{1F1EA}' },
  { code: '47', name: 'Norway', flag: '\u{1F1F3}\u{1F1F4}' },
  { code: '45', name: 'Denmark', flag: '\u{1F1E9}\u{1F1F0}' },
  { code: '358', name: 'Finland', flag: '\u{1F1EB}\u{1F1EE}' },
  { code: '41', name: 'Switzerland', flag: '\u{1F1E8}\u{1F1ED}' },
  { code: '43', name: 'Austria', flag: '\u{1F1E6}\u{1F1F9}' },
  { code: '32', name: 'Belgium', flag: '\u{1F1E7}\u{1F1EA}' },
  { code: '351', name: 'Portugal', flag: '\u{1F1F5}\u{1F1F9}' },
  { code: '30', name: 'Greece', flag: '\u{1F1EC}\u{1F1F7}' },
  { code: '90', name: 'Turkey', flag: '\u{1F1F9}\u{1F1F7}' },
  { code: '62', name: 'Indonesia', flag: '\u{1F1EE}\u{1F1E9}' },
  { code: '60', name: 'Malaysia', flag: '\u{1F1F2}\u{1F1FE}' },
  { code: '65', name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}' },
  { code: '66', name: 'Thailand', flag: '\u{1F1F9}\u{1F1ED}' },
  { code: '63', name: 'Philippines', flag: '\u{1F1F5}\u{1F1ED}' },
  { code: '84', name: 'Vietnam', flag: '\u{1F1FB}\u{1F1F3}' },
  { code: '20', name: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}' },
  { code: '234', name: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}' },
  { code: '254', name: 'Kenya', flag: '\u{1F1F0}\u{1F1EA}' },
] as const;

export async function checkSetupRequired(): Promise<{ setupRequired: boolean }> {
  return apiRequest('/auth/setup-required');
}

export async function setup(username: string, password: string): Promise<SetupResponse> {
  const response = await apiRequest<SetupResponse>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (response.token) {
    setAuthToken(response.token);
  }
  return response;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setAuthToken(response.token);
  return response;
}

export function logout(): void {
  clearAuthToken();
}

export async function getCurrentUser(): Promise<{ user: { userId: number; username: string } }> {
  return apiRequest('/auth/me');
}

/**
 * Initiate Google OAuth flow
 * Returns the authorization URL to redirect the user to
 */
export async function initiateGoogleAuth(): Promise<{ authUrl: string; state: string }> {
  return apiRequest('/auth/google/start', {
    method: 'POST',
  });
}

/**
 * Sign in with Google OAuth
 * Opens Google OAuth popup and returns auth token on success
 */
export async function signInWithGoogle(): Promise<LoginResponse> {
  // Initiate OAuth flow
  const { authUrl } = await initiateGoogleAuth();

  // Open popup window for Google OAuth
  const width = 600;
  const height = 700;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  const popup = window.open(
    authUrl,
    'Google Sign In',
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
  );

  if (!popup) {
    throw new Error('Failed to open Google sign-in popup. Please allow popups for this site.');
  }

  // Wait for OAuth callback and token
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        cleanup();
        reject(new Error('Google sign-in timed out'));
      },
      5 * 60 * 1000
    ); // 5 minute timeout

    const checkPopupClosed = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Google sign-in popup was closed'));
      }
    }, 500);

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(checkPopupClosed);
      window.removeEventListener('message', handleMessage);
      if (!popup.closed) popup.close();
    };

    const handleMessage = (event: MessageEvent) => {
      // Verify origin
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        cleanup();
        const token = event.data.token;
        const username = event.data.username;
        setAuthToken(token);
        resolve({ token, username });
      } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
        cleanup();
        reject(new Error(event.data.error || 'Google sign-in failed'));
      }
    };

    window.addEventListener('message', handleMessage);

    // Also check for redirect-based flow (if popup is blocked)
    const checkInterval = setInterval(() => {
      try {
        const url = new URL(popup.location.href);
        if (url.searchParams.get('google_auth') === 'success') {
          cleanup();
          clearInterval(checkInterval);
          // Token was set via cookie, retrieve it
          const token = getAuthToken();
          if (token) {
            getCurrentUser()
              .then((userInfo) => {
                resolve({ token, username: userInfo.user.username });
              })
              .catch(reject);
          } else {
            reject(new Error('Failed to retrieve auth token after Google sign-in'));
          }
        }
      } catch {
        // Ignore cross-origin errors while popup is on Google domain
      }
    }, 500);
  });
}

// ============================================
// STATS API
// ============================================

export interface DashboardStats {
  totalChats: number;
  byPermission: {
    ignored: number;
    read_only: number;
    read_write: number;
  };
  byType: {
    individual: number;
    group: number;
  };
  totalMessages: number;
  chatsWithoutPermissions: number;
}

export async function getStats(): Promise<DashboardStats> {
  return apiRequest('/stats');
}

// ============================================
// CHATS API
// ============================================

export type ChatPermission = 'ignored' | 'read_only' | 'read_write';
export type ChatType = 'individual' | 'group';

export interface ChatWithPermission {
  chatId: string;
  chatType: ChatType;
  permission: ChatPermission | null;
  displayName?: string;
  notes?: string;
  messageCount?: number;
  lastMessageAt?: string;
  createdAt?: string;
  updatedAt?: string;
  // Smart default fields
  effectivePermission?: ChatPermission;
  isSmartDefaultWritable?: boolean;
}

export async function getChats(): Promise<{ chats: ChatWithPermission[] }> {
  return apiRequest('/chats');
}

export async function discoverChats(): Promise<{
  chats: ChatWithPermission[];
  defaultPermission: ChatPermission;
}> {
  return apiRequest('/chats/discover');
}

export interface UnifiedChat extends ChatWithPermission {
  isConfigured: boolean;
}

export async function getAllChatsUnified(): Promise<{ chats: UnifiedChat[] }> {
  return apiRequest('/chats/all');
}

export async function getChat(chatId: string): Promise<ChatWithPermission> {
  return apiRequest(`/chats/${encodeURIComponent(chatId)}`);
}

export async function updateChatPermission(
  chatId: string,
  permission: ChatPermission,
  displayName?: string,
  notes?: string
): Promise<ChatWithPermission> {
  return apiRequest(`/chats/${encodeURIComponent(chatId)}/permission`, {
    method: 'PATCH',
    body: JSON.stringify({ permission, displayName, notes }),
  });
}

export async function updateChatDetails(
  chatId: string,
  displayName?: string,
  notes?: string
): Promise<ChatWithPermission> {
  return apiRequest(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName, notes }),
  });
}

export async function deletePermission(chatId: string): Promise<{ success: boolean }> {
  return apiRequest(`/chats/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });
}

// ============================================
// AUDIT LOG API
// ============================================

export interface AuditEntry {
  id: number;
  chatId: string;
  oldPermission: ChatPermission | null;
  newPermission: ChatPermission | 'deleted';
  changedBy?: string;
  changedAt: string;
}

export async function getAuditLog(
  limit = 100,
  chatId?: string
): Promise<{ entries: AuditEntry[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (chatId) params.set('chatId', chatId);
  return apiRequest(`/audit-log?${params}`);
}

// ============================================
// GROUPS API
// ============================================

export interface StoredGroup {
  group_id: string;
  group_name: string | null;
  group_subject: string | null;
  participant_count: number | null;
  last_updated: string;
}

export async function getGroups(): Promise<{ groups: StoredGroup[] }> {
  return apiRequest('/groups');
}

export async function getGroup(groupId: string): Promise<StoredGroup | null> {
  try {
    const result = await apiRequest<{ success: boolean; data: StoredGroup }>(
      `/groups/${encodeURIComponent(groupId)}`
    );
    return result.data;
  } catch {
    return null; // Group not found or error
  }
}

export async function searchGroups(query: string): Promise<{ groups: StoredGroup[] }> {
  return apiRequest(`/groups/search?q=${encodeURIComponent(query)}`);
}

// ============================================
// BILLING API
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

export interface BillingConfigStatus {
  providers: {
    google: boolean;
    anthropic: boolean;
    openai: boolean;
    cloudflare: boolean;
    oracle: boolean;
  };
  projectScope?: {
    projectName: string;
    filters: {
      anthropicKeyIds?: string[];
      openaiKeyConfigured: boolean;
      r2Buckets?: string[];
      ociCompartment?: string;
      googleBillingProjectId?: string;
    };
  };
}

export interface BillingOptions {
  start?: string;
  end?: string;
  noCache?: boolean;
}

export async function getBillingSummary(options: BillingOptions = {}): Promise<BillingSummary> {
  const params = new URLSearchParams();
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  if (options.noCache) params.set('noCache', 'true');

  const queryString = params.toString();
  return apiRequest(`/billing/summary${queryString ? `?${queryString}` : ''}`);
}

export async function getBillingConfig(): Promise<BillingConfigStatus> {
  return apiRequest('/billing/config');
}

export async function getAnthropicBilling(options: BillingOptions = {}): Promise<ProviderBilling> {
  const params = new URLSearchParams();
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);

  const queryString = params.toString();
  return apiRequest(`/billing/anthropic${queryString ? `?${queryString}` : ''}`);
}

export async function getOpenAIBilling(options: BillingOptions = {}): Promise<ProviderBilling> {
  const params = new URLSearchParams();
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);

  const queryString = params.toString();
  return apiRequest(`/billing/openai${queryString ? `?${queryString}` : ''}`);
}

export async function getGoogleBilling(options: BillingOptions = {}): Promise<ProviderBilling> {
  const params = new URLSearchParams();
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);

  const queryString = params.toString();
  return apiRequest(`/billing/google${queryString ? `?${queryString}` : ''}`);
}

export async function getCloudflareBilling(options: BillingOptions = {}): Promise<ProviderBilling> {
  const params = new URLSearchParams();
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);

  const queryString = params.toString();
  return apiRequest(`/billing/cloudflare${queryString ? `?${queryString}` : ''}`);
}

export async function getOracleBilling(options: BillingOptions = {}): Promise<ProviderBilling> {
  const params = new URLSearchParams();
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);

  const queryString = params.toString();
  return apiRequest(`/billing/oracle${queryString ? `?${queryString}` : ''}`);
}

export async function clearBillingCache(): Promise<{ success: boolean; message: string }> {
  return apiRequest('/billing/clear-cache', { method: 'POST' });
}

// ============================================
// SLACK API
// ============================================

export type SlackChannelPermission = 'ignored' | 'read_only' | 'read_write';
export type SlackChannelType = 'channel' | 'dm' | 'group_dm' | 'private';

export interface SlackChannelWithPermission {
  channelId: string;
  channelName: string | null;
  channelType: SlackChannelType;
  isMember: boolean;
  lastUpdated: string;
  permission: SlackChannelPermission;
  respondToMentions: boolean;
  respondToDMs: boolean;
  notes?: string;
  messageCount?: number;
  lastMessageAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SlackDashboardStats {
  totalChannels: number;
  byPermission: {
    ignored: number;
    read_only: number;
    read_write: number;
  };
  byType: {
    channel: number;
    dm: number;
    group_dm: number;
    private: number;
  };
  totalMessages: number;
  channelsWithoutPermissions: number;
}

export interface SlackMessageStats {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  uniqueChannels: number;
  uniqueUsers: number;
  firstMessage: string | null;
  lastMessage: string | null;
}

export interface StoredSlackMessage {
  id: number;
  message_id: string;
  channel_id: string;
  thread_ts: string | null;
  user_id: string;
  user_name: string | null;
  text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: string;
  created_at: string;
  has_files: boolean;
  file_types: string[] | null;
}

export async function getSlackStats(): Promise<SlackDashboardStats> {
  return apiRequest('/slack/stats');
}

export async function getSlackChannels(): Promise<{ channels: SlackChannelWithPermission[] }> {
  return apiRequest('/slack/channels');
}

export async function getSlackChannel(channelId: string): Promise<SlackChannelWithPermission> {
  return apiRequest(`/slack/channels/${encodeURIComponent(channelId)}`);
}

export async function updateSlackChannelPermission(
  channelId: string,
  permission: SlackChannelPermission,
  options?: {
    respondToMentions?: boolean;
    respondToDMs?: boolean;
    notes?: string;
  }
): Promise<SlackChannelWithPermission> {
  return apiRequest(`/slack/channels/${encodeURIComponent(channelId)}/permission`, {
    method: 'PATCH',
    body: JSON.stringify({ permission, ...options }),
  });
}

export async function deleteSlackChannelPermission(
  channelId: string
): Promise<{ success: boolean }> {
  return apiRequest(`/slack/channels/${encodeURIComponent(channelId)}`, {
    method: 'DELETE',
  });
}

export async function searchSlackMessages(
  query: string,
  limit = 50
): Promise<{ messages: StoredSlackMessage[]; query: string }> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiRequest(`/slack/messages/search?${params}`);
}

export async function getRecentSlackMessages(
  limit = 50
): Promise<{ messages: StoredSlackMessage[] }> {
  return apiRequest(`/slack/messages/recent?limit=${limit}`);
}

export async function getSlackMessageStats(): Promise<SlackMessageStats> {
  return apiRequest('/slack/messages/stats');
}

// ============================================
// AGENT CAPABILITIES API
// ============================================

export interface SkillInfo {
  name: string;
  description: string;
  location: 'project' | 'global';
}

export interface ToolInfo {
  name: string;
  description: string;
  keywords: string[];
  useCases: string[];
}

export interface CategoryInfo {
  name: string;
  description: string;
  keywords: string[];
  tools: ToolInfo[];
}

export interface AgentCapabilities {
  skills: SkillInfo[];
  categories: CategoryInfo[];
}

export async function getAgentCapabilities(): Promise<AgentCapabilities> {
  return apiRequest('/capabilities');
}

// ============================================
// MCP SERVERS API
// ============================================

export interface MCPServer {
  name: string;
  type: 'local' | 'remote';
  url?: string;
  enabled: boolean;
  connected: boolean;
  hasTokens: boolean;
  toolCount?: number;
  lastConnected?: string;
}

export interface OAuthConfig {
  port: number;
  redirectUrl: string;
  isProduction: boolean;
}

export interface OAuthAuthorizeResponse {
  success: boolean;
  serverName: string;
  authUrl?: string;
  callbackUrl?: string;
  instructions?: string;
  message?: string;
  requiresOpenCode?: boolean;
  openCodeUrl?: string;
  connected?: boolean;
}

export async function getMCPServers(): Promise<{ servers: MCPServer[] }> {
  return apiRequest('/mcp/servers');
}

export async function getMCPOAuthConfig(): Promise<OAuthConfig> {
  return apiRequest('/mcp/oauth/config');
}

export async function triggerMCPOAuth(serverName: string): Promise<OAuthAuthorizeResponse> {
  return apiRequest(`/mcp/oauth/authorize/${encodeURIComponent(serverName)}`, {
    method: 'POST',
  });
}

export async function clearMCPTokens(
  serverName: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/mcp/oauth/tokens/${encodeURIComponent(serverName)}`, {
    method: 'DELETE',
  });
}

export interface OpenCodeConfig {
  url: string | null;
  available: boolean;
  port: string;
  isProduction: boolean;
}

export async function getOpenCodeUrl(): Promise<OpenCodeConfig> {
  return apiRequest('/mcp/opencode/url');
}

export interface OAuthCompleteResponse {
  success: boolean;
  pending?: boolean;
  status?: string;
  message?: string;
}

export async function completeMCPOAuth(serverName: string): Promise<OAuthCompleteResponse> {
  return apiRequest(`/mcp/oauth/complete/${encodeURIComponent(serverName)}`, {
    method: 'POST',
  });
}

// ============================================
// SECRETS API
// ============================================

export interface SecretMetadata {
  key: string;
  category: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SecretValue {
  key: string;
  value: string;
  revealed: boolean;
}

export async function listSecrets(): Promise<{ secrets: SecretMetadata[] }> {
  return apiRequest('/secrets');
}

export async function getSecret(key: string, reveal: boolean): Promise<SecretValue> {
  const query = reveal ? '?reveal=true' : '';
  return apiRequest(`/secrets/${encodeURIComponent(key)}${query}`);
}

export async function setSecret(
  key: string,
  payload: { value: string; category?: string; description?: string }
): Promise<{ success: boolean }> {
  return apiRequest(`/secrets/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteSecret(key: string): Promise<{ success: boolean }> {
  return apiRequest(`/secrets/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

export async function invalidateSecretsCache(): Promise<{ success: boolean }> {
  return apiRequest('/secrets/invalidate-cache', {
    method: 'POST',
  });
}

// ============================================
// PROVIDERS API
// ============================================

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'opencode_zen';

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  configured: boolean;
  updatedAt?: string | null;
}

export interface ProviderDefaults {
  transcription: ProviderId;
  vision: ProviderId;
  imageGeneration: ProviderId;
  agentChat: ProviderId;
}

export async function getProviders(): Promise<{ providers: ProviderStatus[] }> {
  return apiRequest('/providers');
}

export async function setProviderKey(
  provider: ProviderId,
  payload: { value: string }
): Promise<{ success: boolean }> {
  return apiRequest(`/providers/${encodeURIComponent(provider)}/key`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getProviderDefaults(): Promise<{ defaults: ProviderDefaults }> {
  return apiRequest('/providers/defaults');
}

export async function setProviderDefaults(
  defaults: ProviderDefaults
): Promise<{ success: boolean }> {
  return apiRequest('/providers/defaults', {
    method: 'PUT',
    body: JSON.stringify(defaults),
  });
}

// ============================================
// SCHEDULER API
// ============================================

export type ScheduleType = 'once' | 'recurring' | 'cron';
export type ScheduleProvider = 'whatsapp' | 'slack';
export type RunStatus = 'running' | 'success' | 'failed';

export interface ScheduledJob {
  id: number;
  name: string;
  description?: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  runAt?: string;
  intervalMinutes?: number;
  timezone: string;
  provider: ScheduleProvider;
  target: string;
  messageTemplate: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJobRun {
  id: number;
  jobId: number;
  startedAt: string;
  completedAt?: string;
  status: RunStatus;
  error?: string;
  messageSent?: string;
  jobName?: string; // Included in recent runs
}

export interface CreateScheduledJobInput {
  name: string;
  description?: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  runAt?: string;
  intervalMinutes?: number;
  timezone?: string;
  provider: ScheduleProvider;
  target: string;
  messageTemplate: string;
  enabled?: boolean;
}

export interface UpdateScheduledJobInput {
  name?: string;
  description?: string;
  scheduleType?: ScheduleType;
  cronExpression?: string;
  runAt?: string;
  intervalMinutes?: number;
  timezone?: string;
  provider?: ScheduleProvider;
  target?: string;
  messageTemplate?: string;
  enabled?: boolean;
}

export interface SchedulerStats {
  totalJobs: number;
  enabledJobs: number;
  byProvider: {
    whatsapp: number;
    slack: number;
  };
  byType: {
    once: number;
    recurring: number;
    cron: number;
  };
  totalRuns: number;
  last24Hours: {
    success: number;
    failed: number;
  };
}

export async function getSchedulerStats(): Promise<SchedulerStats> {
  return apiRequest('/schedules/stats');
}

export async function getScheduledJobs(): Promise<{ jobs: ScheduledJob[] }> {
  return apiRequest('/schedules');
}

export async function getScheduledJob(id: number): Promise<ScheduledJob> {
  return apiRequest(`/schedules/${id}`);
}

export async function createScheduledJob(input: CreateScheduledJobInput): Promise<ScheduledJob> {
  return apiRequest('/schedules', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateScheduledJob(
  id: number,
  input: UpdateScheduledJobInput
): Promise<ScheduledJob> {
  return apiRequest(`/schedules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteScheduledJob(
  id: number
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/schedules/${id}`, {
    method: 'DELETE',
  });
}

export async function toggleScheduledJob(id: number, enabled: boolean): Promise<ScheduledJob> {
  return apiRequest(`/schedules/${id}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function runScheduledJobNow(
  id: number
): Promise<{ success: boolean; error?: string; messageSent?: string }> {
  return apiRequest(`/schedules/${id}/run`, {
    method: 'POST',
  });
}

export async function getScheduledJobRuns(
  id: number,
  limit?: number
): Promise<{ runs: ScheduledJobRun[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return apiRequest(`/schedules/${id}/runs${params}`);
}

export async function getRecentScheduledRuns(limit?: number): Promise<{ runs: ScheduledJobRun[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return apiRequest(`/schedules/runs/recent${params}`);
}

export async function validateCronExpression(
  expression: string
): Promise<{ valid: boolean; description: string | null }> {
  return apiRequest('/schedules/validate-cron', {
    method: 'POST',
    body: JSON.stringify({ expression }),
  });
}

// Common cron presets for quick selection
export const CRON_PRESETS = {
  'Weekdays at 8:00 AM': '0 8 * * 1-5',
  'Weekdays at 9:00 AM': '0 9 * * 1-5',
  'Weekdays at 8:30 AM': '30 8 * * 1-5',
  'Weekdays at 5:00 PM': '0 17 * * 1-5',
  'Mondays at 9:00 AM': '0 9 * * 1',
  'Fridays at 4:00 PM': '0 16 * * 5',
  'Every hour': '0 * * * *',
  'Every 2 hours': '0 */2 * * *',
  'Daily at 9:00 AM': '0 9 * * *',
  'Daily at midnight': '0 0 * * *',
} as const;

export const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Jerusalem',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

// ============================================
// SYSTEM PROMPTS API
// ============================================

export type PromptPlatform = 'whatsapp' | 'slack';

export interface SystemPrompt {
  id: number;
  chatId: string;
  platform: PromptPlatform;
  promptText: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemPromptWithInfo extends SystemPrompt {
  displayName?: string;
  isDefault: boolean;
}

export interface PromptForChat {
  platform: PromptPlatform;
  chatId: string;
  promptText: string;
  isCustom: boolean;
}

export interface DefaultPrompts {
  whatsapp: string;
  slack: string;
}

/**
 * List all system prompts, optionally filtered by platform
 */
export async function listPrompts(platform?: PromptPlatform): Promise<SystemPromptWithInfo[]> {
  const params = platform ? `?platform=${platform}` : '';
  return apiRequest(`/prompts${params}`);
}

/**
 * Get the default prompts for all platforms
 */
export async function getDefaultPrompts(): Promise<DefaultPrompts> {
  return apiRequest('/prompts/defaults');
}

/**
 * Get embedded default prompts (for reset to default)
 */
export async function getEmbeddedDefaults(): Promise<DefaultPrompts> {
  return apiRequest('/prompts/embedded-defaults');
}

/**
 * Update the platform default prompt
 */
export async function updateDefaultPrompt(
  platform: PromptPlatform,
  promptText: string
): Promise<SystemPrompt> {
  return apiRequest(`/prompts/defaults/${platform}`, {
    method: 'PUT',
    body: JSON.stringify({ promptText }),
  });
}

/**
 * Get the prompt for a specific chat (returns custom or default)
 */
export async function getPromptForChat(
  platform: PromptPlatform,
  chatId: string
): Promise<PromptForChat> {
  return apiRequest(`/prompts/${platform}/${encodeURIComponent(chatId)}`);
}

/**
 * Set/update a custom prompt for a specific chat
 */
export async function setPromptForChat(
  platform: PromptPlatform,
  chatId: string,
  promptText: string
): Promise<SystemPrompt> {
  return apiRequest(`/prompts/${platform}/${encodeURIComponent(chatId)}`, {
    method: 'PUT',
    body: JSON.stringify({ promptText }),
  });
}

/**
 * Delete a custom prompt (chat reverts to using platform default)
 */
export async function deletePromptForChat(
  platform: PromptPlatform,
  chatId: string
): Promise<{ success: boolean }> {
  return apiRequest(`/prompts/${platform}/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });
}

// ============================================
// WEBHOOK API
// ============================================

export type WebhookSourceType = 'github' | 'calendar' | 'jira' | 'custom';
export type WebhookProvider = 'whatsapp' | 'slack';
export type WebhookEventStatus = 'processed' | 'filtered' | 'failed' | 'pending';

export interface Webhook {
  id: number;
  name: string;
  description?: string;
  token: string;
  signatureHeader?: string;
  sourceType: WebhookSourceType;
  eventFilter?: string[];
  provider: WebhookProvider;
  target: string;
  messageTemplate?: string;
  enabled: boolean;
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  id: number;
  webhookId: number;
  receivedAt: string;
  eventType?: string;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  error?: string;
  messageSent?: string;
  processingTimeMs?: number;
  webhookName?: string;
}

export interface CreateWebhookInput {
  name: string;
  description?: string;
  token?: string;
  signatureHeader?: string;
  sourceType: WebhookSourceType;
  eventFilter?: string[];
  provider: WebhookProvider;
  target: string;
  messageTemplate?: string;
  enabled?: boolean;
}

export interface UpdateWebhookInput {
  name?: string;
  description?: string;
  token?: string;
  signatureHeader?: string;
  sourceType?: WebhookSourceType;
  eventFilter?: string[];
  provider?: WebhookProvider;
  target?: string;
  messageTemplate?: string;
  enabled?: boolean;
}

export interface WebhookStats {
  totalWebhooks: number;
  enabledWebhooks: number;
  bySourceType: {
    github: number;
    calendar: number;
    jira: number;
    custom: number;
  };
  byProvider: {
    whatsapp: number;
    slack: number;
  };
  totalEvents: number;
  last24Hours: {
    processed: number;
    filtered: number;
    failed: number;
  };
}

export async function getWebhookStats(): Promise<WebhookStats> {
  return apiRequest('/webhooks/stats');
}

export async function getWebhooks(): Promise<{ webhooks: Webhook[] }> {
  return apiRequest('/webhooks');
}

export async function getWebhook(id: number): Promise<Webhook> {
  return apiRequest(`/webhooks/${id}`);
}

export async function createWebhook(input: CreateWebhookInput): Promise<Webhook> {
  return apiRequest('/webhooks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateWebhook(id: number, input: UpdateWebhookInput): Promise<Webhook> {
  return apiRequest(`/webhooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteWebhook(id: number): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/webhooks/${id}`, {
    method: 'DELETE',
  });
}

export async function toggleWebhook(id: number, enabled: boolean): Promise<Webhook> {
  return apiRequest(`/webhooks/${id}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function regenerateWebhookToken(id: number): Promise<Webhook> {
  return apiRequest(`/webhooks/${id}/regenerate-token`, {
    method: 'POST',
  });
}

export async function testWebhook(
  id: number
): Promise<{ success: boolean; status: string; message?: string; error?: string }> {
  return apiRequest(`/webhooks/${id}/test`, {
    method: 'POST',
  });
}

export async function getWebhookEvents(
  id: number,
  limit?: number
): Promise<{ events: WebhookEvent[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return apiRequest(`/webhooks/${id}/events${params}`);
}

export async function getRecentWebhookEvents(limit?: number): Promise<{ events: WebhookEvent[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return apiRequest(`/webhooks/events/recent${params}`);
}

// GitHub event types and descriptions for UI
export const GITHUB_EVENTS: Record<string, string> = {
  pull_request: 'Pull request opened, closed, merged, etc.',
  push: 'Commits pushed to a branch',
  issues: 'Issue opened, closed, labeled, etc.',
  issue_comment: 'Comment on an issue or PR',
  workflow_run: 'GitHub Actions workflow status',
  release: 'Release published or updated',
  create: 'Branch or tag created',
  delete: 'Branch or tag deleted',
  fork: 'Repository forked',
  star: 'Repository starred',
};

// Default message templates
export const DEFAULT_WEBHOOK_TEMPLATES: Record<string, string> = {
  'github:pull_request': `🔀 **PR {{pr_action}}**: {{pr_title}}
by @{{pr_author}} in {{repo_name}}
{{pr_branch}} → {{pr_base}}
{{pr_url}}`,

  'github:push': `📤 **Push to {{push_branch}}**
{{push_commits}} commit(s) by {{push_author}}
{{push_compare_url}}`,

  'github:issues': `🐛 **Issue {{issue_action}}**: {{issue_title}}
by @{{issue_author}} in {{repo_name}}
{{issue_url}}`,

  'github:workflow_run': `⚙️ **Workflow {{action}}**
Status: {{status}}
{{workflow_url}}`,

  'github:release': `🎉 **Release {{action}}**: {{release_name}}
Tag: {{tag_name}}
{{release_url}}`,

  'calendar:reminder': `📅 **Meeting Reminder**
{{event_summary}}
📍 {{event_location}}
🔗 {{meeting_link}}`,

  custom: `📨 Webhook received: {{event_type}}
{{timestamp}}`,
};

// ============================================
// AGENT REGISTRY API
// ============================================

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  mode: string | null;
  modelDefault: string | null;
  modelFallback: string | null;
  basePrompt: string | null;
  enabled: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AgentSkill {
  id: number;
  agentId: string;
  skillName: string;
  enabled: boolean | null;
  createdAt: string | null;
}

export interface AgentTool {
  id: number;
  agentId: string;
  pattern: string;
  type: string; // 'allow' | 'deny' | 'ask'
  createdAt: string | null;
}

export interface AgentWithDetails extends Agent {
  skills: AgentSkill[];
  tools: AgentTool[];
}

export interface AgentStats {
  totalAgents: number;
  enabledAgents: number;
  totalSkills: number;
  totalContextRules: number;
}

export interface ContextRule {
  id: number;
  contextType: string;
  contextId: string | null;
  agentId: string | null;
  skillOverrides: string | null;
  priority: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateAgentInput {
  id: string;
  name: string;
  description?: string;
  mode?: string;
  modelDefault?: string;
  modelFallback?: string;
  basePrompt?: string;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  mode?: string;
  modelDefault?: string;
  modelFallback?: string;
  basePrompt?: string;
  enabled?: boolean;
}

export async function getAgentStats(): Promise<AgentStats> {
  return apiRequest('/agents/stats');
}

export async function getAgents(): Promise<{ agents: Agent[] }> {
  return apiRequest('/agents');
}

export async function getAvailableSkills(): Promise<{ skills: string[] }> {
  return apiRequest('/agents/available-skills');
}

export async function getAgentWithDetails(id: string): Promise<AgentWithDetails> {
  return apiRequest(`/agents/${encodeURIComponent(id)}`);
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  return apiRequest('/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
  return apiRequest(`/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteAgent(id: string): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function toggleAgent(id: string, enabled: boolean): Promise<Agent> {
  return apiRequest(`/agents/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function getAgentSkills(id: string): Promise<{ skills: AgentSkill[] }> {
  return apiRequest(`/agents/${encodeURIComponent(id)}/skills`);
}

export async function setAgentSkills(
  id: string,
  skills: string[]
): Promise<{ skills: AgentSkill[] }> {
  return apiRequest(`/agents/${encodeURIComponent(id)}/skills`, {
    method: 'PUT',
    body: JSON.stringify({ skills }),
  });
}

export async function getAgentTools(
  id: string
): Promise<{ allowTools: string[]; denyTools: string[]; askTools: string[] }> {
  return apiRequest(`/agents/${encodeURIComponent(id)}/tools`);
}

export async function setAgentTools(
  id: string,
  allow: string[],
  deny: string[],
  ask: string[]
): Promise<{ tools: AgentTool[] }> {
  return apiRequest(`/agents/${encodeURIComponent(id)}/tools`, {
    method: 'PUT',
    body: JSON.stringify({ allowTools: allow, denyTools: deny, askTools: ask }),
  });
}

export async function getContextRules(): Promise<{ rules: ContextRule[] }> {
  return apiRequest('/agents/context-rules');
}

export async function createContextRule(rule: {
  contextType: string;
  contextId?: string;
  agentId?: string;
  skillOverrides?: string[];
  priority?: number;
}): Promise<ContextRule> {
  return apiRequest('/agents/context-rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function deleteContextRule(
  id: number
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/agents/context-rules/${id}`, {
    method: 'DELETE',
  });
}

export async function syncAgentsToFilesystem(
  environment?: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest('/agents/sync', {
    method: 'POST',
    body: JSON.stringify({ environment }),
  });
}

// ============================================
// MINIAPP EDITOR APIs
// ============================================

/**
 * Start or continue editing a miniapp
 */
export async function editApp(
  appName: string,
  prompt: string,
  createNew: boolean = false,
  continueSession?: string
): Promise<{
  success: boolean;
  sessionId: string;
  portalUrl: string;
  response: string;
  commitHash: string;
  buildStatus: {
    success: boolean;
    output: string;
    duration: number;
    error?: string;
  };
  error?: string;
}> {
  return apiRequest(`/apps/${appName}/edit`, {
    method: 'POST',
    body: JSON.stringify({ prompt, createNew, continueSession }),
  });
}

/**
 * Trigger a build for an app
 */
export async function buildApp(
  appName: string,
  sessionId: string
): Promise<{
  success: boolean;
  buildOutput: string;
  duration: number;
  error?: string;
}> {
  return apiRequest(`/apps/${appName}/build`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

/**
 * Rollback to a previous commit
 */
export async function rollbackToCommit(
  appName: string,
  sessionId: string,
  commitHash: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  return apiRequest(`/apps/${appName}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, commitHash }),
  });
}

/**
 * Get commit history for a session
 */
export async function getHistory(
  appName: string,
  sessionId: string
): Promise<{
  success: boolean;
  commits: Array<{
    hash: string;
    message: string;
    timestamp: Date;
    filesChanged: string[];
    buildSuccess: boolean;
  }>;
  error?: string;
}> {
  return apiRequest(`/apps/${appName}/history?sessionId=${sessionId}`);
}

/**
 * Close a session and optionally create PR
 */
export async function closeSession(
  appName: string,
  sessionId: string,
  merge: boolean = false
): Promise<{
  success: boolean;
  message: string;
  prUrl?: string;
  error?: string;
}> {
  return apiRequest(`/apps/${appName}/close-session`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, merge }),
  });
}

/**
 * Get active edit sessions
 */
export async function getActiveSessions(): Promise<{
  success: boolean;
  sessions: Array<{
    id: string;
    appName: string;
    sessionId: string;
    branchName: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  error?: string;
}> {
  return apiRequest('/apps/sessions/active');
}

/**
 * Get sessions for a specific app
 */
export async function getAppSessions(appName: string): Promise<{
  success: boolean;
  sessions: Array<{
    id: string;
    sessionId: string;
    branchName: string;
    createdAt: Date;
    updatedAt: Date;
    closedAt?: Date;
  }>;
  error?: string;
}> {
  return apiRequest(`/apps/${appName}/sessions`);
}

// ============================================
// MONITORING API
// ============================================

export interface CpuMetrics {
  usagePercent: number;
  loadAverage: [number, number, number];
}

export interface MemoryMetrics {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  usedPercent: number;
}

export interface DiskMetrics {
  path: string;
  totalGB: number;
  usedGB: number;
  availableGB: number;
  usedPercent: number;
}

export interface ContainerMetrics {
  name: string;
  status: 'running' | 'exited' | 'restarting' | 'paused' | 'unknown';
  cpuPercent: number;
  memoryUsage: string;
  memoryPercent: number;
}

export interface MonitoringAlert {
  type: 'cpu' | 'memory' | 'disk' | 'container_down';
  severity: 'warning' | 'critical';
  message: string;
}

export interface ServerMetrics {
  timestamp: string;
  host: {
    cpu: CpuMetrics;
    memory: MemoryMetrics;
    disk: DiskMetrics[];
  };
  containers: ContainerMetrics[];
  alerts: MonitoringAlert[];
  connectionStatus?: 'connected' | 'failed';
  error?: string;
}

export interface AlertThresholds {
  cpu: number;
  memory: number;
  disk: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export async function getServerMetrics(): Promise<ServerMetrics> {
  return apiRequest('/monitoring/metrics');
}

export async function getMonitoringConfig(): Promise<AlertThresholds> {
  return apiRequest('/monitoring/config');
}

export async function updateMonitoringConfig(
  config: Partial<AlertThresholds>
): Promise<{ message: string; thresholds: AlertThresholds }> {
  return apiRequest('/monitoring/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function testMonitoringConnection(): Promise<ConnectionTestResult> {
  return apiRequest('/monitoring/test');
}

// ============================================
// ONBOARDER API
// ============================================

export interface OnboarderAction {
  label: string;
  route: string;
  params?: Record<string, string>;
}

export interface OnboarderSuggestion {
  id: string;
  label: string;
  prompt: string;
  actions?: OnboarderAction[];
}

export interface OnboarderChatResponse {
  sessionId: string;
  message: string;
  actions?: OnboarderAction[];
}

export interface OnboarderSessionInfo {
  id: number;
  userId: number;
  sessionId: string;
  title: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getOnboarderSession(): Promise<{
  sessionId: string;
  title?: string;
  isNew?: boolean;
}> {
  return apiRequest('/onboarder/session');
}

export async function resetOnboarderSession(): Promise<{ success: boolean; cleared: number }> {
  return apiRequest('/onboarder/session', { method: 'DELETE' });
}

export async function getOnboarderSessions(): Promise<{ sessions: OnboarderSessionInfo[] }> {
  return apiRequest('/onboarder/sessions');
}

export async function createNewOnboarderSession(): Promise<{
  sessionId: string;
  title: string;
  isNew: boolean;
}> {
  return apiRequest('/onboarder/sessions/new', { method: 'POST' });
}

export async function activateOnboarderSession(
  sessionId: string
): Promise<{ success: boolean; sessionId: string }> {
  return apiRequest(`/onboarder/sessions/${sessionId}/activate`, { method: 'POST' });
}

export async function getOnboarderSuggestions(
  route?: string | null
): Promise<{ suggestions: OnboarderSuggestion[] }> {
  const params = route ? `?route=${encodeURIComponent(route)}` : '';
  return apiRequest(`/onboarder/suggestions${params}`);
}

export async function sendOnboarderMessage(payload: {
  message: string;
  sessionId?: string | null;
  route?: string | null;
  agent?: string;
}): Promise<OnboarderChatResponse> {
  return apiRequest('/onboarder/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================
// INTEGRATIONS CATALOG
// ============================================

/**
 * Authentication method for integrations that support multiple auth options
 */
export interface AuthMethod {
  type: 'api_token' | 'oauth2' | 'oauth2-pkce';
  name: string;
  description: string;
  requiredFields: string[];
}

export interface IntegrationManifest {
  name: string;
  title: string;
  description: string;
  version: string;
  status: 'stable' | 'beta' | 'experimental';
  icon?: string;
  docsUrl?: string;
  oauth: {
    type?: string;
    scopes: string[];
  };
  authMethods?: AuthMethod[];
  tools: Array<{
    name: string;
    description: string;
    category: string;
  }>;
  requiredSecrets: Array<{
    name: string;
    description: string;
    category: string;
    required?: boolean;
    authMethod?: string;
  }>;
}

export interface CatalogIntegration {
  manifest: IntegrationManifest;
  secretsConfigured: boolean;
  isConnected: boolean;
}

/**
 * Get all integrations from the catalog
 */
export async function getIntegrationsCatalog(): Promise<CatalogIntegration[]> {
  return apiRequest('/integrations/catalog');
}

/**
 * Get a specific integration from the catalog
 */
export async function getIntegration(name: string): Promise<CatalogIntegration> {
  return apiRequest(`/integrations/catalog/${encodeURIComponent(name)}`);
}

/**
 * Save credentials for an integration (inline credential entry)
 */
export interface SaveCredentialsResponse {
  success: boolean;
  secretsConfigured: boolean;
  message?: string;
}

export async function saveIntegrationCredentials(
  name: string,
  credentials: Record<string, string>,
  authMethod?: string
): Promise<SaveCredentialsResponse> {
  return apiRequest(`/integrations/connect/${encodeURIComponent(name)}/credentials`, {
    method: 'POST',
    body: JSON.stringify({ credentials, authMethod }),
  });
}

/**
 * Initiate OAuth connection for an integration
 */
export async function connectIntegration(
  name: string,
  authMethod?: string
): Promise<{
  success: boolean;
  message: string;
  authUrl?: string;
  connected?: boolean;
  instructions?: string;
  requiresOpenCode?: boolean;
  openCodeUrl?: string;
  callbackUrl?: string;
  oauthState?: string;
  requiredSecrets?: Array<{
    name: string;
    description: string;
    category: string;
    required?: boolean;
    authMethod?: string;
  }>;
}> {
  return apiRequest(`/integrations/connect/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: JSON.stringify({ authMethod }),
  });
}

// ============================================
// STORAGE API
// ============================================

export interface TableStats {
  tableName: string;
  rowCount: number;
  estimatedSize?: string;
}

export interface DatabaseStorageStats {
  tables: TableStats[];
  totalRows: number;
  connectionStatus: 'connected' | 'error';
  error?: string;
}

export interface MediaStorageStats {
  totalFiles: number;
  byType: {
    image: number;
    audio: number;
    video: number;
    document: number;
  };
  oldestMedia?: string;
  newestMedia?: string;
}

export interface SessionStorageStats {
  status: 'connected' | 'disconnected' | 'unknown';
  path: string;
  sizeMB: number;
  exists: boolean;
  lastModified?: string;
}

export interface CloudStorageStats {
  cloudflare: {
    available: boolean;
    storageGB?: number;
    error?: string;
  };
  google: {
    available: boolean;
    storageGB?: number;
    error?: string;
  };
}

export interface StorageSummary {
  database: DatabaseStorageStats;
  media: MediaStorageStats;
  session: SessionStorageStats;
  cloud: CloudStorageStats;
  fetchedAt: string;
}

export interface CleanupPreview {
  messagesCount: number;
  oldestMessage?: string;
  newestAffected?: string;
}

export interface CleanupResult {
  success: boolean;
  deletedCount: number;
  message?: string;
  error?: string;
}

export async function getStorageSummary(): Promise<StorageSummary> {
  return apiRequest('/storage/summary');
}

export async function getDatabaseStorageStats(): Promise<DatabaseStorageStats> {
  return apiRequest('/storage/database');
}

export async function getMediaStorageStats(): Promise<MediaStorageStats> {
  return apiRequest('/storage/media');
}

export async function getSessionStorageStats(): Promise<SessionStorageStats> {
  return apiRequest('/storage/session');
}

export async function getCloudStorageStats(): Promise<CloudStorageStats> {
  return apiRequest('/storage/cloud');
}

export async function previewStorageCleanup(beforeDate: string): Promise<CleanupPreview> {
  return apiRequest('/storage/cleanup/preview', {
    method: 'POST',
    body: JSON.stringify({ beforeDate }),
  });
}

export async function cleanupOldMessages(beforeDate: string): Promise<CleanupResult> {
  return apiRequest('/storage/cleanup/messages', {
    method: 'POST',
    body: JSON.stringify({ beforeDate }),
  });
}

// ============================================
// VERSION CHECK API
// ============================================

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  changelogUrl: string;
  updateInstructions: string | null;
  lastChecked: Date | string;
  error?: string;
  shouldShowNotification?: boolean;
}

export interface VersionServiceStatus {
  enabled: boolean;
  polling: boolean;
  endpoint: string | null;
  intervalHours: number;
  currentVersion: string;
}

export interface UserVersionPreferences {
  userId: number;
  notificationsEnabled: boolean;
  dismissedVersions: string[];
  remindLaterUntil: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Get current version status and check for updates
 */
export async function getVersionStatus(refresh = false): Promise<VersionCheckResult> {
  const params = refresh ? '?refresh=true' : '';
  return apiRequest(`/version/status${params}`);
}

/**
 * Get version service configuration status
 */
export async function getVersionServiceStatus(): Promise<VersionServiceStatus> {
  return apiRequest('/version/service-status');
}

/**
 * Get user's version notification preferences
 */
export async function getVersionPreferences(): Promise<UserVersionPreferences> {
  return apiRequest('/version/preferences');
}

/**
 * Update user's version notification preferences
 */
export async function updateVersionPreferences(prefs: {
  notificationsEnabled?: boolean;
}): Promise<UserVersionPreferences> {
  return apiRequest('/version/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

/**
 * Dismiss a specific version notification permanently
 */
export async function dismissVersion(
  version: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest('/version/dismiss', {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

/**
 * Set "remind me later" for version notifications
 * @param hours - 1 (1 hour), 24 (1 day), or 168 (1 week)
 */
export async function remindLaterVersion(
  hours: 1 | 24 | 168
): Promise<{ success: boolean; message: string; remindLaterUntil: Date | string }> {
  return apiRequest('/version/remind-later', {
    method: 'POST',
    body: JSON.stringify({ hours }),
  });
}

/**
 * Force an immediate version check (bypasses cache)
 */
export async function checkVersionNow(): Promise<VersionCheckResult> {
  return apiRequest('/version/check-now', {
    method: 'POST',
  });
}

// ============================================
// FEATURE FLAGS API
// ============================================

export interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  category: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagWithOverride extends FeatureFlag {
  userOverride: boolean | null;
  effectiveValue: boolean;
}

/**
 * Get all feature flags with user overrides
 */
export async function getFeatureFlags(): Promise<{ flags: FeatureFlagWithOverride[] }> {
  return apiRequest('/feature-flags');
}

/**
 * Get effective flag values as a flat object
 */
export async function getEffectiveFeatureFlags(): Promise<{ flags: Record<string, boolean> }> {
  return apiRequest('/feature-flags/effective');
}

/**
 * Set a user override for a specific flag
 */
export async function setFeatureFlagOverride(
  flagId: string,
  enabled: boolean
): Promise<{ success: boolean; flags: FeatureFlagWithOverride[] }> {
  return apiRequest(`/feature-flags/${encodeURIComponent(flagId)}/override`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

/**
 * Remove a user override (revert to global default)
 */
export async function removeFeatureFlagOverride(
  flagId: string
): Promise<{ success: boolean; flags: FeatureFlagWithOverride[] }> {
  return apiRequest(`/feature-flags/${encodeURIComponent(flagId)}/override`, {
    method: 'DELETE',
  });
}

// ============================================
// UI REFRESH EVENTS
// ============================================

/**
 * Simple event bus for cross-component communication.
 * Used to notify UI components when data changes (e.g., prompts updated by onboarder).
 */
export type RefreshEventType = 'prompts' | 'agents' | 'permissions' | 'all';

const refreshListeners = new Map<RefreshEventType, Set<() => void>>();

/**
 * Subscribe to refresh events for a specific data type
 */
export function subscribeToRefresh(eventType: RefreshEventType, callback: () => void): () => void {
  if (!refreshListeners.has(eventType)) {
    refreshListeners.set(eventType, new Set());
  }
  refreshListeners.get(eventType)!.add(callback);

  // Return unsubscribe function
  return () => {
    refreshListeners.get(eventType)?.delete(callback);
  };
}

/**
 * Trigger a refresh event to notify all subscribers
 */
export function triggerRefresh(eventType: RefreshEventType): void {
  // Trigger specific event type listeners
  refreshListeners.get(eventType)?.forEach((cb) => cb());

  // Also trigger 'all' listeners
  if (eventType !== 'all') {
    refreshListeners.get('all')?.forEach((cb) => cb());
  }
}
