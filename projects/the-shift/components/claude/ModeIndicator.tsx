'use client';

type Mode = 'plan' | 'act' | 'ask' | 'agent';

interface ModeIndicatorProps {
  mode: Mode;
  className?: string;
}

const modeConfig: Record<Mode, { label: string; bgClass: string; textClass: string }> = {
  plan: {
    label: 'PLAN MODE',
    bgClass: 'bg-amber-500/20 dark:bg-amber-400/20',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  act: {
    label: 'ACT MODE',
    bgClass: 'bg-green-500/20 dark:bg-green-400/20',
    textClass: 'text-green-700 dark:text-green-400',
  },
  ask: {
    label: 'ASK MODE',
    bgClass: 'bg-blue-500/20 dark:bg-blue-400/20',
    textClass: 'text-blue-700 dark:text-blue-400',
  },
  agent: {
    label: 'AGENT MODE',
    bgClass: 'bg-gray-500/20 dark:bg-gray-400/20',
    textClass: 'text-gray-700 dark:text-gray-400',
  },
};

export default function ModeIndicator({ mode, className = '' }: ModeIndicatorProps) {
  const config = modeConfig[mode];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2 py-1 rounded
        font-mono text-xs font-semibold
        border border-current/20
        ${config.bgClass}
        ${config.textClass}
        ${className}
      `}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {config.label}
    </span>
  );
}
