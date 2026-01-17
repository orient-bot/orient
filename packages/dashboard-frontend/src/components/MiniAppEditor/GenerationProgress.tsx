/**
 * GenerationProgress
 *
 * Animated progress indicator shown during code generation and building.
 */

import { Loader2, Code2, Hammer } from 'lucide-react';

interface GenerationProgressProps {
  stage?: 'generating' | 'building' | 'complete';
}

export default function GenerationProgress({ stage = 'generating' }: GenerationProgressProps) {
  return (
    <div className="mt-6 p-6 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
      <div className="space-y-4">
        {/* Generating Stage */}
        <div className="flex items-center gap-3">
          {stage === 'generating' ? (
            <Loader2 className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-spin" />
          ) : (
            <Code2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          )}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Generating code with OpenCode...
          </span>
        </div>

        {/* Building Stage */}
        {(stage === 'building' || stage === 'complete') && (
          <div className="flex items-center gap-3">
            {stage === 'building' ? (
              <Loader2 className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-spin" />
            ) : (
              <Hammer className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Building app...
            </span>
          </div>
        )}

        {/* Animated dots */}
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
