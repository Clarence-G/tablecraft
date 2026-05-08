import { useGameHeaderStatus } from '@repo/game-ui';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action, CardType, PlayerView, Team } from './shared';

// ---- Cell tile color classes ----

function cellColorClass(color: CardType | null, revealed: boolean, isSpymaster: boolean): string {
  if (revealed) {
    if (color === 'red') return 'bg-red-600 text-white border-red-700';
    if (color === 'blue') return 'bg-blue-600 text-white border-blue-700';
    if (color === 'bystander') return 'bg-amber-200 text-amber-900 border-amber-300';
    if (color === 'assassin') return 'bg-gray-900 text-white border-gray-800';
  }
  if (isSpymaster && color) {
    if (color === 'red') return 'bg-red-100 text-red-900 border-red-400 ring-1 ring-red-400';
    if (color === 'blue') return 'bg-blue-100 text-blue-900 border-blue-400 ring-1 ring-blue-400';
    if (color === 'bystander') return 'bg-amber-50 text-amber-700 border-amber-300';
    if (color === 'assassin')
      return 'bg-gray-200 text-gray-900 border-gray-500 ring-1 ring-gray-600';
  }
  return 'bg-card text-foreground border-border hover:bg-muted/60';
}

// ---- Team label colors ----

function teamBadgeClass(team: Team): string {
  return team === 'red'
    ? 'bg-red-100 text-red-800 border border-red-300'
    : 'bg-blue-100 text-blue-800 border border-blue-300';
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
  const { t } = useTranslation('codenames');
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState<string>('1');

  const gameOver = state.phase === 'over';
  const isSetup = state.phase === 'setup';
  const isMyTeam = state.activeTeam === state.myTeam;
  const isSpymaster = state.myRole === 'spymaster';
  const isOperative = state.myRole === 'operative';

  useGameHeaderStatus(gameOver ? undefined : (state.activeTeam ?? undefined), state.phase);

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));

  // ---- Setup Phase UI ----
  if (isSetup) {
    return (
      <div className="flex-1 flex flex-col p-3 gap-3 max-w-2xl mx-auto w-full text-foreground">
        <div className="text-center text-sm text-muted-foreground">{t('setup.instruction')}</div>

        <div className="grid grid-cols-2 gap-3">
          {(['red', 'blue'] as Team[]).map((team) => (
            <div
              key={team}
              className={`rounded-xl p-3 border ${team === 'red' ? 'border-red-300 bg-red-50' : 'border-blue-300 bg-blue-50'}`}
            >
              <div
                className={`font-bold text-sm mb-2 ${team === 'red' ? 'text-red-700' : 'text-blue-700'}`}
              >
                {t(`team.${team}`)}
              </div>
              {(['spymaster', 'operative'] as const).map((role) => {
                const occupant = state.playersInfo.find((p) => p.team === team && p.role === role);
                const isMe = occupant?.id === myId;
                const isMine = state.myTeam === team && state.myRole === role;
                return (
                  <div key={role} className="mb-1.5">
                    <div className="text-xs text-muted-foreground mb-1">{t(`role.${role}`)}</div>
                    {occupant ? (
                      <div
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${isMine ? 'bg-primary/20 font-semibold' : 'bg-white/60'}`}
                      >
                        <span>{playerNames[occupant.id] ?? occupant.id}</span>
                        {isMe && <span className="text-muted-foreground">({t('setup.you')})</span>}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!!isSending}
                        onClick={() => sendAction({ type: 'joinTeam', team, role })}
                        className="w-full text-xs px-2 py-1.5 rounded-lg border border-dashed border-muted-foreground/40 text-muted-foreground hover:bg-white/60 hover:border-muted-foreground transition-all"
                      >
                        + {t('setup.join')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Players not yet assigned */}
        {state.playersInfo.filter((p) => !p.team).length > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            {t('setup.unassigned')}:{' '}
            {state.playersInfo
              .filter((p) => !p.team)
              .map((p) => playerNames[p.id] ?? p.id)
              .join(', ')}
          </div>
        )}

        {/* Commit button */}
        <button
          type="button"
          disabled={!!isSending}
          onClick={() => sendAction({ type: 'commitTeams' })}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/80 transition-all disabled:opacity-50"
        >
          {t('setup.start')}
        </button>

        {lastReject && <div className="text-xs text-destructive text-center">{lastReject}</div>}
      </div>
    );
  }

  // ---- Playing Phase UI ----
  const board = state.board ?? [];

  const canGiveClue = state.phase === 'clue' && isMyTeam && isSpymaster;
  const canGuess = state.phase === 'guess' && isMyTeam && isOperative;
  const canEndGuessing =
    state.phase === 'guess' &&
    isMyTeam &&
    isOperative &&
    (state.guessesUsed >= 1 || state.currentClue?.count === 0);

  function handleGiveClue() {
    if (!clueWord.trim()) return;
    const countVal = clueCount === 'unlimited' ? 'unlimited' : Number.parseInt(clueCount, 10);
    sendAction({
      type: 'giveClue',
      word: clueWord.trim(),
      count: countVal as number | 'unlimited',
    });
    setClueWord('');
  }

  return (
    <div className="flex-1 flex flex-col p-2 sm:p-3 gap-2 max-w-2xl mx-auto w-full text-foreground">
      {/* Score and turn status */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 items-center">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${teamBadgeClass('red')}`}
          >
            {t('team.red')} {state.redRemaining}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${teamBadgeClass('blue')}`}
          >
            {t('team.blue')} {state.blueRemaining}
          </span>
        </div>
        {state.phase !== 'over' && state.activeTeam && (
          <div
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${teamBadgeClass(state.activeTeam)}`}
          >
            {t(`team.${state.activeTeam}`)} {t('turn')}
          </div>
        )}
      </div>

      {/* Current clue */}
      {state.currentClue && (
        <div className="bg-card/70 rounded-xl border border-border px-3 py-2 text-center">
          <span className="font-bold text-lg">{state.currentClue.word}</span>
          <span className="text-muted-foreground ml-2 text-sm">
            × {state.currentClue.count === 'unlimited' ? '∞' : state.currentClue.count}
          </span>
          {state.phase === 'guess' && (
            <span className="text-xs text-muted-foreground ml-2">
              ({state.guessesUsed}/{state.maxGuesses === 'unlimited' ? '∞' : state.maxGuesses})
            </span>
          )}
        </div>
      )}

      {/* Game board — 5×5 grid */}
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
        {board.map((cell, i) => {
          const isRevealed = cell.revealed;
          const colorClass = cellColorClass(cell.color, isRevealed, isSpymaster);
          const isClickable = canGuess && !isRevealed;
          return (
            <button
              key={i}
              type="button"
              disabled={!isClickable || !!isSending}
              onClick={() => isClickable && sendAction({ type: 'guess', cellIndex: i })}
              className={`
                relative rounded-lg border-2 px-0.5 py-1.5 sm:py-2 min-h-[44px] text-center
                text-[10px] sm:text-xs font-medium transition-all
                ${colorClass}
                ${isClickable ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}
                ${isRevealed ? 'opacity-70' : ''}
              `}
            >
              <span className="leading-tight break-all hyphens-auto">{cell.word}</span>
            </button>
          );
        })}
      </div>

      {/* Status bar */}
      {!gameOver && (
        <div className="text-xs text-center text-muted-foreground">
          {state.phase === 'clue' && isMyTeam && isSpymaster && t('hint.giveClue')}
          {state.phase === 'clue' &&
            (!isMyTeam || !isSpymaster) &&
            t('hint.waitClue', { team: t(`team.${state.activeTeam}`) })}
          {state.phase === 'guess' && isMyTeam && isOperative && t('hint.guess')}
          {state.phase === 'guess' &&
            (!isMyTeam || !isOperative) &&
            t('hint.waitGuess', { team: t(`team.${state.activeTeam}`) })}
        </div>
      )}

      {/* Spymaster clue input */}
      {canGiveClue && (
        <div className="bg-card/70 rounded-xl border border-border p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">{t('clue.label')}</div>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={clueWord}
              onChange={(e) => setClueWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGiveClue()}
              placeholder={t('clue.placeholder')}
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-background border border-border text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <select
              value={clueCount}
              onChange={(e) => setClueCount(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-background border border-border text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'unlimited'].map((v) => (
                <option key={v} value={v}>
                  {v === 'unlimited' ? '∞' : v}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!clueWord.trim() || !!isSending}
              onClick={handleGiveClue}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 hover:bg-primary/80 transition-all"
            >
              {t('clue.send')}
            </button>
          </div>
        </div>
      )}

      {/* End guessing button */}
      {canEndGuessing && (
        <button
          type="button"
          disabled={!!isSending}
          onClick={() => sendAction({ type: 'endGuessing' })}
          className="w-full py-2 rounded-xl border border-border bg-card/70 text-sm text-muted-foreground hover:bg-muted/80 transition-all"
        >
          {t('endGuessing')}
        </button>
      )}

      {lastReject && <div className="text-xs text-destructive text-center">{lastReject}</div>}

      {/* Team roster */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        {(['red', 'blue'] as Team[]).map((team) => (
          <div
            key={team}
            className={`rounded-xl p-2 border ${team === 'red' ? 'border-red-200 bg-red-50/50' : 'border-blue-200 bg-blue-50/50'}`}
          >
            <div
              className={`text-xs font-semibold mb-1 ${team === 'red' ? 'text-red-700' : 'text-blue-700'}`}
            >
              {t(`team.${team}`)}
            </div>
            <div className="flex flex-wrap gap-1">
              {state.playersInfo
                .filter((p) => p.team === team)
                .map((p) => {
                  const pl = players.find((pp) => pp.id === p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-1">
                      {pl && <PlayerBadge player={pl} isCurrentTurn={false} isMe={p.id === myId} />}
                      {p.role === 'spymaster' && (
                        <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">
                          {t('role.spymaster')}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Game Over */}
      {gameOver && state.winner && (
        <GameOverModal
          rankings={[
            ...state.playersInfo.filter((p) => p.team === state.winner).map((p) => p.id),
            ...state.playersInfo.filter((p) => p.team !== state.winner).map((p) => p.id),
          ]}
          playerNames={playerNames}
          myId={myId}
        />
      )}
    </div>
  );
}
