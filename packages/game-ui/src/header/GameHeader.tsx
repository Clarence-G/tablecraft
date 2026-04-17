import { ArrowLeft, icons, LogOut, ScrollText, Settings } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface GameHeaderProps {
  gameName: string;
  /** Lucide icon name OR SVG filename (no extension) in `/game-icons/`. */
  icon?: string;
  roomId: string;
  elapsedSeconds: number;
  phase?: string;
  onBack?: () => void;
  onExit?: () => void;
  onRules?: () => void;
  onSettings?: () => void;
}

function formatElapsed(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(total % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function Icon({ name }: { name?: string }) {
  const Lucide =
    name && (icons as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (Lucide) return <Lucide className="size-5" />;
  if (name) {
    return (
      <img
        src={`/game-icons/${name}.svg`}
        alt=""
        className="size-5 object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return null;
}

export function GameHeader({
  gameName,
  icon,
  roomId,
  elapsedSeconds,
  phase,
  onBack,
  onExit,
  onRules,
  onSettings,
}: GameHeaderProps) {
  const { t } = useTranslation('game-ui');
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard may be unavailable in some environments
    }
  }

  return (
    <header
      data-testid="game-header"
      className="sticky top-0 z-40 h-[52px] sm:h-[44px] bg-card/80 backdrop-blur border-b border-border px-3 sm:px-4 flex items-center gap-2"
    >
      <button
        type="button"
        aria-label={t('header.back', { defaultValue: 'Back' })}
        onClick={onBack}
        className="p-1 rounded-[6px] hover:bg-secondary/60 transition-colors"
      >
        <ArrowLeft className="size-5" />
      </button>
      <Icon name={icon} />
      <span className="font-semibold truncate">{gameName}</span>
      <button
        type="button"
        data-testid="room-code-chip"
        onClick={copyCode}
        className="font-mono text-xs tracking-wider bg-secondary border border-border rounded-full px-2 py-0.5 hover:border-foreground transition-colors"
        aria-label={t('header.copyRoomCode', { defaultValue: 'Copy room code' })}
      >
        {copied ? t('header.copied', { defaultValue: 'Copied' }) : roomId}
      </button>

      <div className="flex-1 min-w-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{formatElapsed(elapsedSeconds)}</span>
        {phase && (
          <>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline truncate">{phase}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        {onRules && (
          <button
            type="button"
            aria-label={t('header.rules', { defaultValue: 'Rules' })}
            onClick={onRules}
            className="p-1 rounded-[6px] hover:bg-secondary/60 hidden sm:inline-flex"
          >
            <ScrollText className="size-4" />
          </button>
        )}
        {onSettings && (
          <button
            type="button"
            aria-label={t('header.settings', { defaultValue: 'Settings' })}
            onClick={onSettings}
            className="p-1 rounded-[6px] hover:bg-secondary/60 hidden sm:inline-flex"
          >
            <Settings className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={t('header.exit', { defaultValue: 'Exit' })}
          onClick={onExit}
          className="p-1 rounded-[6px] hover:bg-destructive/10 text-destructive"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}
