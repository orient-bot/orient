import { assetUrl } from '../api';

interface OnboarderBubbleProps {
  isOpen: boolean;
  onClick: () => void;
  showPulse?: boolean;
}

export default function OnboarderBubble({ isOpen, onClick, showPulse }: OnboarderBubbleProps) {
  return (
    <button
      type="button"
      className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-lg transition hover:bg-accent ${
        showPulse ? 'animate-pulse' : ''
      }`}
      onClick={onClick}
      aria-label="Open Ori onboarding chat"
    >
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
        <img
          src={assetUrl('/mascot/variations/agents.png')}
          alt="Ori"
          className="w-6 h-6 object-contain"
        />
      </div>
      <div className="flex flex-col items-start text-left">
        <span className="text-xs font-medium text-foreground">
          {isOpen ? 'Close Ori' : 'Ask Ori'}
        </span>
        <span className="text-[10px] text-muted-foreground">Onboarding help</span>
      </div>
    </button>
  );
}
