import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '../lib/authClient';

interface ResetPasswordProps {
  onSuccess: () => void;
  onBack: () => void;
}

export function ResetPassword({ onSuccess, onBack }: ResetPasswordProps) {
  const { t } = useTranslation('common');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!token) {
      setError(t('auth.resetTokenInvalid'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (authError) {
        setError(t('auth.resetTokenInvalid'));
        return;
      }
      onSuccess();
    } catch {
      setError(t('auth.resetTokenInvalid'));
    } finally {
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
          <h1 className="text-xl font-bold mb-4 text-foreground">{t('auth.resetPasswordTitle')}</h1>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label
                className="block text-xs font-semibold text-foreground mb-1"
                htmlFor="password"
              >
                {t('auth.newPasswordLabel')}
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {t('auth.resetPasswordSubmit')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
