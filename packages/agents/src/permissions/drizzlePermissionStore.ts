import {
  approvalGrants,
  approvalRequests,
  permissionPolicies,
  getDatabase,
  and,
  eq,
} from '@orientbot/database';
import type { ApprovalGrant, ApprovalRequest, PermissionPolicy } from './types.js';
import type {
  ApprovalGrantFilter,
  ApprovalRequestCreateInput,
  ApprovalRequestFilter,
  ApprovalRequestUpdateInput,
  PermissionStore,
} from './approvalStore.js';

function parseJsonArray(value?: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function serializeJson(value?: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.stringify(value);
}

function mapPolicy(row: typeof permissionPolicies.$inferSelect): PermissionPolicy {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    toolPatterns: parseJsonArray(row.toolPatterns) ?? [],
    agentIds: parseJsonArray(row.agentIds),
    platforms: parseJsonArray(row.platforms),
    action: row.action as PermissionPolicy['action'],
    granularity: row.granularity as PermissionPolicy['granularity'],
    timeout: row.timeout ?? undefined,
    promptTemplate: row.promptTemplate ?? undefined,
    riskLevel: row.riskLevel as PermissionPolicy['riskLevel'],
    priority: row.priority ?? 0,
    enabled: row.enabled ?? true,
  };
}

export class DrizzlePermissionStore implements PermissionStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getDb(): Promise<any> {
    return await getDatabase();
  }

  async listPolicies(): Promise<PermissionPolicy[]> {
    const db = await this.getDb();
    const rows = await db.select().from(permissionPolicies);
    return rows.map(mapPolicy);
  }

  async createApprovalRequest(input: ApprovalRequestCreateInput): Promise<ApprovalRequest> {
    await (
      await this.getDb()
    )
      .insert(approvalRequests)
      .values({
        id: input.id,
        sessionId: input.sessionId,
        platform: input.platform,
        userId: input.userId,
        agentId: input.agentId,
        policyId: input.policy.id,
        toolName: input.toolName,
        toolInput: serializeJson(input.toolInput) ?? '{}',
        status: input.status,
        platformMessageId: input.platformMessageId ?? null,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt ?? null,
      })
      .execute();

    return {
      id: input.id,
      sessionId: input.sessionId,
      platform: input.platform,
      userId: input.userId,
      agentId: input.agentId,
      tool: {
        name: input.toolName,
        input: input.toolInput,
      },
      policy: input.policy,
      status: input.status,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    };
  }

  async updateApprovalRequest(
    id: string,
    input: ApprovalRequestUpdateInput
  ): Promise<ApprovalRequest | null> {
    const updateData: Record<string, unknown> = {};
    if (input.status) updateData.status = input.status;
    if (input.platformMessageId !== undefined)
      updateData.platformMessageId = input.platformMessageId ?? null;
    if (input.resolvedAt) updateData.resolvedAt = input.resolvedAt;
    if (input.resolvedBy !== undefined) updateData.resolvedBy = input.resolvedBy ?? null;
    if (input.expiresAt !== undefined) updateData.expiresAt = input.expiresAt ?? null;

    if (Object.keys(updateData).length === 0) {
      return this.getApprovalRequest(id);
    }

    const rows = await (await this.getDb())
      .update(approvalRequests)
      .set(updateData)
      .where(eq(approvalRequests.id, id))
      .returning();

    const row = rows[0];
    if (!row) return null;
    return this.mapApprovalRequest(row);
  }

  async getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
    const rows = await (await this.getDb())
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, id));
    const row = rows[0];
    if (!row) return null;
    return this.mapApprovalRequest(row);
  }

  async listApprovalRequests(filter: ApprovalRequestFilter): Promise<ApprovalRequest[]> {
    const conditions = [];
    if (filter.id) conditions.push(eq(approvalRequests.id, filter.id));
    if (filter.sessionId) conditions.push(eq(approvalRequests.sessionId, filter.sessionId));
    if (filter.platform) conditions.push(eq(approvalRequests.platform, filter.platform));
    if (filter.userId) conditions.push(eq(approvalRequests.userId, filter.userId));
    if (filter.agentId) conditions.push(eq(approvalRequests.agentId, filter.agentId));
    if (filter.status) conditions.push(eq(approvalRequests.status, filter.status));

    const rows = conditions.length
      ? await (
          await this.getDb()
        )
          .select()
          .from(approvalRequests)
          .where(and(...conditions))
      : await (await this.getDb()).select().from(approvalRequests);

    const mapped = [];
    for (const row of rows) {
      mapped.push(await this.mapApprovalRequest(row));
    }
    return mapped;
  }

  async listApprovalGrants(filter: ApprovalGrantFilter): Promise<ApprovalGrant[]> {
    const conditions = [
      eq(approvalGrants.sessionId, filter.sessionId),
      eq(approvalGrants.userId, filter.userId),
    ];
    if (filter.grantType) {
      conditions.push(eq(approvalGrants.grantType, filter.grantType));
    }
    if (filter.grantValue) {
      conditions.push(eq(approvalGrants.grantValue, filter.grantValue));
    }

    const rows = await (
      await this.getDb()
    )
      .select()
      .from(approvalGrants)
      .where(and(...conditions));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((row: any) => ({
      id: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      grantType: row.grantType as ApprovalGrant['grantType'],
      grantValue: row.grantValue,
      expiresAt: row.expiresAt ?? undefined,
      createdAt: row.createdAt ?? new Date(),
    }));
  }

  async createApprovalGrant(
    grant: Omit<ApprovalGrant, 'id' | 'createdAt'>
  ): Promise<ApprovalGrant> {
    const rows = await (
      await this.getDb()
    )
      .insert(approvalGrants)
      .values({
        sessionId: grant.sessionId,
        userId: grant.userId,
        grantType: grant.grantType,
        grantValue: grant.grantValue,
        expiresAt: grant.expiresAt ?? null,
      })
      .returning();

    const row = rows[0];
    return {
      id: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      grantType: row.grantType as ApprovalGrant['grantType'],
      grantValue: row.grantValue,
      expiresAt: row.expiresAt ?? undefined,
      createdAt: row.createdAt ?? new Date(),
    };
  }

  async deleteApprovalGrants(filter: ApprovalGrantFilter): Promise<number> {
    const conditions = [
      eq(approvalGrants.sessionId, filter.sessionId),
      eq(approvalGrants.userId, filter.userId),
    ];
    if (filter.grantType) {
      conditions.push(eq(approvalGrants.grantType, filter.grantType));
    }
    if (filter.grantValue) {
      conditions.push(eq(approvalGrants.grantValue, filter.grantValue));
    }
    const rows = await (
      await this.getDb()
    )
      .delete(approvalGrants)
      .where(and(...conditions))
      .returning();
    return rows.length;
  }

  private async mapApprovalRequest(
    row: typeof approvalRequests.$inferSelect
  ): Promise<ApprovalRequest> {
    let policy: PermissionPolicy | undefined;
    if (row.policyId) {
      const policyRows = await (await this.getDb())
        .select()
        .from(permissionPolicies)
        .where(eq(permissionPolicies.id, row.policyId));
      if (policyRows[0]) {
        policy = mapPolicy(policyRows[0]);
      }
    }

    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = JSON.parse(row.toolInput ?? '{}') as Record<string, unknown>;
    } catch {
      parsedInput = {};
    }

    return {
      id: row.id,
      sessionId: row.sessionId,
      platform: row.platform,
      userId: row.userId,
      agentId: row.agentId,
      tool: {
        name: row.toolName,
        input: parsedInput,
      },
      policy:
        policy ??
        ({
          id: row.policyId ?? 'unknown',
          name: 'Unknown policy',
          toolPatterns: [],
          action: 'ask',
          granularity: 'per_call',
          riskLevel: 'low',
        } as PermissionPolicy),
      status: row.status as ApprovalRequest['status'],
      createdAt: row.createdAt ?? new Date(),
      resolvedAt: row.resolvedAt ?? undefined,
      resolvedBy: row.resolvedBy ?? undefined,
      expiresAt: row.expiresAt ?? undefined,
    };
  }
}
