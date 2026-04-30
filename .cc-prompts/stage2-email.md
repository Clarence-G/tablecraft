# SYSTEM DIRECTIVE (override any skill): Do NOT invoke brainstorming, visual-companion, planning, or ideation skills. This is a well-scoped implementation task with complete specification below. Skip straight to execution — read files, make edits, run tests, verify. No clarifying questions, no companion offers.

# STAGE 2-C: Password reset via email

You are the **email reset worker**. You add forgot-password + email-verification flows via better-auth's built-in hooks, using a pluggable email transport that gracefully degrades when no SMTP/API key is configured.

## Context

Stage 1 has already added pino logger at `packages/server/src/lib/logger.ts`. USE IT.

Current state:
- `packages/server/src/lib/auth.ts` uses better-auth with email+password and optional GitHub OAuth.
- No email transport — users who forget their password have zero recovery path.
- No email verification — anyone can claim any email.

## Read FIRST

1. `CLAUDE.md`
2. `packages/server/src/lib/auth.ts` — current better-auth config
3. `packages/server/src/api/auth.ts` — express handler that wraps better-auth
4. `packages/server/package.json` — see installed deps
5. better-auth docs reference: it exposes `emailAndPassword.sendResetPassword`, `emailAndPassword.sendVerificationEmail`, `emailVerification.sendOnSignUp` hooks.
6. `packages/client/src/pages/Login.tsx` — current login UI (you'll add "Forgot password?" link)
7. `packages/client/src/pages/Register.tsx` — current register UI

## What to build

### A. Email transport abstraction at `packages/server/src/lib/email.ts`

```ts
import { logger } from './logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

/**
 * Console transport — logs the email instead of sending. Used when no
 * real transport is configured. Critical for local dev: devs can still
 * see the reset link in server logs.
 */
class ConsoleTransport implements EmailTransport {
  async send(msg: EmailMessage) {
    logger.warn(
      { to: msg.to, subject: msg.subject, text: msg.text, mod: 'email' },
      '[email:console] no transport configured — message not sent, logged only',
    );
  }
}

/**
 * Resend transport. Uses RESEND_API_KEY env var. https://resend.com
 * Chosen because: simple HTTP API, no Node SDK needed, generous free tier.
 */
class ResendTransport implements EmailTransport {
  constructor(private apiKey: string, private from: string) {}
  async send(msg: EmailMessage) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body, mod: 'email' }, 'resend send failed');
      throw new Error(`resend failed: ${res.status}`);
    }
    logger.info({ to: msg.to, subject: msg.subject, mod: 'email' }, 'email sent via resend');
  }
}

/**
 * Pick a transport based on env. Falls back to console transport if nothing
 * is configured. Never throws on init — server must boot without email.
 */
export function buildEmailTransport(): EmailTransport {
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM || 'TableCraft <noreply@tablecraft.local>';

  if (resendKey) {
    logger.info({ from: fromAddress, mod: 'email' }, 'using resend transport');
    return new ResendTransport(resendKey, fromAddress);
  }

  logger.warn(
    { mod: 'email' },
    'no email transport configured (set RESEND_API_KEY) — password resets will be logged only',
  );
  return new ConsoleTransport();
}

export const emailTransport = buildEmailTransport();
```

### B. Wire better-auth in `lib/auth.ts`

Extend the existing `betterAuth({ ... })` config:

```ts
import { emailTransport } from './email';

betterAuth({
  // ... existing config ...
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,  // keep false for now — soft launch
    sendResetPassword: async ({ user, url, token }) => {
      await emailTransport.send({
        to: user.email,
        subject: 'TableCraft — Reset your password',
        text: `Hi ${user.name || ''},\n\nReset your password:\n${url}\n\nLink expires in 1 hour.\nIf you didn't request this, ignore this email.`,
        html: `<p>Hi ${user.name || ''},</p><p><a href="${url}">Click here to reset your password</a></p><p>Link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
      });
    },
    // onPasswordReset fires AFTER a successful reset — can log security event here
    onPasswordReset: async ({ user }) => {
      logger.info({ userId: user.id, mod: 'auth' }, 'password reset completed');
    },
  },
  emailVerification: {
    sendOnSignUp: false,  // opt-in for now
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await emailTransport.send({
        to: user.email,
        subject: 'TableCraft — Verify your email',
        text: `Click to verify:\n${url}`,
        html: `<p><a href="${url}">Verify your email</a></p>`,
      });
    },
  },
});
```

Use the exact better-auth v1.6.x signatures. Check the existing config file to see what form the options take.

### C. Client UI

Add two pages:

1. `packages/client/src/pages/ForgotPassword.tsx` — simple form: email input, submit calls `authClient.requestPasswordReset({ email, redirectTo })`, shows "If an account exists with that email, we sent a reset link." (don't leak whether email exists — security).

2. `packages/client/src/pages/ResetPassword.tsx` — reads `?token=...` from URL, shows new-password form, submits `authClient.resetPassword({ newPassword, token })`, on success redirects to Login.

Both pages use existing shadcn components (`Input`, `Button`, `Card`), existing i18n, existing layout. Follow `Login.tsx` as style template.

### D. Add "Forgot password?" link to `Login.tsx`

Small link below the password field → Link to `/forgot-password`.

### E. Routes

In `packages/client/src/App.tsx` (or wherever routes are defined), add:
- `/forgot-password` → `<ForgotPassword />`
- `/reset-password` → `<ResetPassword />`

### F. i18n

Add new keys to `packages/client/src/i18n/locales/{zh,en}/common.json` under an `auth` namespace:
```json
{
  "auth": {
    "forgotPassword": "忘记密码" / "Forgot password",
    "forgotPasswordTitle": "重置密码" / "Reset your password",
    "forgotPasswordDesc": "...",
    "emailLabel": "邮箱" / "Email",
    "sendResetLink": "发送重置链接" / "Send reset link",
    "resetLinkSent": "如果该邮箱已注册，我们已发送重置链接。" / "If an account exists with that email, we sent a reset link.",
    "resetPasswordTitle": "设置新密码" / "Set new password",
    "newPasswordLabel": "新密码" / "New password",
    "resetPasswordSubmit": "重置密码" / "Reset password",
    "resetPasswordSuccess": "密码已重置，请登录" / "Password reset — please sign in",
    "resetTokenInvalid": "链接已失效或已使用" / "Link is invalid or expired",
    "backToLogin": "返回登录" / "Back to sign in"
  }
}
```

### G. .env.example

Add:
```
# Email transport — optional. If unset, password-reset emails are logged to the
# server console only (fine for local dev). Set in production.
RESEND_API_KEY=
EMAIL_FROM=TableCraft <noreply@example.com>
```

### H. Tests

1. `packages/server/src/lib/email.test.ts`:
   - `buildEmailTransport()` with no env → console transport, doesn't throw
   - `buildEmailTransport()` with `RESEND_API_KEY` set → resend transport
   - ConsoleTransport.send() doesn't throw

2. `packages/server/src/lib/auth.test.ts` (extend existing):
   - verify `sendResetPassword` is invoked with expected `{ user, url, token }` when a reset is requested (mock transport, stub better-auth flow)

Target: ≥4 new assertions.

## Hard constraints

1. **DO NOT edit**:
   - `packages/server/src/db/schema.ts` (Stage 1)
   - `packages/server/src/engine/**` (Stage 2-B)
   - `packages/server/src/socket/**` (Stage 2-B)
   - `packages/server/src/lib/logger.ts` (Stage 1)
   - `packages/server/src/index.ts` beyond importing nothing new (you don't need to)
   - Other Stage 2 workers' files (reports, moderation, telemetry)

2. **DO create**:
   - `packages/server/src/lib/email.ts`
   - `packages/client/src/pages/ForgotPassword.tsx`
   - `packages/client/src/pages/ResetPassword.tsx`

3. **DO edit**:
   - `packages/server/src/lib/auth.ts`
   - `packages/server/src/lib/auth.test.ts`
   - `packages/client/src/pages/Login.tsx` (just add a link)
   - `packages/client/src/App.tsx` (routes)
   - `packages/client/src/i18n/locales/{zh,en}/common.json` (new auth keys)
   - `.env.example`

4. **No emoji**. **All UI strings via i18n**. No hardcoded zh/en strings in pages.

5. **Graceful no-op**: server must boot fine with no RESEND_API_KEY. Reset requests log the URL to server console. Test this.

## Validation

```bash
cd /Users/bytedance/Projects/boardgames
pnpm typecheck
pnpm --filter @repo/server test
pnpm test
```

Manual e2e:
1. Register a new account with a fake email
2. Sign out
3. Hit "Forgot password?" → enter the email → submit
4. Check server log — should see `[email:console] message not sent, logged only` with the reset URL
5. Extract token from logged URL, navigate to `/reset-password?token=...`
6. Set new password → redirect to login → sign in with new password → success

## Deliverables

1. `lib/email.ts` with ConsoleTransport + ResendTransport + `buildEmailTransport()`
2. `lib/auth.ts` wired to send via email transport
3. `ForgotPassword.tsx` + `ResetPassword.tsx` pages
4. Routes in App.tsx
5. Login.tsx has "Forgot password?" link
6. i18n keys in both zh and en
7. `.env.example` updated
8. Tests green (≥4 new assertions)
9. Dev server boots without RESEND_API_KEY (verified)
10. `docs/ISSUE_stage2-email.md` with 6-section template

## Out of scope (record, don't do)

- Email verification flow UI (just the hook — user opt-in later)
- Rate-limiting reset requests (Stage 1 added `/api` rate limit — sufficient)
- Customizing email templates beyond basic text/HTML
- SMTP transport (resend + console is enough)
- Password strength meter

START NOW.
