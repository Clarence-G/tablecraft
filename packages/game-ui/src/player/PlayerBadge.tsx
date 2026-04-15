import type { PlayerInfo } from '@repo/shared';

interface PlayerBadgeProps {
  player: PlayerInfo;
  isCurrentTurn?: boolean;
  isMe?: boolean;
}

export function PlayerBadge({ player, isCurrentTurn, isMe }: PlayerBadgeProps) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
      ${isCurrentTurn ? 'bg-yellow-500/20 border border-yellow-500' : 'bg-gray-800'}
      ${isMe ? 'ring-2 ring-blue-500' : ''}
    `}
    >
      <span
        className={`w-2 h-2 rounded-full ${player.connected ? 'bg-green-500' : 'bg-gray-500'}`}
      />
      <span className="font-medium">{player.name}</span>
      {isMe && <span className="text-xs text-blue-400">你</span>}
      {isCurrentTurn && <span className="text-xs text-yellow-400">回合中</span>}
    </div>
  );
}
