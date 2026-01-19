/**
 * PromptCard Component
 *
 * Display card for a prompt (default or custom).
 */

import type { PromptPlatform } from '../../api';

interface PromptCardProps {
  platform: PromptPlatform;
  promptText: string;
  displayName?: string;
  isDefault?: boolean;
  onEdit: () => void;
}

export function PromptCard({
  platform,
  promptText,
  displayName,
  isDefault = false,
  onEdit,
}: PromptCardProps) {
  return (
    <div className="card p-6 border-border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {platform === 'whatsapp' ? (
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-emerald-700 dark:text-emerald-400"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              </svg>
            </div>
          ) : (
            <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-violet-700 dark:text-violet-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
              </svg>
            </div>
          )}
          <div>
            <h3 className="font-semibold text-foreground">
              {displayName || (platform === 'whatsapp' ? 'WhatsApp' : 'Slack')}{' '}
              {isDefault && 'Default'}
            </h3>
            {isDefault && (
              <p className="text-xs text-muted-foreground">Used when no custom prompt is set</p>
            )}
          </div>
        </div>
        <button onClick={onEdit} className="btn btn-secondary text-sm py-1.5 px-3">
          Edit
        </button>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 max-h-48 overflow-y-auto border border-border">
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
          {promptText.slice(0, 500)}
          {promptText.length > 500 && '...'}
        </pre>
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        {promptText.length.toLocaleString()} characters
      </div>
    </div>
  );
}
