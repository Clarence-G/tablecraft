import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { useRoom } from '../hooks/useRoom';

type RoomCtx = ReturnType<typeof useRoom>;

interface RoomPageProps {
  roomId: string;
  userId: string;
  roomCtx: RoomCtx;
  onGameStart: () => void;
  onLeave: () => void;
}

export function Room({ roomId, userId, roomCtx, onGameStart, onLeave }: RoomPageProps) {
  const { t } = useTranslation('common');
  const { room, ready, start, leave, restart } = roomCtx;

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">{t('room.connecting')}</div>
      </div>
    );
  }

  const me = room.players.find((p) => p.id === userId);
  const isHost = room.hostId === userId;
  const hasEnoughPlayers = room.players.length >= room.minPlayers;
  const allReady = hasEnoughPlayers && room.players.every((p) => p.ready);

  return (
    <div className="min-h-screen p-6 sm:p-8" data-testid="room-page">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1a1108]">{t('room.waitingRoom')}</h1>
          <div
            data-testid="room-code"
            className="bg-card border-2 border-foreground rounded-[8px] px-4 py-2 font-mono tracking-widest text-lg shadow-button"
          >
            {roomId}
          </div>
        </div>

        <div className="bg-card border-thick border-foreground rounded-[16px] p-6 shadow-card mb-6">
          <h2 className="text-sm text-[#9c8b78] uppercase tracking-wider font-semibold mb-3">
            {t('room.playerList')}
          </h2>
          <div className="space-y-2" data-testid="player-list">
            {room.players.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between py-1"
                data-testid={`player-${index}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full border ${player.connected ? 'bg-success border-[#0a5c2a]' : 'bg-[#c4b8a8] border-[#9c8b78]'}`}
                  />
                  <span className="font-medium">{player.name}</span>
                  {player.id === room.hostId && (
                    <span className="text-xs text-warning font-semibold bg-[#fef3e0] border border-warning rounded-full px-2 py-0.5">
                      {t('room.host')}
                    </span>
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${player.ready ? 'text-success' : 'text-[#9c8b78]'}`}
                >
                  {player.ready ? t('room.ready') : t('room.notReady')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {!me?.ready && (
            <Button
              onClick={ready}
              data-testid="ready-btn"
              className="w-full py-3 bg-jade border-2 border-[#0a5c2a] text-white shadow-[#0a5c2a_-4px_4px_0px] hover:-translate-y-0.5 hover:shadow-[#0a5c2a_-5px_6px_0px] active:translate-y-px active:shadow-[#0a5c2a_-2px_2px_0px] rounded-[12px] font-semibold"
              size="lg"
            >
              {t('room.readyBtn')}
            </Button>
          )}

          {isHost && (
            <Button
              onClick={start}
              disabled={!allReady}
              data-testid="start-btn"
              className="w-full py-3 shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] font-semibold"
              size="lg"
            >
              {!hasEnoughPlayers
                ? t('room.needPlayers', { count: room.minPlayers })
                : t('room.startGame')}
            </Button>
          )}

          {room.status === 'finished' && (
            <Button
              onClick={restart}
              className="w-full py-3 shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] font-semibold"
              size="lg"
            >
              {t('room.playAgain')}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => {
              leave();
              onLeave();
            }}
            className="w-full py-3 bg-card border-2 border-foreground shadow-[#3d2e1e_-4px_4px_0px] hover:-translate-y-0.5 hover:shadow-[#3d2e1e_-5px_6px_0px] active:translate-y-px active:shadow-[#3d2e1e_-2px_2px_0px] rounded-[12px] font-semibold"
            size="lg"
          >
            {t('room.leave')}
          </Button>
        </div>
      </div>
    </div>
  );
}
