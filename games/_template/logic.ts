import { type ActionResult, type GameContext, type GameLogic, logAction } from '@repo/shared';
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
      //
      // Activity Log: emit one NOTIFY_ALL per user-visible event so the
      // SidePanel's "Log" tab has something to render. Use logAction for
      // player actions, logSystem for neutral events. Add the matching
      // i18n key to games/<id>/i18n/{zh,en}.json under the "log" object.
      // See docs/ACTIVITY_LOG.md for the full contract.
      return {
        ok: true,
        state,
        events: [
          logAction(playerID, 'log.exampleAction', {
            /* messageParams */
          }),
        ],
      };
    }

    return { ok: false, reason: 'Unknown action' };
  },

  getPlayerView(state, _playerID): PlayerView {
    return {
      currentPlayer: state.currentPlayer,
    };
  },
};
