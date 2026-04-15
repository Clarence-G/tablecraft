import type { ActionResult, GameContext, GameLogic } from '@repo/shared';
import { type Action, ActionSchema, type PlayerView } from './shared';

// ---- Internal State (never sent to clients) ----
interface TState {
  currentPlayer: string;
  // TODO: add game-specific state
}

export const logic: GameLogic<TState, Action, PlayerView> = {
  actions: ActionSchema,

  setup(ctx: GameContext): TState {
    return {
      currentPlayer: ctx.players[0],
    };
  },

  onAction(state, action, playerID): ActionResult<TState> {
    if (playerID !== state.currentPlayer) {
      return { ok: false, reason: 'Not your turn' };
    }

    if (action.type === 'example_action') {
      // TODO: implement action logic
      return { ok: true, state };
    }

    return { ok: false, reason: 'Unknown action' };
  },

  getPlayerView(state, playerID): PlayerView {
    return {
      currentPlayer: state.currentPlayer,
    };
  },
};
