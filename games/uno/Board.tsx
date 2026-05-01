import { useGameHeaderStatus } from '@repo/game-ui';
import { HandStrip, PlayingCard } from '@repo/game-ui/card';
import { GameOverModal } from '@repo/game-ui/feedback';
import { useGameLog } from '@repo/game-ui/log';
import type { BoardProps } from '@repo/shared';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Action, COLORS, type PlayerView, type UnoColor, deserializeCard } from './shared';

// ---- Card color styling ----

const CARD_COLOR_HEX: Record<string, string> = {
  red: '#d94040',
  blue: '#2563eb',
  green: '#16a34a',
  yellow: '#d97706',
};

function getCardStyle(color: string): { className: string; style?: React.CSSProperties } {
  const hex = CARD_COLOR_HEX[color];
  if (hex) {
    return {
      className: 'border-[#1a1108] text-card',
      // Plastic sheen: base color + soft top highlight + bottom shadow.
      style: {
        background: `linear-gradient(160deg, color-mix(in srgb, ${hex} 100%, white 18%) 0%, ${hex} 38%, color-mix(in srgb, ${hex} 100%, black 16%) 100%)`,
      },
    };
  }
  return {
    className: 'border-[#1a1108] text-card',
    style: {
      background:
        'conic-gradient(from 210deg at 50% 50%, #d94040, #d97706, #16a34a, #2563eb, #d94040)',
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
      center={
        // White "oval badge" behind the center glyph — classic UNO plastic look.
        <span
          className="relative inline-flex items-center justify-center"
          style={{
            textShadow: '1px 2px 0 rgba(26,17,8,0.35)',
            fontStyle: 'italic',
            letterSpacing: '-0.02em',
          }}
        >
          {label}
        </span>
      }
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...colorStyle,
        boxShadow: selected
          ? '0 8px 0 -2px rgba(26,17,8,0.55), 0 10px 16px -6px rgba(26,17,8,0.45)'
          : '0 3px 0 -1px rgba(26,17,8,0.45), 0 6px 10px -4px rgba(26,17,8,0.35)',
      }}
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
  const reduced = useReducedMotion();

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

  const currentPlayerName = playerNames[state.currentPlayer] ?? state.currentPlayer;
  const currentIsBot = !gameOver && !isMyTurn && currentPlayerName.startsWith('Bot');

  const turnLabel: string = gameOver
    ? `${playerNames[state.winner ?? ''] ?? state.winner} ${t('won')}`
    : isMyTurn
      ? t('yourTurn')
      : currentIsBot
        ? t('botThinking', { name: currentPlayerName })
        : t('opponentTurn', { name: currentPlayerName });

  const turnCardAnimate =
    !reduced && isMyTurn && !gameOver
      ? {
          boxShadow: [
            '#1a1108 -4px 4px 0px, 0 0 0 0 rgba(244,217,168,0)',
            '#1a1108 -4px 4px 0px, 0 0 0 5px rgba(244,217,168,0.55)',
            '#1a1108 -4px 4px 0px, 0 0 0 0 rgba(244,217,168,0)',
          ],
          opacity: [1, 0.94, 1],
        }
      : { boxShadow: '#1a1108 -4px 4px 0px', opacity: 1 };

  return (
    <div
      className="flex-1 flex flex-col p-3 sm:p-6 max-w-3xl mx-auto w-full min-w-0 gap-4"
      data-testid="game-board"
    >
      {pendingWild !== null && <ColorPickerModal onChoose={handleColorChosen} />}

      {/* Player strip — floats on the red scene, cream chips for contrast. */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {players.map((p) => {
          const info = state.players.find((sp) => sp.id === p.id);
          const isCurrent = state.currentPlayer === p.id;
          const isMe = p.id === myId;
          return (
            <div
              key={p.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 text-xs font-semibold transition-all ${
                isCurrent
                  ? 'bg-card border-foreground text-foreground shadow-[#1a1108_-2px_2px_0px]'
                  : 'bg-card/80 border-card/60 text-foreground/80'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  p.connected ? 'bg-success' : 'bg-muted-foreground'
                }`}
              />
              <span className="truncate max-w-[80px]">
                {p.name}
                {isMe ? ` · ${t('you', { ns: 'game-ui' })}` : ''}
              </span>
              <span
                className={`font-mono text-[10px] ${
                  isCurrent ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {info?.cardCount ?? 0}
              </span>
            </div>
          );
        })}
      </div>

      {/* The pile zone — bare on the paper surface, no container box. */}
      <div className="flex items-center justify-center gap-6 sm:gap-12 py-4">
        {/* Draw pile — stacked card backs, classic UNO logo center. */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative">
            <div
              className="absolute -top-1 -left-1 w-14 h-20 sm:w-20 sm:h-28 rounded-[10px] border-2 border-[#1a1108]"
              style={{
                background: 'linear-gradient(160deg, #2a1810 0%, #1a1108 60%, #0d0805 100%)',
                boxShadow: '0 2px 0 -1px rgba(26,17,8,0.5)',
              }}
              aria-hidden
            />
            <button
              type="button"
              onClick={isMyTurn && !state.hasDrawnThisTurn ? handleDraw : undefined}
              disabled={!isMyTurn || state.hasDrawnThisTurn}
              aria-label={t('drawCard')}
              className={`relative w-14 h-20 sm:w-20 sm:h-28 rounded-[10px] border-2 border-[#1a1108] flex items-center justify-center text-card font-bold ${
                isMyTurn && !state.hasDrawnThisTurn
                  ? 'cursor-pointer hover:-translate-y-1 transition-transform'
                  : 'cursor-default'
              }`}
              style={{
                background: 'linear-gradient(160deg, #2a1810 0%, #1a1108 60%, #0d0805 100%)',
                boxShadow: '0 4px 0 -1px rgba(26,17,8,0.55), 0 8px 12px -4px rgba(0,0,0,0.35)',
              }}
            >
              <span
                className="italic text-base sm:text-xl font-black"
                style={{
                  color: 'var(--scene-accent, #f4d9a8)',
                  textShadow: '1px 2px 0 rgba(0,0,0,0.6)',
                  letterSpacing: '-0.03em',
                  transform: 'rotate(-14deg)',
                }}
              >
                UNO
              </span>
            </button>
          </div>
          <span className="text-[10px] sm:text-xs text-card/90 font-semibold">
            {t('drawPile')} · {state.drawPileCount}
          </span>
        </div>

        {/* Discard pile — settle-in motion when the top card changes. */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative w-14 h-20 sm:w-20 sm:h-28">
            <AnimatePresence mode="popLayout" initial={false}>
              {topCard !== '' && (
                <motion.div
                  key={topCard + '|' + state.activeColor}
                  className="absolute inset-0"
                  initial={
                    reduced
                      ? { opacity: 1, scale: 1, rotate: 0 }
                      : { opacity: 0, scale: 0.6, rotate: -8, y: -18 }
                  }
                  animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: reduced ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <UnoCardFace serialized={topCard} size="normal" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className="text-[10px] sm:text-xs text-card/90 font-semibold">
            {t('discardPile')}
          </span>
        </div>

        {/* Meta column — active color + play direction. */}
        <div className="flex flex-col items-center gap-2 sm:gap-3">
          {topCardIsWild && (
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-8 rounded-full border-2 border-[#1a1108] bg-card flex items-center justify-center shadow-[#1a1108_-2px_2px_0px]">
                <ColorDot color={state.activeColor} />
              </div>
              <span className="text-[10px] text-card/90 font-semibold">{t('currentColor')}</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-8 h-8 rounded-full border-2 border-[#1a1108] bg-card flex items-center justify-center text-foreground text-base font-bold shadow-[#1a1108_-2px_2px_0px]">
              {state.direction === 1 ? '↻' : '↺'}
            </div>
            <span className="text-[10px] text-card/90 font-semibold">{t('direction')}</span>
          </div>
        </div>
      </div>

      {/* Turn indicator — sits between table and hand, clear even on red. */}
      <div className="flex justify-center">
        <motion.div
          className="flex items-center gap-2 text-sm font-semibold bg-card border-2 border-foreground rounded-[10px] px-3 py-1.5"
          animate={turnCardAnimate}
          transition={
            !reduced && isMyTurn && !gameOver
              ? { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
              : { duration: 0.2 }
          }
        >
          <span
            className={`w-2 h-2 rounded-full ${
              gameOver ? 'bg-muted-foreground' : isMyTurn ? 'bg-warning' : 'bg-muted-foreground'
            }`}
          />
          <span className={isMyTurn && !gameOver ? 'text-warning' : 'text-muted-foreground'}>
            {turnLabel}
          </span>
        </motion.div>
      </div>

      {/* My Hand — cream panel, thick border — reads clearly on the red scene. */}
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

          {isMyTurn && state.hasDrawnThisTurn && (
            <div className="flex gap-2 justify-center mt-3">
              <button
                type="button"
                onClick={handlePass}
                className="bg-muted text-muted-foreground border-2 border-border px-4 py-2 rounded-[10px] font-semibold text-sm hover:bg-secondary transition-colors"
              >
                {t('pass')}
              </button>
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
