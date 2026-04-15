import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ClientEvents, RoomSummary, ServerEvents } from '@repo/shared';
import { Pencil, RefreshCw, Users } from 'lucide-react';
import { useState } from 'react';
import type { Socket } from 'socket.io-client';
import { clientRegistry } from '../../../../games/client-registry';
import type { useRoom } from '../hooks/useRoom';

type AppSocket = Socket<ServerEvents, ClientEvents>;
type RoomCtx = ReturnType<typeof useRoom>;

interface LobbyProps {
  socket: AppSocket | null;
  userName: string;
  rename: (name: string) => void;
  roomCtx: RoomCtx;
  onRoomCreated: (roomId: string) => void;
  onRoomJoined: (roomId: string) => void;
}

export function Lobby({
  socket,
  userName,
  rename,
  roomCtx,
  onRoomCreated,
  onRoomJoined,
}: LobbyProps) {
  const { create, join, listRooms } = roomCtx;
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Nickname editing
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(userName);

  // Game selection + room list
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const games = Object.values(clientRegistry);

  function confirmRename() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== userName) rename(trimmed);
    setEditingName(false);
  }

  async function fetchRooms(gameId?: string) {
    setLoadingRooms(true);
    try {
      const result = await listRooms(gameId ?? '');
      setRooms(result);
    } finally {
      setLoadingRooms(false);
    }
  }

  function selectGame(gameId: string) {
    const next = selectedGameId === gameId ? null : gameId;
    setSelectedGameId(next);
    setError(null);
    fetchRooms(next ?? undefined);
  }

  // Fetch all rooms on mount
  useState(() => {
    fetchRooms();
  });

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

  async function handleJoinRoom(roomId: string) {
    setError(null);
    setLoading(true);
    try {
      await join(roomId, userName);
      onRoomJoined(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinByCode() {
    if (!joinCode.trim()) return;
    await handleJoinRoom(joinCode.trim().toUpperCase());
  }

  return (
    <div className="min-h-screen p-6 sm:p-8">
      <h1 className="text-4xl font-bold mb-2 text-center text-[#1a1108]">桌游大全</h1>

      {/* Editable nickname */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <span className="text-muted-foreground">你好，</span>
        {editingName ? (
          <input
            className="border-2 border-foreground bg-card shadow-inset rounded-[8px] px-2 py-0.5 text-foreground font-semibold w-32 text-center outline-none"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename();
              if (e.key === 'Escape') {
                setNameDraft(userName);
                setEditingName(false);
              }
            }}
            onBlur={confirmRename}
            maxLength={12}
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(userName);
              setEditingName(true);
            }}
            className="font-semibold text-foreground underline decoration-dashed underline-offset-4 decoration-border hover:decoration-foreground transition-colors inline-flex items-center gap-1"
          >
            {userName}
            <Pencil className="size-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Game selection */}
        <h2 className="text-xl font-semibold mb-4">选择游戏</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {games.map((plugin) => (
            <button
              type="button"
              key={plugin.meta.id}
              onClick={() => selectGame(plugin.meta.id)}
              data-testid={`game-card-${plugin.meta.id}`}
              className={`bg-card border-thick border-foreground rounded-[16px] p-6 text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:-rotate-[1.5deg] hover:shadow-card-hover active:translate-y-0 active:rotate-0 active:shadow-card-active ${
                selectedGameId === plugin.meta.id ? 'ring-2 ring-warning' : ''
              }`}
            >
              <div className="text-lg font-bold">{plugin.meta.name}</div>
              <div className="text-sm text-muted-foreground mt-1">{plugin.meta.description}</div>
              <div className="text-xs text-[#9c8b78] mt-2">
                {plugin.meta.minPlayers}--{plugin.meta.maxPlayers} 人
              </div>
            </button>
          ))}
        </div>

        {/* Room list */}
        <div className="bg-card border-thick border-foreground rounded-[16px] p-6 shadow-card mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg font-semibold">
              {selectedGameId ? `${clientRegistry[selectedGameId]?.meta.name} - 房间` : '所有房间'}
            </h2>
            <div className="flex items-center gap-2">
              {/* Inline room code join */}
              <Input
                type="text"
                placeholder="房间码"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                data-testid="room-code-input"
                className="w-24 uppercase tracking-widest border-2 border-border bg-card shadow-inset rounded-[8px] text-center text-sm h-8 focus-visible:border-foreground"
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <Button
                onClick={handleJoinByCode}
                disabled={loading || !joinCode.trim()}
                data-testid="join-room-btn"
                size="sm"
                className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[8px] px-3 font-semibold text-sm h-8"
              >
                加入
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <button
                type="button"
                onClick={() => fetchRooms(selectedGameId ?? undefined)}
                disabled={loadingRooms}
                className="p-2 rounded-[8px] border-2 border-border hover:border-foreground transition-colors"
                aria-label="刷新"
              >
                <RefreshCw className={`size-4 ${loadingRooms ? 'animate-spin' : ''}`} />
              </button>
              {selectedGameId && (
                <Button
                  onClick={() => handleCreate(selectedGameId)}
                  disabled={loading}
                  className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] px-4 font-semibold"
                >
                  创建新房间
                </Button>
              )}
            </div>
          </div>

          {loadingRooms ? (
            <div className="text-center text-muted-foreground py-6">加载中...</div>
          ) : rooms.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">
              {selectedGameId ? '暂无房间，创建一个吧' : '暂无房间'}
            </div>
          ) : (
            <div className="space-y-3">
              {rooms.map((r) => (
                <div
                  key={r.roomId}
                  className="flex items-center justify-between bg-secondary border-2 border-border rounded-[12px] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono tracking-wider font-semibold">{r.roomId}</span>
                    {!selectedGameId && (
                      <span className="text-xs font-semibold bg-[#fef3e0] text-[#7a4006] border border-warning rounded-full px-2 py-0.5">
                        {r.gameName}
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">{r.hostName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Users className="size-3.5" />
                      {r.playerCount}/{r.maxPlayers}
                    </span>
                    <Button
                      onClick={() => handleJoinRoom(r.roomId)}
                      disabled={loading}
                      className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] px-3 font-semibold text-sm"
                      size="sm"
                    >
                      加入
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
