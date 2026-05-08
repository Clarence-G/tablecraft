import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useGameHeaderStatus } from '@repo/game-ui';
import { GameOverModal } from '@repo/game-ui/feedback';
import { useGameLog } from '@repo/game-ui/log';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type Action,
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

const DICE_ICON_PATHS: Record<number, string> = {
  1: '/game-icons/yahtzee/dice-six-faces-one.svg',
  2: '/game-icons/yahtzee/dice-six-faces-two.svg',
  3: '/game-icons/yahtzee/dice-six-faces-three.svg',
  4: '/game-icons/yahtzee/dice-six-faces-four.svg',
  5: '/game-icons/yahtzee/dice-six-faces-five.svg',
  6: '/game-icons/yahtzee/dice-six-faces-six.svg',
};

// ---- Paper-textured scorecard background ----
// Cream base + faint horizontal ruled lines + a red left margin, like a
// classic Yahtzee paper scoresheet. Pure CSS gradients — no assets needed.
const paperStyle: CSSProperties = {
  backgroundColor: '#fbf4df',
  backgroundImage: [
    // red left margin line
    'linear-gradient(90deg, transparent 0, transparent 18px, rgba(217, 70, 64, 0.35) 18px, rgba(217, 70, 64, 0.35) 19px, transparent 19px)',
    // horizontal ruled lines every 28px
    'repeating-linear-gradient(180deg, transparent 0, transparent 27px, rgba(120, 75, 20, 0.12) 27px, rgba(120, 75, 20, 0.12) 28px)',
    // subtle paper grain
    'radial-gradient(ellipse at top left, rgba(255,255,255,0.4), transparent 60%)',
  ].join(','),
  backgroundRepeat: 'no-repeat, repeat, no-repeat',
};

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5 px-1">
      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-foreground/70">
        {label}
      </span>
      <span className="flex-1 h-px bg-foreground/25" />
    </div>
  );
}

function SectionDivider() {
  return (
    <div className="relative my-3 flex items-center" aria-hidden="true">
      <span className="flex-1 h-[3px] border-t-2 border-b border-foreground/50 bg-foreground/5" />
    </div>
  );
}

function DieFace({
  value,
  held,
  onClick,
  t,
}: { value: number; held: boolean; onClick?: () => void; t: (key: string) => string }) {
  const isUnrolled = value === 0;

  // Trigger a spin animation whenever the die's value changes after the
  // initial render — i.e. whenever this die actually gets re-rolled. Held
  // dice keep the same value and stay still. During the spin we cycle the
  // displayed face through random values so the die visibly "tumbles"; we
  // snap to the real value the instant the blur clears.
  const SPIN_MS = 750;
  const FACE_TICK_MS = 70;
  const prevValue = useRef(value);
  const [spinKey, setSpinKey] = useState(0);
  const [displayValue, setDisplayValue] = useState(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    const isSpin = prevValue.current !== value && value > 0 && prevValue.current > 0;
    prevValue.current = value;

    if (!isSpin || reduced) {
      setDisplayValue(value);
      return;
    }

    setSpinKey((k) => k + 1);
    const interval = setInterval(() => {
      setDisplayValue(1 + Math.floor(Math.random() * 6));
    }, FACE_TICK_MS);
    const stop = setTimeout(() => {
      clearInterval(interval);
      setDisplayValue(value);
    }, SPIN_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [value, reduced]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative flex items-center justify-center',
        'w-14 h-14 rounded-[12px] border-2',
        'transition-all duration-150',
        held
          ? 'bg-[#fff6d9] shadow-[2px_2px_0px_0px_rgba(0,0,0,0.35)]'
          : 'bg-card border-foreground shadow-[4px_4px_0px_0px_hsl(var(--shadow))]',
        onClick ? 'cursor-pointer active:translate-y-[2px] active:shadow-none' : 'cursor-default',
      ].join(' ')}
      style={held ? { borderColor: 'var(--scene-accent, #d97706)' } : undefined}
      aria-label={isUnrolled ? t('notRolled') : `${t('dice')}${value}${held ? t('locked') : ''}`}
    >
      {isUnrolled ? (
        <span className="text-muted-foreground text-xs">?</span>
      ) : reduced ? (
        <svg viewBox="0 0 512 512" className="w-10 h-10" aria-hidden="true">
          <image href={DICE_ICON_PATHS[value]} width={512} height={512} />
        </svg>
      ) : (
        <motion.svg
          key={spinKey}
          viewBox="0 0 512 512"
          className="w-10 h-10"
          aria-hidden="true"
          initial={{ rotate: 0, filter: 'blur(0px)' }}
          animate={{
            rotate: [0, 1080],
            filter: ['blur(0px)', 'blur(4px)', 'blur(4px)', 'blur(0px)'],
          }}
          transition={{
            rotate: { duration: SPIN_MS / 1000, ease: [0.45, 0, 0.2, 1] },
            filter: { duration: SPIN_MS / 1000, times: [0, 0.18, 0.75, 1] },
          }}
          style={{ transformOrigin: '50% 50%', willChange: 'transform, filter' }}
        >
          <image
            href={DICE_ICON_PATHS[displayValue] ?? DICE_ICON_PATHS[value]}
            width={512}
            height={512}
          />
        </motion.svg>
      )}
      {held && (
        <span
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border-2 border-foreground flex items-center justify-center"
          style={{
            backgroundColor: 'var(--scene-accent, #d97706)',
            boxShadow: '1px 1px 0 0 rgba(0,0,0,0.5)',
          }}
          aria-hidden="true"
        >
          <span
            className="block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: 'hsl(var(--shadow))' }}
          />
        </span>
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
  t,
}: {
  category: number;
  score: number;
  potential: number | null;
  isMyTurn: boolean;
  canScore: boolean;
  onScore: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const isFilled = score >= 0;
  const showPotential = isMyTurn && canScore && !isFilled && potential !== null;

  return (
    <button
      type="button"
      disabled={!canScore || isFilled}
      onClick={onScore}
      className={[
        'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] border text-sm',
        'transition-colors duration-100',
        isFilled
          ? 'bg-transparent border-foreground/25 text-foreground cursor-default'
          : canScore
            ? 'bg-warning/10 border-warning cursor-pointer hover:bg-destructive/10 hover:border-destructive'
            : 'bg-white/30 border-foreground/15 text-muted-foreground cursor-default',
      ].join(' ')}
      aria-label={`${t(`categories.${category}`)}: ${isFilled ? score : showPotential ? `${t('preview')}${potential}` : t('unfilled')}`}
    >
      <span className="flex flex-col items-start min-w-0 flex-1">
        <span className="font-medium truncate">{t(`categories.${category}`)}</span>
        <span className="text-[11px] text-muted-foreground truncate">
          {t(`categoryHints.${category}`)}
        </span>
      </span>
      <span
        className={[
          'font-mono font-semibold min-w-[2.5rem] text-right shrink-0',
          isFilled ? 'text-foreground' : showPotential ? 'text-warning' : 'text-muted-foreground',
        ].join(' ')}
      >
        {isFilled ? score : showPotential ? potential : '--'}
      </span>
    </button>
  );
}

// ---- Opponent Scorecard (compact, tap to expand) ----

function OpponentCard({
  player,
  name,
  t,
}: {
  player: PlayerScore;
  name: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const upperSum = getUpperSectionSum(player.scores);
  const hasBonus = upperSum >= UPPER_BONUS_THRESHOLD;
  const filled = player.scores.filter((s) => s >= 0).length;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="w-full text-left border-2 border-foreground rounded-[12px] bg-card shadow-[4px_4px_0px_0px_hsl(var(--shadow))] p-3 cursor-pointer transition-transform active:translate-y-[1px] active:shadow-[2px_2px_0px_0px_hsl(var(--shadow))] hover:-translate-y-[1px] hover:shadow-[5px_5px_0px_0px_hsl(var(--shadow))]"
            aria-label={t('viewScorecard', { name })}
          />
        }
      >
        <div className="text-xs font-semibold text-foreground mb-1 truncate">{name}</div>
        <div className="text-xs text-muted-foreground">
          {t('filledCount', { n: filled })} · {t('upperSection')}
          {upperSum}
          {hasBonus && <span className="text-success ml-1">+{UPPER_BONUS_VALUE}</span>}
        </div>
        <div className="text-sm font-bold text-foreground mt-1">
          {player.totalScore} {t('points')}
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('opponentScorecard', { name })}</DialogTitle>
        </DialogHeader>
        <OpponentScorecardBody player={player} t={t} />
      </DialogContent>
    </Dialog>
  );
}

function OpponentScorecardBody({
  player,
  t,
}: {
  player: PlayerScore;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const upperSum = getUpperSectionSum(player.scores);
  const upperBonusProgress = Math.min(upperSum, UPPER_BONUS_THRESHOLD);
  const hasBonus = upperSum >= UPPER_BONUS_THRESHOLD;

  return (
    <div className="mt-2 p-3 rounded-[10px] border-2 border-foreground/40" style={paperStyle}>
      <div className="mb-2 text-xs text-muted-foreground">
        {t('upperSectionSum')} {upperSum}/{UPPER_BONUS_THRESHOLD}
        {hasBonus ? (
          <span className="text-success font-semibold ml-1">{t('bonusEarned')}</span>
        ) : (
          <span className="ml-1">
            {t('bonusHint', { threshold: UPPER_BONUS_THRESHOLD, bonus: UPPER_BONUS_VALUE })}
          </span>
        )}
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-success transition-all"
          style={{ width: `${(upperBonusProgress / UPPER_BONUS_THRESHOLD) * 100}%` }}
        />
      </div>

      <SectionHeader label={t('upperSection')} />
      <div className="space-y-1 mb-2">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: category index is stable
          <ReadOnlyScoreRow key={i} category={i} score={player.scores[i]} t={t} />
        ))}
      </div>

      <SectionDivider />

      <SectionHeader label={t('lowerSection')} />
      <div className="space-y-1">
        {Array.from({ length: 7 }, (_, i) => {
          const cat = i + 6;
          return <ReadOnlyScoreRow key={cat} category={cat} score={player.scores[cat]} t={t} />;
        })}
      </div>

      {player.yahtzeeBonus > 0 && (
        <div className="mt-2 text-xs font-semibold text-success px-1">
          {t('yahtzeeBonus', { n: player.yahtzeeBonus * 100 })}
        </div>
      )}

      <div className="mt-3 pt-2 border-t-2 border-double border-foreground/60 flex items-center justify-between">
        <span className="text-sm font-semibold">{t('totalScore')}</span>
        <span className="text-lg font-bold text-foreground">{player.totalScore}</span>
      </div>
    </div>
  );
}

function ReadOnlyScoreRow({
  category,
  score,
  t,
}: {
  category: number;
  score: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const isFilled = score >= 0;
  return (
    <div
      className={[
        'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] border text-sm',
        isFilled
          ? 'bg-transparent border-foreground/25 text-foreground'
          : 'bg-white/30 border-foreground/15 text-muted-foreground',
      ].join(' ')}
    >
      <span className="flex flex-col items-start min-w-0 flex-1">
        <span className="font-medium truncate">{t(`categories.${category}`)}</span>
        <span className="text-[11px] text-muted-foreground truncate">
          {t(`categoryHints.${category}`)}
        </span>
      </span>
      <span
        className={[
          'font-mono font-semibold min-w-[2.5rem] text-right shrink-0',
          isFilled ? 'text-foreground' : 'text-muted-foreground',
        ].join(' ')}
      >
        {isFilled ? score : '--'}
      </span>
    </div>
  );
}

// ---- Main Board ----

export function Board(props: BoardProps<PlayerView, Action>) {
  // Fail-closed guard: the server's PlayerView snapshot may not have landed
  // on the very first render. Previously `state.players.find(...)` etc. would
  // throw and trip the Sentry ErrorBoundary.
  //
  // We split the component in two so the guard can early-return BEFORE any
  // hook executes — this is the only React-legal way to conditionally skip
  // the rest of a component body without violating Rules of Hooks. All hooks
  // live in BoardInner, which only runs once state has hydrated.
  if (!props.state || !props.state.players || props.state.players.length === 0) {
    return null;
  }
  return <BoardInner {...props} />;
}

function BoardInner({
  state,
  myId,
  players,
  sendAction: rawSendAction,
  isSending,
}: BoardProps<PlayerView, Action>) {
  const sendAction = isSending ? () => {} : rawSendAction;
  const { t } = useTranslation('yahtzee');
  const { push } = useGameLog();
  const reducedMotion = useReducedMotion();
  const [showFullScorecard, setShowFullScorecard] = useState(false);

  const isMyTurn = state.currentPlayer === myId;
  const gameOver = state.phase === 'finished';
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);
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

  // ---- Game log: roll / score / win / yahtzee-bonus ----
  const prevDice = useRef<number[] | null>(null);
  const prevRollsLeft = useRef<number | null>(null);
  const prevDicePlayer = useRef<string | null>(null);
  useEffect(() => {
    const diceChanged =
      prevDice.current !== null &&
      state.dice.some((d, i) => d !== prevDice.current?.[i]) &&
      state.dice.every((d) => d >= 1);
    if (diceChanged) {
      push({
        kind: 'action',
        actorId: playerNames[state.currentPlayer] ?? state.currentPlayer,
        messageKey: 'yahtzee.log.roll',
        messageParams: {
          dice: state.dice.join(' '),
          rolls: state.rollsLeft,
        },
      });
    }
    prevDice.current = [...state.dice];
    prevRollsLeft.current = state.rollsLeft;
    prevDicePlayer.current = state.currentPlayer;
  }, [state.dice, state.rollsLeft, state.currentPlayer, playerNames, push]);

  const prevScores = useRef<Map<string, number[]> | null>(null);
  const prevYahtzeeBonus = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const scoresMap = new Map<string, number[]>();
    const bonusMap = new Map<string, number>();
    for (const p of state.players) {
      scoresMap.set(p.id, p.scores);
      bonusMap.set(p.id, p.yahtzeeBonus);
    }
    const prev = prevScores.current;
    const prevBonus = prevYahtzeeBonus.current;
    if (prev) {
      for (const p of state.players) {
        const was = prev.get(p.id);
        if (!was) continue;
        for (let i = 0; i < p.scores.length; i++) {
          if (was[i] < 0 && p.scores[i] >= 0) {
            push({
              kind: 'action',
              actorId: playerNames[p.id] ?? p.id,
              messageKey: p.scores[i] === 0 ? 'yahtzee.log.zeroScore' : 'yahtzee.log.score',
              messageParams: {
                category: t(`categories.${i}`),
                score: p.scores[i],
              },
            });
          }
        }
      }
    }
    if (prevBonus) {
      for (const p of state.players) {
        const was = prevBonus.get(p.id) ?? 0;
        if (p.yahtzeeBonus > was) {
          push({
            kind: 'system',
            actorId: playerNames[p.id] ?? p.id,
            messageKey: 'yahtzee.log.yahtzeeBonus',
          });
        }
      }
    }
    prevScores.current = scoresMap;
    prevYahtzeeBonus.current = bonusMap;
  }, [state.players, playerNames, push, t]);

  const loggedWinner = useRef<string | null>(null);
  useEffect(() => {
    if (state.winner && loggedWinner.current !== state.winner) {
      loggedWinner.current = state.winner;
      const winnerPlayer = state.players.find((p) => p.id === state.winner);
      push({
        kind: 'system',
        messageKey: 'yahtzee.log.win',
        messageParams: {
          player: playerNames[state.winner] ?? state.winner,
          total: winnerPlayer?.totalScore ?? 0,
        },
      });
    }
  }, [state.winner, state.players, playerNames, push]);

  const rankings = gameOver
    ? [...state.players].sort((a, b) => b.totalScore - a.totalScore).map((p) => p.id)
    : null;

  return (
    <div
      className="flex-1 text-foreground flex flex-col p-3 sm:p-4 max-w-3xl lg:max-w-5xl mx-auto w-full overflow-y-auto"
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

      {/* Status (round + rolls info — turn lives in header) */}
      <div className="flex justify-center mb-3">
        <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium bg-card border-2 border-foreground rounded-full px-3 py-1 shadow-[2px_2px_0px_0px_hsl(var(--shadow))] text-foreground">
          {gameOver
            ? `${t('gameOver')} ${playerNames[state.winner ?? ''] ?? state.winner} ${t('won')}`
            : isMyTurn
              ? t('roundInfoMine', {
                  round: state.roundNumber,
                  rolls: state.rollsLeft,
                })
              : t('roundInfoOther', {
                  round: state.roundNumber,
                })}
        </span>
      </div>

      {/* Opponents (compact) */}
      {opponents.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {opponents.map((opp) => (
            <div key={opp.id} className="shrink-0 w-36">
              <OpponentCard player={opp} name={playerNames[opp.id] ?? opp.id} t={t} />
            </div>
          ))}
        </div>
      )}

      {/* Dice Area */}
      {!gameOver && (
        <div
          className="border-2 rounded-[14px] p-4 mb-3"
          style={{
            backgroundColor: 'rgba(245, 237, 220, 0.96)',
            borderColor: 'hsl(var(--shadow))',
            boxShadow:
              '4px 4px 0px 0px hsl(var(--shadow)), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 6px rgba(40,25,10,0.12)',
          }}
        >
          <div className="flex justify-center gap-2 mb-4">
            {state.dice.map((d, i) => (
              <DieFace // biome-ignore lint/suspicious/noArrayIndexKey: dice positions are fixed (always 5 dice in order)
                key={i}
                value={d}
                held={state.heldDice[i]}
                onClick={canHold ? () => sendAction({ type: 'hold', diceIndex: i }) : undefined}
                t={t}
              />
            ))}
          </div>
          {canHold && (
            <div className="text-center text-xs text-muted-foreground mb-3">{t('lockHint')}</div>
          )}
          <motion.button
            type="button"
            disabled={!canRoll}
            onClick={() => sendAction({ type: 'roll' })}
            className={[
              'w-full py-3 rounded-[8px] font-semibold text-base border-2 transition-colors',
              canRoll
                ? // Amber/honey-gold CTA driven by scene accent. Contrasts
                  // against both the cream platform chrome and the walnut
                  // scene surface — avoids the "dark button on dark wood"
                  // mud reported by the vision review. Dark-brown text
                  // keeps the on-paper feel.
                  'text-[#2a1f14] border-[#2a1f14] active:translate-y-[2px]'
                : 'bg-muted text-muted-foreground border-border cursor-not-allowed',
            ].join(' ')}
            style={canRoll ? { backgroundColor: 'var(--scene-accent, #f4c744)' } : undefined}
            animate={
              canRoll && !reducedMotion
                ? {
                    boxShadow: [
                      '4px 4px 0px 0px #2a1f14, 0 0 0 0 rgba(244,199,68,0)',
                      '4px 4px 0px 0px #2a1f14, 0 0 0 4px rgba(244,199,68,0.55)',
                      '4px 4px 0px 0px #2a1f14, 0 0 0 0 rgba(244,199,68,0)',
                    ],
                  }
                : {
                    boxShadow: canRoll ? '4px 4px 0px 0px #2a1f14' : '0 0 0 0 rgba(0,0,0,0)',
                  }
            }
            transition={
              canRoll && !reducedMotion
                ? { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
                : { duration: 0.2 }
            }
          >
            {!hasRolled
              ? t('rollDice')
              : state.rollsLeft === 0
                ? t('selectCategory')
                : t('rollAgain', { n: state.rollsLeft })}
          </motion.button>
        </div>
      )}

      {/* My Scorecard */}
      {myPlayerScore && (
        <div
          className="border-2 border-foreground rounded-[12px] p-3 mb-3 shadow-[4px_4px_0px_0px_hsl(var(--shadow))] relative"
          style={paperStyle}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">{t('myScorecard')}</span>
            <button
              type="button"
              onClick={() => setShowFullScorecard((v) => !v)}
              className="text-xs text-muted-foreground underline inline-flex items-center min-h-[44px] py-2 px-3"
            >
              {showFullScorecard ? t('collapse') : t('expand')}
            </button>
          </div>

          {/* Upper section bonus progress */}
          <div className="mb-2 text-xs text-muted-foreground">
            {t('upperSectionSum')} {upperSum}/{UPPER_BONUS_THRESHOLD}
            {hasUpperBonus ? (
              <span className="text-success font-semibold ml-1">{t('bonusEarned')}</span>
            ) : (
              <span className="ml-1">
                {t('bonusHint', { threshold: UPPER_BONUS_THRESHOLD, bonus: UPPER_BONUS_VALUE })}
              </span>
            )}
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${(upperBonusProgress / UPPER_BONUS_THRESHOLD) * 100}%` }}
            />
          </div>

          {(showFullScorecard || isMyTurn) && (
            <>
              {/* Upper section */}
              <SectionHeader label={t('upperSection')} />
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
                    t={t}
                  />
                ))}
              </div>

              {/* Upper → Lower divider */}
              <SectionDivider />

              {/* Lower section */}
              <SectionHeader label={t('lowerSection')} />
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
                      t={t}
                    />
                  );
                })}
              </div>

              {/* Yahtzee bonus */}
              {myPlayerScore.yahtzeeBonus > 0 && (
                <div className="mt-2 text-xs font-semibold text-success px-1">
                  {t('yahtzeeBonus', { n: myPlayerScore.yahtzeeBonus * 100 })}
                </div>
              )}
            </>
          )}

          {/* Total */}
          <div className="mt-3 pt-2 border-t-2 border-double border-foreground/60 flex items-center justify-between">
            <span className="text-sm font-semibold">{t('totalScore')}</span>
            <span className="text-lg font-bold text-foreground">
              {calculateTotalScore(myPlayerScore.scores, myPlayerScore.yahtzeeBonus)}
            </span>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameOver && rankings && (
        <GameOverModal rankings={rankings} playerNames={playerNames} myId={myId} />
      )}
    </div>
  );
}
