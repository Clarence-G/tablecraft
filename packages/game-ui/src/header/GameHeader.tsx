import type { PlayerInfo } from '@repo/shared';
import Avatar from 'boring-avatars';
import { ArrowLeft, LogOut, ScrollText, Settings, icons } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface GameHeaderProps {
  gameName: string;
  /** Lucide icon name OR SVG filename (no extension) in `/game-icons/`. */
  icon?: string;
  roomId: string;
  elapsedSeconds: number;
  phase?: string;
  /** All players in the room. If provided, Header renders a compact avatar row. */
  players?: PlayerInfo[];
  /** ID of whoever's turn it is. Drives the center turn pill + avatar highlight. */
  currentPlayerId?: string;
  /** Local viewer's ID, for the "你的回合" self-turn wording. */
  myId?: string;
  onBack?: () => void;
  onExit?: () => void;
  onRules?: () => void;
  onSettings?: () => void;
}

const AVATAR_COLORS = ['#d94040', '#2563eb', '#16a34a', '#d97706', '#7c3aed'];

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
  if (Lucide) return <Lucide className="size-[18px]" />;
  if (name) {
    return (
      <img
        src={`/game-icons/${name}.svg`}
        alt=""
        className="size-[18px] object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return null;
}

const iconBtn =
  'flex items-center justify-center size-9 rounded-[10px] border-2 border-foreground bg-card shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active transition-all';

function CompactPlayer({
  player,
  isCurrentTurn,
  isMe,
}: {
  player: PlayerInfo;
  isCurrentTurn: boolean;
  isMe: boolean;
}) {
  return (
    <div
      data-testid={`header-player-${player.id}`}
      className={`flex items-center gap-1.5 rounded-[10px] px-1.5 py-0.5 border-2 transition-all ${
        isCurrentTurn
          ? 'bg-[#fef3e0] border-warning shadow-button'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="relative shrink-0">
        <Avatar name={player.name} size={24} variant="beam" colors={AVATAR_COLORS} />
        {!player.connected && (
          <span className="absolute inset-0 rounded-full bg-card/70 border border-border" />
        )}
      </div>
      <span
        className={`text-xs font-semibold hidden md:inline truncate max-w-[80px] ${
          isCurrentTurn ? 'text-[#7a4006]' : 'text-foreground'
        }`}
      >
        {player.name}
        {isMe ? '·你' : ''}
      </span>
    </div>
  );
}

export function GameHeader({
  gameName,
  icon,
  roomId,
  elapsedSeconds,
  phase,
  players,
  currentPlayerId,
  myId,
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

  const currentPlayer = players?.find((p) => p.id === currentPlayerId);
  const isMyTurn = !!myId && currentPlayerId === myId;
  const turnLabel = currentPlayer
    ? isMyTurn
      ? t('header.yourTurn', { defaultValue: '你的回合' })
      : t('header.playerTurn', {
          defaultValue: '{{name}} 的回合',
          name: currentPlayer.name,
        })
    : null;

  return (
    <header
      data-testid="game-header"
      className="sticky top-0 z-40 h-[56px] bg-card border-b-2 border-foreground px-2 sm:px-5 flex items-center gap-2 sm:gap-3"
    >
      {/* Left: back + identity */}
      <button
        type="button"
        aria-label={t('header.back', { defaultValue: 'Back' })}
        onClick={onBack}
        className={iconBtn}
      >
        <ArrowLeft className="size-4" />
      </button>

      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
        {icon && (
          <span className="flex items-center justify-center size-9 rounded-[10px] bg-[#fef3e0] border-2 border-warning text-[#7a4006] shadow-button shrink-0">
            <Icon name={icon} />
          </span>
        )}
        <span className="font-bold text-base text-foreground truncate leading-none hidden sm:inline">
          {gameName}
        </span>
        <button
          type="button"
          data-testid="room-code-chip"
          onClick={copyCode}
          aria-label={t('header.copyRoomCode', { defaultValue: 'Copy room code' })}
          className="font-mono text-xs font-bold tracking-widest bg-secondary border-2 border-foreground text-foreground rounded-[8px] px-2.5 py-1 shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active transition-all"
        >
          {copied ? t('header.copied', { defaultValue: 'Copied' }) : roomId}
        </button>
      </div>

      {/* Center: turn indicator + phase + elapsed */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2">
        {turnLabel ? (
          <span
            data-testid="header-turn-indicator"
            className={`inline-flex items-center gap-1 sm:gap-1.5 border-2 rounded-[10px] px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm font-bold shadow-button transition-all max-w-full min-w-0 ${
              isMyTurn
                ? 'bg-[#fef3e0] border-warning text-[#7a4006] animate-[pulse_2.4s_ease-in-out_infinite]'
                : 'bg-card border-foreground text-foreground'
            }`}
          >
            <span
              className={`inline-block size-2 rounded-full shrink-0 ${
                isMyTurn ? 'bg-warning' : 'bg-muted-foreground'
              }`}
            />
            <span className="truncate">{turnLabel}</span>
          </span>
        ) : null}
        {phase && (
          <span className="hidden sm:inline-flex text-xs font-semibold text-muted-foreground truncate max-w-[20vw]">
            {phase}
          </span>
        )}
        <span className="hidden sm:inline-flex items-center gap-1.5 bg-[#f0e8d8] border-2 border-border rounded-full px-2.5 py-0.5 text-xs font-mono font-bold text-[#6b5744] tabular-nums shrink-0">
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>

      {/* Right: player avatars + rules / settings / exit */}
      <div className="flex items-center gap-1.5 shrink-0">
        {players && players.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 mr-1">
            {players.map((p) => (
              <CompactPlayer
                key={p.id}
                player={p}
                isCurrentTurn={p.id === currentPlayerId}
                isMe={p.id === myId}
              />
            ))}
          </div>
        )}
        {onRules && (
          <button
            type="button"
            aria-label={t('header.rules', { defaultValue: 'Rules' })}
            onClick={onRules}
            className={`${iconBtn} hidden sm:inline-flex`}
          >
            <ScrollText className="size-4" />
          </button>
        )}
        {onSettings && (
          <button
            type="button"
            aria-label={t('header.settings', { defaultValue: 'Settings' })}
            onClick={onSettings}
            className={`${iconBtn} hidden sm:inline-flex`}
          >
            <Settings className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={t('header.exit', { defaultValue: 'Exit' })}
          onClick={onExit}
          className="flex items-center justify-center size-9 rounded-[10px] border-2 border-destructive bg-[#fde8e8] text-destructive shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active transition-all"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}
