/**
 * MissingIntegrationsBadge
 *
 * Displays a warning badge and tooltip for apps with missing required integrations.
 */

import { AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface MissingIntegrationsBadgeProps {
  missingIntegrations: string[];
}

export default function MissingIntegrationsBadge({
  missingIntegrations,
}: MissingIntegrationsBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (missingIntegrations.length === 0) {
    return null;
  }

  const integrationLabels: Record<string, string> = {
    google: 'Google',
    slack: 'Slack',
    calendar: 'Google Calendar',
    docs: 'Google Docs',
    sheets: 'Google Sheets',
    jira: 'Jira',
    system: 'System',
  };

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
        aria-label={`${missingIntegrations.length} missing integration${missingIntegrations.length !== 1 ? 's' : ''}`}
      >
        <AlertCircle className="h-3 w-3" />
        <span>{missingIntegrations.length} missing</span>
      </button>

      {showTooltip && (
        <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-lg shadow-lg p-3 z-10 min-w-max">
          <p className="text-xs font-medium text-foreground mb-2">This app requires setup:</p>
          <ul className="space-y-1 mb-3">
            {missingIntegrations.map((integration) => (
              <li
                key={integration}
                className="text-xs text-muted-foreground flex items-center gap-2"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                {integrationLabels[integration] || integration}
              </li>
            ))}
          </ul>
          <a
            href="/settings/integrations"
            className="text-xs text-primary hover:text-primary/90 font-medium"
          >
            Go to Settings →
          </a>
        </div>
      )}
    </div>
  );
}
