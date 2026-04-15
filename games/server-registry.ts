import { logic as gomokuLogic } from '@games/gomoku/logic';
import { meta as gomokuMeta } from '@games/gomoku/shared';
import type { ServerGamePlugin } from '@repo/shared';

export const serverRegistry: Record<string, ServerGamePlugin> = {
  [gomokuMeta.id]: { meta: gomokuMeta, logic: gomokuLogic },
};
