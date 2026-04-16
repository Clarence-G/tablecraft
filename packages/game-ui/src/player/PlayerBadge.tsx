import type { PlayerInfo } from '@repo/shared';
import { useTranslation } from 'react-i18next';

interface PlayerBadgeProps {
  player: PlayerInfo;
  isCurrentTurn?: boolean;
  isMe?: boolean;
}

export function PlayerBadge({ player, isCurrentTurn, isMe }: PlayerBadgeProps) {
  const { t } = useTranslation('game-ui');
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-[12px] text-sm border-2 transition-all
      ${isCurrentTurn ? 'bg-[#fef3e0] border-warning' : 'bg-card border-foreground'}
      ${isMe ? 'shadow-button' : 'shadow-[#3d2e1e_-3px_3px_0px]'}
    `}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full border ${player.connected ? 'bg-success border-[#0a5c2a]' : 'bg-[#c4b8a8] border-[#9c8b78]'}`}
      />
      <span className="font-semibold">{player.name}</span>
      {isMe && <span className="text-xs text-muted-foreground font-medium">{t('you')}</span>}
      <span className={`text-xs font-semibold ${isCurrentTurn ? 'text-warning' : 'invisible'}`}>
        {t('yourTurn')}
      </span>
    </div>
  );
}
