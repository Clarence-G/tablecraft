import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '../lib/authClient';

interface ForgotPasswordProps {
  onBack: () => void;
}

export function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const { t } = useTranslation('common');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } finally {
      // Always show the same message — don't reveal whether email exists.
      setSubmitted(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground mb-4 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 inline-block mr-1" />
          {t('auth.backToLogin')}
        </button>
        <div className="bg-card border-2 border-border rounded-xl shadow-[4px_4px_0_var(--border)] p-6">
          <h1 className="text-xl font-bold mb-2 text-foreground">{t('auth.forgotPasswordTitle')}</h1>
          <p className="text-sm text-muted-foreground mb-4">{t('auth.forgotPasswordDesc')}</p>

          {submitted ? (
            <p className="text-sm text-foreground">{t('auth.resetLinkSent')}</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="email">
                  {t('auth.emailLabel')}
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {t('auth.sendResetLink')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
