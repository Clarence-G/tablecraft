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
});
