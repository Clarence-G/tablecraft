import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-2 text-center">桌游平台</h1>
      <p className="text-center text-muted-foreground mb-8">你好，{userName}</p>

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
              className="bg-card hover:bg-accent rounded-xl p-6 text-left transition ring-1 ring-foreground/10 hover:ring-foreground/20"
            >
              <div className="text-lg font-bold">{plugin.meta.name}</div>
              <div className="text-sm text-muted-foreground mt-1">{plugin.meta.description}</div>
              <div className="text-xs text-muted-foreground/60 mt-2">
                {plugin.meta.minPlayers}–{plugin.meta.maxPlayers} 人
              </div>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>加入房间</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="输入 6 位房间码"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                data-testid="room-code-input"
                className="flex-1 uppercase tracking-widest"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
              <Button
                onClick={handleJoin}
                disabled={loading || !joinCode.trim()}
                data-testid="join-room-btn"
              >
                加入
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mt-4 bg-destructive/10 border border-destructive/40 rounded-lg p-3 text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
