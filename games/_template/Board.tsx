import type { BoardProps } from '@repo/shared';
import type { Action, PlayerView } from './shared';

export function Board({ state, myId, sendAction, lastReject }: BoardProps<PlayerView, Action>) {
  const isMyTurn = state.currentPlayer === myId;

  return (
    <div className="flex-1 text-foreground flex flex-col items-center justify-center gap-4 p-4 w-full">
      <h1 className="text-2xl font-bold">游戏模板</h1>
      <p className="text-gray-400">{isMyTurn ? '你的回合' : `等待 ${state.currentPlayer} 行动`}</p>
      {isMyTurn && (
        <button
          type="button"
          onClick={() => sendAction({ type: 'example_action' })}
          className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg"
        >
          执行动作
        </button>
      )}
      {lastReject && <p className="text-red-400">{lastReject}</p>}
    </div>
  );
}
