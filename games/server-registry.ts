import { logic as connectFourLogic } from '@games/connect-four/logic';
import { meta as connectFourMeta } from '@games/connect-four/shared';
import { logic as gomokuLogic } from '@games/gomoku/logic';
import { meta as gomokuMeta } from '@games/gomoku/shared';
import { logic as loveLetterLogic } from '@games/love-letter/logic';
import { meta as loveLetterMeta } from '@games/love-letter/shared';
import type { ServerGamePlugin } from '@repo/shared';

export const serverRegistry: Record<string, ServerGamePlugin> = {
  [gomokuMeta.id]: { meta: gomokuMeta, logic: gomokuLogic },
  [loveLetterMeta.id]: { meta: loveLetterMeta, logic: loveLetterLogic },
  [connectFourMeta.id]: { meta: connectFourMeta, logic: connectFourLogic },
};
