import { fireEvent, render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLogProvider, useGameLog } from '../log/index';
import { SidePanel } from './SidePanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options?.defaultValue) return String(options.defaultValue);
      return key;
    },
  }),
}));

function Pusher() {
  const { push } = useGameLog();
  return (
    <button type="button" onClick={() => push({ kind: 'action', messageKey: 'hello' })}>
      fire
    </button>
  );
}

/** Open the panel by clicking the rail's expand button, which is the first accessible expand title. */
function expandPanel(getAllByTitle: (q: string) => HTMLElement[]): void {
  fireEvent.click(getAllByTitle('sidepanel.expand')[0]);
}

describe('SidePanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts collapsed (rail visible) on desktop by default', () => {
    const { getByTestId, queryByTestId } = render(
      <GameLogProvider>
        <SidePanel />
      </GameLogProvider>,
    );
    expect(getByTestId('side-panel-rail')).toBeInTheDocument();
    expect(queryByTestId('side-panel-desktop')).toBeNull();
  });

  it('expands to desktop panel after clicking the rail', () => {
    const { getByTestId, getAllByTitle } = render(
      <GameLogProvider>
        <SidePanel />
      </GameLogProvider>,
    );
    expandPanel(getAllByTitle);
    const panel = within(getByTestId('side-panel-desktop'));
    expect(panel.getByText('sidepanel.tab.log')).toBeInTheDocument();
    expect(panel.getByText('sidepanel.tab.chat')).toBeInTheDocument();
  });

  it('shows empty log placeholder when expanded with no entries', () => {
    const { getByTestId, getAllByTitle } = render(
      <GameLogProvider>
        <SidePanel />
      </GameLogProvider>,
    );
    expandPanel(getAllByTitle);
    const panel = within(getByTestId('side-panel-desktop'));
    expect(panel.getByText('sidepanel.log.empty')).toBeInTheDocument();
  });

  it('renders pushed log entries after expand', () => {
    const { getByTestId, getByText, getAllByTitle } = render(
      <GameLogProvider>
        <SidePanel />
        <Pusher />
      </GameLogProvider>,
    );
    fireEvent.click(getByText('fire'));
    expandPanel(getAllByTitle);
    const panel = within(getByTestId('side-panel-desktop'));
    expect(panel.getByText('hello')).toBeInTheDocument();
  });

  it('switches to chat tab and shows empty state', () => {
    const { getByTestId, getAllByTitle } = render(
      <GameLogProvider>
        <SidePanel />
      </GameLogProvider>,
    );
    expandPanel(getAllByTitle);
    const panel = within(getByTestId('side-panel-desktop'));
    fireEvent.click(panel.getByText('sidepanel.tab.chat'));
    expect(panel.getByText('sidepanel.chat.empty')).toBeInTheDocument();
    expect(panel.getByPlaceholderText('sidepanel.chat.placeholder')).toBeInTheDocument();
  });

  it('persists collapse state to localStorage', () => {
    const { getByTestId, getAllByTitle } = render(
      <GameLogProvider>
        <SidePanel />
      </GameLogProvider>,
    );
    expandPanel(getAllByTitle);
    const panel = within(getByTestId('side-panel-desktop'));
    fireEvent.click(panel.getByTitle('sidepanel.collapse'));
    expect(window.localStorage.getItem('sidepanel.expanded')).toBe('false');
  });
});
