import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GameCoverImage } from '@/components/GameCoverImage';
import type { RoomSummary } from '@repo/shared';
import { Clock, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RoomCard } from '@/pages/lobby/sections';

interface GameMetaLite {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes?: number;
  icon?: string;
  tags?: string[];
}

interface GameActionDialogProps {
  /** Meta for the game being previewed; null hides the dialog. */
  game: GameMetaLite | null;
  /** Localized game display name (read via i18n at the call site). */
  displayName: string;
  /** Localized description. */
  description: string;
  /** Localized tags. */
  tags: string[];
  /** Fetch current rooms for this game (already filtered server-side). */
  fetchRooms: (gameId: string) => Promise<RoomSummary[]>;
  onClose: () => void;
  onCreate: (gameId: string) => void | Promise<void>;
  onJoin: (roomId: string) => void | Promise<void>;
  onSpectate: (roomId: string) => void;
  disabled: boolean;
}

/**
 * Modal shown when a user taps a game card in the lobby.
 *
 * Replaces the old "click-to-filter-and-scroll" flow. Gives the user a focused
 * surface for one game: see active rooms + create a new one, without
 * contaminating the main filter state.
 */
export function GameActionDialog({
  game,
  displayName,
  description,
  tags,
  fetchRooms,
  onClose,
  onCreate,
  onJoin,
  onSpectate,
  disabled,
}: GameActionDialogProps) {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // Refetch whenever the dialog opens with a new game.
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    setLoading(true);
    fetchRooms(game.id)
      .then((result) => {
        if (!cancelled) setRooms(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game, fetchRooms]);

  if (!game) return null;

  const m = game;
  const playerRange =
    m.minPlayers === m.maxPlayers ? `${m.minPlayers}` : `${m.minPlayers}-${m.maxPlayers}`;

  return (
    <Dialog open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden">
        {/* Hero banner: full-width cover image with gradient fade into the body */}
        <div className="relative aspect-[16/9] overflow-hidden">
          <GameCoverImage
            gameId={m.id}
            fallbackIcon={m.icon ?? 'rolling-dices'}
            className="absolute inset-0 size-full"
          />
          {/* Bottom fade so body text reads cleanly */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent"
          />
        </div>

        <div className="px-5 pt-2 pb-5 space-y-4">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-xl font-extrabold leading-tight">
              {displayName}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-snug">
              {description}
            </DialogDescription>
          </DialogHeader>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-0.5 text-xs text-[#6b5744] bg-[#f0e8d8] border border-border rounded-full px-2 py-0.5">
              <Users className="size-3" />
              {playerRange}
              {t('lobby.players')}
            </span>
            {m.estimatedMinutes && (
              <span className="inline-flex items-center gap-0.5 text-xs text-[#6b5744] bg-[#f0e8d8] border border-border rounded-full px-2 py-0.5">
                <Clock className="size-3" />
                {m.estimatedMinutes}
                {t('lobby.minutes')}
              </span>
            )}
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-semibold border rounded-full px-2 py-0.5 bg-secondary text-muted-foreground border-border"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Active rooms for this game */}
          <div>
            <div className="text-sm font-bold text-foreground mb-2">
              {t('lobby.activeRooms')}
            </div>
            {loading ? (
              <div className="text-xs text-muted-foreground py-4">
                {t('lobby.connectingHint')}
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-xs text-muted-foreground bg-secondary/50 border border-border rounded-[10px] px-3 py-3 text-center">
                {t('lobby.noRoomsForGame', { game: displayName })}
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-5 px-5">
                {rooms.map((r) => (
                  <RoomCard
                    key={r.roomId}
                    room={r}
                    onJoin={() => onJoin(r.roomId)}
                    onSpectate={() => onSpectate(r.roomId)}
                    joinLabel={t('lobby.join')}
                    spectateLabel={t('lobby.room.spectate')}
                    disabled={disabled}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Primary CTA: create a new room */}
          <button
            type="button"
            onClick={() => onCreate(m.id)}
            disabled={disabled}
            data-testid="dialog-create-room-btn"
            className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-[#5a3820] px-4 py-2.5 rounded-[12px] border-2 border-[#8a5a2b] bg-[linear-gradient(180deg,#fef3e0_0%,#f5deb3_55%,#ebc98a_100%)] shadow-[0_3px_0_0_#8a5a2b,0_6px_12px_-2px_rgba(90,56,32,0.35)] hover:-translate-y-0.5 hover:shadow-[0_4px_0_0_#8a5a2b,0_8px_14px_-2px_rgba(90,56,32,0.4)] active:translate-y-[2px] active:shadow-[0_1px_0_0_#8a5a2b,0_2px_4px_-1px_rgba(90,56,32,0.3)] disabled:opacity-60 disabled:hover:translate-y-0 transition-all duration-150"
          >
            <Plus className="size-4" />
            {t('lobby.createForGame', { game: displayName })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
