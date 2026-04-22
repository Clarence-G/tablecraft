import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIdentity } from '../hooks/useIdentity';
import { claimGuest } from '../lib/api';
import { authClient } from '../lib/authClient';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.082 3.292 9.384 7.86 10.907.575.105.787-.248.787-.553 0-.274-.01-.998-.015-1.96-3.197.694-3.872-1.54-3.872-1.54-.523-1.33-1.278-1.684-1.278-1.684-1.044-.714.08-.7.08-.7 1.155.082 1.762 1.187 1.762 1.187 1.026 1.76 2.693 1.252 3.35.957.103-.744.4-1.253.728-1.54-2.553-.29-5.237-1.276-5.237-5.68 0-1.254.448-2.28 1.184-3.085-.12-.29-.513-1.46.11-3.046 0 0 .965-.31 3.16 1.178a10.97 10.97 0 0 1 2.876-.387c.976.005 1.96.132 2.876.387 2.194-1.488 3.158-1.178 3.158-1.178.625 1.586.232 2.756.113 3.046.738.806 1.183 1.832 1.183 3.085 0 4.416-2.688 5.386-5.25 5.67.412.354.78 1.052.78 2.122 0 1.532-.014 2.767-.014 3.143 0 .308.208.664.793.552C20.21 21.38 23.5 17.08 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
    </svg>
  );
}

interface LoginProps {
  onSuccess: () => void;
  onGoToRegister: () => void;
  onBack: () => void;
}

export function Login({ onSuccess, onGoToRegister, onBack }: LoginProps) {
  const { t } = useTranslation('common');
  const { guestId } = useIdentity();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await authClient.signIn.email({
        email,
        password,
      });
      if (authError) {
        setError(mapAuthError(authError, t));
        return;
      }
      if (data) {
        // Fire-and-forget merge of the guest's ledger rows. Errors are
        // swallowed inside claimGuest (409s are expected on repeat logins).
        await claimGuest(guestId);
        onSuccess();
      }
    } catch {
      setError(t('auth.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  async function githubSignIn() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: window.location.origin,
      });
    } catch {
      setError(t('auth.errorGeneric'));
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
          {t('auth.backToLobby')}
        </button>
        <div className="bg-card border-2 border-border rounded-xl shadow-[4px_4px_0_var(--border)] p-6">
          <h1 className="text-xl font-bold mb-4 text-foreground">{t('auth.signIn')}</h1>

          <Button
            type="button"
            onClick={githubSignIn}
            variant="outline"
            className="w-full mb-4"
            disabled={loading}
          >
            <GithubIcon className="size-4 mr-2" />
            {t('auth.continueWithGithub')}
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs text-muted-foreground">
                {t('auth.orDivider')}
              </span>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="email">
                {t('auth.email')}
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
            <div>
              <label
                className="block text-xs font-semibold text-foreground mb-1"
                htmlFor="password"
              >
                {t('auth.password')}
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
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
              {t('auth.signIn')}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            {t('auth.noAccount')}{' '}
            <button
              type="button"
              onClick={onGoToRegister}
              className="underline text-foreground hover:text-primary"
            >
              {t('auth.createAccount')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function mapAuthError(
  authError: { code?: string; message?: string },
  t: (key: string) => string,
): string {
  const code = authError.code?.toUpperCase() ?? '';
  if (
    code.includes('INVALID_CREDENTIALS') ||
    code.includes('INVALID_EMAIL_OR_PASSWORD') ||
    code.includes('INVALID_PASSWORD') ||
    code.includes('USER_NOT_FOUND')
  ) {
    return t('auth.errorInvalidCredentials');
  }
  if ((code.includes('EMAIL') && code.includes('IN_USE')) || code.includes('USER_ALREADY_EXISTS')) {
    return t('auth.errorEmailInUse');
  }
  return authError.message ?? t('auth.errorGeneric');
}
