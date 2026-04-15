import type { ClientEvents, ServerEvents } from '@repo/shared';
import { useState } from 'react';
import type { Socket } from 'socket.io-client';
import { clientRegistry } from '../../../../games/client-registry';
import type { useRoom } from '../hooks/useRoom';

type AppSocket = Socket<ServerEvents, ClientEvents>;
type RoomCtx = ReturnType<typeof useRoom>;

interface LobbyProps {
  socket: AppSocket | null;
  userName: string;
  roomCtx: RoomCtx;
  onRoomCreated: (roomId: string) => void;
  onRoomJoined: (roomId: string) => void;
}

export function Lobby({ socket, userName, roomCtx, onRoomCreated, onRoomJoined }: LobbyProps) {
  const { create, join } = roomCtx;
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const games = Object.values(clientRegistry);

  async function handleCreate(gameId: string) {
    setError(null);
    setLoading(true);
    try {
      const { roomId } = await create(gameId, userName);
      onRoomCreated(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await join(joinCode.trim().toUpperCase(), userName);
      onRoomJoined(joinCode.trim().toUpperCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-2 text-center">桌游平台</h1>
      <p className="text-center text-gray-400 mb-8">你好，{userName}</p>

      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold mb-4">选择游戏</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {games.map((plugin) => (
            <button
              type="button"
              key={plugin.meta.id}
              onClick={() => handleCreate(plugin.meta.id)}
              disabled={loading}
              data-testid={`game-card-${plugin.meta.id}`}
              className="bg-gray-800 hover:bg-gray-700 rounded-xl p-6 text-left transition"
            >
              <div className="text-lg font-bold">{plugin.meta.name}</div>
              <div className="text-sm text-gray-400 mt-1">{plugin.meta.description}</div>
              <div className="text-xs text-gray-500 mt-2">
                {plugin.meta.minPlayers}–{plugin.meta.maxPlayers} 人
              </div>
            </button>
          ))}
        </div>

        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">加入房间</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="输入 6 位房间码"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              data-testid="room-code-input"
              className="flex-1 bg-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 uppercase tracking-widest"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={loading || !joinCode.trim()}
              data-testid="join-room-btn"
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2 rounded-lg font-medium"
            >
              加入
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-900/50 border border-red-500 rounded-lg p-3 text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
