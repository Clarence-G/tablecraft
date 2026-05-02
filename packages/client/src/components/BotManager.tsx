import { Button } from '@/components/ui/button';
import { Bot, Check, Copy, Dices, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../lib/api';
import { CreateBotDialog } from './CreateBotDialog';
import { RevokeBotConfirm } from './RevokeBotConfirm';

// TODO: move to @repo/shared once backend worker lands the shared export.
export interface BotRow {
  userId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const MAX_BOTS = 5;

interface BotManagerProps {
  initialBots: BotRow[];
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function BotManager({ initialBots }: BotManagerProps) {
  const { t, i18n } = useTranslation('common');
  const [bots, setBots] = useState<BotRow[]>(
    initialBots.filter((b) => b.revokedAt === null),
  );
  // When the parent's `/api/me` fetch resolves AFTER mount, `initialBots`
  // transitions from `[]` to the real array. Without this effect, the
  // useState initializer above keeps the stale `[]`. We sync whenever the
  // parent-provided list changes. Local edits (create/revoke) still win in
  // between parent updates — the effect only fires when `initialBots`
  // identity changes, not on every render.
  useEffect(() => {
    setBots(initialBots.filter((b) => b.revokedAt === null));
  }, [initialBots]);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<BotRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const remaining = useMemo(() => Math.max(0, MAX_BOTS - bots.length), [bots.length]);
  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';

  async function refresh() {
    try {
      const res = await apiFetch<{ bots: BotRow[]; remaining: number }>('/api/me/bots');
      setBots(res.bots.filter((b) => b.revokedAt === null));
    } catch {
      /* keep local state; surface nothing — user can retry */
    }
  }

  function handleCreated(bot: BotRow) {
    setBots((prev) => [bot, ...prev.filter((b) => b.userId !== bot.userId)]);
  }

  function handleRevoked() {
    if (revokeTarget) {
      setBots((prev) => prev.filter((b) => b.userId !== revokeTarget.userId));
    }
    setRevokeTarget(null);
    void refresh();
  }

  async function copyUserId(userId: string) {
    try {
      await navigator.clipboard.writeText(userId);
      setCopiedId(userId);
      setTimeout(() => setCopiedId((curr) => (curr === userId ? null : curr)), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <section>
      <div className="flex items-end justify-between mb-2 gap-2">
        <div>
          <h2 className="text-base font-semibold">{t('me.bots.title')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('me.bots.remaining', { n: remaining })}
          </p>
        </div>
        {bots.length > 0 && (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={remaining === 0}
            title={remaining === 0 ? t('me.bots.limitReached') : undefined}
          >
            <Plus className="size-3.5" />
            {t('me.bots.createNew')}
          </Button>
        )}
      </div>

      {bots.length === 0 ? (
        <div className="bg-card border-2 border-border rounded-[12px] p-6 text-center">
          <Dices className="size-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground mb-4">{t('me.bots.emptyHint')}</p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('me.bots.createFirst')}
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {bots.map((bot) => {
            const copied = copiedId === bot.userId;
            return (
              <li
                key={bot.userId}
                className="bg-card border-2 border-border rounded-[12px] p-3 flex items-start gap-3"
              >
                <div className="size-10 rounded-full bg-secondary border-2 border-border flex items-center justify-center shrink-0">
                  <Bot className="size-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{bot.name}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <code className="font-mono text-[11px] text-muted-foreground truncate">
                      {bot.userId}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyUserId(bot.userId)}
                      className="inline-flex items-center text-muted-foreground hover:text-foreground p-0.5 rounded"
                      aria-label={t('me.bots.copyUserId')}
                    >
                      {copied ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span>
                      {t('me.bots.createdAt', { date: formatDate(bot.createdAt, locale) })}
                    </span>
                    <span className="mx-1.5">·</span>
                    <span>
                      {bot.lastUsedAt
                        ? t('me.bots.lastUsedAt', {
                            date: formatDate(bot.lastUsedAt, locale),
                          })
                        : t('me.bots.lastUsedNever')}
                    </span>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRevokeTarget(bot)}
                  aria-label={t('me.bots.revoke')}
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only sm:not-sr-only">{t('me.bots.revoke')}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <CreateBotDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
      {revokeTarget && (
        <RevokeBotConfirm
          open={revokeTarget !== null}
          botUserId={revokeTarget.userId}
          botName={revokeTarget.name}
          onCancel={() => setRevokeTarget(null)}
          onRevoked={handleRevoked}
        />
      )}
    </section>
  );
}
