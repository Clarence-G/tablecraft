import { GameIcon } from '@/components/GameIcon';
import { LeaderboardRow } from '@repo/game-ui/leaderboard';
import type { LeaderboardEntry } from '@repo/shared';
import { ArrowLeft, Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clientRegistry } from '../../../../games/client-registry';
import { useSession } from '../hooks/useSession';
import { apiFetch } from '../lib/api';

interface MyRank {
  rank: number | null;
  points: number;
  total?: number;
}

interface LeaderboardProps {
  onBack: () => void;
}

const OVERALL = 'overall';

export function Leaderboard({ onBack }: LeaderboardProps) {
  const { t, i18n } = useTranslation('common');
  const gt = (id: string, key: string) => i18n.t(key, { ns: id });
  const session = useSession();
  const authedUser = session.data?.user ?? null;

  const games = Object.values(clientRegistry);
  const [tab, setTab] = useState<string>(OVERALL);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [me, setMe] = useState<MyRank | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const qs = tab === OVERALL ? '' : `?gameId=${encodeURIComponent(tab)}`;
    // Guests don't get a "me" row per spec §6.6. Only fetch when signed in.
    const mePromise = authedUser
      ? apiFetch<MyRank>(`/api/leaderboard/me${qs}`, { signal: controller.signal }).catch(
          () => null,
        )
      : Promise.resolve<MyRank | null>(null);
    Promise.all([
      apiFetch<{ entries: LeaderboardEntry[]; total: number }>(`/api/leaderboard${qs}`, {
        signal: controller.signal,
      }).catch(() => ({ entries: [] as LeaderboardEntry[], total: 0 })),
      mePromise,
    ])
      .then(([board, myRow]) => {
        if (controller.signal.aborted) return;
        setEntries(board.entries ?? []);
        setMe(myRow);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, authedUser?.id]);

  const meInTop = Boolean(authedUser && entries.some((e) => e.userId === authedUser.id));
  const showMeRow =
    Boolean(authedUser) && !meInTop && me?.rank != null && (me?.points ?? 0) > 0;

  return (
    <div data-testid="leaderboard-page" className="min-h-screen">
      <nav className="sticky top-0 z-50 bg-background border-b-[2.5px] border-foreground px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm font-semibold border-2 border-border bg-card rounded-[8px] px-2.5 py-1 hover:border-foreground hover:-translate-y-0.5 transition-all"
            aria-label={t('lobby.backToLobby')}
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">{t('leaderboard.title')}</h1>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs: horizontally scrollable on mobile. */}
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-3 mb-3 scrollbar-none">
          <TabButton
            active={tab === OVERALL}
            onClick={() => setTab(OVERALL)}
            label={t('leaderboard.overall')}
          />
          {games.map((g) => (
            <TabButton
              key={g.meta.id}
              active={tab === g.meta.id}
              onClick={() => setTab(g.meta.id)}
              icon={g.meta.icon}
              label={String(gt(g.meta.id, 'name'))}
            />
          ))}
        </div>

        {loading ? (
          <div className="bg-card border-2 border-border rounded-[12px] p-6 text-center text-muted-foreground text-sm">
            {t('lobby.loading')}
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-card border-2 border-border rounded-[12px] p-6 text-center text-muted-foreground text-sm">
            {t('leaderboard.empty')}
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.userId} data-testid="leaderboard-row">
                <LeaderboardRow
                  rank={e.rank}
                  userId={e.userId}
                  name={e.name}
                  points={e.points}
                  highlighted={e.userId === authedUser?.id}
                  youLabel={t('leaderboard.youLabel')}
                  pointsSuffix={t('leaderboard.ptsSuffix')}
                />
                {e.isBot && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 ml-[4.25rem]">
                    <Bot className="size-3" aria-hidden="true" />
                    <span>
                      {e.ownerName
                        ? t('leaderboard.botBy', { name: e.ownerName })
                        : t('leaderboard.botUnowned')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showMeRow && authedUser && me?.rank != null && (
          <div className="sticky bottom-0 mt-4 pb-2 bg-background pt-2">
            <LeaderboardRow
              rank={me.rank}
              userId={authedUser.id}
              name={authedUser.name}
              points={me.points}
              highlighted
              youLabel={t('leaderboard.youLabel')}
              pointsSuffix={t('leaderboard.ptsSuffix')}
            />
          </div>
        )}
      </main>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: string;
}

function TabButton({ active, onClick, label, icon }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`snap-start shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold border-2 rounded-full px-3 py-1.5 transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:border-foreground'
      }`}
    >
      {icon && <GameIcon name={icon} className="size-3.5" />}
      <span>{label}</span>
    </button>
  );
}
