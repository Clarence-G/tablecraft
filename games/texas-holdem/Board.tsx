import {
  type CardRank,
  type CardSuit,
  PlayingCard,
  CardBack as SharedCardBack,
} from '@repo/card-ui';
import { useGameHeaderStatus } from '@repo/game-ui';
import { GameOverModal } from '@repo/game-ui/feedback';
import type { BoardProps } from '@repo/shared';
import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Action, POKER_CHIP_COLORS, type PlayerInfo, type PlayerView } from './shared';

// ---- Card Component ----

const SUIT_MAP: Record<string, CardSuit> = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
};

function CardFace({ card }: { card: string }) {
  const rankPart = card.length === 3 ? card.slice(0, 2) : (card[0] ?? '');
  const suitPart = card[card.length - 1] ?? '';
  const suit = SUIT_MAP[suitPart];
  const rank = (rankPart === 'T' ? '10' : rankPart) as CardRank;
  if (!suit) return <SharedCardBack size="md" />;
  return <PlayingCard size="md" suit={suit} rank={rank} />;
}

function CardBack() {
  return <SharedCardBack size="md" />;
}

function CardPlaceholder({ label }: { label?: string }) {
  return (
    <div
      className="w-14 h-20 rounded-[10px] border shrink-0 flex items-end justify-center pb-1.5"
      style={{
        borderColor: 'rgba(244, 217, 168, 0.22)',
        background: 'rgba(0, 0, 0, 0.16)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
      }}
    >
      {label && (
        <span
          className="text-[10px] tracking-widest uppercase opacity-60"
          style={{ color: 'rgba(244, 217, 168, 0.75)' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

// ---- Player Seat ----

function PlayerSeat({
  player,
  name,
  isMe,
  isActive,
  isDealer,
  t,
}: {
  player: PlayerInfo;
  name: string;
  isMe: boolean;
  isActive: boolean;
  isDealer: boolean;
  t: (key: string) => string;
}) {
  const statusLabel: Record<string, string> = {
    active: '',
    folded: t('fold'),
    all_in: t('allIn'),
    eliminated: t('eliminated'),
  };
  const statusColor: Record<string, string> = {
    folded: 'text-muted-foreground',
    all_in: 'text-warning',
    eliminated: 'text-destructive',
  };

  return (
    <div
      className={[
        'flex items-center justify-between px-3 py-2 rounded-[8px] border-2 transition-colors',
        isActive
          ? 'border-[var(--scene-accent)] bg-card shadow-[0_0_0_3px_rgba(212,160,86,0.25)]'
          : 'border-border bg-card',
        isMe && !isActive ? 'border-foreground' : '',
        player.status === 'folded' || player.status === 'eliminated' ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isDealer && (
          <span
            className={`text-[10px] w-5 h-5 inline-flex items-center justify-center rounded-full ${POKER_CHIP_COLORS.surface.bgClass} ${POKER_CHIP_COLORS.surface.textClass} border ${POKER_CHIP_COLORS.gold.borderClass} font-bold shrink-0`}
            style={{ boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.25)' }}
          >
            D
          </span>
        )}
        <span className="text-sm font-semibold truncate text-foreground">{name}</span>
        {isMe && <span className="text-xs text-muted-foreground shrink-0">({t('me')})</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {player.status !== 'active' && player.status !== 'eliminated' && (
          <span className={`text-xs font-bold ${statusColor[player.status] ?? ''}`}>
            {statusLabel[player.status]}
          </span>
        )}
        {player.currentBet > 0 && (
          <span
            className={`text-xs font-semibold ${POKER_CHIP_COLORS.gold.textClass} inline-flex items-center gap-1`}
          >
            <span
              aria-hidden
              className={`inline-block w-2 h-2 rounded-full bg-[var(--scene-accent,#d4a056)] ring-1 ${POKER_CHIP_COLORS.gold.ringClass}`}
            />
            {player.currentBet}
          </span>
        )}
        <span className="text-sm font-mono text-foreground">{player.chips}</span>
        <div className="flex gap-0.5">
          {player.holeCards
            ? player.holeCards.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: card positions in hole are ordered and stable
                <CardFace key={i} card={c} />
              ))
            : player.cardCount > 0
              ? Array.from({ length: player.cardCount }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: card positions are ordered and stable
                  <CardBack key={i} />
                ))
              : null}
        </div>
      </div>
    </div>
  );
}

// ---- Raise Panel ----

function RaisePanel({
  minRaise,
  maxRaise,
  bigBlind,
  onRaise,
  onCancel,
  t,
}: {
  minRaise: number;
  maxRaise: number;
  bigBlind: number;
  onRaise: (amount: number) => void;
  onCancel: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [amount, setAmount] = useState(minRaise);

  const clamped = Math.max(minRaise, Math.min(maxRaise, amount));

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-semibold text-foreground">{t('raiseTotal')}</div>
      <input
        type="range"
        min={minRaise}
        max={maxRaise}
        step={bigBlind}
        value={clamped}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={minRaise}
          max={maxRaise}
          value={clamped}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="flex-1 border-2 border-foreground rounded-[8px] px-3 py-2 text-sm bg-card text-foreground outline-none focus:border-warning"
        />
        <span className="text-sm text-muted-foreground shrink-0">{t('chips')}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onRaise(clamped)}
          className="flex-1 py-2 rounded-[8px] border-2 border-foreground bg-primary text-primary-foreground font-semibold text-sm shadow-[2px_2px_0px_0px_hsl(var(--shadow))] active:translate-y-[1px] active:shadow-none"
        >
          {t('raiseAmount', { amount: clamped })}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-[8px] border-2 border-border bg-card text-foreground font-semibold text-sm"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

// ---- Action Buttons ----

function ActionPanel({
  canCheck,
  canCall,
  callAmount,
  canRaise,
  minRaise,
  maxRaise,
  bigBlind,
  myChips,
  onFold,
  onCheck,
  onCall,
  onRaise,
  onAllIn,
  t,
}: {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaise: number;
  maxRaise: number;
  bigBlind: number;
  myChips: number;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: (amount: number) => void;
  onAllIn: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [showRaise, setShowRaise] = useState(false);

  const btnBase = 'py-3 px-2 rounded-[8px] border-2 font-semibold text-sm transition-all';
  const btnActive =
    'border-foreground bg-card shadow-[2px_2px_0px_0px_hsl(var(--foreground))] active:translate-y-[1px] active:shadow-none hover:bg-warning/10';
  const btnDisabled = 'border-border bg-muted text-muted-foreground cursor-not-allowed';
  const btnDanger =
    'border-destructive bg-destructive/10 text-destructive shadow-[2px_2px_0px_0px_hsl(var(--destructive))] active:translate-y-[1px] active:shadow-none';

  if (showRaise) {
    return (
      <RaisePanel
        minRaise={minRaise}
        maxRaise={maxRaise}
        bigBlind={bigBlind}
        onRaise={(amt) => {
          setShowRaise(false);
          onRaise(amt);
        }}
        onCancel={() => setShowRaise(false)}
        t={t}
      />
    );
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <button type="button" onClick={onFold} className={`${btnBase} flex-1 ${btnDanger}`}>
        {t('fold')}
      </button>
      {canCheck && (
        <button type="button" onClick={onCheck} className={`${btnBase} flex-1 ${btnActive}`}>
          {t('check')}
        </button>
      )}
      {canCall && (
        <button type="button" onClick={onCall} className={`${btnBase} flex-1 ${btnActive}`}>
          {t('callAmount', { amount: callAmount })}
        </button>
      )}
      {canRaise && (
        <button
          type="button"
          onClick={() => setShowRaise(true)}
          className={`${btnBase} flex-1 ${btnActive}`}
        >
          {t('raise')}
        </button>
      )}
      <button
        type="button"
        onClick={onAllIn}
        disabled={myChips <= 0}
        className={`${btnBase} flex-1 ${myChips > 0 ? btnActive : btnDisabled}`}
      >
        {t('allIn')}
      </button>
    </div>
  );
}

// ---- Round Label ----

const ROUND_KEYS: Record<string, string> = {
  preflop: 'preflop',
  flop: 'flop',
  turn: 'turn',
  river: 'river',
};

// ---- Main Board ----

export function Board({
  state,
  myId,
  players,
  sendAction: rawSendAction,
  isSending,
  lastReject,
  pointsDelta,
  ties,
  onReturnToRoom,
  canReturnToRoom,
  onReturnToLobby,
}: BoardProps<PlayerView, Action>) {
  const sendAction = isSending ? () => {} : rawSendAction;
  const { t } = useTranslation('texas-holdem');
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const isMyTurn = state.handPhase === 'betting' && state.currentPlayer === myId;
  const gameOver = state.gamePhase === 'finished';
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);

  const highestBet = Math.max(...state.players.map((p) => p.currentBet), 0);
  const callAmount = highestBet - state.myCurrentBet;
  const canCheck = callAmount <= 0;
  const canCall = callAmount > 0 && callAmount < state.myChips;
  const minRaiseTotal = highestBet + state.minRaise;
  const canRaise = state.myChips > callAmount;

  const rankings = gameOver
    ? [...state.players].sort((a, b) => b.chips - a.chips).map((p) => p.id)
    : null;

  const reduced = useReducedMotion();
  const turnPulse =
    isMyTurn && !reduced
      ? {
          boxShadow: [
            '0 0 0 0 rgba(212,160,86,0)',
            '0 0 0 6px rgba(212,160,86,0.35)',
            '0 0 0 0 rgba(212,160,86,0)',
          ],
        }
      : { boxShadow: '0 0 0 0 rgba(212,160,86,0)' };

  return (
    <div
      className="flex-1 text-card flex flex-col p-3 sm:p-4 max-w-3xl lg:max-w-5xl mx-auto w-full gap-3"
      data-testid="game-board"
    >
      {/* Status row */}
      <div
        className="text-center text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'rgba(244, 217, 168, 0.85)' }}
      >
        {t('hand', { n: state.handNumber })} ·{' '}
        {t(ROUND_KEYS[state.bettingRound] ?? state.bettingRound)}
      </div>

      {/* Error message */}
      {lastReject && (
        <div className="px-3 py-2 rounded-[8px] bg-destructive/10 border-2 border-destructive text-destructive text-sm text-center">
          {lastReject}
        </div>
      )}

      {/* Community cards + pot — floating on felt */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-semibold uppercase tracking-wider"
          style={{
            borderColor: 'rgba(244, 217, 168, 0.35)',
            background: 'rgba(0, 0, 0, 0.22)',
            color: 'rgba(244, 217, 168, 0.9)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{
              background: 'var(--scene-accent, #d4a056)',
              boxShadow: `inset 0 -1px 0 rgba(0,0,0,0.3), 0 0 0 1px ${POKER_CHIP_COLORS.gold.hex}`,
            }}
          />
          {t('pot')}
          <span
            className="text-base font-bold ml-0.5"
            style={{ color: 'var(--scene-accent, #d4a056)' }}
          >
            {state.pot}
          </span>
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          {state.communityCards.map((card, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: community cards are ordered and stable for display
            <CardFace key={i} card={card} />
          ))}
          {Array.from({ length: Math.max(0, 5 - state.communityCards.length) }).map((_, i) => {
            const slotIdx = state.communityCards.length + i;
            const labelKey = ['flop1', 'flop2', 'flop3', 'turn', 'river'][slotIdx];
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholder positions are ordered and stable
              <CardPlaceholder key={i} label={labelKey ? t(labelKey) : undefined} />
            );
          })}
        </div>

        {/* My hole cards */}
        {state.myHoleCards && (
          <div className="flex flex-col items-center gap-1">
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'rgba(244, 217, 168, 0.75)' }}
            >
              {t('myHand')}
            </div>
            <div className="flex gap-2">
              {state.myHoleCards.map((card, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: hole cards are ordered and stable
                <CardFace key={i} card={card} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Showdown result */}
      {state.showdownResult && state.handPhase !== 'betting' && (
        <div className="border-2 border-success rounded-[12px] bg-success/10 shadow-[4px_4px_0px_0px_hsl(var(--success))] p-4 mb-3">
          <div className="text-xs font-semibold text-success mb-2">{t('showdown')}</div>
          {state.showdownResult.map((r) => (
            <div key={r.playerId} className="flex justify-between items-center text-sm py-1">
              <span className="text-foreground font-semibold">
                {playerNames[r.playerId] ?? r.playerId}
              </span>
              <span className="text-muted-foreground text-xs mx-2">{r.handName}</span>
              <span className="text-success font-bold">+{r.amount}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action area */}
      {isMyTurn && (
        <motion.div
          className="border-2 border-foreground rounded-[12px] bg-card text-foreground shadow-[4px_4px_0px_0px_hsl(var(--shadow))] p-4 mb-3"
          animate={turnPulse}
          transition={
            isMyTurn && !reduced
              ? { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
              : { duration: 0.2 }
          }
        >
          <ActionPanel
            canCheck={canCheck}
            canCall={canCall}
            callAmount={callAmount}
            canRaise={canRaise}
            minRaise={minRaiseTotal}
            maxRaise={highestBet + state.myChips}
            bigBlind={state.bigBlind}
            myChips={state.myChips}
            onFold={() => sendAction({ type: 'fold' })}
            onCheck={() => sendAction({ type: 'check' })}
            onCall={() => sendAction({ type: 'call' })}
            onRaise={(amount) => sendAction({ type: 'raise', amount })}
            onAllIn={() => sendAction({ type: 'all_in' })}
            t={t}
          />
        </motion.div>
      )}
      {!isMyTurn && state.handPhase === 'betting' && (
        <div
          className="rounded-[12px] p-3 mb-3 text-center text-sm border"
          style={{
            borderColor: 'rgba(244, 217, 168, 0.3)',
            background: 'rgba(0, 0, 0, 0.18)',
            color: 'rgba(244, 217, 168, 0.85)',
          }}
        >
          {t(ROUND_KEYS[state.bettingRound] ?? state.bettingRound)}
        </div>
      )}

      {/* Players list */}
      <div className="border-2 border-foreground rounded-[12px] bg-card text-foreground shadow-[4px_4px_0px_0px_hsl(var(--shadow))] p-3 mb-3">
        <div className="text-xs text-muted-foreground font-semibold mb-2">{t('playerStatus')}</div>
        <div className="flex flex-col gap-1">
          {state.players.map((p, i) => (
            <PlayerSeat
              key={p.id}
              player={p}
              name={playerNames[p.id] ?? p.id}
              isMe={p.id === myId}
              isActive={state.handPhase === 'betting' && state.currentPlayer === p.id}
              isDealer={i === state.dealerIdx}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* Game Over Modal */}
      {gameOver && rankings && (
        <GameOverModal
          rankings={rankings}
          playerNames={playerNames}
          myId={myId}
          pointsDelta={pointsDelta}
          ties={ties}
          onReturnToRoom={onReturnToRoom}
          canReturnToRoom={canReturnToRoom}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );
}
