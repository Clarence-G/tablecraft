import { logic as connectFourLogic } from '@games/connect-four/logic';
import { meta as connectFourMeta } from '@games/connect-four/shared';
import { logic as gomokuLogic } from '@games/gomoku/logic';
import { meta as gomokuMeta } from '@games/gomoku/shared';
import { logic as hiveLogic } from '@games/hive/logic';
import { meta as hiveMeta } from '@games/hive/shared';
import { logic as liarBarLogic } from '@games/liar-bar/logic';
import { meta as liarBarMeta } from '@games/liar-bar/shared';
import { logic as loveLetterLogic } from '@games/love-letter/logic';
import { meta as loveLetterMeta } from '@games/love-letter/shared';
import { logic as yahtzeeLogic } from '@games/yahtzee/logic';
import { meta as yahtzeeMeta } from '@games/yahtzee/shared';
import type { ServerGamePlugin } from '@repo/shared';

export const serverRegistry: Record<string, ServerGamePlugin> = {
  [gomokuMeta.id]: { meta: gomokuMeta, logic: gomokuLogic },
  [loveLetterMeta.id]: { meta: loveLetterMeta, logic: loveLetterLogic },
  [connectFourMeta.id]: { meta: connectFourMeta, logic: connectFourLogic },
  [liarBarMeta.id]: { meta: liarBarMeta, logic: liarBarLogic },
  [yahtzeeMeta.id]: { meta: yahtzeeMeta, logic: yahtzeeLogic },
  [hiveMeta.id]: { meta: hiveMeta, logic: hiveLogic },
};
