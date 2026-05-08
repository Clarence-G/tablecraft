import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameHeader } from './GameHeader';

describe('GameHeader', () => {
  it('renders game name and room code', () => {
    render(
      <GameHeader
        gameName="德州扑克"
        icon="Target"
        roomId="A3F2"
        elapsedSeconds={754}
        phase="第3局翻牌前"
      />,
    );
    expect(screen.getByText('德州扑克')).toBeInTheDocument();
    expect(screen.getByText('A3F2')).toBeInTheDocument();
    expect(screen.getByText('12:34')).toBeInTheDocument();
    expect(screen.getByText('第3局翻牌前')).toBeInTheDocument();
  });

  it('fires onBack when back button clicked', () => {
    const onBack = vi.fn();
    render(<GameHeader gameName="x" icon="Target" roomId="A" elapsedSeconds={0} onBack={onBack} />);
    fireEvent.click(screen.getByLabelText(/back/i));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('fires onExit when exit button clicked', () => {
    const onExit = vi.fn();
    render(<GameHeader gameName="x" icon="Target" roomId="A" elapsedSeconds={0} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /exit/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('copies room code when the code chip is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<GameHeader gameName="x" icon="Target" roomId="A3F2" elapsedSeconds={0} />);
    fireEvent.click(screen.getByTestId('room-code-chip'));
    expect(writeText).toHaveBeenCalledWith('A3F2');
  });

  it('hides elapsed time during pre-match phases (setup / placement)', () => {
    const { rerender } = render(
      <GameHeader gameName="x" icon="Target" roomId="A" elapsedSeconds={754} phase="setup" />,
    );
    expect(screen.queryByText('12:34')).not.toBeInTheDocument();
    expect(screen.getByText('--:--')).toBeInTheDocument();

    rerender(
      <GameHeader gameName="x" icon="Target" roomId="A" elapsedSeconds={754} phase="placement" />,
    );
    expect(screen.queryByText('12:34')).not.toBeInTheDocument();
    expect(screen.getByText('--:--')).toBeInTheDocument();
  });

  it('shows elapsed time during active-play phases', () => {
    render(
      <GameHeader gameName="x" icon="Target" roomId="A" elapsedSeconds={754} phase="playing" />,
    );
    expect(screen.getByText('12:34')).toBeInTheDocument();
    expect(screen.queryByText('--:--')).not.toBeInTheDocument();
  });
});
