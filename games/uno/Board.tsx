import { useGameHeaderStatus } from '@repo/game-ui';
import { HandStrip, PlayingCard } from '@repo/game-ui/card';
import { GameOverModal } from '@repo/game-ui/feedback';
import { useGameLog } from '@repo/game-ui/log';
import type { BoardProps } from '@repo/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Action, COLORS, type PlayerView, type UnoColor, deserializeCard } from './shared';

// ---- Card color styling ----

function getCardStyle(color: string): { className: string; style?: React.CSSProperties } {
  if (color === 'red') return { className: 'bg-[#d94040] border-[#d94040] text-card' };
  if (color === 'blue') return { className: 'bg-[#2563eb] border-[#2563eb] text-card' };
  if (color === 'green') return { className: 'bg-[#16a34a] border-[#16a34a] text-card' };
  if (color === 'yellow') return { className: 'bg-[#d97706] border-[#d97706] text-card' };
  return {
    className: 'border-foreground text-card',
    style: { background: 'linear-gradient(135deg, #d94040, #2563eb, #16a34a, #d97706)' },
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

// Compact, mirror-safe corner glyph. Multi-letter words render garbled at 180deg,
// so action cards use a single symbol / short form in the corners.
function getCornerGlyph(serialized: string): string {
  if (serialized === 'wild') return '★';
  if (serialized === 'wild_draw_four') return '+4';
  const card = deserializeCard(serialized);
  if (card.type === 'number') return String(card.value);
  if (card.action === 'skip') return '⊘';
  if (card.action === 'reverse') return '⇄';
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
  const cornerGlyph = getCornerGlyph(serialized);

  return (
    <PlayingCard
      size={size === 'small' ? 'sm' : 'md'}
      backgroundClass={`${colorClass} text-card`}
      corner={cornerGlyph}
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

// ---- Log helpers ----

function describeCard(serialized: string, t: (k: string) => string): string {
  if (!serialized) return '';
  const color = getCardColor(serialized);
  const label = getCardLabel(serialized);
  const colorLabel = color === 'wild' ? t('color.wild') : t(`color.${color}`);
  return `${colorLabel} ${label}`;
}

// ---- Main Board ----

export function Board({
  state,
  myId,
  players,
  sendAction: rawSendAction,
  isSending,
}: BoardProps<PlayerView, Action>) {
  // Swallow every action while one is already in flight. Prevents duplicate
  // emits during the server round-trip so slow connections don't double-tap.
  const sendAction = isSending ? () => {} : rawSendAction;
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [pendingWild, setPendingWild] = useState<number | null>(null);
  const { t } = useTranslation('uno');
  const { push } = useGameLog();

  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));

  const topCard = state.topCard;
  const topCardIsWild = topCard === 'wild' || topCard === 'wild_draw_four';
  const selectedKey = selectedCardIndex !== null ? `${selectedCardIndex}` : null;

  const prev = useRef<PlayerView | null>(null);
  const loggedWinner = useRef<string | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p) {
      const moverId = p.currentPlayer;
      const moverName = playerNames[moverId] ?? moverId;
      if (p.topCard && state.topCard && state.topCard !== p.topCard) {
        push({
          kind: 'action',
          actorId: moverName,
          messageKey: 'uno.log.play',
          messageParams: { card: describeCard(state.topCard, t) },
        });
      } else if (p.drawPileCount > state.drawPileCount) {
        const drew = p.drawPileCount - state.drawPileCount;
        push({
          kind: 'action',
          actorId: moverName,
          messageKey: drew === 1 ? 'uno.log.draw' : 'uno.log.drawMany',
          messageParams: { count: drew },
        });
      }
      if (p.direction !== state.direction) {
        push({ kind: 'system', messageKey: 'uno.log.reverse' });
      }
      const wildInvolved =
        p.topCard === 'wild' ||
        p.topCard === 'wild_draw_four' ||
        state.topCard === 'wild' ||
        state.topCard === 'wild_draw_four';
      if (wildInvolved && p.activeColor !== state.activeColor) {
        push({
          kind: 'system',
          actorId: moverName,
          messageKey: 'uno.log.wild',
          messageParams: { color: t(`color.${state.activeColor}`) },
        });
      }
    }
    prev.current = state;
  }, [state, playerNames, push, t]);

  useEffect(() => {
    if (state.winner && loggedWinner.current !== state.winner) {
      loggedWinner.current = state.winner;
      push({
        kind: 'system',
        messageKey: 'uno.log.win',
        messageParams: { player: playerNames[state.winner] ?? state.winner },
      });
    }
  }, [state.winner, playerNames, push]);

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
      className="flex-1 text-foreground flex flex-col p-3 sm:p-6 max-w-3xl mx-auto w-full min-w-0"
      data-testid="game-board"
    >
      {pendingWild !== null && <ColorPickerModal onChoose={handleColorChosen} />}

      {/* Felt table: players strip on top, then draw/discard/meta */}
      <div
        className="bg-felt text-card rounded-[16px] border-2 border-foreground shadow-card p-3 sm:p-5 mb-4"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 20%, rgba(255,255,255,0.08), transparent 60%), repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 6px)',
        }}
      >
        {/* Player strip (inside felt) */}
        <div className="flex flex-wrap gap-1.5 justify-center mb-4 pb-3 border-b border-card/15">
          {players.map((p) => {
            const info = state.players.find((sp) => sp.id === p.id);
            const isCurrent = state.currentPlayer === p.id;
            const isMe = p.id === myId;
            return (
              <div
                key={p.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 text-xs font-semibold transition-all ${
                  isCurrent
                    ? 'bg-[#fef3e0] border-warning text-[#7a4006] shadow-button'
                    : 'bg-card/15 border-card/40 text-card'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    p.connected ? 'bg-success' : 'bg-muted-foreground'
                  }`}
                />
                <span className="truncate max-w-[80px]">
                  {p.name}
                  {isMe ? ` · ${t('you', { ns: 'game-ui', defaultValue: '你' })}` : ''}
                </span>
                <span
                  className={`font-mono text-[10px] ${
                    isCurrent ? 'text-[#7a4006]' : 'text-card/70'
                  }`}
                >
                  {info?.cardCount ?? 0}
                </span>
              </div>
            );
          })}
        </div>

        {gameOver && (
          <div className="text-center text-sm text-card font-semibold mb-3">
            {`${playerNames[state.winner ?? ''] ?? state.winner} ${t('won')}`}
          </div>
        )}
        <div className="flex items-center justify-center gap-4 sm:gap-10">
          <div className="flex flex-col items-center gap-1">
            <div className="w-14 h-20 sm:w-20 sm:h-28 rounded-[10px] border-2 border-card/40 bg-card/20 backdrop-blur-sm flex items-center justify-center text-card font-bold text-xs shadow-[#1a1108_-3px_3px_0px]">
              {state.drawPileCount}
            </div>
            <span className="text-[10px] sm:text-xs text-card/70">{t('drawPile')}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            {topCard !== '' ? (
              <UnoCardFace serialized={topCard} size="normal" />
            ) : (
              <div className="w-14 h-20 sm:w-20 sm:h-28 rounded-[10px] border-2 border-card/30 bg-card/10 backdrop-blur-sm" />
            )}
            <span className="text-[10px] sm:text-xs text-card/70">{t('discardPile')}</span>
          </div>

          <div className="flex flex-col items-center gap-2 sm:gap-3">
            {topCardIsWild && (
              <div className="flex flex-col items-center gap-0.5">
                <div className="w-7 h-7 rounded-full border-2 border-card/40 flex items-center justify-center bg-card/10">
                  <ColorDot color={state.activeColor} />
                </div>
                <span className="text-[10px] text-card/70">{t('currentColor')}</span>
              </div>
            )}
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-7 h-7 rounded-full border-2 border-card/40 flex items-center justify-center bg-card/10 text-card text-base font-bold">
                {state.direction === 1 ? '↻' : '↺'}
              </div>
              <span className="text-[10px] text-card/70">{t('direction')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* My Hand */}
      {!gameOver && (
        <div className="bg-card text-foreground rounded-[16px] border-2 border-foreground shadow-card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-muted-foreground">
              {t('yourHand')} · {state.myHand.length} {t('cards')}
            </div>
          </div>
          <span className="sm:hidden">
            <HandStrip
              cards={state.myHand.map((serialized, idx) => ({ serialized, idx }))}
              getKey={(c) => String(c.idx)}
              selectedKey={selectedKey}
              onSelect={(_k, c) => handleCardClick(c.idx)}
              isDisabled={() => !isMyTurn}
              overlapThreshold={6}
              maxOverlap={14}
              emptyLabel={t('noCards')}
              renderCard={(c, { selected, disabled, onSelect }) => (
                <UnoCardFace
                  serialized={c.serialized}
                  size="small"
                  selected={selected}
                  disabled={disabled}
                  onClick={onSelect}
                />
              )}
            />
          </span>
          <span className="hidden sm:block">
            <HandStrip
              cards={state.myHand.map((serialized, idx) => ({ serialized, idx }))}
              getKey={(c) => String(c.idx)}
              selectedKey={selectedKey}
              onSelect={(_k, c) => handleCardClick(c.idx)}
              isDisabled={() => !isMyTurn}
              overlapThreshold={11}
              maxOverlap={28}
              emptyLabel={t('noCards')}
              renderCard={(c, { selected, disabled, onSelect }) => (
                <UnoCardFace
                  serialized={c.serialized}
                  size="normal"
                  selected={selected}
                  disabled={disabled}
                  onClick={onSelect}
                />
              )}
            />
          </span>

          {isMyTurn && selectedCardIndex !== null && (
            <div className="flex justify-center mt-2">
              <button
                type="button"
                onClick={() => handlePlayCard(selectedCardIndex)}
                className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-[6px] font-semibold shadow-button hover:-translate-y-0.5 transition-transform"
              >
                {t('playCard')}
              </button>
            </div>
          )}

          {isMyTurn && (
            <div className="flex gap-2 justify-center mt-3">
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
