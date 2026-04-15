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
      ${isCurrentTurn ? 'bg-warning/15 border border-warning/50' : 'bg-card ring-1 ring-foreground/10'}
      ${isMe ? 'ring-2 ring-ring' : ''}
    `}
    >
      <span
        className={`w-2 h-2 rounded-full ${player.connected ? 'bg-success' : 'bg-muted-foreground/40'}`}
      />
      <span className="font-medium">{player.name}</span>
      {isMe && <span className="text-xs text-muted-foreground">你</span>}
      {isCurrentTurn && <span className="text-xs text-warning">回合中</span>}
    </div>
  );
}
