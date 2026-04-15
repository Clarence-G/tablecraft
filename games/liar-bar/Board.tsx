import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import type { Action, Card, PlayerView } from './shared';

// Card color backgrounds (light tints for face-up cards)
const CARD_BG: Record<Card, string> = {
  Q: 'bg-[#e8f0fe]',
  K: 'bg-[#f0e8fe]',
  A: 'bg-[#e8f8ee]',
  Joker: 'bg-[#fde8e8]',
};

const CARD_BORDER_COLOR: Record<Card, string> = {
  Q: 'border-[#2563eb]',
  K: 'border-[#7c3aed]',
  A: 'border-[#16a34a]',
  Joker: 'border-[#d94040]',
};

const CARD_TEXT_COLOR: Record<Card, string> = {
  Q: 'text-[#2563eb]',
  K: 'text-[#7c3aed]',
  A: 'text-[#16a34a]',
  Joker: 'text-[#d94040]',
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative flex flex-col items-center justify-center',
        'w-14 h-20 sm:w-16 sm:h-24 rounded-[12px] border-2',
        'transition-all select-none',
        CARD_BG[card],
        selected
          ? 'border-foreground shadow-[4px_4px_0px_0px_#3d2e1e] -translate-y-2'
          : CARD_BORDER_COLOR[card],
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1',
      ].join(' ')}
    >
      <span className={`text-lg font-bold ${CARD_TEXT_COLOR[card]}`}>
        {card === 'Joker' ? 'J' : card}
      </span>
      <span className={`text-[10px] font-medium ${CARD_TEXT_COLOR[card]}`}>
        {card === 'Joker' ? 'Joker' : card}
      </span>
    </button>
  );
}

function FaceDownCard() {
  return (
    <div className="w-8 h-11 rounded-[8px] border-2 border-foreground bg-muted flex items-center justify-center">
      <span className="text-muted-foreground text-xs font-bold">?</span>
    </div>
  );
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
              fired ? 'bg-[#d94040] border-[#d94040]' : 'bg-muted border-border',
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
  sendAction,
  onReturnToRoom,
  onReturnToLobby,
}: BoardProps<PlayerView, Action>) {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const myInfo = state.players.find((p) => p.id === myId);
  const amAlive = myInfo?.alive ?? false;
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';

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
    <div className="min-h-screen text-foreground flex flex-col p-3 sm:p-4 max-w-lg mx-auto gap-3">
      {/* Challenge Result Overlay */}
      {cr && !gameOver && (
        <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-4 text-center">
          <div className="text-sm font-bold mb-2">{cr.wasLying ? '撒谎被抓！' : '诚实无辜！'}</div>
          <div className="flex gap-1 justify-center mb-2">
            {cr.playedCards.map((card, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: played cards are ephemeral display-only list
                key={i}
                className={`px-2 py-1 rounded-[8px] border-2 text-xs font-bold ${CARD_BG[card as Card]} ${CARD_BORDER_COLOR[card as Card]} ${CARD_TEXT_COLOR[card as Card]}`}
              >
                {card}
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {playerNames[cr.shooterId] ?? cr.shooterId} 扣动扳机 (第 {cr.shotChamberIndex + 1} 格)
            {' — '}
            {cr.shotDied ? (
              <span className="text-[#d94040] font-semibold">中弹出局</span>
            ) : (
              <span className="text-[#16a34a] font-semibold">幸运存活</span>
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
                {!info?.alive && <span className="text-[#d94040] font-semibold">出局</span>}
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

      {/* Game Info */}
      <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-3 text-center">
        <div className="text-xs text-muted-foreground mb-1">本轮宣告牌型</div>
        <div className={`text-2xl font-bold ${CARD_TEXT_COLOR[state.declaredSuit as Card]}`}>
          {state.declaredSuit}
        </div>
      </div>

      {/* Status */}
      <div className="text-center text-sm text-muted-foreground">
        {gameOver
          ? `${playerNames[state.winner ?? ''] ?? state.winner} 获胜！`
          : state.phase === 'challenging' && state.lastPlay
            ? `${playerNames[state.lastPlay.playerId] ?? state.lastPlay.playerId} 打出了 ${state.lastPlay.count} 张牌，等待 ${playerNames[deciderId ?? ''] ?? deciderId} 决定...`
            : !amAlive
              ? '你已出局，观战中...'
              : isMyTurn
                ? '你的回合 — 选择 1~3 张牌打出'
                : `等待 ${playerNames[state.currentPlayer] ?? state.currentPlayer}...`}
      </div>

      {/* Last Play Info */}
      {state.phase === 'challenging' && state.lastPlay && (
        <div className="text-center text-xs text-muted-foreground bg-secondary rounded-[8px] py-2 px-3">
          {playerNames[state.lastPlay.playerId] ?? state.lastPlay.playerId} 声称打出了{' '}
          <span className="font-semibold">{state.lastPlay.count}</span> 张{' '}
          <span className={`font-bold ${CARD_TEXT_COLOR[state.declaredSuit as Card]}`}>
            {state.declaredSuit}
          </span>
        </div>
      )}

      {/* My Hand */}
      {amAlive && !gameOver && state.phase === 'playing' && isMyTurn && (
        <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            你的手牌（选 1~3 张）
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
              className="w-full py-2.5 rounded-[12px] font-semibold text-sm bg-primary text-primary-foreground border-2 border-[#1a1108] shadow-[4px_4px_0px_0px_#1a1108] transition-all hover:-translate-y-0.5 active:translate-y-px"
            >
              打出 {selectedIndices.length} 张牌（声称为 {state.declaredSuit}）
            </button>
          )}
          {selectedIndices.length === 0 && (
            <div className="text-xs text-muted-foreground text-center">点击选牌，然后打出</div>
          )}
        </div>
      )}

      {/* Hand (view only, not my turn) */}
      {amAlive && !gameOver && state.phase === 'playing' && !isMyTurn && (
        <div className="border-2 border-border rounded-[12px] bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">你的手牌</div>
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
          <div className="text-xs font-medium text-muted-foreground mb-2">你的手牌</div>
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
            className="flex-1 py-3 rounded-[12px] font-bold text-sm border-2 border-[#d94040] bg-[#fde8e8] text-[#d94040] shadow-[4px_4px_0px_0px_#d94040] transition-all hover:-translate-y-0.5 active:translate-y-px"
          >
            质疑！骗子！
          </button>
          <button
            type="button"
            onClick={handleBelieve}
            className="flex-1 py-3 rounded-[12px] font-bold text-sm border-2 border-[#16a34a] bg-[#e8f8ee] text-[#16a34a] shadow-[4px_4px_0px_0px_#16a34a] transition-all hover:-translate-y-0.5 active:translate-y-px"
          >
            相信，继续
          </button>
        </div>
      )}

      {/* Spectator / eliminated view */}
      {!amAlive && !gameOver && (
        <div className="text-center text-sm text-muted-foreground border-2 border-border rounded-[12px] bg-card p-4">
          你已出局，正在观战
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
          onReturnToRoom={onReturnToRoom}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );
}
