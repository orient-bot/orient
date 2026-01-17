import type {
  ApprovalPromptResult,
  ApprovalRequest,
  ApprovalResult,
  Platform,
  PlatformContext,
} from '../types.js';

export type InteractionType = 'button' | 'reaction' | 'reply' | 'modal' | 'link';

export interface PlatformApprovalAdapter {
  platform: Platform;
  supportsNativeApproval: boolean;
  supportedInteractionTypes: readonly InteractionType[];

  requestApproval(
    request: ApprovalRequest,
    context: PlatformContext
  ): Promise<ApprovalPromptResult>;

  handleApprovalResponse(response: unknown): Promise<ApprovalResult | null>;

  cancelRequest(requestId: string): Promise<void>;

  formatApprovalPrompt(request: ApprovalRequest): unknown;
  formatApprovalResult(result: ApprovalResult): unknown;
}
