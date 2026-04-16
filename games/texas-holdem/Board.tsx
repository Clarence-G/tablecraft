import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type Action,
  type PlayerInfo,
  type PlayerView,
  SUIT_PATHS,
  displayRank,
  isRedSuit,
} from './shared';

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
  const suit = card[card.length - 1] ?? '';
  const red = isRedSuit(suit);
  const rank = displayRank(card);

  return (
    <div
      className={[
        'w-9 h-12 sm:w-10 sm:h-14 rounded-[6px] border-2 border-foreground bg-card',
        'flex flex-col items-center justify-between py-1 px-1',
        'shadow-[2px_2px_0px_0px_#3d2e1e] shrink-0',
      ].join(' ')}
    >
      <span
        className={[
          'text-xs font-bold leading-none',
          red ? 'text-[#d94040]' : 'text-foreground',
        ].join(' ')}
      >
        {rank}
      </span>
      <SuitIcon suit={suit} className={`size-3.5 ${red ? 'text-[#d94040]' : 'text-foreground'}`} />
    </div>
  );
}

function CardBack() {
  return (
    <div className="w-9 h-12 sm:w-10 sm:h-14 rounded-[6px] border-2 border-foreground bg-primary flex items-center justify-center shadow-[2px_2px_0px_0px_#1a1108] shrink-0">
      <span className="text-primary-foreground text-xs font-bold">?</span>
    </div>
  );
}

function CardPlaceholder() {
  return (
    <div className="w-9 h-12 sm:w-10 sm:h-14 rounded-[6px] border-2 border-dashed border-border flex items-center justify-center shrink-0">
      <span className="text-muted-foreground text-xs">-</span>
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
    all_in: 'text-[#d97706]',
    eliminated: 'text-[#d94040]',
  };

  return (
    <div
      className={[
        'flex items-center justify-between px-3 py-2 rounded-[8px] border-2',
        isActive ? 'border-[#d97706] bg-[#fef3e0]' : 'border-border bg-card',
        isMe ? 'border-foreground' : '',
        player.status === 'folded' || player.status === 'eliminated' ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isDealer && (
          <span className="text-xs bg-[#d97706] text-card px-1 rounded font-bold shrink-0">D</span>
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
          <span className="text-xs text-[#d97706]">
            {t('bet')}
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
          className="flex-1 border-2 border-foreground rounded-[8px] px-3 py-2 text-sm bg-card text-foreground outline-none focus:border-[#d97706]"
        />
        <span className="text-sm text-muted-foreground shrink-0">{t('chips')}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onRaise(clamped)}
          className="flex-1 py-2 rounded-[8px] border-2 border-foreground bg-primary text-primary-foreground font-semibold text-sm shadow-[2px_2px_0px_0px_#1a1108] active:translate-y-[1px] active:shadow-none"
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

  const btnBase = 'py-3 rounded-[8px] border-2 font-semibold text-sm transition-all';
  const btnActive =
    'border-foreground bg-card shadow-[2px_2px_0px_0px_#3d2e1e] active:translate-y-[1px] active:shadow-none hover:bg-[#fef3e0]';
  const btnDisabled = 'border-border bg-muted text-muted-foreground cursor-not-allowed';
  const btnDanger =
    'border-[#d94040] bg-[#fde8e8] text-[#d94040] shadow-[2px_2px_0px_0px_#d94040] active:translate-y-[1px] active:shadow-none';

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
  sendAction,
  lastReject,
  onReturnToRoom,
  onReturnToLobby,
}: BoardProps<PlayerView, Action>) {
  const { t } = useTranslation('texas-holdem');
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const isMyTurn = state.handPhase === 'betting' && state.currentPlayer === myId;
  const gameOver = state.gamePhase === 'finished';

  const highestBet = Math.max(...state.players.map((p) => p.currentBet), 0);
  const callAmount = highestBet - state.myCurrentBet;
  const canCheck = callAmount <= 0;
  const canCall = callAmount > 0 && callAmount < state.myChips;
  const minRaiseTotal = highestBet + state.minRaise;
  const canRaise = state.myChips > callAmount;

  const rankings = gameOver
    ? [...state.players].sort((a, b) => b.chips - a.chips).map((p) => p.id)
    : null;

  return (
    <div
      className="min-h-screen text-foreground flex flex-col p-3 sm:p-4 max-w-lg mx-auto"
      data-testid="game-board"
    >
      {/* Player badges */}
      <div className="flex flex-wrap gap-2 justify-center mb-2">
        {players.map((p) => (
          <PlayerBadge
            key={p.id}
            player={p}
            isCurrentTurn={state.currentPlayer === p.id}
            isMe={p.id === myId}
          />
        ))}
      </div>

      {/* Status row */}
      <div className="text-center text-sm text-muted-foreground mb-2">
        {t('hand', { n: state.handNumber })} ·{' '}
        {t(ROUND_KEYS[state.bettingRound] ?? state.bettingRound)}
        {isMyTurn && ` · ${t('yourAction')}`}
      </div>

      {/* Error message */}
      {lastReject && (
        <div className="mb-2 px-3 py-2 rounded-[8px] bg-[#fde8e8] border-2 border-[#d94040] text-[#d94040] text-sm text-center">
          {lastReject}
        </div>
      )}

      {/* Community cards + pot */}
      <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-4 mb-3">
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs text-muted-foreground font-semibold">{t('communityCards')}</div>
          <div className="flex gap-2 justify-center flex-wrap">
            {state.communityCards.map((card, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: community cards are ordered and stable for display
              <CardFace key={i} card={card} />
            ))}
            {Array.from({ length: Math.max(0, 5 - state.communityCards.length) }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholder positions are ordered and stable
              <CardPlaceholder key={i} />
            ))}
          </div>
          <div className="text-base font-bold text-foreground">
            {t('pot')} {state.pot}
          </div>
        </div>
      </div>

      {/* My hole cards */}
      {state.myHoleCards && (
        <div
          className={[
            'border-2 rounded-[12px] bg-card p-4 mb-3',
            isMyTurn
              ? 'border-[#d97706] shadow-[4px_4px_0px_0px_#d97706]'
              : 'border-foreground shadow-[4px_4px_0px_0px_#3d2e1e]',
          ].join(' ')}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs text-muted-foreground font-semibold">{t('myHand')}</div>
            <div className="flex gap-2">
              {state.myHoleCards.map((card, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: hole cards are ordered and stable
                <CardFace key={i} card={card} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Showdown result */}
      {state.showdownResult && state.handPhase !== 'betting' && (
        <div className="border-2 border-[#16a34a] rounded-[12px] bg-[#e8f8ee] shadow-[4px_4px_0px_0px_#16a34a] p-4 mb-3">
          <div className="text-xs font-semibold text-[#16a34a] mb-2">{t('showdown')}</div>
          {state.showdownResult.map((r) => (
            <div key={r.playerId} className="flex justify-between items-center text-sm py-1">
              <span className="text-foreground font-semibold">
                {playerNames[r.playerId] ?? r.playerId}
              </span>
              <span className="text-muted-foreground text-xs mx-2">{r.handName}</span>
              <span className="text-[#16a34a] font-bold">+{r.amount}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action area */}
      {isMyTurn && (
        <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-4 mb-3">
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
        </div>
      )}
      {!isMyTurn && state.handPhase === 'betting' && (
        <div className="border-2 border-border rounded-[12px] bg-card p-3 mb-3 text-center text-sm text-muted-foreground">
          {t('waiting')} {playerNames[state.currentPlayer] ?? state.currentPlayer} {t('acting')}
        </div>
      )}

      {/* Players list */}
      <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-3 mb-3">
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
          onReturnToRoom={onReturnToRoom}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );
}
