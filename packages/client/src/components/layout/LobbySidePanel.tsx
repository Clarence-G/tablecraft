import Avatar from 'boring-avatars';
import {
  History,
  PanelRightClose,
  PanelRightOpen,
  Trophy,
  User as UserIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LeaderboardRow } from '@repo/game-ui/leaderboard';
import { apiFetch } from '../../lib/api';
import { useRecentGames, type RecentGame } from '../../hooks/useRecentGames';

const STORAGE_KEY = 'lobbysidepanel.expanded';

type TabId = 'leaderboard' | 'profile' | 'recent';

interface SessionUser {
  id: string;
  name: string;
  email?: string | null;
}

interface LobbySidePanelProps {
  /** Authenticated user, or null when the visitor is a guest. */
  authedUser: SessionUser | null;
  /** Guest display name (always present so the profile tab can edit it). */
  userName: string;
  /** Rename the guest display name. No-op for authed users. */
  rename: (name: string) => void;
  /** Global points total for the authed user. */
  points: number;
  /** Global rank for the authed user, or null when they have no points yet. */
  myRank: number | null;
  onGoToLogin: () => void;
  onGoToRegister: () => void;
  onGoToLeaderboard: () => void;
  onGoToMe: () => void;
  onGoToAllRooms: () => void;
  onSignOut?: () => void;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
}

function readInitialExpanded(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return true; // default: open on desktop
}

// ---------- TabButton / RailIcon (mirrors game-ui SidePanel shapes) ----------

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Trophy;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-1 px-2 py-1.5 rounded-[10px] text-xs font-semibold border-2 transition-all ${
        active
          ? 'bg-[#fef3e0] border-warning text-[#7a4006] shadow-button'
          : 'bg-card border-foreground text-muted-foreground shadow-[#3d2e1e_-2px_2px_0px] hover:-translate-y-0.5'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function RailIcon({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Trophy;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative flex items-center justify-center size-8 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// ---------- Leaderboard tab ----------

type Period = 'all' | 'week' | 'day';

function PeriodPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border-2 transition-all ${
        active
          ? 'bg-[#fef3e0] border-warning text-[#7a4006] shadow-[2px_2px_0px_0px_#d97706]'
          : 'bg-card border-border text-muted-foreground hover:border-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function LeaderboardTab({ onGoFull }: { onGoFull: () => void }) {
  const { t } = useTranslation('common');
  const [period, setPeriod] = useState<Period>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    apiFetch<{ entries: LeaderboardEntry[]; total: number }>(
      `/api/leaderboard?limit=10&period=${period}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!controller.signal.aborted) setEntries(r.entries ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEntries([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Period switch: 总榜 / 周榜 / 日榜 */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-background/40">
        <PeriodPill
          active={period === 'all'}
          label={t('lobbyPanel.leaderboard.periodAll')}
          onClick={() => setPeriod('all')}
        />
        <PeriodPill
          active={period === 'week'}
          label={t('lobbyPanel.leaderboard.periodWeek')}
          onClick={() => setPeriod('week')}
        />
        <PeriodPill
          active={period === 'day'}
          label={t('lobbyPanel.leaderboard.periodDay')}
          onClick={() => setPeriod('day')}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {loading ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            {t('lobby.loading')}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            {t('lobbyPanel.leaderboard.empty')}
          </div>
        ) : (
          entries.map((e) => (
            <LeaderboardRow
              key={e.userId}
              rank={e.rank}
              userId={e.userId}
              name={e.name}
              points={e.points}
              pointsSuffix={t('leaderboard.ptsSuffix')}
            />
          ))
        )}
        <button
          type="button"
          onClick={onGoFull}
          className="mt-1 text-xs font-semibold text-foreground underline-offset-2 hover:underline self-center"
        >
          {t('lobbyPanel.leaderboard.viewFull')}
        </button>
      </div>
    </div>
  );
}

// ---------- Profile tab ----------

function ProfileTab({
  authedUser,
  userName,
  rename,
  points,
  myRank,
  onGoToLogin,
  onGoToRegister,
  onGoToMe,
  onSignOut,
}: {
  authedUser: SessionUser | null;
  userName: string;
  rename: (n: string) => void;
  points: number;
  myRank: number | null;
  onGoToLogin: () => void;
  onGoToRegister: () => void;
  onGoToMe: () => void;
  onSignOut?: () => void;
}) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState(userName);

  useEffect(() => {
    setDraft(userName);
  }, [userName]);

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== userName) rename(trimmed);
  }

  if (!authedUser) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 pt-2">
          <Avatar size={56} name={userName} variant="beam" />
          <div className="text-sm font-bold text-foreground">{userName}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('lobbyPanel.profile.guestTitle')}
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('lobbyPanel.profile.guestHint')}
        </p>

        <label className="flex flex-col gap-1.5 text-xs">
          <span className="font-semibold text-foreground">
            {t('lobbyPanel.profile.renameLabel')}
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={40}
              className="flex-1 text-xs px-3 py-2 rounded-[8px] border-2 border-foreground bg-card focus:outline-none focus:ring-2 focus:ring-warning/30"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!draft.trim() || draft.trim() === userName}
              className="px-3 rounded-[8px] border-2 border-foreground bg-[#fef3e0] text-[#7a4006] text-xs font-bold shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 transition-all"
            >
              {t('lobbyPanel.profile.saveName')}
            </button>
          </div>
        </label>

        <div className="flex flex-col gap-2 mt-2">
          <button
            type="button"
            onClick={onGoToRegister}
            className="w-full px-3 py-2 rounded-[10px] border-2 border-foreground bg-primary text-primary-foreground text-xs font-bold shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active transition-all"
          >
            {t('auth.signUp')}
          </button>
          <button
            type="button"
            onClick={onGoToLogin}
            className="w-full px-3 py-2 rounded-[10px] border-2 border-border bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
          >
            {t('auth.signIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      <button
        type="button"
        onClick={onGoToMe}
        className="flex flex-col items-center gap-2 pt-2 text-center group"
        title={t('lobbyPanel.profile.loggedInHint')}
      >
        <Avatar
          size={56}
          name={authedUser.email ?? authedUser.id}
          variant="beam"
        />
        <div className="text-sm font-bold text-foreground group-hover:underline">
          {authedUser.name}
        </div>
        {authedUser.email && (
          <div className="text-[11px] text-muted-foreground truncate max-w-full">
            {authedUser.email}
          </div>
        )}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center gap-0.5 p-2 rounded-[10px] border-2 border-border bg-card">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('hero.pointsLabel')}
          </span>
          <span className="text-base font-bold text-foreground tabular-nums">{points}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 p-2 rounded-[10px] border-2 border-border bg-card">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('hero.rankLabel')}
          </span>
          <span className="text-base font-bold text-foreground tabular-nums">
            {myRank === null ? '—' : `#${myRank}`}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onGoToMe}
        className="w-full px-3 py-2 rounded-[10px] border-2 border-foreground bg-[#fef3e0] text-[#7a4006] text-xs font-bold shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active transition-all"
      >
        {t('me.navLink')}
      </button>

      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          className="w-full px-3 py-2 rounded-[10px] border-2 border-border bg-secondary/50 text-muted-foreground text-xs font-semibold hover:bg-secondary/80 transition-colors"
        >
          {t('auth.signOut')}
        </button>
      )}
    </div>
  );
}

// ---------- Recent tab ----------

function RecentTab({
  authedUser,
  onGoToAllRooms,
}: {
  authedUser: SessionUser | null;
  onGoToAllRooms: () => void;
}) {
  const { t, i18n } = useTranslation('common');
  const { data: recent, isPending } = useRecentGames();
  const gt = (id: string, key: string) => i18n.t(key, { ns: id });

  if (!authedUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8">
        <History className="w-12 h-12 text-foreground/30" strokeWidth={1.5} />
        <div className="text-xs text-center text-muted-foreground">
          {t('lobbyPanel.recent.emptyGuest')}
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
        {t('lobby.loading')}
      </div>
    );
  }

  if (recent.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8">
        <History className="w-12 h-12 text-foreground/30" strokeWidth={1.5} />
        <div className="text-xs text-center text-muted-foreground">
          {t('lobbyPanel.recent.empty')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
      {recent.slice(0, 5).map((g: RecentGame) => (
        <RecentRow key={`${g.roomId}-${g.endedAt}`} game={g} gt={gt} t={t} />
      ))}
      <button
        type="button"
        onClick={onGoToAllRooms}
        className="mt-1 text-xs font-semibold text-foreground underline-offset-2 hover:underline self-center"
      >
        {t('lobbyPanel.recent.viewAll')}
      </button>
    </div>
  );
}

function RecentRow({
  game,
  gt,
  t,
}: {
  game: RecentGame;
  gt: (id: string, key: string) => string;
  t: (key: string) => string;
}) {
  const resultLabel =
    game.result === 'win'
      ? t('lobby.resultWin')
      : game.result === 'loss'
        ? t('lobby.resultLoss')
        : t('lobby.resultDraw');
  const tone =
    game.result === 'win'
      ? 'border-success/60 bg-success/10 text-success'
      : game.result === 'loss'
        ? 'border-destructive/50 bg-destructive/10 text-destructive'
        : 'border-border bg-muted text-muted-foreground';
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] border-2 border-border bg-card text-xs">
      <span className="font-semibold truncate">
        {gt(game.gameId, `${game.gameId}:meta.name`)}
      </span>
      <span
        className={`inline-flex items-center font-bold text-[10px] uppercase tracking-wide border rounded-full px-2 py-0.5 ${tone}`}
      >
        {resultLabel}
      </span>
    </div>
  );
}

// ---------- PanelBody (shared between desktop expanded + mobile drawer) ----------

interface PanelBodyProps {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  onCollapse: () => void;
  props: LobbySidePanelProps;
}

function PanelBody({ activeTab, setActiveTab, onCollapse, props }: PanelBodyProps) {
  const { t } = useTranslation('common');
  return (
    <>
      <div className="flex items-center gap-1.5 px-2 pr-3 py-2 border-b-2 border-foreground bg-secondary/60">
        <TabButton
          active={activeTab === 'leaderboard'}
          label={t('lobbyPanel.tab.leaderboard')}
          icon={Trophy}
          onClick={() => setActiveTab('leaderboard')}
        />
        <TabButton
          active={activeTab === 'profile'}
          label={t('lobbyPanel.tab.profile')}
          icon={UserIcon}
          onClick={() => setActiveTab('profile')}
        />
        <TabButton
          active={activeTab === 'recent'}
          label={t('lobbyPanel.tab.recent')}
          icon={History}
          onClick={() => setActiveTab('recent')}
        />
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t('lobbyPanel.collapse')}
          title={t('lobbyPanel.collapse')}
          className="ml-auto flex items-center justify-center size-7 rounded-[8px] border-2 border-foreground bg-card text-foreground shadow-[#3d2e1e_-2px_2px_0px] hover:-translate-y-0.5 transition-all"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        {activeTab === 'leaderboard' ? (
          <LeaderboardTab onGoFull={props.onGoToLeaderboard} />
        ) : activeTab === 'profile' ? (
          <ProfileTab
            authedUser={props.authedUser}
            userName={props.userName}
            rename={props.rename}
            points={props.points}
            myRank={props.myRank}
            onGoToLogin={props.onGoToLogin}
            onGoToRegister={props.onGoToRegister}
            onGoToMe={props.onGoToMe}
            onSignOut={props.onSignOut}
          />
        ) : (
          <RecentTab authedUser={props.authedUser} onGoToAllRooms={props.onGoToAllRooms} />
        )}
      </div>
    </>
  );
}

// ---------- Top-level component (three-state: rail / expanded / mobile drawer) ----------

export function LobbySidePanel(props: LobbySidePanelProps) {
  const { t } = useTranslation('common');
  const [expanded, setExpanded] = useState<boolean>(readInitialExpanded);
  const [activeTab, setActiveTab] = useState<TabId>('leaderboard');

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(expanded));
    }
  }, [expanded]);

  // NOTE: we intentionally let guests open the 'recent' tab — the tab body
  // already renders a "sign in to see recent games" empty state, which is
  // a better teaching moment than silently forbidding the click.

  function openToTab(tab: TabId) {
    setActiveTab(tab);
    setExpanded(true);
  }

  const tabLabels: Record<TabId, string> = useMemo(
    () => ({
      leaderboard: t('lobbyPanel.tab.leaderboard'),
      profile: t('lobbyPanel.tab.profile'),
      recent: t('lobbyPanel.tab.recent'),
    }),
    [t],
  );

  return (
    <>
      {/* Desktop rail (collapsed) */}
      {!expanded && (
        <aside
          data-testid="lobby-side-panel-rail"
          className="hidden md:flex flex-col items-center gap-1 w-11 py-2 border-l-2 border-border bg-card/60 backdrop-blur-sm sticky top-[60px] h-[calc(100vh-60px)]"
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('lobbyPanel.expand')}
            title={t('lobbyPanel.expand')}
            className="flex items-center justify-center size-8 rounded-[8px] border-2 border-foreground bg-card text-foreground shadow-[#3d2e1e_-2px_2px_0px] hover:-translate-y-0.5 hover:shadow-button transition-all"
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
          </button>
          <RailIcon
            label={tabLabels.leaderboard}
            icon={Trophy}
            onClick={() => openToTab('leaderboard')}
          />
          <RailIcon
            label={tabLabels.profile}
            icon={UserIcon}
            onClick={() => openToTab('profile')}
          />
          <RailIcon
            label={tabLabels.recent}
            icon={History}
            onClick={() => openToTab('recent')}
          />
        </aside>
      )}

      {/* Desktop expanded — sticky inline column */}
      {expanded && (
        <aside
          data-testid="lobby-side-panel-desktop"
          className="hidden md:flex flex-col w-72 lg:w-80 border-l-2 border-border bg-card/90 backdrop-blur-sm sticky top-[60px] h-[calc(100vh-60px)]"
        >
          <PanelBody
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onCollapse={() => setExpanded(false)}
            props={props}
          />
        </aside>
      )}

      {/* Mobile FAB when collapsed */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={t('lobbyPanel.expand')}
          className="md:hidden fixed right-4 bottom-4 z-40 w-12 h-12 rounded-[14px] bg-card border-2 border-foreground shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active flex items-center justify-center text-foreground transition-all"
        >
          <Trophy className="w-5 h-5" />
        </button>
      )}

      {/* Mobile drawer */}
      {expanded && (
        <>
          <button
            type="button"
            aria-label={t('lobbyPanel.collapse')}
            onClick={() => setExpanded(false)}
            className="md:hidden fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
          />
          <aside
            data-testid="lobby-side-panel-mobile"
            className="md:hidden fixed right-0 top-0 bottom-0 z-50 w-[85vw] max-w-sm bg-card border-l-2 border-foreground flex flex-col shadow-card"
          >
            <PanelBody
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onCollapse={() => setExpanded(false)}
              props={props}
            />
          </aside>
        </>
      )}
    </>
  );
}
