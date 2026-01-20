/**
 * MissingCapabilitiesBadge
 *
 * Displays a warning badge and tooltip for apps with missing required capabilities.
 */

import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface MissingCapabilitiesBadgeProps {
  missingCapabilities: string[];
}

export default function MissingCapabilitiesBadge({
  missingCapabilities,
}: MissingCapabilitiesBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (missingCapabilities.length === 0) {
    return null;
  }

  const capabilityLabels: Record<string, string> = {
    storage: 'Storage (Database)',
    scheduler: 'Scheduler (Cron Jobs)',
    webhooks: 'Webhooks',
  };

  const capabilityDescriptions: Record<string, string> = {
    storage: 'This app requires database storage to persist data',
    scheduler: 'This app requires scheduled job execution',
    webhooks: 'This app requires webhook endpoints',
  };

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
        aria-label={`${missingCapabilities.length} unsupported capability${missingCapabilities.length !== 1 ? 'ies' : ''}`}
      >
        <AlertTriangle className="h-3 w-3" />
        <span>Unsupported</span>
      </button>

      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-lg shadow-lg p-3 z-10 min-w-max max-w-xs">
          <p className="text-xs font-medium text-foreground mb-2">
            This app requires capabilities not available in this environment:
          </p>
          <ul className="space-y-2 mb-3">
            {missingCapabilities.map((capability) => (
              <li key={capability} className="text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive mt-1 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-foreground">
                      {capabilityLabels[capability] || capability}
                    </div>
                    <div className="text-muted-foreground">
                      {capabilityDescriptions[capability] || ''}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Contact your administrator to enable these features.
          </p>
        </div>
      )}
    </div>
  );
}
