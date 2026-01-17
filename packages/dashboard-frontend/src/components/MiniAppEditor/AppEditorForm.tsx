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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          What would you like to build or change?
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={disabled}
          placeholder="E.g., Create a todo list app with add, complete, and delete features. Style it with Tailwind using a modern card design..."
          className="w-full h-32 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {prompt.length} / {minLength} characters minimum
          </p>
          {!isValid && prompt.length > 0 && (
            <p className="text-xs text-red-500">
              Please enter at least {minLength} characters
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={!isValid || disabled}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Sparkles className="h-5 w-5" />
        {disabled ? 'Generating...' : 'Generate Code'}
      </button>
    </form>
  );
}
