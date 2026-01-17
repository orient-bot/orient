import type {
  ApprovalPromptResult,
  ApprovalRequest,
  ApprovalResult,
  PlatformContext,
} from '../types.js';
import type { PlatformApprovalAdapter } from './base.js';

export interface WhatsAppMessenger {
  sendMessage(jid: string, text: string): Promise<void>;
}

export interface WhatsAppMessage {
  body?: string;
  reaction?: string;
  from?: string;
  senderId?: string;
}

export class WhatsAppApprovalAdapter implements PlatformApprovalAdapter {
  platform = 'whatsapp';
  supportsNativeApproval = true;
  supportedInteractionTypes = ['reply', 'reaction'] as const;

  constructor(
    private messenger: WhatsAppMessenger,
    private dashboardUrl?: string
  ) {}

  async requestApproval(
    request: ApprovalRequest,
    context: PlatformContext
  ): Promise<ApprovalPromptResult> {
    const message = this.formatApprovalPrompt(request) as string;
    const jid = context.chatId ?? context.sessionId;
    await this.messenger.sendMessage(jid, message);
    return { requestId: request.id };
  }

  async handleApprovalResponse(response: WhatsAppMessage): Promise<ApprovalResult | null> {
    const text = response.body?.trim().toLowerCase();
    if (text === 'approve' || text === 'yes') {
      return {
        requestId: this.extractRequestId(response.body ?? ''),
        status: 'approved',
        resolvedBy: response.senderId ?? response.from,
        resolvedAt: new Date(),
      };
    }
    if (text === 'deny' || text === 'no') {
      return {
        requestId: this.extractRequestId(response.body ?? ''),
        status: 'denied',
        resolvedBy: response.senderId ?? response.from,
        resolvedAt: new Date(),
      };
    }

    if (response.reaction === '👍') {
      return {
        requestId: this.extractRequestId(response.body ?? ''),
        status: 'approved',
        resolvedBy: response.senderId ?? response.from,
        resolvedAt: new Date(),
      };
    }
    if (response.reaction === '👎') {
      return {
        requestId: this.extractRequestId(response.body ?? ''),
        status: 'denied',
        resolvedBy: response.senderId ?? response.from,
        resolvedAt: new Date(),
      };
    }
    return null;
  }

  async cancelRequest(_requestId: string): Promise<void> {
    return;
  }

  formatApprovalPrompt(request: ApprovalRequest): unknown {
    const dashboardLine = this.dashboardUrl
      ? `You can also approve in the dashboard: ${this.dashboardUrl}/approvals/${request.id}`
      : 'You can also approve in the dashboard.';

    return [
      `Approval required`,
      `Agent "${request.agentId}" wants to run "${request.tool.name}".`,
      `Reply with YES/NO or APPROVE/DENY.`,
      `Request ID: ${request.id}`,
      dashboardLine,
    ].join('\n');
  }

  formatApprovalResult(result: ApprovalResult): unknown {
    return `Approval ${result.status}.`;
  }

  private extractRequestId(text: string): string {
    const match = text.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    return match?.[0] ?? '';
  }
}
