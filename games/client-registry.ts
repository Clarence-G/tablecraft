import { meta as gomokuMeta } from '@games/gomoku/shared';
import type { ClientGamePlugin } from '@repo/shared';
import { lazy } from 'react';

export const clientRegistry: Record<string, ClientGamePlugin> = {
  [gomokuMeta.id]: {
    meta: gomokuMeta,
    Board: lazy(() => import('@games/gomoku/board').then((m) => ({ default: m.Board }))),
  },
};
