import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, ApiError } from '../lib/api';

interface RevokeBotConfirmProps {
  open: boolean;
  botUserId: string;
  botName: string;
  onCancel: () => void;
  onRevoked: () => void;
}

export function RevokeBotConfirm({
  open,
  botUserId,
  botName,
  onCancel,
  onRevoked,
}: RevokeBotConfirmProps) {
  const { t } = useTranslation('common');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/me/bots/${encodeURIComponent(botUserId)}`, {
        method: 'DELETE',
      });
      onRevoked();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NOT_OWNER') setError(t('me.bots.errorNotOwner'));
        else if (err.code === 'NOT_FOUND') setError(t('me.bots.errorNotFound'));
        else setError(t('me.bots.errorGeneric'));
      } else {
        setError(t('me.bots.errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('me.bots.revokeTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-snug">
          {t('me.bots.revokeConfirm', { name: botName })}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            {t('me.bots.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleRevoke} disabled={submitting}>
            {submitting ? t('me.bots.revoking') : t('me.bots.revoke')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
