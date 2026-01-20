/**
 * WhatsAppService Component
 *
 * Wrapper for WhatsApp service pages that includes:
 * - Collapsible system prompt section
 * - Chat list (configured or discover mode)
 */

import { useState } from 'react';
import ChatList from './ChatList';
import { PlatformPromptSection } from './prompts';

interface WhatsAppServiceProps {
  onUpdate?: () => void;
}

export default function WhatsAppService({ onUpdate }: WhatsAppServiceProps) {
  const [promptsExpanded, setPromptsExpanded] = useState(false);

  return (
    <div className="space-y-6">
      {/* Collapsible System Prompt Section */}
      <details
        className="card border-border"
        open={promptsExpanded}
        onToggle={(e) => setPromptsExpanded((e.target as HTMLDetailsElement).open)}
      >
        <summary className="px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-lg">
          <div className="flex items-center gap-3">
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform ${promptsExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                />
              </svg>
              <span className="font-medium text-foreground">System Prompt</span>
              <span className="text-xs text-muted-foreground">(customize AI behavior)</span>
            </div>
          </div>
        </summary>
        <div className="px-4 pb-4 pt-2 border-t border-border mt-2">
          <PlatformPromptSection platform="whatsapp" onUpdate={onUpdate} />
        </div>
      </details>

      {/* Chat List */}
      <ChatList onUpdate={onUpdate ?? (() => {})} />
    </div>
  );
}
