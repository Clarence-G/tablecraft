import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type GameLogContextValue, GameLogProvider, useGameLog } from './index';

function Capture({ holder }: { holder: { current: GameLogContextValue | null } }) {
  holder.current = useGameLog();
  return null;
}

describe('useGameLog', () => {
  it('returns noop API outside a provider', () => {
    const holder: { current: GameLogContextValue | null } = { current: null };
    render(<Capture holder={holder} />);
    expect(holder.current).toBeTruthy();
    expect(holder.current?.entries).toEqual([]);
    expect(() => holder.current?.push({ kind: 'action', messageKey: 'x' })).not.toThrow();
  });

  it('push appends entries when inside a provider', () => {
    const holder: { current: GameLogContextValue | null } = { current: null };
    render(
      <GameLogProvider>
        <Capture holder={holder} />
      </GameLogProvider>,
    );
    act(() => {
      holder.current?.push({ kind: 'action', messageKey: 'a' });
      holder.current?.push({ kind: 'system', messageKey: 'b' });
    });
    expect(holder.current?.entries.length).toBe(2);
    expect(holder.current?.entries[0]?.messageKey).toBe('a');
    expect(holder.current?.entries[1]?.kind).toBe('system');
  });

  it('caps at 200 entries (FIFO)', () => {
    const holder: { current: GameLogContextValue | null } = { current: null };
    render(
      <GameLogProvider>
        <Capture holder={holder} />
      </GameLogProvider>,
    );
    act(() => {
      for (let i = 0; i < 250; i++) {
        holder.current?.push({ kind: 'action', messageKey: `k${i}` });
      }
    });
    expect(holder.current?.entries.length).toBe(200);
    expect(holder.current?.entries[0]?.messageKey).toBe('k50');
    expect(holder.current?.entries[199]?.messageKey).toBe('k249');
  });

  it('ingestNotifications ignores non-log payloads and dedupes by object identity', () => {
    const holder: { current: GameLogContextValue | null } = { current: null };
    render(
      <GameLogProvider>
        <Capture holder={holder} />
      </GameLogProvider>,
    );
    const notifs: unknown[] = [
      // UI side-channel payload (e.g. a private card reveal for the Board) —
      // must not appear in the Activity Log.
      { type: 'priest_peek', target: 'bob', card: 5 },
      // Proper log entry.
      { channel: 'log', messageKey: 'log.joined', actorId: 'alice', kind: 'system' },
    ];
    act(() => {
      holder.current?.ingestNotifications(notifs);
      holder.current?.ingestNotifications(notifs);
    });
    expect(holder.current?.entries.length).toBe(1);
    expect(holder.current?.entries[0]?.messageKey).toBe('log.joined');
    expect(holder.current?.entries[0]?.actorId).toBe('alice');
    expect(holder.current?.entries[0]?.kind).toBe('system');
  });

  it('qualifies bare message keys with defaultNs and preserves already-namespaced keys', () => {
    const holder: { current: GameLogContextValue | null } = { current: null };
    render(
      <GameLogProvider defaultNs="connect-four">
        <Capture holder={holder} />
      </GameLogProvider>,
    );
    const notifs: unknown[] = [
      // Server-emitted: bare key, no ns → gets prefixed.
      { channel: 'log', messageKey: 'log.drop', kind: 'action' },
      // Board.tsx-style: legacy 'game.log.xxx' dotted form → rewritten to ns:key.
      { channel: 'log', messageKey: 'connect-four.log.win', kind: 'action' },
      // Already properly namespaced → untouched.
      { channel: 'log', messageKey: 'connect-four:log.draw', kind: 'action' },
      // Different ns (rare, but respect explicit) → untouched.
      { channel: 'log', messageKey: 'common:player.joined', kind: 'system' },
    ];
    act(() => {
      holder.current?.ingestNotifications(notifs);
    });
    expect(holder.current?.entries.map((e) => e.messageKey)).toEqual([
      'connect-four:log.drop',
      'connect-four:log.win',
      'connect-four:log.draw',
      'common:player.joined',
    ]);
  });

  it('clears entries when defaultNs changes', () => {
    const holder: { current: GameLogContextValue | null } = { current: null };
    function Harness({ ns }: { ns: string }) {
      return (
        <GameLogProvider defaultNs={ns}>
          <Capture holder={holder} />
        </GameLogProvider>
      );
    }
    const { rerender } = render(<Harness ns="blackjack" />);
    act(() => {
      holder.current?.push({ kind: 'action', messageKey: 'a' });
      holder.current?.push({ kind: 'action', messageKey: 'b' });
    });
    expect(holder.current?.entries.length).toBe(2);

    rerender(<Harness ns="connect-four" />);
    expect(holder.current?.entries).toEqual([]);
  });
});
