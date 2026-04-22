import { Play } from 'lucide-react';

interface ResumeCardProps {
  gameName: string;
  roomId: string;
  onContinue: () => void;
  ctaLabel?: string;
}

/**
 * Shows a "continue last game" card pointing at an unfinished room.
 * Only rendered when the user has a resumable session.
 */
export function ResumeCard({
  gameName,
  roomId,
  onContinue,
  ctaLabel = 'Continue',
}: ResumeCardProps) {
  return (
    <div className="bg-card border-2 border-foreground rounded-[12px] p-3 shadow-card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          {gameName}
        </div>
        <div className="font-mono tracking-wider font-semibold text-sm text-foreground truncate">
          {roomId}
        </div>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground bg-primary text-primary-foreground rounded-[8px] px-3 font-semibold text-sm h-9 inline-flex items-center gap-1 transition-all"
      >
        <Play className="size-3.5" />
        {ctaLabel}
      </button>
    </div>
  );
}
