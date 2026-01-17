# Integration Manifest Template

Complete template for `INTEGRATION.yaml` files.

## Full Template

```yaml
# Unique identifier (lowercase, alphanumeric, hyphens)
name: service-name

# Display name
title: Service Name

# Description (minimum 50 characters)
description: >-
  A comprehensive description of what this integration provides. Include
  the main features and capabilities. This helps users understand what
  they can do with this integration.

# Semantic version
version: 1.0.0

# Author or organization (optional)
author: Orient

# Icon path relative to catalog directory (optional)
icon: /icons/service-name.svg

# Integration status
status: beta # stable | beta | experimental

# OAuth configuration
oauth:
  # OAuth type
  type: oauth2 # oauth2 | oauth2-pkce

  # Authorization endpoint
  authorizationUrl: https://service.com/oauth/authorize

  # Token exchange endpoint
  tokenUrl: https://service.com/oauth/token

  # Token revocation endpoint (optional)
  revocationUrl: https://service.com/oauth/revoke

  # User info endpoint (optional)
  userInfoUrl: https://service.com/api/me

  # Required scopes
  scopes:
    - read
    - write
    - scope:specific

  # Human-readable scope descriptions (optional)
  scopeDescriptions:
    read: Read access to all resources
    write: Write access to all resources
    scope:specific: Description of what this scope grants

# Required secrets
requiredSecrets:
  - name: SERVICE_CLIENT_ID
    description: OAuth Client ID from developer settings
    category: oauth # oauth | api_key | webhook
    required: true

  - name: SERVICE_CLIENT_SECRET
    description: OAuth Client Secret
    category: oauth
    required: true

  - name: SERVICE_WEBHOOK_SECRET
    description: Webhook signing secret for payload verification
    category: webhook
    required: false

# Available tools
tools:
  # Tool definition
  - name: resource.list
    description: List resources with optional filters
    category: resources
    requiredScopes:
      - read

  - name: resource.get
    description: Get a specific resource by ID
    category: resources
    requiredScopes:
      - read

  - name: resource.create
    description: Create a new resource
    category: resources
    requiredScopes:
      - write

  - name: resource.update
    description: Update an existing resource
    category: resources
    requiredScopes:
      - write

  - name: resource.delete
    description: Delete a resource
    category: resources
    requiredScopes:
      - write

# Webhook configuration (optional)
webhooks:
  # Supported webhook events
  events:
    - resource.created
    - resource.updated
    - resource.deleted

  # Header containing the signature
  signatureHeader: X-Service-Signature

  # Signature algorithm
  signatureAlgorithm: hmac-sha256 # hmac-sha256 | hmac-sha1

# Documentation URL (optional)
docsUrl: https://docs.service.com/api

# API base URL (optional)
apiBaseUrl: https://api.service.com
```

## Field Descriptions

### Required Fields

| Field             | Type   | Description                                            |
| ----------------- | ------ | ------------------------------------------------------ |
| `name`            | string | Unique identifier, lowercase alphanumeric with hyphens |
| `title`           | string | Human-readable display name                            |
| `description`     | string | At least 50 characters describing the integration      |
| `version`         | string | Semantic version (e.g., `1.0.0`)                       |
| `oauth`           | object | OAuth configuration                                    |
| `requiredSecrets` | array  | List of required secret configurations                 |
| `tools`           | array  | List of available tools                                |
| `status`          | string | One of: `stable`, `beta`, `experimental`               |

### OAuth Configuration

| Field               | Type   | Description                                  |
| ------------------- | ------ | -------------------------------------------- |
| `type`              | string | `oauth2` or `oauth2-pkce`                    |
| `authorizationUrl`  | string | URL to redirect users for authorization      |
| `tokenUrl`          | string | URL to exchange code for tokens              |
| `scopes`            | array  | List of OAuth scopes to request              |
| `revocationUrl`     | string | (Optional) URL to revoke tokens              |
| `userInfoUrl`       | string | (Optional) URL to fetch user profile         |
| `scopeDescriptions` | object | (Optional) Human-readable scope descriptions |

### Secret Configuration

| Field         | Type    | Description                      |
| ------------- | ------- | -------------------------------- |
| `name`        | string  | Environment variable name        |
| `description` | string  | Human-readable description       |
| `category`    | string  | `oauth`, `api_key`, or `webhook` |
| `required`    | boolean | Whether this secret is required  |

### Tool Configuration

| Field            | Type   | Description                            |
| ---------------- | ------ | -------------------------------------- |
| `name`           | string | Tool identifier (e.g., `issues.list`)  |
| `description`    | string | What the tool does                     |
| `category`       | string | Grouping category                      |
| `requiredScopes` | array  | (Optional) Scopes needed for this tool |

## Examples

### Minimal Manifest

```yaml
name: simple-api
title: Simple API
description: A simple API integration for basic operations and data access.
version: 1.0.0
status: experimental

oauth:
  type: oauth2
  authorizationUrl: https://api.simple.com/oauth/authorize
  tokenUrl: https://api.simple.com/oauth/token
  scopes:
    - read

requiredSecrets:
  - name: SIMPLE_API_CLIENT_ID
    description: OAuth Client ID
    category: oauth
    required: true
  - name: SIMPLE_API_CLIENT_SECRET
    description: OAuth Client Secret
    category: oauth
    required: true

tools:
  - name: data.list
    description: List data items
    category: data
```

### Complete Production Manifest

See `packages/integrations/src/catalog/github/INTEGRATION.yaml` for a full production example.
