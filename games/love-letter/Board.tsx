import { useGameHeaderStatus } from '@repo/game-ui';
import { PlayingCard } from '@repo/game-ui/card';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOVE_LETTER_CARD_ART, LOVE_LETTER_CARD_BACK } from './cardArt';
import { type Action, OTHER_TARGET_CARDS, type PlayerView } from './shared';

// ---- Card Component ----

function CardFace({
  value,
  selected,
  disabled,
  onClick,
  size = 'normal',
  t,
}: {
  value: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'small' | 'normal';
  t: (key: string) => string;
}) {
  const isSmall = size === 'small';
  const name = t(`cardNames.${value}`);
  return (
    <PlayingCard
      size={isSmall ? 'sm' : 'lg'}
      corner={value}
      center={name}
      subtitle={!isSmall ? t(`cardDescriptions.${value}`) : undefined}
      cardArt={LOVE_LETTER_CARD_ART[value]}
      cardArtAlt={name}
      selected={selected}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

function CardBack({ size = 'small' }: { size?: 'small' | 'normal' }) {
  return (
    <PlayingCard
      size={size === 'small' ? 'sm' : 'lg'}
      faceDown
      backArt={LOVE_LETTER_CARD_BACK}
    />
  );
}

// ---- Main Board ----

export function Board({
  state,
  myId,
  players,
  sendAction: rawSendAction,
  isSending,
  notifications,
}: BoardProps<PlayerView, Action>) {
  const sendAction = isSending ? () => {} : rawSendAction;
  const { t } = useTranslation('love-letter');
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedGuess, setSelectedGuess] = useState<number | null>(null);

  const isMyTurn = state.currentPlayer === myId;
  const amAlive = state.players.find((p) => p.id === myId)?.alive ?? false;
  const gameOver = !!state.winner;
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));

  // Determine if selected card needs a target
  const needsOtherTarget =
    selectedCard !== null && (OTHER_TARGET_CARDS as readonly number[]).includes(selectedCard);
  const needsPrinceTarget = selectedCard === 5;
  const needsTarget = needsOtherTarget || needsPrinceTarget;
  const needsGuess = selectedCard === 1;

  // Valid targets for current card
  const validTargets = state.players.filter((p) => {
    if (!p.alive) return false;
    if (selectedCard === 5) {
      // Prince: can target self or non-protected others
      if (p.id === myId) return true;
      return !p.protected;
    }
    // Other targeting cards: alive, not self, not protected
    return p.id !== myId && !p.protected;
  });

  const hasValidTargets = needsOtherTarget && validTargets.filter((p) => p.id !== myId).length > 0;

  // Countess forced play check
  const mustPlayCountess = state.hand.includes(7) && state.hand.some((c) => c === 5 || c === 6);

  // Can confirm play?
  const canConfirm = (() => {
    if (!selectedCard) return false;
    if (needsTarget && hasValidTargets && !selectedTarget) return false;
    if (needsGuess && hasValidTargets && selectedTarget && !selectedGuess) return false;
    return true;
  })();

  function handleConfirm() {
    if (!selectedCard) return;
    sendAction({
      type: 'play_card',
      card: selectedCard,
      target: selectedTarget ?? undefined,
      guess: selectedGuess ?? undefined,
    });
    setSelectedCard(null);
    setSelectedTarget(null);
    setSelectedGuess(null);
  }

  // Priest peek notifications
  const priestPeek = notifications.find((n: any) => n?.type === 'priest_peek') as
    | { type: string; target: string; card: number }
    | undefined;

  // Baron compare notifications
  const baronCompare = notifications.find((n: any) => n?.type === 'baron_compare') as
    | { type: string; myCard: number; theirCard: number; target: string }
    | undefined;

  return (
    <div
      className="flex-1 text-foreground flex flex-col p-3 sm:p-4 max-w-lg mx-auto w-full"
      data-testid="game-board"
    >
      {/* Notifications */}
      {priestPeek && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-ring/50 rounded-xl px-4 py-3 shadow-lg text-center">
          <div className="text-xs text-muted-foreground mb-1">{t('peekHand')}</div>
          <div className="text-sm">
            {playerNames[priestPeek.target]}
            {t('handIs')}{' '}
            <span className="font-bold">
              {t(`cardNames.${priestPeek.card}`)}({priestPeek.card})
            </span>
          </div>
        </div>
      )}

      {baronCompare && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-ring/50 rounded-xl px-4 py-3 shadow-lg text-center">
          <div className="text-xs text-muted-foreground mb-1">{t('baronCompare')}</div>
          <div className="text-sm">
            {t('yourCard')}{' '}
            <span className="font-bold">
              {t(`cardNames.${baronCompare.myCard}`)}({baronCompare.myCard})
            </span>
            {' vs '}
            {playerNames[baronCompare.target]}:{' '}
            <span className="font-bold">
              {t(`cardNames.${baronCompare.theirCard}`)}({baronCompare.theirCard})
            </span>
          </div>
        </div>
      )}

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
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {!info?.alive && <span className="text-destructive">{t('eliminated')}</span>}
                {info?.alive && info.protected && (
                  <span className="text-warning">{t('protected')}</span>
                )}
                {info?.alive && p.id !== myId && (
                  <span className="flex gap-0.5">
                    {Array.from({ length: info?.cardCount ?? 0 }).map((_, i) => (
                      <CardBack key={i} />
                    ))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Game-specific status (winner / eliminated — turn lives in header) */}
      {(gameOver || !amAlive) && (
        <div className="text-center text-sm text-muted-foreground mb-2">
          {gameOver
            ? `${playerNames[state.winner!] ?? state.winner} ${t('won')}`
            : t('eliminatedWatching')}
        </div>
      )}

      {/* Deck info */}
      <div className="text-center text-xs text-muted-foreground mb-3">
        {t('deckRemaining')} {state.deckSize} {t('cardsUnit')}
        {state.removedCards.length > 0 && (
          <span className="ml-2">
            | {t('removed')}{' '}
            {state.removedCards.map((c) => `${t(`cardNames.${c}`)}(${c})`).join(', ')}
          </span>
        )}
      </div>

      {/* Play Log */}
      <div className="flex-1 bg-card/60 backdrop-blur-sm rounded-xl ring-1 ring-foreground/15 p-3 mb-3 overflow-y-auto max-h-48 sm:max-h-64">
        <div className="text-xs font-medium text-muted-foreground mb-2">{t('playHistory')}</div>
        {state.playLog.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 text-center py-4">{t('noHistory')}</div>
        ) : (
          <div className="space-y-1.5">
            {state.playLog.map((entry, i) => (
              <div key={i} className="text-xs flex items-start gap-1.5">
                <span className="font-medium shrink-0">
                  {playerNames[entry.playerId] ?? entry.playerId}
                </span>
                <span className="text-muted-foreground">
                  {t('played')} {t(`cardNames.${entry.card}`)}({entry.card})
                  {entry.target && ` → ${playerNames[entry.target] ?? entry.target}`}
                  {entry.guess !== undefined &&
                    ` ${t('guess')}${t(`cardNames.${entry.guess}`)}(${entry.guess})`}
                </span>
                <span className="text-muted-foreground/80 ml-auto shrink-0">{entry.effect}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Played cards per player */}
      <div className="flex flex-wrap gap-3 justify-center mb-3">
        {state.players
          .filter((p) => p.playedCards.length > 0)
          .map((p) => (
            <div key={p.id} className="text-center">
              <div className="text-[10px] text-muted-foreground mb-1">
                {playerNames[p.id] ?? p.id}
              </div>
              <div className="flex gap-0.5">
                {p.playedCards.map((c, i) => (
                  <CardFace key={i} value={c} size="small" t={t} />
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* My Hand */}
      {amAlive && !gameOver && (
        <div className="bg-card/60 backdrop-blur-sm rounded-xl ring-1 ring-foreground/15 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">{t('yourHand')}</div>
          <div className="flex gap-3 justify-center mb-3">
            {state.hand.map((card, i) => {
              const isForced = mustPlayCountess && card !== 7;
              return (
                <CardFace
                  key={i}
                  value={card}
                  selected={selectedCard === card && i === state.hand.indexOf(selectedCard)}
                  disabled={!isMyTurn || isForced}
                  t={t}
                  onClick={() => {
                    if (!isMyTurn || isForced) return;
                    if (selectedCard === card) {
                      setSelectedCard(null);
                      setSelectedTarget(null);
                      setSelectedGuess(null);
                    } else {
                      setSelectedCard(card);
                      setSelectedTarget(null);
                      setSelectedGuess(null);
                    }
                  }}
                />
              );
            })}
          </div>

          {mustPlayCountess && isMyTurn && (
            <div className="text-xs text-warning text-center mb-2">{t('mustPlayCountess')}</div>
          )}

          {/* Target Selection */}
          {isMyTurn && selectedCard && needsTarget && validTargets.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-muted-foreground mb-1.5">{t('selectTarget')}</div>
              <div className="flex flex-wrap gap-2 justify-center">
                {validTargets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedTarget(p.id)}
                    className={`
                      px-3 py-1.5 rounded-lg text-sm transition-all
                      ${
                        selectedTarget === p.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }
                    `}
                  >
                    {playerNames[p.id] ?? p.id}
                    {p.id === myId && ` (${t('self')})`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Guard Guess */}
          {isMyTurn && selectedCard === 1 && selectedTarget && (
            <div className="mb-3">
              <div className="text-xs text-muted-foreground mb-1.5">{t('guessHand')}</div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSelectedGuess(n)}
                    className={`
                      px-2.5 py-1.5 rounded-lg text-xs transition-all
                      ${
                        selectedGuess === n
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }
                    `}
                  >
                    {n}-{t(`cardNames.${n}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Confirm Button */}
          {isMyTurn && selectedCard && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`
                w-full py-2.5 rounded-lg font-semibold text-sm transition-all
                ${
                  canConfirm
                    ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }
              `}
            >
              {t('playCard', { card: t(`cardNames.${selectedCard}`) })}
            </button>
          )}
        </div>
      )}

      {/* Eliminated spectator hint */}
      {!amAlive && !gameOver && (
        <div className="text-center text-sm text-muted-foreground bg-card/60 backdrop-blur-sm rounded-xl ring-1 ring-foreground/15 p-4">
          {t('eliminatedWatching2')}
        </div>
      )}

      {/* Game Over */}
      {gameOver && (
        <GameOverModal
          rankings={[
            state.winner!,
            ...state.players.filter((p) => p.id !== state.winner).map((p) => p.id),
          ]}
          playerNames={playerNames}
          myId={myId}
        />
      )}
    </div>
  );
}
