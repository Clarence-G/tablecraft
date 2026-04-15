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
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-gray-400">连接中...</div>
      </div>
    );
  }

  const me = room.players.find((p) => p.id === userId);
  const isHost = room.hostId === userId;
  const allReady = room.players.length > 0 && room.players.every((p) => p.ready);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8" data-testid="room-page">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">等待室</h1>
          <div
            data-testid="room-code"
            className="bg-gray-700 rounded-lg px-4 py-2 font-mono tracking-widest text-lg"
          >
            {roomId}
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-sm text-gray-400 uppercase mb-3">玩家列表</h2>
          <div className="space-y-2" data-testid="player-list">
            {room.players.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between"
                data-testid={`player-${index}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${player.connected ? 'bg-green-500' : 'bg-gray-500'}`}
                  />
                  <span>{player.name}</span>
                  {player.id === room.hostId && (
                    <span className="text-xs text-yellow-400">房主</span>
                  )}
                </div>
                <span className={`text-sm ${player.ready ? 'text-green-400' : 'text-gray-500'}`}>
                  {player.ready ? '已准备' : '未准备'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {!me?.ready && (
            <button
              type="button"
              onClick={ready}
              data-testid="ready-btn"
              className="bg-green-600 hover:bg-green-500 py-3 rounded-xl font-semibold"
            >
              准备
            </button>
          )}

          {isHost && (
            <button
              type="button"
              onClick={start}
              disabled={!allReady}
              data-testid="start-btn"
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 rounded-xl font-semibold"
            >
              开始游戏
            </button>
          )}

          {room.status === 'finished' && (
            <button
              type="button"
              onClick={restart}
              className="bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-semibold"
            >
              再来一局
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              leave();
              onLeave();
            }}
            className="bg-gray-700 hover:bg-gray-600 py-3 rounded-xl font-semibold"
          >
            离开
          </button>
        </div>
      </div>
    </div>
  );
}
