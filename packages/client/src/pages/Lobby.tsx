import { GameIcon } from '@/components/GameIcon';
import { LocaleSwitch } from '@/components/LocaleSwitch';
import { ViewAllRow } from '@repo/game-ui/layout';
import { SectionHead } from '@repo/game-ui/section';
import { UserChip } from '@repo/game-ui/user';
import type { ClientEvents, RoomSummary, ServerEvents } from '@repo/shared';
import Avatar from 'boring-avatars';
import { Clock, Pencil, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import { clientRegistry } from '../../../../games/client-registry';
import { usePoints } from '../hooks/usePoints';
import type { useRoom } from '../hooks/useRoom';
import { useSession } from '../hooks/useSession';
import { apiFetch } from '../lib/api';
import { HeroGuest, HeroLoggedIn, RoomCard } from './lobby/sections';

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
  onGoToRegister: () => void;
  onGoToAllGames: () => void;
  onGoToAllRooms: () => void;
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
  socket: _socket,
  userName,
  rename,
  roomCtx,
  onRoomCreated,
  onRoomJoined,
  onGoToLogin,
  onGoToRegister,
  onGoToAllGames,
  onGoToAllRooms,
}: LobbyProps) {
  const { t, i18n } = useTranslation('common');
  const session = useSession();
  const authedUser = session.data?.user ?? null;
  const { data: points } = usePoints();
  const gt = (gameId: string, key: string) => i18n.t(key, { ns: gameId });

  // Translate Chinese tags (source of truth) to whatever locale is active.
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(userName);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);

  const games = Object.values(clientRegistry);
  const featured = games.slice(0, 8);

  // Fetch rank once when signed in. Swallow failures — rank is a nice-to-have.
  useEffect(() => {
    if (!authedUser) {
      setMyRank(null);
      return;
    }
    let cancelled = false;
    apiFetch<{ rank: number | null }>('/api/leaderboard/me')
      .then((data) => {
        if (!cancelled) setMyRank(data?.rank ?? null);
      })
      .catch(() => {
        if (!cancelled) setMyRank(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authedUser]);

  // Initial room list. Subsequent refreshes come from user actions (join/create).
  useEffect(() => {
    let cancelled = false;
    listRooms('').then((result) => {
      if (!cancelled) setRooms(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listRooms]);

  function confirmRename() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== userName) rename(trimmed);
    setEditingName(false);
  }

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

  function handleQuickJoin(code: string) {
    handleJoinRoom(code.trim().toUpperCase());
  }

  return (
    <div className="min-h-screen">
      {/* Top nav */}
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {authedUser ? (
          <HeroLoggedIn
            points={points?.global ?? 0}
            rank={myRank}
            onQuickJoin={handleQuickJoin}
            pointsLabel={t('hero.pointsLabel')}
            rankLabel={t('hero.rankLabel')}
            welcome={t('hero.welcomeBack', { name: authedUser.name })}
            placeholder={t('hero.roomCodePlaceholder')}
            joinLabel={t('lobby.join')}
          />
        ) : (
          <HeroGuest
            welcome={t('hero.guestWelcome', { name: userName })}
            cta={t('hero.guestCta')}
            summary={t('hero.summary', { games: games.length, rooms: rooms.length })}
            onSignIn={onGoToLogin}
            onSignUp={onGoToRegister}
            onQuickJoin={handleQuickJoin}
            signInLabel={t('auth.signIn')}
            signUpLabel={t('auth.signUp')}
            placeholder={t('hero.roomCodePlaceholder')}
            joinLabel={t('lobby.join')}
          />
        )}

        {/* Active rooms */}
        <section>
          <SectionHead
            title={t('lobby.activeRooms')}
            onViewAll={onGoToAllRooms}
            viewAllLabel={t('lobby.viewAll')}
          />
          {rooms.length === 0 ? (
            <div className="bg-card border-2 border-border rounded-[12px] p-6 text-center text-muted-foreground text-sm">
              {t('lobby.noActiveRooms')}
            </div>
          ) : (
            <ViewAllRow>
              {rooms.slice(0, 5).map((r) => (
                <RoomCard
                  key={r.roomId}
                  room={r}
                  onJoin={() => handleJoinRoom(r.roomId)}
                  joinLabel={t('lobby.join')}
                  disabled={loading}
                />
              ))}
            </ViewAllRow>
          )}
        </section>

        {/* All games */}
        <section>
          <SectionHead
            title={t('lobby.allGames')}
            onViewAll={onGoToAllGames}
            viewAllLabel={t('lobby.viewAll')}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {featured.map((plugin) => {
              const m = plugin.meta;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => handleCreate(m.id)}
                  disabled={loading}
                  data-testid={`game-card-${m.id}`}
                  className="border-thick rounded-[16px] p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:-rotate-[1.5deg] hover:shadow-card-hover active:translate-y-0 active:rotate-0 active:shadow-card-active bg-card border-foreground shadow-card disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:rotate-0 disabled:hover:shadow-card"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-foreground">
                      <GameIcon name={m.icon ?? 'rolling-dices'} className="size-5" />
                    </span>
                    <span className="text-base font-bold leading-tight">{gt(m.id, 'name')}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2 line-clamp-2">
                    {gt(m.id, 'description')}
                  </div>
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
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="bg-[#fde8e8] border-2 border-destructive rounded-[12px] p-3 text-destructive font-medium">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
