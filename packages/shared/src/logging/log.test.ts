import { describe, expect, it } from 'vitest';
import { logAction, logPrivate, logSystem } from './log';

describe('logAction', () => {
  it('builds NOTIFY_ALL with channel log and action kind', () => {
    const ev = logAction('Alice', 'log.move', { row: 7, col: 7 });
    expect(ev.type).toBe('NOTIFY_ALL');
    expect(ev.payload).toMatchObject({
      channel: 'log',
      messageKey: 'log.move',
      actorId: 'Alice',
      kind: 'action',
      messageParams: { row: 7, col: 7 },
    });
  });

  it('omits messageParams when not provided', () => {
    const ev = logAction('Alice', 'log.pass');
    expect(ev.payload.messageParams).toBeUndefined();
  });
});

describe('logSystem', () => {
  it('builds NOTIFY_ALL with system kind, no actorId', () => {
    const ev = logSystem('log.roundStart');
    expect(ev.type).toBe('NOTIFY_ALL');
    expect(ev.payload).toMatchObject({
      channel: 'log',
      messageKey: 'log.roundStart',
      kind: 'system',
    });
    expect(ev.payload.actorId).toBeUndefined();
    expect(ev.payload.messageParams).toBeUndefined();
  });

  it('accepts options shape: { actorId }', () => {
    const ev = logSystem('log.win', { actorId: 'Alice' });
    expect(ev.payload.actorId).toBe('Alice');
    expect(ev.payload.messageParams).toBeUndefined();
  });

  it('accepts options shape: { messageParams }', () => {
    const ev = logSystem('log.turnEnd', { messageParams: { team: 'red' } });
    expect(ev.payload.actorId).toBeUndefined();
    expect(ev.payload.messageParams).toEqual({ team: 'red' });
  });

  it('accepts options shape: { actorId, messageParams }', () => {
    const ev = logSystem('log.win', {
      actorId: 'Bob',
      messageParams: { score: 42 },
    });
    expect(ev.payload.actorId).toBe('Bob');
    expect(ev.payload.messageParams).toEqual({ score: 42 });
  });

  it('accepts flat params shape when neither actorId nor messageParams keys present', () => {
    const ev = logSystem('log.roundStart', { round: 2 });
    expect(ev.payload.actorId).toBeUndefined();
    expect(ev.payload.messageParams).toEqual({ round: 2 });
  });

  it('flat shape handles multiple params', () => {
    const ev = logSystem('log.deal', { phase: 'flop', potSize: 100 });
    expect(ev.payload.messageParams).toEqual({ phase: 'flop', potSize: 100 });
  });

  it('flat shape with boolean params (ICU select usage)', () => {
    const ev = logSystem('log.challengeResult', { wasLying: true, chamberIndex: 3 });
    expect(ev.payload.messageParams).toEqual({ wasLying: true, chamberIndex: 3 });
  });

  it('empty options object yields no messageParams', () => {
    const ev = logSystem('log.tick', {});
    expect(ev.payload.messageParams).toBeUndefined();
  });
});

describe('logPrivate', () => {
  it('builds NOTIFY with to and info kind by default', () => {
    const ev = logPrivate('Bob', 'log.peek', { messageParams: { card: 'priest' } });
    expect(ev.type).toBe('NOTIFY');
    expect(ev.to).toBe('Bob');
    expect(ev.payload).toMatchObject({
      channel: 'log',
      messageKey: 'log.peek',
      kind: 'info',
      messageParams: { card: 'priest' },
    });
  });

  it('respects explicit kind override', () => {
    const ev = logPrivate('Bob', 'log.secret', { kind: 'system' });
    expect(ev.payload.kind).toBe('system');
  });
});
