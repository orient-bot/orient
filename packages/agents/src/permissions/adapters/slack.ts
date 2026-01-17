import type {
  ApprovalPromptResult,
  ApprovalRequest,
  ApprovalResult,
  PlatformContext,
} from '../types.js';
import type { PlatformApprovalAdapter } from './base.js';

interface SlackMessage {
  channel: string;
  text: string;
  blocks?: unknown[];
  threadTs?: string;
}

interface SlackMessageResult {
  ts?: string;
  channel?: string;
}

export interface SlackMessenger {
  postMessage(message: SlackMessage): Promise<SlackMessageResult>;
  updateMessage?(message: SlackMessage & { ts: string }): Promise<SlackMessageResult>;
}

export interface SlackInteractionPayload {
  actions: Array<{ action_id: string; value?: string }>;
  response_url?: string;
  user?: { id?: string };
  message?: { ts?: string };
  channel?: { id?: string };
}

export class SlackApprovalAdapter implements PlatformApprovalAdapter {
  platform = 'slack';
  supportsNativeApproval = true;
  supportedInteractionTypes = ['button', 'modal'] as const;

  constructor(private messenger: SlackMessenger) {}

  async requestApproval(
    request: ApprovalRequest,
    context: PlatformContext
  ): Promise<ApprovalPromptResult> {
    const blocks = this.formatApprovalPrompt(request) as unknown[];
    const result = await this.messenger.postMessage({
      channel: context.channelId ?? context.sessionId,
      threadTs: context.threadId,
      text: `Approval required: ${request.tool.name}`,
      blocks,
    });

    return {
      requestId: request.id,
      platformMessageId: result.ts,
    };
  }

  async handleApprovalResponse(response: SlackInteractionPayload): Promise<ApprovalResult | null> {
    const action = response.actions?.[0];
    if (!action?.value) return null;

    const status = action.action_id === 'approve' ? 'approved' : 'denied';
    return {
      requestId: action.value,
      status,
      resolvedBy: response.user?.id,
      resolvedAt: new Date(),
    };
  }

  async cancelRequest(_requestId: string): Promise<void> {
    return;
  }

  formatApprovalPrompt(request: ApprovalRequest): unknown {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Approval required*\nAgent \`${request.agentId}\` wants to run \`${request.tool.name}\`.`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'approve',
            text: { type: 'plain_text', text: 'Approve' },
            style: 'primary',
            value: request.id,
          },
          {
            type: 'button',
            action_id: 'deny',
            text: { type: 'plain_text', text: 'Deny' },
            style: 'danger',
            value: request.id,
          },
        ],
      },
    ];
  }

  formatApprovalResult(result: ApprovalResult): unknown {
    const status = result.status === 'approved' ? 'approved' : 'denied';
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Approval ${status}.`,
      },
    };
  }
}
