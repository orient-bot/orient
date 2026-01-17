export interface PermissionPolicyItem {
  id: string;
  name: string;
  action: 'allow' | 'deny' | 'ask';
  granularity: 'per_call' | 'per_session' | 'per_category';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  toolPatterns: string[];
  enabled: boolean;
}

interface PermissionPoliciesProps {
  policies: PermissionPolicyItem[];
  onToggle: (id: string, enabled: boolean) => void;
  onEdit?: (id: string) => void;
}

const ACTION_BADGE: Record<string, string> = {
  allow: 'bg-emerald-100 text-emerald-700',
  deny: 'bg-red-100 text-red-700',
  ask: 'bg-amber-100 text-amber-700',
};

export default function PermissionPolicies({ policies, onToggle, onEdit }: PermissionPoliciesProps) {
  if (policies.length === 0) {
    return <div className="text-sm text-muted-foreground">No policies configured yet.</div>;
  }

  return (
    <div className="space-y-3">
      {policies.map((policy) => (
        <div key={policy.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{policy.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ACTION_BADGE[policy.action]}`}>
                  {policy.action.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {policy.toolPatterns.join(', ')}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Granularity: {policy.granularity.replace('_', ' ')} · Risk: {policy.riskLevel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onEdit && (
                <button className="btn btn-ghost h-8 text-xs" onClick={() => onEdit(policy.id)}>
                  Edit
                </button>
              )}
              <button
                className="btn btn-outline h-8 text-xs"
                onClick={() => onToggle(policy.id, !policy.enabled)}
              >
                {policy.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
