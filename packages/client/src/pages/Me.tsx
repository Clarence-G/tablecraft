import { ArrowLeft, LogOut } from 'lucide-react';
import Avatar from 'boring-avatars';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { clientRegistry } from '../../../../games/client-registry';
import { authClient } from '../lib/authClient';
import { apiFetch } from '../lib/api';
import { useSession } from '../hooks/useSession';
import { BotManager, type BotRow } from '../components/BotManager';

interface MeApiResponse {
  user: { id: string; email: string; name: string; image: string | null };
  points: { global: number; byGame: Record<string, number> };
  recentGames: unknown[];
  bots?: BotRow[];
}

interface MeProps {
  onBack: () => void;
  onSignedOut: () => void;
}

export function Me({ onBack, onSignedOut }: MeProps) {
  const { t, i18n } = useTranslation('common');
  const gt = (id: string, key: string) => i18n.t(key, { ns: id });
  const session = useSession();
  const authedUser = session.data?.user ?? null;
  const [data, setData] = useState<MeApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!authedUser) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    apiFetch<MeApiResponse>('/api/me', { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setData(res);
      })
      .catch(() => {
        /* silent: shows the empty skeleton */
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authedUser]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
      onSignedOut();
    } catch {
      /* ignore — user can retry */
    } finally {
      setSigningOut(false);
    }
  }

  if (!authedUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{t('me.signedOutNotice')}</p>
          <Button onClick={onBack}>{t('auth.backToLobby')}</Button>
        </div>
      </div>
    );
  }

  const byGameEntries = data
    ? Object.entries(data.points.byGame).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 bg-background border-b-[2.5px] border-foreground px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="size-3.5" />
            {t('auth.backToLobby')}
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <section className="bg-card border-2 border-foreground rounded-[14px] shadow-[4px_4px_0_var(--foreground)] p-4 sm:p-6 flex items-center gap-4">
          <Avatar size={56} name={authedUser.email ?? authedUser.id} variant="beam" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{authedUser.name}</h1>
            <p className="text-xs text-muted-foreground truncate">{authedUser.email}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">
              {loading ? '—' : (data?.points.global ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground">{t('hero.pointsLabel')}</div>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2">{t('me.pointsByGame')}</h2>
          <div className="bg-card border-2 border-border rounded-[12px] overflow-hidden">
            {loading ? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                {t('lobby.loading')}
              </div>
            ) : byGameEntries.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                {t('me.noPointsYet')}
              </div>
            ) : (
              <ul>
                {byGameEntries.map(([gameId, points]) => {
                  const gameName =
                    gameId === 'daily'
                      ? t('me.dailyCheckin')
                      : clientRegistry[gameId]
                        ? gt(gameId, 'name')
                        : gameId;
                  return (
                    <li
                      key={gameId}
                      className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 border-border"
                    >
                      <span className="text-sm font-medium">{gameName}</span>
                      <span className="font-mono text-sm tabular-nums">
                        {points} <span className="text-muted-foreground">pts</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {!loading && <BotManager initialBots={data?.bots ?? []} />}

        <section className="pt-2">
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full"
          >
            <LogOut className="size-4 mr-2" />
            {t('auth.signOut')}
          </Button>
        </section>
      </main>
    </div>
  );
}
