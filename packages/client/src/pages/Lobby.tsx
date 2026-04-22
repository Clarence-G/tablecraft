import { GameIcon } from '@/components/GameIcon';
import { LocaleSwitch } from '@/components/LocaleSwitch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserChip } from '@repo/game-ui/user';
import type { ClientEvents, RoomSummary, ServerEvents } from '@repo/shared';
import Avatar from 'boring-avatars';
import { Clock, Pencil, Plus, RefreshCw, Sofa, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import { clientRegistry } from '../../../../games/client-registry';
import { usePoints } from '../hooks/usePoints';
import type { useRoom } from '../hooks/useRoom';
import { useSession } from '../hooks/useSession';

type AppSocket = Socket<ServerEvents, ClientEvents>;
type RoomCtx = ReturnType<typeof useRoom>;

interface LobbyProps {
  socket: AppSocket | null;
  userName: string;
  rename: (name: string) => void;
  roomCtx: RoomCtx;
  onRoomCreated: (roomId: string) => void;
  onRoomJoined: (roomId: string) => void;
  onGoToLogin: () => void;
}

const TAG_COLORS: Record<string, string> = {
  策略: 'bg-[#e8f0fe] text-[#1a3a8a] border-[#2563eb]',
  棋类: 'bg-[#e8f8ee] text-[#0a5c2a] border-[#16a34a]',
  推理: 'bg-[#f0e8fe] text-[#4a1a8a] border-[#7c3aed]',
  卡牌: 'bg-[#fef3e0] text-[#7a4006] border-[#d97706]',
  派对: 'bg-[#fde8ec] text-[#8a1a30] border-[#e8556d]',
  休闲: 'bg-[#fde8e8] text-[#7a1a1a] border-[#d94040]',
  骰子: 'bg-[#fde8e8] text-[#7a1a1a] border-[#d94040]',
};

export function Lobby({
  socket,
  userName,
  rename,
  roomCtx,
  onRoomCreated,
  onRoomJoined,
  onGoToLogin,
}: LobbyProps) {
  const { t, i18n } = useTranslation('common');
  const session = useSession();
  const authedUser = session.data?.user ?? null;
  const { data: points } = usePoints();
  const gt = (gameId: string, key: string) => i18n.t(key, { ns: gameId });

  // Build tag translation: Chinese tag -> translated tag
  const tagTranslation = new Map<string, string>();
  for (const g of Object.values(clientRegistry)) {
    const zhTags: string[] = g.meta.tags ?? [];
    const translatedTags: string[] =
      (i18n.t('tags', { ns: g.meta.id, returnObjects: true }) as string[]) ?? [];
    zhTags.forEach((zh, i) => {
      if (translatedTags[i]) tagTranslation.set(zh, translatedTags[i]);
    });
  }
  const translateTag = (zhTag: string) => tagTranslation.get(zhTag) ?? zhTag;

  const { create, join, listRooms } = roomCtx;
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(userName);

  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const games = Object.values(clientRegistry);

  // Collect all unique tags across all games
  const allTags = Array.from(new Set(games.flatMap((g) => g.meta.tags ?? [])));

  // Filter games by active tag
  const visibleGames = activeTag ? games.filter((g) => g.meta.tags?.includes(activeTag)) : games;

  function confirmRename() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== userName) rename(trimmed);
    setEditingName(false);
  }

  async function fetchRooms(gameId?: string) {
    // First load: show skeleton. Subsequent: just spin the refresh icon.
    const isFirstLoad = loadingRooms;
    if (!isFirstLoad) setRefreshing(true);
    try {
      const result = await listRooms(gameId ?? '');
      setRooms(result);
    } finally {
      if (isFirstLoad) setLoadingRooms(false);
      else setRefreshing(false);
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
            <GameIcon name="rolling-dices" className="size-6" />
            <span className="text-xl font-bold text-[#1a1108]">{t('app.title')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitch />
            {authedUser ? (
              <UserChip
                userName={authedUser.name}
                avatarSeed={authedUser.email ?? authedUser.id}
                points={points?.global}
              />
            ) : (
              <>
                {/* Guest: avatar + inline rename + sign-in CTA */}
                <Avatar
                  name={userName}
                  size={32}
                  variant="beam"
                  colors={['#d94040', '#2563eb', '#16a34a', '#d97706', '#7c3aed']}
                />
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
                <UserChip guestLabel={t('auth.signInCta')} onSignInClick={onGoToLogin} />
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Slogan */}
        <p className="text-center text-muted-foreground mb-6">{t('app.slogan')}</p>

        {/* Game selector header + tag filters */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">{t('lobby.selectGame')}</h2>
          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 transition-all ${
                activeTag === null
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card border-border text-muted-foreground hover:border-foreground'
              }`}
            >
              {t('lobby.all')}
            </button>
            {allTags.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 transition-all ${
                  activeTag === tag
                    ? `${TAG_COLORS[tag] ?? 'bg-secondary text-foreground border-foreground'} shadow-[2px_2px_0px_0px_#3d2e1e]`
                    : 'bg-card border-border text-muted-foreground hover:border-foreground'
                }`}
              >
                {translateTag(tag)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {visibleGames.map((plugin) => {
            const m = plugin.meta;
            const active = selectedGameId === m.id;
            const count = roomCountForGame(m.id);
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => selectGame(m.id)}
                data-testid={`game-card-${m.id}`}
                className={`border-thick rounded-[16px] p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:-rotate-[1.5deg] hover:shadow-card-hover active:translate-y-0 active:rotate-0 active:shadow-card-active ${
                  active
                    ? 'bg-[#fef3e0] border-warning shadow-[#7a4006_-6px_6px_0px,rgba(61,46,30,0.08)_0px_2px_8px] -translate-y-0.5'
                    : 'bg-card border-foreground shadow-card'
                }`}
              >
                {/* Icon + name */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-foreground">
                    <GameIcon name={m.icon ?? 'rolling-dices'} className="size-5" />
                  </span>
                  <span className="text-base font-bold leading-tight">{gt(m.id, 'name')}</span>
                </div>
                {/* Description */}
                <div className="text-xs text-muted-foreground mb-2 line-clamp-2">
                  {gt(m.id, 'description')}
                </div>
                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-0.5 text-xs text-[#6b5744] bg-[#f0e8d8] border border-border rounded-full px-2 py-0.5">
                    <Users className="size-3" />
                    {m.minPlayers === m.maxPlayers
                      ? m.minPlayers
                      : `${m.minPlayers}-${m.maxPlayers}`}
                    {t('lobby.players')}
                  </span>
                  {m.estimatedMinutes && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-[#6b5744] bg-[#f0e8d8] border border-border rounded-full px-2 py-0.5">
                      <Clock className="size-3" />
                      {m.estimatedMinutes}
                      {t('lobby.minutes')}
                    </span>
                  )}
                  {m.tags?.map((tag) => (
                    <span
                      key={tag}
                      className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${TAG_COLORS[tag] ?? 'bg-secondary text-muted-foreground border-border'}`}
                    >
                      {translateTag(tag)}
                    </span>
                  ))}
                </div>
                {/* Room count */}
                {count > 0 && (
                  <div className="mt-2 text-xs text-success font-medium">
                    {t('lobby.roomsActive', { count })}
                  </div>
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
                  ? `${gt(selectedGameId, 'name')} - ${t('lobby.rooms')}`
                  : t('lobby.allRooms')}
              </h2>
              <button
                type="button"
                onClick={() => fetchRooms(selectedGameId ?? undefined)}
                disabled={refreshing}
                className="p-1 rounded-[6px] border border-border hover:border-foreground transition-colors"
                aria-label={t('lobby.refresh')}
              >
                <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder={t('lobby.roomCode')}
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
                {t('lobby.join')}
              </Button>
              <Button
                onClick={() => selectedGameId && handleCreate(selectedGameId)}
                disabled={loading || !selectedGameId}
                className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[8px] px-3 font-semibold text-xs h-7 gap-1"
                size="sm"
              >
                <Plus className="size-3.5" />
                {t('lobby.createRoom')}
              </Button>
            </div>
          </div>

          {/* Room list body */}
          <div className="px-4 sm:px-5 py-3 min-h-[120px]">
            {loadingRooms ? (
              <div className="text-center text-muted-foreground py-8">{t('lobby.loading')}</div>
            ) : rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sofa className="size-10 text-[#c4b8a8] mb-3" />
                <p className="text-muted-foreground mb-1">
                  {selectedGameId ? t('lobby.noRooms') : t('lobby.noRoomsYet')}
                </p>
                <p className="text-xs text-[#9c8b78] mb-4">
                  {selectedGameId ? t('lobby.createInvite') : t('lobby.selectAndCreate')}
                </p>
                {selectedGameId && (
                  <Button
                    onClick={() => handleCreate(selectedGameId)}
                    disabled={loading}
                    className="shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] px-6 font-semibold gap-1"
                  >
                    <Plus className="size-4" />
                    {t('lobby.createRoomShort')}
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
                        {t('lobby.join')}
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
