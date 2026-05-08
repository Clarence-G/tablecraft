import { Button } from '@/components/ui/button';
import type { ClientEvents, RoomSummary, ServerEvents } from '@repo/shared';
import { ArrowLeft, Eye, Plus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import { clientRegistry } from '../../../../games/client-registry';

type AppSocket = Socket<ServerEvents, ClientEvents>;

interface RoomsAllProps {
  socket: AppSocket | null;
  listRooms: (gameId: string) => Promise<RoomSummary[]>;
  onBack: () => void;
  onGoToAllGames: () => void;
  onJoinRoom: (roomId: string) => Promise<void>;
  onSpectateRoom: (roomId: string) => void;
}

export function RoomsAll({
  socket,
  listRooms,
  onBack,
  onGoToAllGames,
  onJoinRoom,
  onSpectateRoom,
}: RoomsAllProps) {
  const { t, i18n } = useTranslation('common');
  const gt = (id: string, key: string) => i18n.t(key, { ns: id });

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [gameFilter, setGameFilter] = useState<string>('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const games = Object.values(clientRegistry);

  const refresh = useCallback(() => {
    let cancelled = false;
    // Server-side `listRooms` filters by gameId when non-empty. "" = all.
    listRooms(gameFilter).then((result) => {
      if (!cancelled) setRooms(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listRooms, gameFilter]);

  // Initial fetch + 30s polling (spec §11). Poll interval fires while mounted.
  useEffect(() => {
    const cleanup = refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      cleanup();
      clearInterval(id);
    };
  }, [refresh]);

  // Reactive refresh on `rooms:updated`. Server fires this on any waiting-
  // room state change so the list is up-to-date without waiting for the 30s
  // poll tick.
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      refresh();
    };
    socket.on('rooms:updated', handler);
    return () => {
      socket.off('rooms:updated', handler);
    };
  }, [socket, refresh]);

  async function handleJoin(roomId: string) {
    setError(null);
    setJoining(true);
    try {
      await onJoinRoom(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: games list and gt are stable; intentionally re-memoize only on locale change
  const gameOptions = useMemo(
    () => games.map((g) => ({ id: g.meta.id, label: String(gt(g.meta.id, 'name')) })),
    [i18n.language],
  );

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 bg-background border-b-[2.5px] border-foreground px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm font-semibold border-2 border-border bg-card rounded-[8px] px-2.5 py-1 hover:border-foreground hover:-translate-y-0.5 transition-all"
            aria-label={t('lobby.backToLobby')}
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">{t('roomsAll.title')}</h1>
          <div className="ml-auto">
            <Button
              size="sm"
              variant="secondary"
              onClick={refresh}
              className="border-2 border-border bg-secondary hover:bg-secondary/80 rounded-[8px] px-2.5 font-semibold text-xs h-8"
            >
              {t('roomsAll.refresh')}
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Game filter dropdown */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-muted-foreground">{t('roomsAll.gameFilter')}</span>
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="h-10 w-full border-2 border-border bg-card rounded-[10px] px-3 font-semibold"
          >
            <option value="">{t('roomsAll.anyGame')}</option>
            {gameOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        {/* Rooms list */}
        {rooms.length === 0 ? (
          <div className="bg-card border-2 border-border rounded-[12px] p-6 text-center space-y-3">
            <div className="text-sm text-muted-foreground">{t('roomsAll.empty')}</div>
            <Button
              onClick={onGoToAllGames}
              size="sm"
              className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground rounded-[8px] px-3 font-semibold text-sm h-9 gap-1"
            >
              <Plus className="size-3.5" />
              {t('roomsAll.createCta')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((r) => (
              <div
                key={r.roomId}
                className="bg-card border-2 border-foreground rounded-[12px] shadow-card p-3 flex items-center gap-3"
              >
                <span className="font-mono tracking-wider font-semibold text-sm">{r.roomId}</span>
                <span className="text-xs font-semibold bg-[#fef3e0] text-[#7a4006] border border-warning rounded-full px-1.5 py-0.5 truncate max-w-[160px]">
                  {r.gameName}
                </span>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5 ml-auto">
                  <Users className="size-3" />
                  {r.playerCount}/{r.maxPlayers}
                </span>
                {r.status === 'playing' ? (
                  <Button
                    onClick={() => onSpectateRoom(r.roomId)}
                    size="sm"
                    variant="outline"
                    className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground bg-card rounded-[8px] px-2.5 font-semibold text-xs h-8"
                  >
                    <Eye className="size-3" />
                    {t('lobby.room.spectate')}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleJoin(r.roomId)}
                    disabled={joining}
                    size="sm"
                    className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-foreground rounded-[8px] px-2.5 font-semibold text-xs h-8"
                  >
                    <Plus className="size-3" />
                    {t('lobby.join')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-[#fde8e8] border-2 border-destructive rounded-[12px] p-3 text-destructive font-medium">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
