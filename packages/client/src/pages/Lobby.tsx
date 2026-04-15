import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <div className="min-h-screen p-6 sm:p-8">
      <h1 className="text-4xl font-bold mb-2 text-center text-[#1a1108]">桌游大全</h1>
      <p className="text-center text-muted-foreground mb-8">你好，{userName}</p>

      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold mb-4">选择游戏</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {games.map((plugin) => (
            <button
              type="button"
              key={plugin.meta.id}
              onClick={() => handleCreate(plugin.meta.id)}
              disabled={loading}
              data-testid={`game-card-${plugin.meta.id}`}
              className="bg-card border-thick border-foreground rounded-[16px] p-6 text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:-rotate-[1.5deg] hover:shadow-card-hover active:translate-y-0 active:rotate-0 active:shadow-card-active"
            >
              <div className="text-lg font-bold">{plugin.meta.name}</div>
              <div className="text-sm text-muted-foreground mt-1">{plugin.meta.description}</div>
              <div className="text-xs text-[#9c8b78] mt-2">
                {plugin.meta.minPlayers}--{plugin.meta.maxPlayers} 人
              </div>
            </button>
          ))}
        </div>

        <div className="bg-card border-thick border-foreground rounded-[16px] p-6 shadow-card">
          <h2 className="text-xl font-semibold mb-4">加入房间</h2>
          <div className="flex gap-3">
            <Input
              type="text"
              placeholder="输入 6 位房间码"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              data-testid="room-code-input"
              className="flex-1 uppercase tracking-widest border-2 border-border bg-card shadow-inset rounded-[12px] focus-visible:border-foreground"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <Button
              onClick={handleJoin}
              disabled={loading || !joinCode.trim()}
              data-testid="join-room-btn"
              className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] px-6 font-semibold"
            >
              加入
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-[#fde8e8] border-2 border-destructive rounded-[12px] p-3 text-destructive font-medium">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
