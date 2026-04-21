import { useGameHeaderStatus } from '@repo/game-ui';
import { PlayingCard } from '@repo/game-ui/card';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Action, COLORS, type PlayerView, type UnoColor, deserializeCard } from './shared';

// ---- Card color styling ----

function getCardStyle(color: string): { className: string; style?: React.CSSProperties } {
  if (color === 'red') return { className: 'bg-[#d94040] border-[#d94040] text-card' };
  if (color === 'blue') return { className: 'bg-[#2563eb] border-[#2563eb] text-card' };
  if (color === 'green') return { className: 'bg-[#16a34a] border-[#16a34a] text-card' };
  if (color === 'yellow') return { className: 'bg-[#d97706] border-[#d97706] text-card' };
  // wild
  return {
    className: 'border-foreground text-card',
    style: {
      background: 'linear-gradient(135deg, #d94040, #2563eb, #16a34a, #d97706)',
    },
  };
}

function getCardLabel(serialized: string): string {
  if (serialized === 'wild') return 'WILD';
  if (serialized === 'wild_draw_four') return '+4';
  const card = deserializeCard(serialized);
  if (card.type === 'number') return String(card.value);
  if (card.action === 'skip') return 'SKIP';
  if (card.action === 'reverse') return 'REV';
  if (card.action === 'draw_two') return '+2';
  return '?';
}

function getCardColor(serialized: string): string {
  if (serialized === 'wild' || serialized === 'wild_draw_four') return 'wild';
  const card = deserializeCard(serialized);
  if (card.type === 'wild') return 'wild';
  return card.color;
}

// ---- UnoCardFace ----

function UnoCardFace({
  serialized,
  selected,
  disabled,
  onClick,
  size = 'normal',
}: {
  serialized: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'small' | 'normal';
}) {
  const color = getCardColor(serialized);
  const { className: colorClass, style: colorStyle } = getCardStyle(color);
  const label = getCardLabel(serialized);

  return (
    <PlayingCard
      size={size === 'small' ? 'sm' : 'md'}
      backgroundClass={`${colorClass} text-card`}
      corner={label}
      center={label}
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      style={colorStyle}
    />
  );
}

// ---- Color dot ----

function ColorDot({ color }: { color: UnoColor }) {
  const { className, style } = getCardStyle(color);
  return (
    <span style={style} className={`inline-block w-4 h-4 rounded-full border-2 ${className}`} />
  );
}

// ---- Color Picker Modal ----

function ColorPickerModal({ onChoose }: { onChoose: (c: UnoColor) => void }) {
  const { t } = useTranslation('uno');
  return (
    <div className="fixed inset-0 bg-[#1a1108]/60 flex items-center justify-center z-50">
      <div className="bg-card border-2 border-foreground rounded-[16px] p-6 shadow-[4px_4px_0px_0px_#3d2e1e] max-w-xs w-full mx-4 text-center">
        <div className="text-sm font-semibold text-foreground mb-4">{t('chooseColor')}</div>
        <div className="flex gap-3 justify-center">
          {COLORS.map((c) => {
            const { className, style } = getCardStyle(c);
            return (
              <button
                key={c}
                type="button"
                style={style}
                onClick={() => onChoose(c)}
                className={`w-12 h-12 rounded-full border-2 font-bold text-xs ${className} hover:scale-110 transition-transform`}
              >
                {c === 'red' ? 'R' : c === 'blue' ? 'B' : c === 'green' ? 'G' : 'Y'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Main Board ----

export function Board({ state, myId, players, sendAction }: BoardProps<PlayerView, Action>) {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [pendingWild, setPendingWild] = useState<number | null>(null);
  const { t } = useTranslation('uno');

  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));

  const topCard = state.topCard;
  const topCardIsWild = topCard === 'wild' || topCard === 'wild_draw_four';

  function handleCardClick(idx: number) {
    if (!isMyTurn) return;
    setSelectedCardIndex(selectedCardIndex === idx ? null : idx);
  }

  function handlePlayCard(idx: number) {
    const serialized = state.myHand[idx];
    if (serialized === undefined) return;
    const isWild = serialized === 'wild' || serialized === 'wild_draw_four';
    if (isWild) {
      setPendingWild(idx);
      setSelectedCardIndex(null);
    } else {
      sendAction({ type: 'play_card', cardIndex: idx });
      setSelectedCardIndex(null);
    }
  }

  function handleColorChosen(color: UnoColor) {
    if (pendingWild === null) return;
    sendAction({ type: 'play_card', cardIndex: pendingWild, chosenColor: color });
    setPendingWild(null);
  }

  function handleDraw() {
    sendAction({ type: 'draw_card' });
    setSelectedCardIndex(null);
  }

  function handlePass() {
    sendAction({ type: 'pass' });
    setSelectedCardIndex(null);
  }

  return (
    <div
      className="flex-1 text-foreground flex flex-col p-3 sm:p-4 max-w-lg mx-auto w-full"
      data-testid="game-board"
    >
      {/* Color picker modal */}
      {pendingWild !== null && <ColorPickerModal onChoose={handleColorChosen} />}

      {/* Players */}
      <div className="flex flex-wrap gap-2 justify-center mb-3">
        {players.map((p) => {
          const info = state.players.find((sp) => sp.id === p.id);
          return (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <PlayerBadge
                player={p}
                isCurrentTurn={state.currentPlayer === p.id}
                isMe={p.id === myId}
              />
              <div className="text-xs text-muted-foreground">
                {info?.cardCount ?? 0} {t('cards')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Winner banner (turn state lives in header) */}
      {gameOver && (
        <div className="text-center text-sm text-card font-semibold mb-3">
          {`${playerNames[state.winner ?? ''] ?? state.winner} ${t('won')}`}
        </div>
      )}

      {/* Center area: discard pile + color indicator */}
      <div className="flex items-center justify-center gap-6 mb-4">
        {/* Draw pile */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-[10px] border-2 border-card/40 bg-card/20 backdrop-blur-sm flex items-center justify-center text-card font-bold text-xs shadow-[4px_4px_0px_0px_#1a1108]">
            {state.drawPileCount}
          </div>
          <span className="text-xs text-card/70">{t('drawPile')}</span>
        </div>

        {/* Discard pile top card */}
        <div className="flex flex-col items-center gap-1">
          {topCard !== '' ? (
            <UnoCardFace serialized={topCard} size="normal" />
          ) : (
            <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-[10px] border-2 border-card/30 bg-card/10 backdrop-blur-sm" />
          )}
          <span className="text-xs text-card/70">{t('discardPile')}</span>
        </div>

        {/* Active color (shown when top card is wild) */}
        {topCardIsWild && (
          <div className="flex flex-col items-center gap-1">
            <ColorDot color={state.activeColor} />
            <span className="text-xs text-card/70">{t('currentColor')}</span>
          </div>
        )}

        {/* Direction indicator */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-lg font-bold text-card">{state.direction === 1 ? '>' : '<'}</span>
          <span className="text-xs text-card/70">{t('direction')}</span>
        </div>
      </div>

      {/* My Hand */}
      {!gameOver && (
        <div className="bg-card/90 backdrop-blur-sm text-foreground rounded-[12px] border-2 border-card/40 p-3 shadow-[4px_4px_0px_0px_#1a1108] mb-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            {t('yourHand')} ({state.myHand.length} {t('cards')})
          </div>
          <div className="flex flex-wrap gap-2 justify-center mb-3 overflow-x-auto py-1">
            {state.myHand.map((serialized, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: card hand positions are index-keyed
              <div key={idx} className="flex flex-col items-center gap-1">
                <UnoCardFace
                  serialized={serialized}
                  selected={selectedCardIndex === idx}
                  disabled={!isMyTurn}
                  onClick={() => handleCardClick(idx)}
                />
                {isMyTurn && selectedCardIndex === idx && (
                  <button
                    type="button"
                    onClick={() => handlePlayCard(idx)}
                    className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-[6px] font-semibold"
                  >
                    {t('playCard')}
                  </button>
                )}
              </div>
            ))}
            {state.myHand.length === 0 && (
              <span className="text-xs text-muted-foreground">{t('noCards')}</span>
            )}
          </div>

          {/* Action buttons */}
          {isMyTurn && (
            <div className="flex gap-2 justify-center">
              {!state.hasDrawnThisTurn && (
                <button
                  type="button"
                  onClick={handleDraw}
                  className="bg-secondary text-secondary-foreground border-2 border-foreground px-4 py-2 rounded-[10px] font-semibold text-sm shadow-[2px_2px_0px_0px_#3d2e1e] hover:-translate-y-0.5 transition-transform"
                >
                  {t('drawCard')}
                </button>
              )}
              {state.hasDrawnThisTurn && (
                <button
                  type="button"
                  onClick={handlePass}
                  className="bg-muted text-muted-foreground border-2 border-border px-4 py-2 rounded-[10px] font-semibold text-sm hover:bg-secondary transition-colors"
                >
                  {t('pass')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Game Over */}
      {gameOver && (
        <GameOverModal
          rankings={[
            state.winner ?? '',
            ...state.players.filter((p) => p.id !== state.winner).map((p) => p.id),
          ].filter(Boolean)}
          playerNames={playerNames}
          myId={myId}
        />
      )}
    </div>
  );
}
