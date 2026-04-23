import { Button } from '@/components/ui/button';
import { QuickJoinInput } from '@repo/game-ui/input';
import { Stat } from '@repo/game-ui/stat';
import type { RoomSummary } from '@repo/shared';
import { Plus, Users } from 'lucide-react';

interface HeroGuestProps {
  welcome: string;
  cta: string;
  summary: string;
  onSignIn: () => void;
  onSignUp: () => void;
  onQuickJoin: (code: string) => void;
  signInLabel: string;
  signUpLabel: string;
  placeholder: string;
  joinLabel: string;
}

export function HeroGuest({
  welcome,
  cta,
  summary,
  onSignIn,
  onSignUp,
  onQuickJoin,
  signInLabel,
  signUpLabel,
  placeholder,
  joinLabel,
}: HeroGuestProps) {
  return (
    <section className="bg-card border-thick border-foreground rounded-[16px] shadow-card p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6 sm:items-center">
      <div className="flex-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{welcome}</h1>
        <p className="text-sm text-muted-foreground mt-1">{cta}</p>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={onSignUp}
            className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground rounded-[8px] px-3 font-semibold text-sm h-9"
            size="sm"
          >
            {signUpLabel}
          </Button>
          <Button
            onClick={onSignIn}
            variant="secondary"
            className="border-2 border-border bg-secondary hover:bg-secondary/80 rounded-[8px] px-3 font-semibold text-sm h-9"
            size="sm"
          >
            {signInLabel}
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-start sm:items-end gap-2">
        <QuickJoinInput onSubmit={onQuickJoin} placeholder={placeholder} buttonLabel={joinLabel} />
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>
    </section>
  );
}

interface HeroLoggedInProps {
  points: number;
  rank: number | null;
  onQuickJoin: (code: string) => void;
  welcome: string;
  pointsLabel: string;
  rankLabel: string;
  placeholder: string;
  joinLabel: string;
}

export function HeroLoggedIn({
  points,
  rank,
  onQuickJoin,
  welcome,
  pointsLabel,
  rankLabel,
  placeholder,
  joinLabel,
}: HeroLoggedInProps) {
  return (
    <section className="bg-card border-thick border-foreground rounded-[16px] shadow-card p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6 sm:items-center">
      <div className="flex-1 min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{welcome}</h1>
        <div className="mt-3 flex gap-2">
          <Stat label={pointsLabel} value={points} big />
          <Stat label={rankLabel} value={rank === null ? '—' : `#${rank}`} big />
        </div>
      </div>
      <div className="flex flex-col items-start sm:items-end gap-2">
        {/* ResumeCard slot — wired in Stage 7 when resumable games surface. */}
        <QuickJoinInput onSubmit={onQuickJoin} placeholder={placeholder} buttonLabel={joinLabel} />
      </div>
    </section>
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
