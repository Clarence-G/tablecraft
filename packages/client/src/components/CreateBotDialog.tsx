import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, apiFetch } from '../lib/api';
import type { BotRow } from './BotManager';

interface CreateBotDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (bot: BotRow) => void;
}

interface CreateResponse {
  bot: BotRow;
  token: string;
}

export function CreateBotDialog({ open, onClose, onCreated }: CreateBotDialogProps) {
  const { t } = useTranslation('common');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setName('');
    setSubmitting(false);
    setError(null);
    setToken(null);
    setCopied(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setError(t('me.bots.errorNameLength'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<CreateResponse>('/api/me/bots', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      setToken(res.token);
      onCreated(res.bot);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'BOT_LIMIT_REACHED') setError(t('me.bots.errorLimit'));
        else if (err.code === 'INVALID_BODY') setError(t('me.bots.errorNameLength'));
        else setError(t('me.bots.errorGeneric'));
      } else {
        setError(t('me.bots.errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('me.bots.errorCopy'));
    }
  }

  const showToken = token !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {showToken ? t('me.bots.tokenReadyTitle') : t('me.bots.createTitle')}
          </DialogTitle>
        </DialogHeader>

        {!showToken ? (
          <div className="space-y-3">
            <label className="block" htmlFor="create-bot-name">
              <span className="text-xs font-semibold text-muted-foreground">
                {t('me.bots.nameLabel')}
              </span>
              <Input
                id="create-bot-name"
                type="text"
                autoFocus
                value={name}
                maxLength={40}
                disabled={submitting}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('me.bots.namePlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !submitting) handleCreate();
                }}
                className="mt-1"
              />
            </label>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                {t('me.bots.cancel')}
              </Button>
              <Button onClick={handleCreate} disabled={submitting || name.trim().length === 0}>
                {submitting ? t('me.bots.creating') : t('me.bots.create')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2 items-start rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-snug">{t('me.bots.tokenWarning')}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {t('me.bots.tokenLabel')}
              </span>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border-2 border-border bg-muted font-mono text-xs break-all select-all">
                  {token}
                </code>
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  aria-label={t('me.bots.copy')}
                  className="shrink-0"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? t('me.bots.copied') : t('me.bots.copy')}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground leading-snug">
                {t('me.bots.tokenUsageHint')}
              </p>
              <pre className="px-2 py-1.5 rounded-lg border-2 border-border bg-muted font-mono text-[11px] whitespace-pre-wrap break-all">
                {t('me.bots.tokenUsageExample')}
              </pre>
            </div>

            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end pt-1">
              <Button onClick={handleClose}>{t('me.bots.done')}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
