import { GameIcon } from '@/components/GameIcon';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Clock, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clientRegistry } from '../../../../games/client-registry';
import { TAG_COLORS, allTags, buildTagTranslation } from '../lib/tags';

interface GamesAllProps {
  userName: string;
  onBack: () => void;
  /** Fired when the user clicks a game card. Delegates to App so the create flow lives in one place. */
  onCreateRoom: (gameId: string) => Promise<void>;
}

export function GamesAll({ userName: _userName, onBack, onCreateRoom }: GamesAllProps) {
  const { t, i18n } = useTranslation('common');
  const gt = (id: string, key: string) => i18n.t(key, { ns: id });

  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read URL query once on mount. We intentionally don't watch history changes
  // beyond this — there's no router, so back/forward through URL isn't a flow
  // we need to support; we only mirror state → URL for shareable links.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const tag = params.get('tag');
    if (q) setQuery(q);
    if (tag) setActiveTag(tag);
  }, []);

  // Push state → URL on every filter change. `replaceState` avoids a history
  // entry per keystroke.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (activeTag) params.set('tag', activeTag);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [query, activeTag]);

  const games = Object.values(clientRegistry);
  const tagTranslation = useMemo(() => buildTagTranslation(i18n), [i18n, i18n.language]);
  const translateTag = (zh: string) => tagTranslation.get(zh) ?? zh;
  const tags = allTags();

  const filtered = games.filter((g) => {
    if (activeTag && !(g.meta.tags ?? []).includes(activeTag)) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    const name = String(gt(g.meta.id, 'name')).toLowerCase();
    return name.includes(needle);
  });

  async function handleCreate(gameId: string) {
    setError(null);
    setLoading(true);
    try {
      await onCreateRoom(gameId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
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
          <h1 className="text-xl font-bold text-foreground">{t('gamesAll.title')}</h1>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Search */}
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('gamesAll.searchPlaceholder')}
            className="h-10 pl-9 border-2 border-border rounded-[10px]"
          />
        </div>

        {/* Tag chips */}
        {tags.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={`text-xs font-semibold border-2 rounded-full px-2.5 py-1 transition-colors ${
                activeTag === null
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground'
              }`}
            >
              {t('gamesAll.allTags')}
            </button>
            {tags.map((tag) => {
              const active = activeTag === tag;
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => setActiveTag(active ? null : tag)}
                  className={`text-xs font-semibold border-2 rounded-full px-2.5 py-1 transition-colors ${
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : (TAG_COLORS[tag] ?? 'bg-card text-muted-foreground border-border')
                  }`}
                >
                  {translateTag(tag)}
                </button>
              );
            })}
          </div>
        )}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="bg-card border-2 border-border rounded-[12px] p-6 text-center text-muted-foreground text-sm">
            {t('gamesAll.noMatches')}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filtered.map((plugin) => {
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
        )}

        {error && (
          <div className="bg-[#fde8e8] border-2 border-destructive rounded-[12px] p-3 text-destructive font-medium">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
