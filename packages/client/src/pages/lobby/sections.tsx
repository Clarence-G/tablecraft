import { Button } from '@/components/ui/button';
import { QuickJoinInput } from '@repo/game-ui/input';
import { Stat } from '@repo/game-ui/stat';
import type { RoomSummary } from '@repo/shared';
import { Plus, Users } from 'lucide-react';

/**
 * Card-styled hero frame with a warm illustrated background bleeding in from
 * the right. A cream gradient overlay keeps the left side legible so copy and
 * CTAs don't fight the artwork.
 *
 * Sized for a generous ~2.6:1 banner ratio on desktop (taller than the flat
 * content-hugging card we used pre-illustration) so the hand-drawn hexes,
 * meeples and dice have room to breathe. On mobile we drop to a shorter fixed
 * min-height so the illustration reads as ambient texture, not content.
 *
 * Layered top-to-bottom:
 *   1. bg-card (fallback if image fails)
 *   2. <img> — right-anchored hero illustration, absolute inset
 *   3. cream gradient overlay (left opaque → right transparent)
 *   4. children (original Hero content, z-10)
 */
function HeroShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="relative overflow-hidden bg-card border-thick border-foreground rounded-[16px] shadow-card min-h-[200px] sm:min-h-[260px] md:min-h-[320px]"
    >
      <img
        src="/hero-bg.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-right opacity-90"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 35%, hsl(var(--card) / 0.55) 60%, hsl(var(--card) / 0) 100%)',
        }}
      />
      <div className="relative z-10 h-full p-5 sm:p-8 md:p-10 flex flex-col justify-center gap-4">
        {children}
      </div>
    </section>
  );
}

interface HeroGuestProps {
  welcome: string;
  cta: string;
  onCreateRoom: () => void;
  createRoomLabel: string;
}

export function HeroGuest({ welcome, cta, onCreateRoom, createRoomLabel }: HeroGuestProps) {
  return (
    <HeroShell>
      <div className="max-w-[60%] sm:max-w-[55%]">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground leading-tight">
          {welcome}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">{cta}</p>
        <div className="mt-5">
          <Button
            onClick={onCreateRoom}
            className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground rounded-[10px] px-5 font-semibold text-sm sm:text-base h-11"
          >
            <Plus className="size-4" />
            {createRoomLabel}
          </Button>
        </div>
      </div>
    </HeroShell>
  );
}

interface HeroLoggedInProps {
  points: number;
  rank: number | null;
  onCreateRoom: () => void;
  welcome: string;
  pointsLabel: string;
  rankLabel: string;
  createRoomLabel: string;
}

export function HeroLoggedIn({
  points,
  rank,
  onCreateRoom,
  welcome,
  pointsLabel,
  rankLabel,
  createRoomLabel,
}: HeroLoggedInProps) {
  return (
    <HeroShell>
      <div className="max-w-[60%] sm:max-w-[55%]">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground leading-tight">
          {welcome}
        </h1>
        <div className="mt-5 flex gap-3 flex-wrap items-center">
          <Stat label={pointsLabel} value={points} big />
          <Stat label={rankLabel} value={rank === null ? '—' : `#${rank}`} big />
          <Button
            onClick={onCreateRoom}
            className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground rounded-[10px] px-5 font-semibold text-sm sm:text-base h-11"
          >
            <Plus className="size-4" />
            {createRoomLabel}
          </Button>
        </div>
      </div>
    </HeroShell>
  );
}

interface QuickJoinBarProps {
  onQuickJoin: (code: string) => void;
  placeholder: string;
  joinLabel: string;
}

/**
 * Standalone quick-join row. Originally lived inside the Hero but moved out
 * so the hero illustration isn't obscured by an input field. Now sits above
 * the Active Rooms section where "enter a room code" is semantically closest.
 */
export function QuickJoinBar({ onQuickJoin, placeholder, joinLabel }: QuickJoinBarProps) {
  return (
    <div className="flex justify-end">
      <QuickJoinInput onSubmit={onQuickJoin} placeholder={placeholder} buttonLabel={joinLabel} />
    </div>
  );
}

interface RoomCardProps {
  room: RoomSummary;
  onJoin: () => void;
  joinLabel: string;
  disabled: boolean;
}

/** Horizontally-scrolled room card used in the Active rooms carousel. */
export function RoomCard({ room, onJoin, joinLabel, disabled }: RoomCardProps) {
  return (
    <div className="snap-start shrink-0 w-[220px] bg-card border-2 border-foreground rounded-[12px] shadow-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono tracking-wider font-semibold text-sm">{room.roomId}</span>
        <span className="text-xs font-semibold bg-[#fef3e0] text-[#7a4006] border border-warning rounded-full px-1.5 py-0.5 truncate max-w-[100px]">
          {room.gameName}
        </span>
      </div>
      <div className="text-xs text-muted-foreground truncate">{room.hostName}</div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5">
          <Users className="size-3" />
          {room.playerCount}/{room.maxPlayers}
        </span>
        <Button
          onClick={onJoin}
          disabled={disabled}
          size="sm"
          className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground rounded-[8px] px-2.5 font-semibold text-xs h-7"
        >
          <Plus className="size-3" />
          {joinLabel}
        </Button>
      </div>
    </div>
  );
}
