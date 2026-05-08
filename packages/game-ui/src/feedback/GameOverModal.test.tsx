import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameOverModal } from './GameOverModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options?.defaultValue) return String(options.defaultValue);
      return key;
    },
  }),
}));

describe('GameOverModal', () => {
  const baseProps = {
    rankings: ['me', 'other'],
    playerNames: { me: 'Me', other: 'Other' },
    myId: 'me',
  };

  it('exposes dialog semantics (role, aria-modal, labelled by title)', () => {
    render(<GameOverModal {...baseProps} onReturnToLobby={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'game-over-title');
    // Title element carries the matching id.
    expect(document.getElementById('game-over-title')).toBeTruthy();
  });

  it('Escape triggers onReturnToLobby when provided', () => {
    const onReturnToLobby = vi.fn();
    const onReturnToRoom = vi.fn();
    const onRestart = vi.fn();
    render(
      <GameOverModal
        {...baseProps}
        onRestart={onRestart}
        onReturnToRoom={onReturnToRoom}
        onReturnToLobby={onReturnToLobby}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onReturnToLobby).toHaveBeenCalledTimes(1);
    expect(onReturnToRoom).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('Escape falls back to onReturnToRoom when onReturnToLobby absent', () => {
    const onReturnToRoom = vi.fn();
    const onRestart = vi.fn();
    render(<GameOverModal {...baseProps} onRestart={onRestart} onReturnToRoom={onReturnToRoom} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onReturnToRoom).toHaveBeenCalledTimes(1);
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('Escape falls back to onRestart when only onRestart present', () => {
    const onRestart = vi.fn();
    render(<GameOverModal {...baseProps} onRestart={onRestart} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('renders positive pointsDelta row and header match/total badges', () => {
    render(
      <GameOverModal
        {...baseProps}
        pointsDelta={{ me: 10, other: 0 }}
        totalPoints={42}
        onReturnToLobby={() => {}}
      />,
    );
    // Header badges: "match 10" + "total 42"
    expect(screen.getByText('match')).toBeInTheDocument();
    expect(screen.getByText('total')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    // Row badges: two "+"-prefixed deltas (10 for me, 0 for other)
    const plusLabels = screen.getAllByText('+');
    expect(plusLabels).toHaveLength(2);
    // My delta 10 shows up twice (header + row); opponent row shows 0
    expect(screen.getAllByText('10')).toHaveLength(2);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders zero pointsDelta when delta is absent for a player (fallback to 0)', () => {
    render(<GameOverModal {...baseProps} pointsDelta={{ me: 0 }} onReturnToLobby={() => {}} />);
    // Both player rows show a PointsBadge with "+" label and 0 points.
    const plusLabels = screen.getAllByText('+');
    expect(plusLabels).toHaveLength(2);
    // Three 0s: header match + two rows
    expect(screen.getAllByText('0')).toHaveLength(3);
  });

  it('draw variant: when I share first place via ties, show draw title instead of youWin', () => {
    render(<GameOverModal {...baseProps} ties={[['me', 'other']]} onReturnToLobby={() => {}} />);
    expect(screen.getByText('draw')).toBeInTheDocument();
    expect(screen.queryByText('youWin')).not.toBeInTheDocument();
  });

  it('non-draw when I am not in the top-ranked tie group', () => {
    const props = {
      rankings: ['me', 'a', 'b'],
      playerNames: { me: 'Me', a: 'A', b: 'B' },
      myId: 'me',
    };
    // Tie group between A and B (both 2nd place) — I still win solo.
    render(<GameOverModal {...props} ties={[['a', 'b']]} onReturnToLobby={() => {}} />);
    expect(screen.getByText('youWin')).toBeInTheDocument();
    expect(screen.queryByText('draw')).not.toBeInTheDocument();
  });
});
