import { useMemo } from 'react';

export interface ApprovalQueueItem {
  id: string;
  toolName: string;
  agentId: string;
  userId: string;
  platform: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

interface ApprovalQueueProps {
  items: ApprovalQueueItem[];
  isLoading?: boolean;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

const RISK_COLOR: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export default function ApprovalQueue({ items, isLoading, onApprove, onDeny }: ApprovalQueueProps) {
  const pendingItems = useMemo(() => items.filter((item) => item.status === 'pending'), [items]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading approvals...</div>;
  }

  if (pendingItems.length === 0) {
    return <div className="text-sm text-muted-foreground">No pending approvals.</div>;
  }

  return (
    <div className="space-y-3">
      {pendingItems.map((item) => (
        <div key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{item.toolName}</p>
              <p className="text-xs text-muted-foreground">
                Agent: {item.agentId} · Platform: {item.platform}
              </p>
              <p className="text-xs text-muted-foreground">Requested by {item.userId}</p>
            </div>
            {item.riskLevel && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${RISK_COLOR[item.riskLevel]}`}>
                {item.riskLevel.toUpperCase()}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button className="btn btn-outline h-8 text-xs" onClick={() => onDeny(item.id)}>
                Deny
              </button>
              <button className="btn btn-primary h-8 text-xs" onClick={() => onApprove(item.id)}>
                Approve
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
