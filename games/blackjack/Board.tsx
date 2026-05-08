import { useGameHeaderStatus } from '@repo/game-ui';
import { PlayingCard } from '@repo/game-ui/card';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Action, type PlayerInfo, type PlayerView, SUIT_PATHS, handTotal } from './shared';

// ---- Card Component ----

function SuitIcon({ suit, className }: { suit: string; className?: string }) {
  const d = SUIT_PATHS[suit];
  if (!d) return null;
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <path fill="currentColor" d={d} />
    </svg>
  );
}

function CardFace({ card }: { card: string }) {
  if (card === 'hidden') return <PlayingCard size="sm" faceDown />;

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const isRed = suit === 'h' || suit === 'd';
  const displayRank = rank === 'T' ? '10' : rank;

  return (
    <PlayingCard
      size="sm"
      accent={isRed ? 'red' : 'default'}
      corner={displayRank}
      cornerIcon={<SuitIcon suit={suit} className="size-2.5" />}
      center={<SuitIcon suit={suit} className="size-4" />}
    />
  );
}

function Hand({
  cards,
  label,
  total,
  pointsLabel,
}: { cards: string[]; label: string; total?: number; pointsLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <div className="flex gap-1 flex-wrap justify-center">
        {cards.map((card, i) => (
          <CardFace // biome-ignore lint/suspicious/noArrayIndexKey: card positions in hand are ordered and stable for display
            key={i}
            card={card}
          />
        ))}
        {cards.length === 0 && (
          <div className="w-10 h-14 rounded-[6px] border-2 border-dashed border-border flex items-center justify-center">
            <span className="text-muted-foreground text-xs">-</span>
          </div>
        )}
      </div>
      {total !== undefined && total > 0 && (
        <span className="text-sm font-semibold text-foreground">
          {total} {pointsLabel}
        </span>
      )}
    </div>
  );
}

// ---- Player Status Row ----

function PlayerRow({
  player,
  name,
  isMe,
  isActive,
}: {
  player: PlayerInfo;
  name: string;
  isMe: boolean;
  isActive: boolean;
}) {
  const { t } = useTranslation('blackjack');
  const outcomeLabel: Record<string, string> = {
    pending: '',
    win: t('win'),
    lose: t('lose'),
    push: t('push'),
    blackjack: t('blackjack'),
    bust: t('busted'),
  };

  const outcomeColor: Record<string, string> = {
    win: 'text-success',
    blackjack: 'text-success',
    lose: 'text-destructive',
    bust: 'text-destructive',
    push: 'text-warning',
    pending: 'text-muted-foreground',
  };

  return (
    <div
      className={[
        'flex items-center justify-between px-3 py-2 rounded-[8px] border-2',
        isActive ? 'border-warning bg-warning/10' : 'border-border bg-card',
        isMe ? 'border-foreground' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold truncate text-foreground">{name}</span>
        {isMe && <span className="text-xs text-muted-foreground shrink-0">{t('me')}</span>}
        {player.bet > 0 && (
          <span className="text-xs text-warning shrink-0">
            {t('bet')} {player.bet}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {player.cardCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {player.cardCount}
            {t('cards')}
          </span>
        )}
        {player.outcome !== 'pending' && (
          <span className={`text-xs font-bold ${outcomeColor[player.outcome] ?? ''}`}>
            {outcomeLabel[player.outcome]}
          </span>
        )}
        <span className="text-sm font-mono text-foreground">{player.chips}</span>
      </div>
    </div>
  );
}

// ---- Betting UI ----

const BET_AMOUNTS = [10, 25, 50, 100, 200, 500];

function BettingPanel({
  myChips,
  hasBet,
  onBet,
}: {
  myChips: number;
  hasBet: boolean;
  onBet: (amount: number) => void;
}) {
  const [custom, setCustom] = useState('');
  const { t } = useTranslation('blackjack');

  if (hasBet) {
    return <div className="text-center text-sm text-muted-foreground py-4">{t('betWaiting')}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-semibold text-foreground text-center">{t('selectBet')}</div>
      <div className="flex flex-wrap gap-2 justify-center">
        {BET_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={amount > myChips}
            onClick={() => onBet(amount)}
            className={[
              'px-4 py-2 min-h-[44px] rounded-[8px] border-2 font-semibold text-sm transition-all',
              amount <= myChips
                ? 'border-foreground bg-card shadow-[2px_2px_0px_0px_hsl(var(--foreground))] active:translate-y-[1px] active:shadow-none hover:bg-warning/10'
                : 'border-border bg-muted text-muted-foreground cursor-not-allowed',
            ].join(' ')}
          >
            {amount}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={10}
          max={Math.min(500, myChips)}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={t('customAmount')}
          className="flex-1 border-2 border-foreground rounded-[8px] px-3 py-2 text-sm bg-card text-foreground outline-none focus:border-warning"
        />
        <button
          type="button"
          disabled={!custom || Number(custom) < 10 || Number(custom) > Math.min(500, myChips)}
          onClick={() => {
            const n = Number(custom);
            if (n >= 10 && n <= Math.min(500, myChips)) {
              onBet(n);
              setCustom('');
            }
          }}
          className={[
            'px-4 py-2 rounded-[8px] border-2 font-semibold text-sm transition-all',
            custom && Number(custom) >= 10 && Number(custom) <= Math.min(500, myChips)
              ? 'border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0px_0px_hsl(var(--shadow))] active:translate-y-[1px] active:shadow-none'
              : 'border-border bg-muted text-muted-foreground cursor-not-allowed',
          ].join(' ')}
        >
          {t('bet')}
        </button>
      </div>
    </div>
  );
}

// ---- Action Buttons ----

function ActionButtons({
  canAct,
  canDoubleDown,
  onHit,
  onStand,
  onDoubleDown,
}: {
  canAct: boolean;
  canDoubleDown: boolean;
  onHit: () => void;
  onStand: () => void;
  onDoubleDown: () => void;
}) {
  const { t } = useTranslation('blackjack');
  const btnBase = 'flex-1 py-3 rounded-[8px] border-2 font-semibold text-sm transition-all';
  const btnActive =
    'border-foreground bg-card shadow-[2px_2px_0px_0px_hsl(var(--foreground))] active:translate-y-[1px] active:shadow-none hover:bg-warning/10';
  const btnDisabled = 'border-border bg-muted text-muted-foreground cursor-not-allowed';

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!canAct}
        onClick={onHit}
        className={`${btnBase} ${canAct ? btnActive : btnDisabled}`}
      >
        {t('hit')}
      </button>
      <button
        type="button"
        disabled={!canAct}
        onClick={onStand}
        className={`${btnBase} ${canAct ? btnActive : btnDisabled}`}
      >
        {t('stand')}
      </button>
      <button
        type="button"
        disabled={!canAct || !canDoubleDown}
        onClick={onDoubleDown}
        className={`${btnBase} ${canAct && canDoubleDown ? btnActive : btnDisabled}`}
      >
        {t('double')}
      </button>
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
  lastReject,
}: BoardProps<PlayerView, Action>) {
  const sendAction = isSending ? () => {} : rawSendAction;
  const { t } = useTranslation('blackjack');
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const myPlayer = state.players.find((p) => p.id === myId);
  const isMyTurn = state.phase === 'player_turns' && state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);

  const hasBet = (myPlayer?.bet ?? 0) > 0;
  const myHandLen = state.myHand.length;
  const canDoubleDown =
    isMyTurn && myHandLen === 2 && (myPlayer?.chips ?? 0) >= (myPlayer?.bet ?? 0);

  const rankings = gameOver
    ? [...state.players].sort((a, b) => b.chips - a.chips).map((p) => p.id)
    : null;

  const phaseLabel: Record<string, string> = {
    betting: t('bettingPhase'),
    player_turns: t('playerAction'),
    dealer_turn: t('dealerAction'),
    payout: t('settling'),
    finished: t('gameOver'),
  };

  return (
    <div
      className="flex-1 text-foreground flex flex-col p-3 sm:p-4 max-w-lg mx-auto w-full"
      data-testid="game-board"
    >
      {/* Header */}
      <div className="flex flex-wrap gap-2 justify-center mb-3">
        {players.map((p) => (
          <PlayerBadge
            key={p.id}
            player={p}
            isCurrentTurn={state.currentPlayer === p.id}
            isMe={p.id === myId}
          />
        ))}
      </div>

      {/* Phase + Round */}
      <div className="text-center text-sm text-muted-foreground mb-3">
        {t('round', { n: state.round })} · {phaseLabel[state.phase] ?? state.phase}
        {isMyTurn && ` · ${t('yourAction')}`}
      </div>

      {/* Error message */}
      {lastReject && (
        <div className="mb-3 px-3 py-2 rounded-[8px] bg-destructive/10 border-2 border-destructive text-destructive text-sm text-center">
          {lastReject}
        </div>
      )}

      {/* Dealer hand */}
      <div className="border-2 border-card/40 rounded-[12px] bg-card/85 backdrop-blur-sm text-foreground shadow-[4px_4px_0px_0px_hsl(var(--shadow))] p-4 mb-3">
        <Hand
          cards={state.dealerHand}
          label={t('dealer')}
          total={state.dealerTotal > 0 ? state.dealerTotal : undefined}
          pointsLabel={t('points')}
        />
        {state.dealerHiddenCard && state.dealerHand.length > 0 && (
          <div className="text-center text-xs text-muted-foreground mt-1">
            {t('known')} {handTotal([state.dealerHand[0]])} {t('points')}
          </div>
        )}
      </div>

      {/* My hand */}
      {state.myHand.length > 0 && (
        <div
          className={[
            'border-2 rounded-[12px] bg-card/90 backdrop-blur-sm text-foreground p-4 mb-3',
            isMyTurn
              ? 'border-warning shadow-[4px_4px_0px_0px_hsl(var(--warning))]'
              : 'border-card/40 shadow-[4px_4px_0px_0px_hsl(var(--shadow))]',
          ].join(' ')}
        >
          <Hand
            cards={state.myHand}
            label={t('myHand')}
            total={state.myTotal}
            pointsLabel={t('points')}
          />
          {state.myTotal > 21 && (
            <div className="text-center text-sm font-bold text-destructive mt-1">{t('bust')}</div>
          )}
          {state.myTotal === 21 && state.myHand.length === 2 && (
            <div className="text-center text-sm font-bold text-success mt-1">{t('blackjack')}</div>
          )}
        </div>
      )}

      {/* Action area */}
      <div className="border-2 border-card/40 rounded-[12px] bg-card/90 backdrop-blur-sm text-foreground shadow-[4px_4px_0px_0px_hsl(var(--shadow))] p-4 mb-3">
        {state.phase === 'betting' && (
          <BettingPanel
            myChips={myPlayer?.chips ?? 0}
            hasBet={hasBet}
            onBet={(amount) => sendAction({ type: 'bet', amount })}
          />
        )}
        {state.phase === 'player_turns' && isMyTurn && (
          <ActionButtons
            canAct={true}
            canDoubleDown={canDoubleDown}
            onHit={() => sendAction({ type: 'hit' })}
            onStand={() => sendAction({ type: 'stand' })}
            onDoubleDown={() => sendAction({ type: 'double_down' })}
          />
        )}
        {state.phase === 'player_turns' && !isMyTurn && (
          <div className="text-center text-sm text-muted-foreground py-2">
            {phaseLabel[state.phase]}
          </div>
        )}
        {(state.phase === 'dealer_turn' || state.phase === 'payout') && (
          <div className="text-center text-sm text-muted-foreground py-2">
            {phaseLabel[state.phase]}
          </div>
        )}
        {state.phase === 'finished' && !gameOver && (
          <div className="text-center text-sm text-muted-foreground py-2">{t('gameOver')}</div>
        )}
      </div>

      {/* Players list */}
      <div className="border-2 border-card/40 rounded-[12px] bg-card/80 backdrop-blur-sm text-foreground shadow-[4px_4px_0px_0px_hsl(var(--shadow))] p-3 mb-3">
        <div className="text-xs text-muted-foreground font-semibold mb-2">{t('playerStatus')}</div>
        <div className="flex flex-col gap-1">
          {state.players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              name={playerNames[p.id] ?? p.id}
              isMe={p.id === myId}
              isActive={state.phase === 'player_turns' && state.currentPlayer === p.id}
            />
          ))}
        </div>
      </div>

      {/* Game Over Modal */}
      {gameOver && rankings && (
        <GameOverModal rankings={rankings} playerNames={playerNames} myId={myId} />
      )}
    </div>
  );
}
