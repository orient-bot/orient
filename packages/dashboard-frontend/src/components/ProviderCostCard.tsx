import type { ProviderBilling, ModelCost, ServiceCost } from '../api';

interface ProviderCostCardProps {
  name: string;
  billing: ProviderBilling;
  icon: React.ReactNode;
  colorClass: string;
}

function formatCost(cost: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cost);
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

function isModelCost(item: ModelCost | ServiceCost): item is ModelCost {
  return 'model' in item;
}

export default function ProviderCostCard({ name, billing, icon, colorClass }: ProviderCostCardProps) {
  const hasBreakdown = billing.breakdown && billing.breakdown.length > 0;
  
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-surface-100">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-surface-500">{name}</p>
            <p className="text-2xl font-semibold text-surface-900 mt-1">
              {billing.available ? formatCost(billing.cost) : '—'}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
            {icon}
          </div>
        </div>
        
        {/* Status indicator */}
        {!billing.available && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{billing.error || 'Not configured'}</span>
          </div>
        )}
        
        {/* Additional metrics */}
        {billing.available && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-surface-500">
            {billing.tokenCount !== undefined && (
              <div>
                <span className="font-medium text-surface-700">{formatNumber(billing.tokenCount)}</span>
                <span className="ml-1">tokens</span>
              </div>
            )}
            {billing.storageGB !== undefined && (
              <div>
                <span className="font-medium text-surface-700">{billing.storageGB.toFixed(2)}</span>
                <span className="ml-1">GB</span>
              </div>
            )}
            {billing.operations !== undefined && (
              <div>
                <span className="font-medium text-surface-700">{formatNumber(billing.operations)}</span>
                <span className="ml-1">ops</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Breakdown */}
      {hasBreakdown && billing.available && (
        <div className="p-4 bg-surface-50 max-h-48 overflow-y-auto">
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-2">
            Breakdown
          </p>
          <div className="space-y-2">
            {billing.breakdown!.map((item, idx) => {
              const label = isModelCost(item) ? item.model : item.service;
              const tokens = isModelCost(item) 
                ? `${formatNumber(item.inputTokens + item.outputTokens)} tokens`
                : null;
              
              return (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="text-surface-700 truncate block">{label}</span>
                    {tokens && (
                      <span className="text-xs text-surface-400">{tokens}</span>
                    )}
                  </div>
                  <span className="font-medium text-surface-900 ml-3">
                    {formatCost(item.cost)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}



