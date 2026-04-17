import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/generated/game-icons', () => ({
  SVG_ICON_NAMES: new Set(['gomoku', 'splendor']),
}));

import * as LucideIcons from 'lucide-react';
import { GameIcon } from './GameIcon';

function render(props: Parameters<typeof GameIcon>[0]): ReactElement {
  return GameIcon(props) as ReactElement;
}

describe('GameIcon', () => {
  it('renders an <img> when name is in the SVG manifest', () => {
    const el = render({ name: 'gomoku' });
    expect(el.type).toBe('img');
    expect((el.props as { src: string }).src).toBe('/game-icons/gomoku.svg');
  });

  it('renders the matching Lucide component when name is a Lucide icon', () => {
    const el = render({ name: 'Crown' });
    expect(el.type).toBe(LucideIcons.Crown);
  });

  it('falls back to DefaultIcon (Gamepad2) when name matches nothing', () => {
    const el = render({ name: 'nothing-here-nope' });
    expect(el.type).toBe(LucideIcons.Gamepad2);
  });

  it('falls back to DefaultIcon when name is undefined', () => {
    const el = render({});
    expect(el.type).toBe(LucideIcons.Gamepad2);
  });
});
