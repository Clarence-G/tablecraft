import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameRoomLayout } from './GameRoomLayout';

describe('GameRoomLayout', () => {
  it('renders the header with game name and wraps children', () => {
    render(
      <GameRoomLayout
        gameId="gomoku"
        gameName="五子棋"
        icon="Target"
        roomId="A3F2"
        matchStartedAt={Date.now()}
        onReturnToLobby={() => {}}
      >
        <div data-testid="board-child">BOARD</div>
      </GameRoomLayout>,
    );
    expect(screen.getByText('五子棋')).toBeInTheDocument();
    expect(screen.getByText('A3F2')).toBeInTheDocument();
    expect(screen.getByTestId('board-child')).toBeInTheDocument();
  });

  it('shows exit confirmation before calling onReturnToLobby', () => {
    const onReturnToLobby = vi.fn();
    render(
      <GameRoomLayout
        gameId="gomoku"
        gameName="五子棋"
        icon="Target"
        roomId="A3F2"
        matchStartedAt={Date.now()}
        onReturnToLobby={onReturnToLobby}
      >
        <div />
      </GameRoomLayout>,
    );
    fireEvent.click(screen.getByLabelText(/exit/i));
    expect(onReturnToLobby).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /leave|离开/i }));
    expect(onReturnToLobby).toHaveBeenCalledTimes(1);
  });

  it('back button calls onReturnToLobby without confirmation', () => {
    const onReturnToLobby = vi.fn();
    render(
      <GameRoomLayout
        gameId="gomoku"
        gameName="五子棋"
        icon="Target"
        roomId="A3F2"
        matchStartedAt={Date.now()}
        onReturnToLobby={onReturnToLobby}
      >
        <div />
      </GameRoomLayout>,
    );
    fireEvent.click(screen.getByLabelText(/back/i));
    expect(onReturnToLobby).toHaveBeenCalledTimes(1);
  });
});
