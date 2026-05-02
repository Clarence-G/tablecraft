import { GameActionDialog } from '@/components/GameActionDialog';
import { GameCoverImage } from '@/components/GameCoverImage';
import { GameIcon } from '@/components/GameIcon';
import { LobbySidePanel } from '@/components/layout/LobbySidePanel';
import { LocaleSwitch } from '@/components/LocaleSwitch';
import { ViewAllRow } from '@repo/game-ui/layout';
import { SectionHead } from '@repo/game-ui/section';
import { UserChip } from '@repo/game-ui/user';
import type { ClientEvents, RoomSummary, ServerEvents } from '@repo/shared';
import { ChevronDown, Clock, Plus, Users } from 'lucide-react';
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
import { buildTagTranslation } from '../lib/tags';
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
  onRoomSpectated: (roomId: string) => void;
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
  onRoomSpectated,
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
  const [allGamesExpanded, setAllGamesExpanded] = useState<boolean>(false);
  /** Game currently opened in the action dialog (null = dialog closed). */
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
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
      setError(t('lobby.connectingHint'));
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
      setError(t('lobby.connectingHint'));
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

  // Clicking a game card opens a focused modal for that game — pick an active
  // room to join, or create a new one, without touching the global filter or
  // scrolling away from where the user clicked.
  function handlePickGame(gameId: string) {
    setSelectedGameId(gameId);
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

          {/* Game filter chips + contextual create-room action: single row so layout stays stable when filter toggles */}
          <div className="flex flex-wrap items-center gap-2 pb-2 mb-3">
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
            {gameFilter && (
              <button
                type="button"
                onClick={() => handleCreate(gameFilter)}
                disabled={loading || !socketReady}
                data-testid="create-room-btn"
                className="ml-auto inline-flex items-center gap-1 text-sm font-semibold border-2 border-foreground bg-card rounded-full px-3 py-1 shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active disabled:opacity-60 transition-all"
              >
                <Plus className="size-3.5" />
                {t('lobby.createForGame', { game: filteredGameName })}
              </button>
            )}
          </div>

          {rooms.length === 0 ? (
            <div className="bg-card border-2 border-border rounded-[12px] p-6 text-center space-y-3">
              <div className="text-sm text-muted-foreground">
                {gameFilter
                  ? t('lobby.noRoomsForGame', { game: filteredGameName })
                  : t('lobby.noActiveRooms')}
              </div>
            </div>
          ) : (
            <ViewAllRow>
              {rooms.slice(0, 5).map((r) => (
                <RoomCard
                  key={r.roomId}
                  room={r}
                  onJoin={() => handleJoinRoom(r.roomId)}
                  onSpectate={() => onRoomSpectated(r.roomId)}
                  joinLabel={t('lobby.join')}
                  spectateLabel={t('lobby.room.spectate')}
                  disabled={loading || !socketReady}
                />
              ))}
            </ViewAllRow>
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
          {(() => {
            const COLLAPSED_COUNT = 6;
            const canCollapse = games.length > COLLAPSED_COUNT;
            const visibleGames =
              !canCollapse || allGamesExpanded ? games : games.slice(0, COLLAPSED_COUNT);
            return (
              <>
                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                  {visibleGames.map((plugin) => {
              const m = plugin.meta;
              const tagList = m.tags ?? [];
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => handlePickGame(m.id)}
                  disabled={loading || !socketReady}
                  data-testid={`game-card-${m.id}`}
                  className="group relative border-thick rounded-[16px] text-left transition-all duration-200 hover:-translate-y-1 hover:-rotate-[1.5deg] hover:shadow-card-hover active:translate-y-0 active:rotate-0 active:shadow-card-active bg-card border-foreground shadow-card disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:rotate-0 disabled:hover:shadow-card overflow-hidden aspect-square"
                >
                  {/* Full-bleed cover image */}
                  <GameCoverImage
                    gameId={m.id}
                    fallbackIcon={m.icon ?? 'rolling-dices'}
                    className="absolute inset-0 size-full"
                  />

                  {/* Persistent top-left name plate.
                      A solid (non-see-through) amber-dark pill with top highlight,
                      gold-cream typography and a soft drop shadow — reads like a
                      small engraved nameplate that sits on top of any cover art.
                      No icon: the SVG game icons are black-on-dark and unreadable
                      here; the game name alone is enough. */}
                  <div className="absolute top-2 left-2 z-10 flex items-center rounded-full px-3 py-1 border border-[#2a1810]/70 bg-[linear-gradient(180deg,#4a2e1a_0%,#2a1810_100%)] shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,220,170,0.25)]">
                    <span className="text-xs font-bold leading-tight text-[#fef3e0] tracking-wide">
                      {gt(m.id, 'name')}
                    </span>
                  </div>

                  {/* Hover overlay: description + tags slide up from bottom.
                      On touch devices (no hover), overlay is hidden — the persistent badge is enough. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 z-10 p-3 bg-gradient-to-t from-black/85 via-black/60 to-transparent text-white opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none"
                  >
                    <div className="text-[11px] leading-snug text-white/90 mb-2 line-clamp-3">
                      {gt(m.id, 'description')}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-white bg-white/15 border border-white/25 rounded-full px-1.5 py-0.5 backdrop-blur-sm">
                        <Users className="size-2.5" />
                        {m.minPlayers === m.maxPlayers
                          ? m.minPlayers
                          : `${m.minPlayers}-${m.maxPlayers}`}
                        {t('lobby.players')}
                      </span>
                      {m.estimatedMinutes && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-white bg-white/15 border border-white/25 rounded-full px-1.5 py-0.5 backdrop-blur-sm">
                          <Clock className="size-2.5" />
                          {m.estimatedMinutes}
                          {t('lobby.minutes')}
                        </span>
                      )}
                      {tagList.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-semibold text-white bg-white/15 border border-white/25 rounded-full px-1.5 py-0.5 backdrop-blur-sm"
                        >
                          {translateTag(tag)}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
                  {/* "Coming soon" placeholder shown only when expanded or when there's nothing to collapse */}
                  {(!canCollapse || allGamesExpanded) && (
                    <div
                      aria-hidden="true"
                      className="border-2 border-dashed border-border rounded-[16px] p-4 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground bg-card/40 aspect-square"
                    >
                      <Plus className="size-5 opacity-60" />
                      <span className="text-xs font-semibold">{t('lobby.comingSoon')}</span>
                    </div>
                  )}
                </div>
                {canCollapse && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setAllGamesExpanded((v) => !v)}
                      aria-expanded={allGamesExpanded}
                      className="group/expand relative inline-flex items-center gap-2 text-sm font-bold text-[#5a3820] px-5 py-2 rounded-full border-2 border-[#8a5a2b] bg-[linear-gradient(180deg,#fef3e0_0%,#f5deb3_55%,#ebc98a_100%)] shadow-[0_3px_0_0_#8a5a2b,0_6px_12px_-2px_rgba(90,56,32,0.35)] hover:-translate-y-0.5 hover:shadow-[0_4px_0_0_#8a5a2b,0_8px_14px_-2px_rgba(90,56,32,0.4)] active:translate-y-[2px] active:shadow-[0_1px_0_0_#8a5a2b,0_2px_4px_-1px_rgba(90,56,32,0.3)] transition-all duration-150"
                    >
                      {/* subtle top highlight stripe for the 3D-pill feel */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-2 top-[2px] h-[30%] rounded-full bg-white/45 blur-[1px]"
                      />
                      <span className="relative">
                        {allGamesExpanded
                          ? t('lobby.showFewerGames')
                          : t('lobby.showMoreGames', { count: games.length })}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`relative size-4 transition-transform duration-200 ${allGamesExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </section>

        {!socketReady && (
          <div className="bg-[#fff7e0] border-2 border-[#d4a056] rounded-[12px] p-3 text-foreground/80 text-sm">
            {t('lobby.connectingHint')}
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

      {/* Game preview + action dialog. Opens when a game card is tapped. */}
      <GameActionDialog
        game={(() => {
          if (!selectedGameId) return null;
          const plugin = clientRegistry[selectedGameId];
          if (!plugin) return null;
          const m = plugin.meta;
          return {
            id: m.id,
            name: m.name,
            description: m.description,
            minPlayers: m.minPlayers,
            maxPlayers: m.maxPlayers,
            estimatedMinutes: m.estimatedMinutes,
            icon: m.icon,
            tags: m.tags,
          };
        })()}
        displayName={selectedGameId ? String(gt(selectedGameId, 'name')) : ''}
        description={selectedGameId ? String(gt(selectedGameId, 'description')) : ''}
        tags={
          selectedGameId
            ? (clientRegistry[selectedGameId]?.meta.tags ?? []).map((tag) => translateTag(tag))
            : []
        }
        fetchRooms={(gameId) => listRooms(gameId)}
        onClose={() => setSelectedGameId(null)}
        onCreate={async (gameId) => {
          setSelectedGameId(null);
          await handleCreate(gameId);
        }}
        onJoin={async (roomId) => {
          setSelectedGameId(null);
          await handleJoinRoom(roomId);
        }}
        onSpectate={(roomId) => {
          setSelectedGameId(null);
          onRoomSpectated(roomId);
        }}
        disabled={loading || !socketReady}
      />
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
