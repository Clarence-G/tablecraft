import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import {
  type Action,
  CATEGORY_NAMES_ZH,
  NUM_CATEGORIES,
  type PlayerScore,
  type PlayerView,
  UPPER_BONUS_THRESHOLD,
  UPPER_BONUS_VALUE,
  calculateScore,
  calculateTotalScore,
  getUpperSectionSum,
} from './shared';

// ---- Dice Face SVG ----

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 25],
    [75, 25],
    [25, 50],
    [75, 50],
    [25, 75],
    [75, 75],
  ],
};

function DieFace({ value, held, onClick }: { value: number; held: boolean; onClick?: () => void }) {
  const dots = value >= 1 && value <= 6 ? DOT_POSITIONS[value] : [];
  const isUnrolled = value === 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative flex items-center justify-center',
        'w-14 h-14 rounded-[12px] border-2',
        'transition-all duration-150',
        held
          ? 'bg-[#fef3e0] border-[#d97706] shadow-[2px_2px_0px_0px_#d97706]'
          : 'bg-card border-foreground shadow-[4px_4px_0px_0px_#3d2e1e]',
        onClick ? 'cursor-pointer active:translate-y-[2px] active:shadow-none' : 'cursor-default',
      ].join(' ')}
      aria-label={isUnrolled ? '未投掷' : `骰子${value}${held ? '（已锁定）' : ''}`}
    >
      {isUnrolled ? (
        <span className="text-muted-foreground text-xs">?</span>
      ) : (
        <svg viewBox="0 0 100 100" className="w-10 h-10" aria-hidden="true">
          {dots.map(([cx, cy], i) => (
            <circle // biome-ignore lint/suspicious/noArrayIndexKey: dot positions are stable per die face value
              key={i}
              cx={cx}
              cy={cy}
              r={9}
              fill="currentColor"
              className="text-foreground"
            />
          ))}
        </svg>
      )}
    </button>
  );
}

// ---- Score Row ----

function ScoreRow({
  category,
  score,
  potential,
  isMyTurn,
  canScore,
  onScore,
}: {
  category: number;
  score: number;
  potential: number | null;
  isMyTurn: boolean;
  canScore: boolean;
  onScore: () => void;
}) {
  const isFilled = score >= 0;
  const showPotential = isMyTurn && canScore && !isFilled && potential !== null;

  return (
    <button
      type="button"
      disabled={!canScore || isFilled}
      onClick={onScore}
      className={[
        'w-full flex items-center justify-between px-3 py-2 rounded-[8px] border text-sm',
        'transition-colors duration-100',
        isFilled
          ? 'bg-card border-border text-foreground cursor-default'
          : canScore
            ? 'bg-[#fef3e0] border-[#d97706] cursor-pointer hover:bg-[#fde8e8] hover:border-[#d94040]'
            : 'bg-muted border-border text-muted-foreground cursor-default',
      ].join(' ')}
      aria-label={`${CATEGORY_NAMES_ZH[category]}: ${isFilled ? score : showPotential ? `预览${potential}` : '未填'}`}
    >
      <span className="font-medium">{CATEGORY_NAMES_ZH[category]}</span>
      <span
        className={[
          'font-mono font-semibold min-w-[2.5rem] text-right',
          isFilled ? 'text-foreground' : showPotential ? 'text-[#d97706]' : 'text-muted-foreground',
        ].join(' ')}
      >
        {isFilled ? score : showPotential ? potential : '--'}
      </span>
    </button>
  );
}

// ---- Opponent Scorecard (compact) ----

function OpponentCard({ player, name }: { player: PlayerScore; name: string }) {
  const upperSum = getUpperSectionSum(player.scores);
  const hasBonus = upperSum >= UPPER_BONUS_THRESHOLD;
  const filled = player.scores.filter((s) => s >= 0).length;

  return (
    <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-3">
      <div className="text-xs font-semibold text-foreground mb-1 truncate">{name}</div>
      <div className="text-xs text-muted-foreground">
        {filled}/13 已填 · 上区{upperSum}
        {hasBonus && <span className="text-[#16a34a] ml-1">+{UPPER_BONUS_VALUE}</span>}
      </div>
      <div className="text-sm font-bold text-foreground mt-1">{player.totalScore} 分</div>
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
  const [showFullScorecard, setShowFullScorecard] = useState(false);

  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));

  const myPlayerScore = state.players.find((p) => p.id === myId);
  const hasRolled = state.rollsLeft < 3;
  const canScore = isMyTurn && hasRolled && !gameOver;
  const canRoll = isMyTurn && state.rollsLeft > 0 && !gameOver;
  const canHold = isMyTurn && hasRolled && state.rollsLeft > 0 && !gameOver;

  const potentialScores = myPlayerScore
    ? Array.from({ length: NUM_CATEGORIES }, (_, i) => {
        if (myPlayerScore.scores[i] >= 0) return null;
        return calculateScore(i, state.dice);
      })
    : Array(NUM_CATEGORIES).fill(null);

  const upperSum = myPlayerScore ? getUpperSectionSum(myPlayerScore.scores) : 0;
  const upperBonusProgress = Math.min(upperSum, UPPER_BONUS_THRESHOLD);
  const hasUpperBonus = upperSum >= UPPER_BONUS_THRESHOLD;

  const opponents = state.players.filter((p) => p.id !== myId);

  const rankings = gameOver
    ? [...state.players].sort((a, b) => b.totalScore - a.totalScore).map((p) => p.id)
    : null;

  return (
    <div
      className="min-h-screen text-foreground flex flex-col p-3 sm:p-4 max-w-2xl mx-auto"
      data-testid="game-board"
    >
      {/* Header: Players */}
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

      {/* Status */}
      <div className="text-center text-sm text-muted-foreground mb-3">
        {gameOver
          ? `游戏结束！${playerNames[state.winner ?? ''] ?? state.winner} 获胜`
          : isMyTurn
            ? `你的回合 · 第 ${state.roundNumber}/13 轮 · 剩余投掷: ${state.rollsLeft}`
            : `等待 ${playerNames[state.currentPlayer] ?? state.currentPlayer} · 第 ${state.roundNumber}/13 轮`}
      </div>

      {/* Opponents (compact) */}
      {opponents.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {opponents.map((opp) => (
            <div key={opp.id} className="shrink-0 w-36">
              <OpponentCard player={opp} name={playerNames[opp.id] ?? opp.id} />
            </div>
          ))}
        </div>
      )}

      {/* Dice Area */}
      {!gameOver && (
        <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-4 mb-3">
          <div className="flex justify-center gap-2 mb-4">
            {state.dice.map((d, i) => (
              <DieFace // biome-ignore lint/suspicious/noArrayIndexKey: dice positions are fixed (always 5 dice in order)
                key={i}
                value={d}
                held={state.heldDice[i]}
                onClick={canHold ? () => sendAction({ type: 'hold', diceIndex: i }) : undefined}
              />
            ))}
          </div>
          {canHold && (
            <div className="text-center text-xs text-muted-foreground mb-3">
              点击骰子锁定/解锁（锁定的骰子不会重新投掷）
            </div>
          )}
          <button
            type="button"
            disabled={!canRoll}
            onClick={() => sendAction({ type: 'roll' })}
            className={[
              'w-full py-3 rounded-[8px] font-semibold text-base border-2 transition-all',
              canRoll
                ? 'bg-primary text-primary-foreground border-[#1a1108] shadow-[4px_4px_0px_0px_#1a1108] active:translate-y-[2px] active:shadow-none'
                : 'bg-muted text-muted-foreground border-border cursor-not-allowed',
            ].join(' ')}
          >
            {!hasRolled
              ? '投掷骰子'
              : state.rollsLeft === 0
                ? '请选择计分分类'
                : `再次投掷（剩余 ${state.rollsLeft} 次）`}
          </button>
        </div>
      )}

      {/* My Scorecard */}
      {myPlayerScore && (
        <div className="border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_#3d2e1e] p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">我的计分表</span>
            <button
              type="button"
              onClick={() => setShowFullScorecard((v) => !v)}
              className="text-xs text-muted-foreground underline"
            >
              {showFullScorecard ? '收起' : '展开'}
            </button>
          </div>

          {/* Upper section bonus progress */}
          <div className="mb-2 text-xs text-muted-foreground">
            上区合计: {upperSum}/{UPPER_BONUS_THRESHOLD}
            {hasUpperBonus ? (
              <span className="text-[#16a34a] font-semibold ml-1">
                已获得+{UPPER_BONUS_VALUE}分奖励
              </span>
            ) : (
              <span className="ml-1">
                （满{UPPER_BONUS_THRESHOLD}分额外+{UPPER_BONUS_VALUE}分）
              </span>
            )}
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#16a34a] transition-all"
              style={{ width: `${(upperBonusProgress / UPPER_BONUS_THRESHOLD) * 100}%` }}
            />
          </div>

          {(showFullScorecard || isMyTurn) && (
            <>
              {/* Upper section */}
              <div className="text-xs text-muted-foreground font-semibold mb-1 px-1">上区</div>
              <div className="space-y-1 mb-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <ScoreRow // biome-ignore lint/suspicious/noArrayIndexKey: category index is the stable identifier
                    key={i}
                    category={i}
                    score={myPlayerScore.scores[i]}
                    potential={potentialScores[i]}
                    isMyTurn={isMyTurn}
                    canScore={canScore}
                    onScore={() => sendAction({ type: 'score', category: i })}
                  />
                ))}
              </div>

              {/* Lower section */}
              <div className="text-xs text-muted-foreground font-semibold mb-1 px-1">下区</div>
              <div className="space-y-1">
                {Array.from({ length: 7 }, (_, i) => {
                  const cat = i + 6;
                  return (
                    <ScoreRow
                      key={cat}
                      category={cat}
                      score={myPlayerScore.scores[cat]}
                      potential={potentialScores[cat]}
                      isMyTurn={isMyTurn}
                      canScore={canScore}
                      onScore={() => sendAction({ type: 'score', category: cat })}
                    />
                  );
                })}
              </div>

              {/* Yahtzee bonus */}
              {myPlayerScore.yahtzeeBonus > 0 && (
                <div className="mt-2 text-xs font-semibold text-[#16a34a] px-1">
                  快艇奖励: +{myPlayerScore.yahtzeeBonus * 100} 分
                </div>
              )}
            </>
          )}

          {/* Total */}
          <div className="mt-3 pt-2 border-t border-border flex items-center justify-between">
            <span className="text-sm font-semibold">总分</span>
            <span className="text-lg font-bold text-foreground">
              {calculateTotalScore(myPlayerScore.scores, myPlayerScore.yahtzeeBonus)}
            </span>
          </div>
        </div>
      )}

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
