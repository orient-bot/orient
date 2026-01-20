/**
 * AppEditorForm
 *
 * Form component for entering AI prompts to edit miniapps.
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface AppEditorFormProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  initialPrompt?: string;
}

export default function AppEditorForm({
  onSubmit,
  disabled = false,
  initialPrompt = '',
}: AppEditorFormProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const minLength = 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim().length >= minLength && !disabled) {
      onSubmit(prompt.trim());
      setPrompt(''); // Clear for next prompt
    }
  };

  const isValid = prompt.trim().length >= minLength;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          What would you like to build or change?
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={disabled}
          placeholder="E.g., Create a todo list app with add, complete, and delete features. Style it with Tailwind using a modern card design..."
          className="input resize-none h-32"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {prompt.length} / {minLength} characters minimum
          </p>
          {!isValid && prompt.length > 0 && (
            <p className="text-xs text-destructive">Please enter at least {minLength} characters</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={!isValid || disabled}
        className="btn btn-primary w-full flex items-center justify-center gap-2"
      >
        <Sparkles className="h-5 w-5" />
        {disabled ? 'Generating...' : 'Generate Code'}
      </button>
    </form>
  );
}
