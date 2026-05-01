import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('buildEmailTransport', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it('returns console transport when RESEND_API_KEY is not set', async () => {
    const { buildEmailTransport } = await import('./email.js');
    const transport = buildEmailTransport();
    expect(transport).toBeDefined();
    // ConsoleTransport.send must not throw
    await expect(
      transport.send({ to: 'a@b.com', subject: 'Test', text: 'hello' }),
    ).resolves.toBeUndefined();
  });

  it('returns resend transport when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { buildEmailTransport } = await import('./email.js');
    const transport = buildEmailTransport();
    expect(transport).toBeDefined();
    // It has a send method
    expect(typeof transport.send).toBe('function');
  });

  it('console transport send() resolves without throwing', async () => {
    const { buildEmailTransport } = await import('./email.js');
    const transport = buildEmailTransport();
    await expect(
      transport.send({
        to: 'test@example.com',
        subject: 'Reset',
        text: 'http://localhost/reset?token=abc',
        html: '<a href="...">reset</a>',
      }),
    ).resolves.toBeUndefined();
  });
});
