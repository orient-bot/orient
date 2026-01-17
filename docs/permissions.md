# Agent Permissions

The agent permissions system controls which tool calls are allowed, denied, or require approval across platforms (Slack, WhatsApp, dashboard, etc.).

## Concepts

- **Policies** define which tools require approval and at what granularity.
- **Approvals** are persisted so pending requests can survive restarts.
- **Adapters** provide platform-specific approval UX.

## Policy Model

Policies live in:

- Code defaults: `packages/agents/src/permissions/defaultPolicies.ts`
- Database overrides: `permission_policies` table

Policy fields:

- `toolPatterns`: glob patterns like `file_*`, `bash`, `http_*`
- `action`: `allow` | `deny` | `ask`
- `granularity`: `per_call` | `per_session` | `per_category`
- `riskLevel`: `low` | `medium` | `high` | `critical`

## Approval Flow

1. Agent requests tool call
2. Policy engine evaluates policies
3. If `ask`, platform adapter requests approval
4. Approval decision stored in `approval_requests`
5. Optional grants stored in `approval_grants`

## Platform Adapters

Adapters live under `packages/agents/src/permissions/adapters/`:

- `SlackApprovalAdapter` uses Block Kit buttons
- `WhatsAppApprovalAdapter` uses replies/reactions
- `DashboardApprovalAdapter` handles dashboard approvals

Adapters are registered via `PlatformAdapterRegistry`.

## Adding a New Platform

1. Implement `PlatformApprovalAdapter`
2. Register it in the platform service
3. Ensure policy engine is constructed with the registry

Example registration:

```
const registry = new PlatformAdapterRegistry();
registry.register(new TelegramApprovalAdapter(...));
```

## Testing

Policy engine tests live in `packages/agents/__tests__/policyEngine.test.ts`.

Run:

```
pnpm --filter @orient/agents test
```
