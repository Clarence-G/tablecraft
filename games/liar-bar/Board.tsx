import { useGameHeaderStatus } from '@repo/game-ui';
import { type CardAccent, PlayingCard } from '@repo/game-ui/card';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Action, type Card, type PlayerView, SUIT_COLORS } from './shared';

const CARD_ACCENT: Record<Card, CardAccent> = {
  Q: 'blue',
  K: 'purple',
  A: 'green',
  Joker: 'red',
};

function HandCard({
  card,
  selected,
  disabled,
  onClick,
}: {
  card: Card;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <PlayingCard
      size="md"
      accent={CARD_ACCENT[card]}
      backgroundClass={SUIT_COLORS[card].bgClass}
      corner={card === 'Joker' ? 'J' : card}
      center={card === 'Joker' ? 'Joker' : card}
      selected={selected}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

function FaceDownCard() {
  return <PlayingCard size="xs" faceDown />;
}

function RevolverDisplay({ chamber, alive }: { chamber: number; alive: boolean }) {
  return (
    <div className="flex gap-1 items-center">
      {Array.from({ length: 6 }, (_, i) => {
        const fired = i < chamber;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: revolver chambers are fixed positional
            key={i}
            className={[
              'w-3 h-3 rounded-full border',
              fired ? 'bg-destructive border-destructive' : 'bg-muted border-border',
              !alive ? 'opacity-40' : '',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}

// ---- Main Board ----

export function Board({
  state,
  myId,
  players,
  sendAction: rawSendAction,
  isSending,
}: BoardProps<PlayerView, Action>) {
  const sendAction = isSending ? () => {} : rawSendAction;
  const { t } = useTranslation('liar-bar');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const myInfo = state.players.find((p) => p.id === myId);
  const amAlive = myInfo?.alive ?? false;
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);

  // Who is the decider in challenging phase
  const lastPlayerId = state.lastPlay?.playerId;
  const lastPlayerTurnIdx = state.players.findIndex((p) => p.id === lastPlayerId);
  const alivePlayers = state.players.filter((p) => p.alive);
  // Decider = next alive player after lastPlayer
  let deciderIdx = -1;
  if (lastPlayerId !== undefined) {
    const aliveOrder = alivePlayers.map((p) => p.id);
    const lastIdx = aliveOrder.indexOf(lastPlayerId);
    deciderIdx = (lastIdx + 1) % aliveOrder.length;
  }
  const deciderId = deciderIdx >= 0 ? alivePlayers[deciderIdx]?.id : null;
  const isDecider = state.phase === 'challenging' && myId === deciderId;

  function toggleCard(idx: number) {
    setSelectedIndices((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      if (prev.length >= 3) return prev;
      return [...prev, idx];
    });
  }

  function handlePlayCards() {
    if (selectedIndices.length === 0) return;
    sendAction({ type: 'play_cards', cardIndices: selectedIndices });
    setSelectedIndices([]);
  }

  function handleChallenge() {
    sendAction({ type: 'challenge' });
  }

  function handleBelieve() {
    sendAction({ type: 'believe' });
  }

  const cr = state.challengeResult;

  return (
    <div className="flex-1 text-foreground flex flex-col p-3 sm:p-4 max-w-3xl lg:max-w-5xl mx-auto w-full gap-3">
      {/* Challenge Result Overlay */}
      {cr && !gameOver && (
        <div className="border-2 border-foreground/50 rounded-[12px] bg-card/85 backdrop-blur-sm shadow-[4px_4px_0px_0px_rgba(26,17,8,0.4)] p-4 text-center">
          <div className="text-sm font-bold mb-2">
            {cr.wasLying ? t('caughtLying') : t('honestInnocent')}
          </div>
          <div className="flex gap-1 justify-center mb-2">
            {cr.playedCards.map((card, i) => {
              const suit = SUIT_COLORS[card as Card];
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: played cards are ephemeral display-only list
                  key={i}
                  className="px-2 py-1 rounded-[8px] border-2 text-xs font-bold"
                  style={{
                    backgroundColor: suit.bg,
                    borderColor: suit.border,
                    color: suit.text,
                  }}
                >
                  {card}
                </div>
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            {playerNames[cr.shooterId] ?? cr.shooterId}{' '}
            {t('triggerPull', { n: cr.shotChamberIndex + 1 })}
            {' — '}
            {cr.shotDied ? (
              <span className="text-destructive font-semibold">{t('shotEliminated')}</span>
            ) : (
              <span className="text-success font-semibold">{t('luckyAlive')}</span>
            )}
          </div>
        </div>
      )}

      {/* Players */}
      <div className="flex flex-wrap gap-2 justify-center">
        {players.map((p) => {
          const info = state.players.find((sp) => sp.id === p.id);
          return (
            <div key={p.id} className="flex flex-col items-center gap-1.5">
              <PlayerBadge
                player={p}
                isCurrentTurn={state.currentPlayer === p.id && state.phase === 'playing'}
                isMe={p.id === myId}
              />
              <RevolverDisplay chamber={info?.revolverChamber ?? 0} alive={info?.alive ?? true} />
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {!info?.alive && <span className="text-destructive font-semibold">{t('out')}</span>}
                {info?.alive && p.id !== myId && (
                  <div className="flex gap-0.5">
                    {Array.from({ length: info.cardCount }, (_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: card count display, no stable id
                      <FaceDownCard key={i} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Game Info — declared suit (emphasized hierarchy vs hand cards) */}
      <div
        className="border-4 rounded-[16px] bg-card/85 backdrop-blur-sm p-4 text-center"
        style={{
          borderColor: SUIT_COLORS[state.declaredSuit].border,
          boxShadow: '6px 6px 0px 0px hsl(var(--shadow))',
        }}
      >
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          {t('declaredSuit')}
        </div>
        <div
          className="text-4xl font-black leading-none"
          style={{ color: SUIT_COLORS[state.declaredSuit].text }}
        >
          {state.declaredSuit}
        </div>
      </div>

      {/* Status (challenge phase / game over / eliminated — turn lives in header) */}
      {(gameOver || (state.phase === 'challenging' && state.lastPlay) || !amAlive) && (
        <div className="text-center text-sm text-muted-foreground">
          {gameOver
            ? `${playerNames[state.winner ?? ''] ?? state.winner} ${t('won')}`
            : state.phase === 'challenging' && state.lastPlay
              ? `${playerNames[state.lastPlay.playerId] ?? state.lastPlay.playerId} ${t('playedCards')} ${state.lastPlay.count} ${t('cardsWaiting')} ${playerNames[deciderId ?? ''] ?? deciderId} ${t('deciding')}`
              : t('eliminatedWatching')}
        </div>
      )}

      {/* Last Play Info */}
      {state.phase === 'challenging' && state.lastPlay && (
        <div className="text-center text-xs text-muted-foreground bg-secondary rounded-[8px] py-2 px-3">
          {playerNames[state.lastPlay.playerId] ?? state.lastPlay.playerId} {t('claimedPlayed')}{' '}
          <span className="font-semibold">{state.lastPlay.count}</span> {t('cardsUnit')}{' '}
          <span className="font-bold" style={{ color: SUIT_COLORS[state.declaredSuit].text }}>
            {state.declaredSuit}
          </span>
        </div>
      )}

      {/* My Hand */}
      {amAlive && !gameOver && state.phase === 'playing' && isMyTurn && (
        <div className="border-2 border-foreground/50 rounded-[12px] bg-card/85 backdrop-blur-sm shadow-[4px_4px_0px_0px_rgba(26,17,8,0.4)] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-muted-foreground">{t('yourHand')}</div>
            <div
              className={[
                'text-xs font-mono tabular-nums px-2 py-0.5 rounded-full border',
                selectedIndices.length > 0
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border text-muted-foreground',
              ].join(' ')}
            >
              {selectedIndices.length}/3
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mb-3">
            {state.myHand.map((card, i) => (
              <HandCard
                // biome-ignore lint/suspicious/noArrayIndexKey: hand cards reordered only after actions
                key={i}
                card={card}
                selected={selectedIndices.includes(i)}
                disabled={false}
                onClick={() => toggleCard(i)}
              />
            ))}
          </div>
          {selectedIndices.length > 0 && (
            <button
              type="button"
              onClick={handlePlayCards}
              className="w-full py-2.5 rounded-[12px] font-semibold text-sm bg-primary text-primary-foreground border-2 border-shadow shadow-[4px_4px_0px_0px_hsl(var(--shadow))] transition-all hover:-translate-y-0.5 active:translate-y-px"
            >
              {t('playCards', { n: selectedIndices.length, suit: state.declaredSuit })}
            </button>
          )}
          {selectedIndices.length === 0 && (
            <div className="text-xs text-muted-foreground text-center">{t('clickToSelect')}</div>
          )}
        </div>
      )}

      {/* Hand (view only, not my turn) */}
      {amAlive && !gameOver && state.phase === 'playing' && !isMyTurn && (
        <div className="border-2 border-border rounded-[12px] bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">{t('yourHandView')}</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {state.myHand.map((card, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: hand cards reordered only after actions
              <HandCard key={i} card={card} selected={false} disabled onClick={() => {}} />
            ))}
          </div>
        </div>
      )}

      {/* Hand during challenging phase */}
      {amAlive && !gameOver && state.phase === 'challenging' && (
        <div className="border-2 border-border rounded-[12px] bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">{t('yourHandView')}</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {state.myHand.map((card, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: hand cards reordered only after actions
              <HandCard key={i} card={card} selected={false} disabled onClick={() => {}} />
            ))}
          </div>
        </div>
      )}

      {/* Challenge / Believe buttons */}
      {isDecider && !gameOver && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleChallenge}
            className="flex-1 py-3 rounded-[12px] font-bold text-sm border-2 border-destructive bg-destructive/10 text-destructive shadow-[4px_4px_0px_0px_hsl(var(--destructive))] transition-all hover:-translate-y-0.5 active:translate-y-px"
          >
            {t('challenge')}
          </button>
          <button
            type="button"
            onClick={handleBelieve}
            className="flex-1 py-3 rounded-[12px] font-bold text-sm border-2 border-success bg-success/10 text-success shadow-[4px_4px_0px_0px_hsl(var(--success))] transition-all hover:-translate-y-0.5 active:translate-y-px"
          >
            {t('believe')}
          </button>
        </div>
      )}

      {/* Spectator / eliminated view */}
      {!amAlive && !gameOver && (
        <div className="text-center text-sm text-muted-foreground border-2 border-border rounded-[12px] bg-card p-4">
          {t('eliminatedSpectating')}
        </div>
      )}

      {/* Game Over */}
      {gameOver && state.winner && (
        <GameOverModal
          rankings={[
            state.winner,
            ...state.players.filter((p) => p.id !== state.winner).map((p) => p.id),
          ]}
          playerNames={playerNames}
          myId={myId}
        />
      )}
    </div>
  );
}
