# Issue: Stage 2-C — Password Reset via Email

## 1. Summary

Added forgot-password and password-reset flows via better-auth v1.6.x hooks, backed by a pluggable email transport that degrades gracefully to console logging when no SMTP/API key is configured.

## 2. Changes

### Server
- **`packages/server/src/lib/email.ts`** — new `EmailTransport` interface with `ConsoleTransport` (logs via pino) and `ResendTransport` (HTTP call to Resend API). `buildEmailTransport()` selects based on `RESEND_API_KEY` env var; falls back to console without throwing.
- **`packages/server/src/lib/auth.ts`** — wired `emailAndPassword.sendResetPassword` and `emailAndPassword.onPasswordReset` hooks; added `emailVerification.sendVerificationEmail` hook (send-on-signup disabled, ready for opt-in later).

### Client
- **`packages/client/src/pages/ForgotPassword.tsx`** — email input, calls `authClient.requestPasswordReset`, always shows neutral confirmation message (security: no email enumeration).
- **`packages/client/src/pages/ResetPassword.tsx`** — reads `?token=` from URL, new-password form, calls `authClient.resetPassword`, redirects to `/login` on success.
- **`packages/client/src/pages/Login.tsx`** — added "Forgot password?" link inline with the password field label.
- **`packages/client/src/App.tsx`** — added `/forgot-password` and `/reset-password` routes.

### i18n
- Added 12 new keys under `auth.*` in both `en/common.json` and `zh/common.json`.

### Config
- **`.env.example`** — added `RESEND_API_KEY` and `EMAIL_FROM` entries with docs.

## 3. Tests

- `packages/server/src/lib/email.test.ts` — 3 assertions: console transport returns when no env, resend transport returns when key set, console `send()` resolves without throwing.
- `packages/server/src/lib/auth.test.ts` — 2 new assertions added: verifies `sendResetPassword` hook fires with correct `to`/`subject`/`url`; verifies transport is NOT called for unknown email.

Total new assertions: **5**.

## 4. Graceful degradation

Running `pnpm dev` with no `RESEND_API_KEY` set causes the server to log:

```
WARN: no email transport configured (set RESEND_API_KEY) — password resets will be logged only
```

Reset requests then log the full reset URL via:

```
WARN: [email:console] no transport configured — message not sent, logged only
      to: user@example.com
      text: Hi ...\n\nReset your password:\nhttps://...?token=...
```

Devs can copy the token from the log to test the full flow locally.

## 5. Out of scope (not done)

- Email verification flow UI (server hook is wired, but `sendOnSignUp: false` — opt-in later)
- Rate-limiting reset requests (Stage 1's `/api` rate limit is sufficient)
- SMTP transport (Resend + console covers the use cases)
- Password strength meter

## 6. Manual e2e

1. Register a new account with any email
2. Sign out
3. Navigate to `/forgot-password`, enter the email, submit
4. Check server log for `[email:console]` entry containing reset URL with token
5. Copy token, navigate to `/reset-password?token=<token>`
6. Enter new password, submit — redirects to `/login`
7. Sign in with new password — success
