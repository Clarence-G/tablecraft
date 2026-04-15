import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ClientEvents, RoomSummary, ServerEvents } from '@repo/shared';
import { Clock, Dices, Heart, Pencil, Plus, RefreshCw, Sofa, Target, Users } from 'lucide-react';
import { type ReactNode, useState } from 'react';
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

const ICON_MAP: Record<string, ReactNode> = {
  Target: <Target className="size-6" />,
  Heart: <Heart className="size-6" />,
  Dices: <Dices className="size-6" />,
};

const TAG_COLORS: Record<string, string> = {
  策略: 'bg-[#e8f0fe] text-[#1a3a8a] border-royal-blue',
  棋类: 'bg-[#e8f0fe] text-[#1a3a8a] border-royal-blue',
  推理: 'bg-[#f0e8fe] text-[#4a1a8a] border-crown',
  卡牌: 'bg-[#f0e8fe] text-[#4a1a8a] border-crown',
  派对: 'bg-[#fde8ec] text-[#8a1a30] border-coral',
  休闲: 'bg-[#e8f8ee] text-[#0a5c2a] border-jade',
};

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

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(userName);

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

  // Count rooms per game for the game cards
  function roomCountForGame(gameId: string) {
    return rooms.filter((r) => r.gameId === gameId).length;
  }

  return (
    <div className="min-h-screen">
      {/* Top nav bar */}
      <nav className="sticky top-0 z-50 bg-background border-b-[2.5px] border-foreground px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dices className="size-6 text-foreground" />
            <span className="text-xl font-bold text-[#1a1108]">桌游大全</span>
          </div>
          {/* User avatar + name */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#f0e8d8] border-2 border-foreground flex items-center justify-center text-sm font-bold">
              {userName[0]}
            </div>
            {editingName ? (
              <input
                className="border-2 border-foreground bg-card shadow-inset rounded-[8px] px-2 py-0.5 text-foreground font-semibold w-28 text-center outline-none text-sm"
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
                className="font-semibold text-sm text-foreground inline-flex items-center gap-1 hover:text-muted-foreground transition-colors"
              >
                {userName}
                <Pencil className="size-3 text-[#9c8b78]" />
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Slogan */}
        <p className="text-center text-muted-foreground mb-6">和朋友一起，随时随地玩桌游</p>

        {/* Game cards — compact 3-col grid */}
        <h2 className="text-lg font-semibold mb-3">选择游戏</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {games.map((plugin) => {
            const m = plugin.meta;
            const active = selectedGameId === m.id;
            const count = roomCountForGame(m.id);
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => selectGame(m.id)}
                data-testid={`game-card-${m.id}`}
                className={`bg-card border-thick border-foreground rounded-[16px] p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:-rotate-[1.5deg] hover:shadow-card-hover active:translate-y-0 active:rotate-0 active:shadow-card-active ${
                  active ? 'ring-2 ring-warning' : ''
                }`}
              >
                {/* Icon + name */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-foreground">
                    {ICON_MAP[m.icon ?? ''] ?? <Dices className="size-6" />}
                  </span>
                  <span className="text-base font-bold leading-tight">{m.name}</span>
                </div>
                {/* Description */}
                <div className="text-xs text-muted-foreground mb-2 line-clamp-2">
                  {m.description}
                </div>
                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-0.5 text-xs text-[#6b5744] bg-[#f0e8d8] border border-border rounded-full px-2 py-0.5">
                    <Users className="size-3" />
                    {m.minPlayers === m.maxPlayers
                      ? m.minPlayers
                      : `${m.minPlayers}-${m.maxPlayers}`}
                    人
                  </span>
                  {m.estimatedMinutes && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-[#6b5744] bg-[#f0e8d8] border border-border rounded-full px-2 py-0.5">
                      <Clock className="size-3" />
                      {m.estimatedMinutes}分钟
                    </span>
                  )}
                  {m.tags?.map((tag) => (
                    <span
                      key={tag}
                      className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${TAG_COLORS[tag] ?? 'bg-secondary text-muted-foreground border-border'}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                {/* Room count */}
                {count > 0 && (
                  <div className="mt-2 text-xs text-success font-medium">{count} 个房间进行中</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Room list */}
        <div className="bg-card border-thick border-foreground rounded-[16px] shadow-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b-2 border-border flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">
                {selectedGameId
                  ? `${clientRegistry[selectedGameId]?.meta.name} - 房间`
                  : '所有房间'}
              </h2>
              <button
                type="button"
                onClick={() => fetchRooms(selectedGameId ?? undefined)}
                disabled={loadingRooms}
                className="p-1 rounded-[6px] border border-border hover:border-foreground transition-colors"
                aria-label="刷新"
              >
                <RefreshCw className={`size-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="房间码"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                data-testid="room-code-input"
                className="w-20 uppercase tracking-widest border-2 border-border bg-card shadow-inset rounded-[8px] text-center text-xs h-7 focus-visible:border-foreground"
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <Button
                onClick={handleJoinByCode}
                disabled={loading || !joinCode.trim()}
                data-testid="join-room-btn"
                size="sm"
                className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[8px] px-2 font-semibold text-xs h-7"
              >
                加入
              </Button>
              <Button
                onClick={() => selectedGameId && handleCreate(selectedGameId)}
                disabled={loading || !selectedGameId}
                className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[8px] px-3 font-semibold text-xs h-7 gap-1"
                size="sm"
              >
                <Plus className="size-3.5" />
                创建新房间
              </Button>
            </div>
          </div>

          {/* Room list body */}
          <div className="px-4 sm:px-5 py-3 min-h-[120px]">
            {loadingRooms ? (
              <div className="text-center text-muted-foreground py-8">加载中...</div>
            ) : rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sofa className="size-10 text-[#c4b8a8] mb-3" />
                <p className="text-muted-foreground mb-1">
                  {selectedGameId ? '暂无房间' : '还没有人创建房间'}
                </p>
                <p className="text-xs text-[#9c8b78] mb-4">
                  {selectedGameId ? '创建一个房间，邀请好友加入吧' : '选择一个游戏，创建房间开始玩'}
                </p>
                {selectedGameId && (
                  <Button
                    onClick={() => handleCreate(selectedGameId)}
                    disabled={loading}
                    className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] px-6 font-semibold gap-1"
                  >
                    <Plus className="size-4" />
                    创建房间
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {rooms.map((r) => (
                  <div
                    key={r.roomId}
                    className="flex items-center justify-between bg-secondary border-2 border-border rounded-[10px] px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono tracking-wider font-semibold text-sm">
                        {r.roomId}
                      </span>
                      {!selectedGameId && (
                        <span className="text-xs font-semibold bg-[#fef3e0] text-[#7a4006] border border-warning rounded-full px-1.5 py-0.5">
                          {r.gameName}
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">{r.hostName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Users className="size-3" />
                        {r.playerCount}/{r.maxPlayers}
                      </span>
                      <Button
                        onClick={() => handleJoinRoom(r.roomId)}
                        disabled={loading}
                        className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[8px] px-2.5 font-semibold text-xs h-7"
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
