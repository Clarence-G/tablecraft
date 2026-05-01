import { logger } from './logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

class ConsoleTransport implements EmailTransport {
  async send(msg: EmailMessage) {
    logger.warn(
      { to: msg.to, subject: msg.subject, text: msg.text, mod: 'email' },
      '[email:console] no transport configured — message not sent, logged only',
    );
  }
}

class ResendTransport implements EmailTransport {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

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
