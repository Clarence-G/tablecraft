import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import { type Action, type PlayerInfo, type PlayerView, handTotal } from './shared';

// ---- Card Component ----

function CardFace({ card }: { card: string }) {
  const isHidden = card === 'hidden';
  if (isHidden) {
    return (
      <div className="w-10 h-14 rounded-[6px] border-2 border-foreground bg-primary flex items-center justify-center shadow-[2px_2px_0px_0px_#1a1108]">
        <span className="text-primary-foreground text-xs font-bold">?</span>
      </div>
    );
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const isRed = suit === 'h' || suit === 'd';

  const suitSymbol: Record<string, string> = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' };
  const displayRank = rank === 'T' ? '10' : rank;
  const displaySuit = suitSymbol[suit] ?? suit;

  return (
    <div
      className={[
        'w-10 h-14 rounded-[6px] border-2 border-foreground bg-card',
        'flex flex-col items-center justify-between py-1 px-1',
        'shadow-[2px_2px_0px_0px_#3d2e1e]',
      ].join(' ')}
    >
      <span
        className={[
          'text-xs font-bold leading-none',
          isRed ? 'text-[#d94040]' : 'text-foreground',
        ].join(' ')}
      >
        {displayRank}
      </span>
      <span
        className={[
          'text-base leading-none',
          isRed ? 'text-[#d94040]' : 'text-foreground',
        ].join(' ')}
      >
        {displaySuit}
      </span>
    </div>
  );
}

function Hand({ cards, label, total }: { cards: string[]; label: string; total?: number }) {
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
        <span className="text-sm font-semibold text-foreground">{total} 点</span>
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
  const outcomeLabel: Record<string, string> = {
    pending: '',
    win: '赢',
    lose: '输',
    push: '平',
    blackjack: '21点!',
    bust: '爆牌',
  };

  const outcomeColor: Record<string, string> = {
    win: 'text-[#16a34a]',
    blackjack: 'text-[#16a34a]',
    lose: 'text-[#d94040]',
    bust: 'text-[#d94040]',
    push: 'text-[#d97706]',
    pending: 'text-muted-foreground',
  };

  return (
    <div
      className={[
        'flex items-center justify-between px-3 py-2 rounded-[8px] border-2',
        isActive
          ? 'border-[#d97706] bg-[#fef3e0]'
          : 'border-border bg-card',
        isMe ? 'border-foreground' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold truncate text-foreground">{name}</span>
        {isMe && (
          <span className="text-xs text-muted-foreground shrink-0">（我）</span>
        )}
        {player.bet > 0 && (
          <span className="text-xs text-[#d97706] shrink-0">下注 {player.bet}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {player.cardCount > 0 && (
          <span className="text-xs text-muted-foreground">{player.cardCount}张</span>
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

  if (hasBet) {
    return (
      <div className="text-center text-sm text-muted-foreground py-4">
        已下注，等待其他玩家...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-semibold text-foreground text-center">选择下注金额</div>
      <div className="flex flex-wrap gap-2 justify-center">
        {BET_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={amount > myChips}
            onClick={() => onBet(amount)}
            className={[
              'px-4 py-2 rounded-[8px] border-2 font-semibold text-sm transition-all',
              amount <= myChips
                ? 'border-foreground bg-card shadow-[2px_2px_0px_0px_#3d2e1e] active:translate-y-[1px] active:shadow-none hover:bg-[#fef3e0]'
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
          placeholder="自定义金额"
          className="flex-1 border-2 border-foreground rounded-[8px] px-3 py-2 text-sm bg-card text-foreground outline-none focus:border-[#d97706]"
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
              ? 'border-foreground bg-primary text-primary-foreground shadow-[2px_2px_0px_0px_#1a1108] active:translate-y-[1px] active:shadow-none'
              : 'border-border bg-muted text-muted-foreground cursor-not-allowed',
          ].join(' ')}
        >
          下注
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
  const btnBase =
    'flex-1 py-3 rounded-[8px] border-2 font-semibold text-sm transition-all';
  const btnActive =
    'border-foreground bg-card shadow-[2px_2px_0px_0px_#3d2e1e] active:translate-y-[1px] active:shadow-none hover:bg-[#fef3e0]';
  const btnDisabled = 'border-border bg-muted text-muted-foreground cursor-not-allowed';

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!canAct}
        onClick={onHit}
        className={`${btnBase} ${canAct ? btnActive : btnDisabled}`}
      >
        要牌
      </button>
      <button
        type="button"
        disabled={!canAct}
        onClick={onStand}
        className={`${btnBase} ${canAct ? btnActive : btnDisabled}`}
      >
        停牌
      </button>
      <button
        type="button"
        disabled={!canAct || !canDoubleDown}
        onClick={onDoubleDown}
        className={`${btnBase} ${canAct && canDoubleDown ? btnActive : btnDisabled}`}
      >
        加倍
      </button>
    </div>
  );
}

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
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const myPlayer = state.players.find((p) => p.id === myId);
  const isMyTurn = state.phase === 'player_turns' && state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';

  const hasBet = (myPlayer?.bet ?? 0) > 0;
  const myHandLen = state.myHand.length;
  const canDoubleDown = isMyTurn && myHandLen === 2 && (myPlayer?.chips ?? 0) >= (myPlayer?.bet ?? 0);

  const rankings = gameOver
    ? [...state.players].sort((a, b) => b.chips - a.chips).map((p) => p.id)
    : null;

  const phaseLabel: Record<string, string> = {
    betting: '下注阶段',
    player_turns: '玩家行动',
    dealer_turn: '庄家行动中...',
    payout: '结算中...',
    finished: '游戏结束',
  };

  return (
    <div
      className="min-h-screen text-foreground flex flex-col p-3 sm:p-4 max-w-lg mx-auto"
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
        第 {state.round} 轮 · {phaseLabel[state.phase] ?? state.phase}
        {isMyTurn && ' · 轮到你行动'}
      </div>

      {/* Error message */}
      {lastReject && (
        <div className="mb-3 px-3 py-2 rounded-[8px] bg-[#fde8e8] border-2 border-[#d94040] text-[#d94040] text-sm text-center">
          {lastReject}
        </div>
      )}

      {/* Dealer hand */}
      <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-4 mb-3">
        <Hand
          cards={state.dealerHand}
          label="庄家"
          total={state.dealerTotal > 0 ? state.dealerTotal : undefined}
        />
        {state.dealerHiddenCard && state.dealerHand.length > 0 && (
          <div className="text-center text-xs text-muted-foreground mt-1">
            已知 {handTotal([state.dealerHand[0]])} 点
          </div>
        )}
      </div>

      {/* My hand */}
      {state.myHand.length > 0 && (
        <div
          className={[
            'border-2 rounded-[12px] bg-card p-4 mb-3',
            isMyTurn
              ? 'border-[#d97706] shadow-[4px_4px_0px_0px_#d97706]'
              : 'border-foreground shadow-[4px_4px_0px_0px_#3d2e1e]',
          ].join(' ')}
        >
          <Hand
            cards={state.myHand}
            label="我的手牌"
            total={state.myTotal}
          />
          {state.myTotal > 21 && (
            <div className="text-center text-sm font-bold text-[#d94040] mt-1">爆牌！</div>
          )}
          {state.myTotal === 21 && state.myHand.length === 2 && (
            <div className="text-center text-sm font-bold text-[#16a34a] mt-1">21点！</div>
          )}
        </div>
      )}

      {/* Action area */}
      <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-4 mb-3">
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
            等待 {playerNames[state.currentPlayer] ?? state.currentPlayer} 行动...
          </div>
        )}
        {(state.phase === 'dealer_turn' || state.phase === 'payout') && (
          <div className="text-center text-sm text-muted-foreground py-2">
            {phaseLabel[state.phase]}
          </div>
        )}
        {state.phase === 'finished' && !gameOver && (
          <div className="text-center text-sm text-muted-foreground py-2">游戏结束</div>
        )}
      </div>

      {/* Players list */}
      <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-3 mb-3">
        <div className="text-xs text-muted-foreground font-semibold mb-2">玩家状态</div>
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
