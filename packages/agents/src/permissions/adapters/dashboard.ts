import type {
  ApprovalPromptResult,
  ApprovalRequest,
  ApprovalResult,
  PlatformContext,
} from '../types.js';
import type { PlatformApprovalAdapter } from './base.js';

export interface DashboardApprovalNotifier {
  onApprovalRequested?(request: ApprovalRequest, context: PlatformContext): void | Promise<void>;
}

export class DashboardApprovalAdapter implements PlatformApprovalAdapter {
  platform = 'dashboard';
  supportsNativeApproval = true;
  supportedInteractionTypes = ['button', 'modal', 'link'] as const;

  constructor(private notifier?: DashboardApprovalNotifier) {}

  async requestApproval(
    request: ApprovalRequest,
    context: PlatformContext
  ): Promise<ApprovalPromptResult> {
    if (this.notifier?.onApprovalRequested) {
      await this.notifier.onApprovalRequested(request, context);
    }
    return { requestId: request.id };
  }

  async handleApprovalResponse(response: {
    requestId: string;
    approved: boolean;
    resolvedBy?: string;
  }) {
    return {
      requestId: response.requestId,
      status: response.approved ? 'approved' : 'denied',
      resolvedBy: response.resolvedBy,
      resolvedAt: new Date(),
    } satisfies ApprovalResult;
  }

  async cancelRequest(_requestId: string): Promise<void> {
    return;
  }

  formatApprovalPrompt(request: ApprovalRequest): unknown {
    return {
      title: 'Approval required',
      requestId: request.id,
      toolName: request.tool.name,
      agentId: request.agentId,
    };
  }

  formatApprovalResult(result: ApprovalResult): unknown {
    return {
      requestId: result.requestId,
      status: result.status,
    };
  }
}
