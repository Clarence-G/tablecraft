import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeaderboardRow } from './LeaderboardRow';

describe('LeaderboardRow', () => {
  it('renders rank, name, and points', () => {
    render(<LeaderboardRow rank={1} userId="u1" name="Alice" points={150} />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();
    expect(screen.getByText(/pts/)).toBeInTheDocument();
  });

  it('uses a custom pointsSuffix', () => {
    render(<LeaderboardRow rank={2} userId="u2" name="Bob" points={10} pointsSuffix="积分" />);
    expect(screen.getByText(/积分/)).toBeInTheDocument();
  });

  it('applies the highlighted variant classes', () => {
    render(
      <LeaderboardRow rank={128} userId="u3" name="Me" points={245} highlighted youLabel="You" />,
    );
    const row = screen.getByTestId('leaderboard-row-128');
    expect(row.className).toContain('border-foreground');
    expect(row.className).toContain('bg-secondary');
    // "You" badge only renders when highlighted.
    expect(screen.getByText(/You/)).toBeInTheDocument();
  });

  it('does not render the You badge when not highlighted', () => {
    render(<LeaderboardRow rank={1} userId="u1" name="Alice" points={10} youLabel="You" />);
    expect(screen.queryByText(/You/)).not.toBeInTheDocument();
  });
});
