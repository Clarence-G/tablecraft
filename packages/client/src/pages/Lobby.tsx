import { GameIcon } from '@/components/GameIcon';
import { LobbySidePanel } from '@/components/layout/LobbySidePanel';
import { LocaleSwitch } from '@/components/LocaleSwitch';
import { ViewAllRow } from '@repo/game-ui/layout';
import { SectionHead } from '@repo/game-ui/section';
import { UserChip } from '@repo/game-ui/user';
import type { ClientEvents, RoomSummary, ServerEvents } from '@repo/shared';
import { Clock, Plus, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import { clientRegistry } from '../../../../games/client-registry';
import { authClient } from '../lib/authClient';
import { track } from '../lib/analytics';
import { usePoints } from '../hooks/usePoints';
import { useRecentGames } from '../hooks/useRecentGames';
import type { useRoom } from '../hooks/useRoom';
import { useSession } from '../hooks/useSession';
import { apiFetch } from '../lib/api';
import { TAG_COLORS, buildTagTranslation } from '../lib/tags';
import { HeroGuest, HeroLoggedIn, QuickJoinBar, RoomCard } from './lobby/sections';

type AppSocket = Socket<ServerEvents, ClientEvents>;
type RoomCtx = ReturnType<typeof useRoom>;

interface LobbyProps {
  socket: AppSocket | null;
  socketReady: boolean;
  userName: string;
  rename: (name: string) => void;
  roomCtx: RoomCtx;
  onRoomCreated: (roomId: string) => void;
  onRoomJoined: (roomId: string) => void;
  onGoToLogin: () => void;
  onGoToRegister: () => void;
  onGoToAllRooms: () => void;
  onGoToLeaderboard: () => void;
  onGoToMe: () => void;
}

export function Lobby({
  socket,
  socketReady,
  userName,
  rename,
  roomCtx,
  onRoomCreated,
  onRoomJoined,
  onGoToLogin,
  onGoToRegister,
  onGoToAllRooms,
  onGoToLeaderboard,
  onGoToMe,
}: LobbyProps) {
  const { t, i18n } = useTranslation('common');
  const session = useSession();
  const authedUser = session.data?.user ?? null;
  const { data: points } = usePoints();
  const { data: recentGames } = useRecentGames();
  const gt = (gameId: string, key: string) => i18n.t(key, { ns: gameId });

  // Translate Chinese tags (source of truth) to whatever locale is active.
  const tagTranslation = buildTagTranslation(i18n);
  const translateTag = (zhTag: string) => tagTranslation.get(zhTag) ?? zhTag;

  const { create, join, listRooms } = roomCtx;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [gameFilter, setGameFilter] = useState<string>('');
  const [myRank, setMyRank] = useState<number | null>(null);
  const roomsSectionRef = useRef<HTMLElement | null>(null);

  const games = Object.values(clientRegistry);
  const filteredGameName = gameFilter
    ? String(gt(gameFilter, 'name'))
    : '';

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

  // Refresh room list whenever the game filter changes. Subsequent refreshes
  // also happen after user-initiated join/create via the route navigation.
  useEffect(() => {
    let cancelled = false;
    listRooms(gameFilter).then((result) => {
      if (!cancelled) setRooms(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listRooms, gameFilter]);

  // Reactive refresh: the server emits `rooms:updated` whenever any waiting-
  // room state changes (create / join / leave / start / kick / restart).
  // No polling needed; lobby stays in sync without 30s lag.
  useEffect(() => {
    if (!socket) return;
    let cancelled = false;
    const handler = () => {
      listRooms(gameFilter).then((result) => {
        if (!cancelled) setRooms(result);
      });
    };
    socket.on('rooms:updated', handler);
    return () => {
      cancelled = true;
      socket.off('rooms:updated', handler);
    };
  }, [socket, listRooms, gameFilter]);

  function handleQuickJoin(code: string) {
    handleJoinRoom(code.trim().toUpperCase());
  }

  async function handleCreate(gameId: string) {
    setError(null);
    if (!socketReady) {
      setError(t('lobby.connectingHint', { defaultValue: 'Connecting to server…' }));
      return;
    }
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
    if (!socketReady) {
      setError(t('lobby.connectingHint', { defaultValue: 'Connecting to server…' }));
      return;
    }
    setLoading(true);
    try {
      await join(roomId, userName);
      track('game_joined', { roomId });
      onRoomJoined(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Clicking a game card filters the room list to that game and scrolls the
  // list into view. Creating a room is then a deliberate second click on the
  // section's "Create <game> room" CTA, so we never spawn ghost rooms.
  function handlePickGame(gameId: string) {
    setGameFilter(gameId);
    // Wait a tick so the new filter renders before scrolling.
    requestAnimationFrame(() => {
      roomsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Hero "Create room" CTA: scroll to the All Games section so the user
  // picks a game first, then the card click kicks off room creation.
  const allGamesSectionRef = useRef<HTMLElement | null>(null);
  function handleCreateRoomCta() {
    allGamesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      /* ignore — user can retry */
    }
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
                onClick={onGoToMe}
              />
            ) : (
              <UserChip guestLabel={t('auth.signInCta')} onSignInClick={onGoToLogin} />
            )}
          </div>
        </div>
      </nav>

      <div className="flex flex-row items-stretch">
        <main className="flex-1 min-w-0">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {authedUser ? (
          <HeroLoggedIn
            points={points?.global ?? 0}
            rank={myRank}
            onCreateRoom={handleCreateRoomCta}
            pointsLabel={t('hero.pointsLabel')}
            rankLabel={t('hero.rankLabel')}
            welcome={t('hero.welcomeBack', { name: authedUser.name })}
            createRoomLabel={t('lobby.createRoomShort')}
          />
        ) : (
          <HeroGuest
            welcome={t('hero.guestWelcome', { name: userName })}
            cta={t('hero.guestCta')}
            onCreateRoom={handleCreateRoomCta}
            createRoomLabel={t('lobby.createRoomShort')}
          />
        )}

        {/* Active rooms */}
        <section ref={roomsSectionRef} className="scroll-mt-20">
          <SectionHead
            title={t('lobby.activeRooms')}
            onViewAll={onGoToAllRooms}
            viewAllLabel={t('lobby.viewAll')}
            actions={
              <QuickJoinBar
                onQuickJoin={handleQuickJoin}
                placeholder={t('hero.roomCodePlaceholder')}
                joinLabel={t('lobby.join')}
              />
            }
          />

          {/* Game filter chips: wrap to 2 rows on desktop, scroll on small screens */}
          <div className="flex flex-wrap gap-2 pb-2 mb-3">
            <FilterChip
              active={gameFilter === ''}
              label={t('lobby.filterAllGames')}
              onClick={() => setGameFilter('')}
            />
            {games.map((g) => (
              <FilterChip
                key={g.meta.id}
                active={gameFilter === g.meta.id}
                label={String(gt(g.meta.id, 'name'))}
                icon={g.meta.icon}
                onClick={() => setGameFilter(g.meta.id)}
              />
            ))}
          </div>

          {rooms.length === 0 ? (
            <div className="bg-card border-2 border-border rounded-[12px] p-6 text-center space-y-3">
              <div className="text-sm text-muted-foreground">
                {gameFilter
                  ? t('lobby.noRoomsForGame', { game: filteredGameName })
                  : t('lobby.noActiveRooms')}
              </div>
              {gameFilter && (
                <button
                  type="button"
                  onClick={() => handleCreate(gameFilter)}
                  disabled={loading || !socketReady}
                  className="inline-flex items-center gap-1 text-sm font-semibold border-2 border-foreground bg-card rounded-[10px] px-3 py-1.5 shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active disabled:opacity-60 transition-all"
                >
                  <Plus className="size-3.5" />
                  {t('lobby.createForGame', { game: filteredGameName })}
                </button>
              )}
            </div>
          ) : (
            <>
              <ViewAllRow>
                {rooms.slice(0, 5).map((r) => (
                  <RoomCard
                    key={r.roomId}
                    room={r}
                    onJoin={() => handleJoinRoom(r.roomId)}
                    joinLabel={t('lobby.join')}
                    disabled={loading || !socketReady}
                  />
                ))}
              </ViewAllRow>
              {gameFilter && (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleCreate(gameFilter)}
                    disabled={loading || !socketReady}
                    className="inline-flex items-center gap-1 text-sm font-semibold border-2 border-foreground bg-card rounded-[10px] px-3 py-1.5 shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active disabled:opacity-60 transition-all"
                  >
                    <Plus className="size-3.5" />
                    {t('lobby.createForGame', { game: filteredGameName })}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Recently played (signed-in only; hidden when empty) */}
        {authedUser && recentGames.length > 0 && (
          <section>
            <SectionHead
              title={t('lobby.recentlyPlayed')}
              onViewAll={onGoToMe}
              viewAllLabel={t('lobby.viewAll')}
            />
            <ViewAllRow>
              {recentGames.map((rg) => {
                const plugin = clientRegistry[rg.gameId];
                const gameName = plugin ? gt(rg.gameId, 'name') : rg.gameId;
                return (
                  <button
                    type="button"
                    key={`${rg.roomId}-${rg.endedAt}`}
                    onClick={() => handleCreate(rg.gameId)}
                    disabled={loading || !socketReady || !plugin}
                    className="snap-start shrink-0 w-[180px] border-2 border-foreground bg-card rounded-[12px] shadow-card p-3 text-left hover:-translate-y-0.5 hover:shadow-card-hover transition-all disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <GameIcon
                        name={plugin?.meta.icon ?? 'rolling-dices'}
                        className="size-4"
                      />
                      <span className="text-sm font-bold leading-tight truncate">
                        {gameName}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {rg.result === 'win'
                        ? t('lobby.resultWin')
                        : rg.result === 'loss'
                          ? t('lobby.resultLoss')
                          : t('lobby.resultDraw')}
                    </div>
                  </button>
                );
              })}
            </ViewAllRow>
          </section>
        )}

        {/* All games */}
        <section ref={allGamesSectionRef} className="scroll-mt-20">
          <SectionHead title={t('lobby.allGames')} />
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {games.map((plugin) => {
              const m = plugin.meta;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => handlePickGame(m.id)}
                  disabled={loading || !socketReady}
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
            {/* "Coming soon" placeholder so the grid feels curated, not sparse.
                Also serves as a subtle roadmap hint. */}
            <div
              aria-hidden="true"
              className="border-2 border-dashed border-border rounded-[16px] p-4 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground bg-card/40 min-h-[120px]"
            >
              <Plus className="size-5 opacity-60" />
              <span className="text-xs font-semibold">{t('lobby.comingSoon')}</span>
            </div>
          </div>
        </section>

        {!socketReady && (
          <div className="bg-[#fff7e0] border-2 border-[#d4a056] rounded-[12px] p-3 text-foreground/80 text-sm">
            {t('lobby.connectingHint', { defaultValue: 'Connecting to server…' })}
          </div>
        )}

        {error && (
          <div className="bg-[#fde8e8] border-2 border-destructive rounded-[12px] p-3 text-destructive font-medium">
            {error}
          </div>
        )}
          </div>
        </main>
        <LobbySidePanel
          authedUser={authedUser}
          userName={userName}
          rename={rename}
          points={points?.global ?? 0}
          myRank={myRank}
          onGoToLogin={onGoToLogin}
          onGoToRegister={onGoToRegister}
          onGoToLeaderboard={onGoToLeaderboard}
          onGoToMe={onGoToMe}
          onGoToAllRooms={onGoToAllRooms}
          onSignOut={authedUser ? handleSignOut : undefined}
        />
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`snap-start shrink-0 inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 border-2 transition-all ${
        active
          ? 'bg-[#fef3e0] border-warning text-[#7a4006] shadow-[2px_2px_0px_0px_#d97706]'
          : 'bg-card border-border text-foreground hover:border-foreground hover:-translate-y-0.5'
      }`}
    >
      {icon && <GameIcon name={icon} className="size-3.5" />}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
