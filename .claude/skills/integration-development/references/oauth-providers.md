# OAuth Provider Reference

Quick reference for OAuth configuration of common providers.

## GitHub

```yaml
oauth:
  type: oauth2
  authorizationUrl: https://github.com/login/oauth/authorize
  tokenUrl: https://github.com/login/oauth/access_token
  scopes:
    - repo
    - read:user
    - user:email
    - read:org
    - workflow
```

**Notes:**

- Tokens don't expire by default
- Scopes are space-separated in URL, comma-separated in response
- Use `Accept: application/json` for token endpoint

## Linear

```yaml
oauth:
  type: oauth2
  authorizationUrl: https://linear.app/oauth/authorize
  tokenUrl: https://api.linear.app/oauth/token
  revocationUrl: https://api.linear.app/oauth/revoke
  scopes:
    - read
    - write
    - issues:create
    - comments:create
```

**Notes:**

- GraphQL API at `https://api.linear.app/graphql`
- Scopes are comma-separated
- Tokens expire, check `expires_in`

## Google

```yaml
oauth:
  type: oauth2-pkce
  authorizationUrl: https://accounts.google.com/o/oauth2/v2/auth
  tokenUrl: https://oauth2.googleapis.com/token
  revocationUrl: https://oauth2.googleapis.com/revoke
  userInfoUrl: https://www.googleapis.com/oauth2/v2/userinfo
  scopes:
    - https://www.googleapis.com/auth/userinfo.email
    - https://www.googleapis.com/auth/userinfo.profile
```

**Notes:**

- Requires PKCE for native/SPA apps
- Scopes are full URLs
- Use `prompt: consent` to get refresh token
- Tokens expire in 1 hour

## Slack

```yaml
oauth:
  type: oauth2
  authorizationUrl: https://slack.com/oauth/v2/authorize
  tokenUrl: https://slack.com/api/oauth.v2.access
  scopes:
    - channels:read
    - chat:write
    - users:read
```

**Notes:**

- Bot tokens don't expire
- User tokens may need refresh
- Scopes determine bot vs user token

## Atlassian (Jira/Confluence)

```yaml
oauth:
  type: oauth2
  authorizationUrl: https://auth.atlassian.com/authorize
  tokenUrl: https://auth.atlassian.com/oauth/token
  scopes:
    - read:jira-work
    - write:jira-work
    - read:jira-user
```

**Notes:**

- Tokens expire in 1 hour
- Refresh tokens last 90 days
- Cloud IDs required for API calls
- Use `https://api.atlassian.com` base URL

## Notion

```yaml
oauth:
  type: oauth2
  authorizationUrl: https://api.notion.com/v1/oauth/authorize
  tokenUrl: https://api.notion.com/v1/oauth/token
  scopes: [] # Notion uses workspace-level access
```

**Notes:**

- No granular scopes
- Access determined by pages shared during auth
- Tokens don't expire

## Microsoft (Azure AD)

```yaml
oauth:
  type: oauth2
  authorizationUrl: https://login.microsoftonline.com/common/oauth2/v2.0/authorize
  tokenUrl: https://login.microsoftonline.com/common/oauth2/v2.0/token
  scopes:
    - https://graph.microsoft.com/.default
    - offline_access
```

**Notes:**

- Use tenant ID instead of `common` for single-tenant
- `offline_access` required for refresh token
- Tokens expire in 1 hour

## Dropbox

```yaml
oauth:
  type: oauth2-pkce
  authorizationUrl: https://www.dropbox.com/oauth2/authorize
  tokenUrl: https://api.dropbox.com/oauth2/token
  revocationUrl: https://api.dropbox.com/2/auth/token/revoke
  scopes: []
```

**Notes:**

- No scopes, uses app permissions
- Use `token_access_type: offline` for refresh token

## Common Patterns

### Token Refresh

```typescript
async function refreshToken(refreshToken: string): Promise<Tokens> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  return response.json();
}
```

### PKCE Generation

```typescript
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
```

### State Parameter

```typescript
function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}
```

## Webhook Signature Verification

### HMAC-SHA256 (GitHub, Linear)

```typescript
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(`sha256=${expected}`));
}
```

### Timestamp Verification (Slack)

```typescript
function verifySlackRequest(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const basestring = `v0:${timestamp}:${body}`;
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(basestring).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```
