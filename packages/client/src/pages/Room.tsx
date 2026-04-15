import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const { room, ready, start, leave, restart } = roomCtx;

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">连接中...</div>
      </div>
    );
  }

  const me = room.players.find((p) => p.id === userId);
  const isHost = room.hostId === userId;
  const hasEnoughPlayers = room.players.length >= room.minPlayers;
  const allReady = hasEnoughPlayers && room.players.every((p) => p.ready);

  return (
    <div className="min-h-screen p-8" data-testid="room-page">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">等待室</h1>
          <div
            data-testid="room-code"
            className="bg-secondary rounded-lg px-4 py-2 font-mono tracking-widest text-lg"
          >
            {roomId}
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">玩家列表</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="player-list">
              {room.players.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between"
                  data-testid={`player-${index}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${player.connected ? 'bg-success' : 'bg-muted-foreground/40'}`}
                    />
                    <span>{player.name}</span>
                    {player.id === room.hostId && (
                      <span className="text-xs text-warning">房主</span>
                    )}
                  </div>
                  <span
                    className={`text-sm ${player.ready ? 'text-success' : 'text-muted-foreground'}`}
                  >
                    {player.ready ? '已准备' : '未准备'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          {!me?.ready && (
            <Button
              onClick={ready}
              data-testid="ready-btn"
              className="w-full py-3 bg-success text-success-foreground hover:bg-success/80"
              size="lg"
            >
              准备
            </Button>
          )}

          {isHost && (
            <Button
              onClick={start}
              disabled={!allReady}
              data-testid="start-btn"
              className="w-full py-3"
              size="lg"
            >
              {!hasEnoughPlayers ? `至少需要 ${room.minPlayers} 名玩家` : '开始游戏'}
            </Button>
          )}

          {room.status === 'finished' && (
            <Button onClick={restart} className="w-full py-3" size="lg">
              再来一局
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={() => {
              leave();
              onLeave();
            }}
            className="w-full py-3"
            size="lg"
          >
            离开
          </Button>
        </div>
      </div>
    </div>
  );
}
