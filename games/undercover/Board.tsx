import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action, PlayerInfo, PlayerView } from './shared';

export function Board({ state, myId, players, sendAction, isSending, lastReject }: BoardProps<PlayerView, Action>) {
  const { t } = useTranslation('undercover');
  const [descText, setDescText] = useState('');
  const [eliminationBanner, setEliminationBanner] = useState<{ name: string; role: string } | null>(null);
  const prevElimCount = useRef(state.players.filter((p) => !p.alive).length);

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const safeSend = isSending ? () => {} : sendAction;

  // Show elimination banner when a new player gets eliminated
  useEffect(() => {
    const elimCount = state.players.filter((p) => !p.alive).length;
    if (elimCount > prevElimCount.current) {
      const justEliminated = state.players.find(
        (p) => !p.alive && p.role !== null,
      );
      if (justEliminated) {
        const roleKey = justEliminated.role === 'undercover' ? 'undercover' : 'civilian';
        setEliminationBanner({ name: playerNames[justEliminated.id] ?? justEliminated.id, role: t(roleKey) });
        const timer = setTimeout(() => setEliminationBanner(null), 3000);
        prevElimCount.current = elimCount;
        return () => clearTimeout(timer);
      }
    }
    prevElimCount.current = elimCount;
  }, [state.players, playerNames, t]);

  const isMyTurnDescribe =
    state.phase === 'describe' && state.currentSpeaker === myId && state.myAlive;

  const canVote = state.phase === 'vote' && state.myAlive && !state.players.find((p) => p.id === myId)?.hasVoted;

  function handleDescribe() {
    const trimmed = descText.trim();
    if (!trimmed) return;
    safeSend({ type: 'describe', text: trimmed });
    setDescText('');
  }

  function handleVote(targetId: string) {
    safeSend({ type: 'vote', targetId });
  }

  const gameOver = state.phase === 'finished';

  return (
    <div className="flex-1 text-foreground flex flex-col p-3 sm:p-4 max-w-3xl lg:max-w-5xl mx-auto w-full gap-3">
      {/* Elimination banner */}
      {eliminationBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-5 py-3 rounded-xl shadow-lg text-center text-sm font-semibold">
          {t('eliminatedWithRole', { name: eliminationBanner.name, role: eliminationBanner.role })}
        </div>
      )}

      {/* My word card */}
      <div className="bg-card border-2 border-ring/40 rounded-xl p-4 text-center shadow-sm">
        <div className="text-xs text-muted-foreground mb-1">{t('yourWord')}</div>
        <div className="text-2xl font-bold tracking-wide">{state.myWord || '—'}</div>
        {!state.myAlive && (
          <div className="mt-1 text-sm text-destructive">{t('youAreEliminated')}</div>
        )}
      </div>

      {/* Phase + Round header */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-medium">
          {state.phase === 'describe' ? t('phase_describe') : state.phase === 'vote' ? t('phase_vote') : t('gameOver')}
        </span>
        <span>{t('round', { round: state.round })}</span>
      </div>

      {/* Tie notice */}
      {state.tiePlayerIds.length > 0 && state.phase === 'describe' && (
        <div className="bg-warning/20 border border-warning/50 rounded-lg px-3 py-2 text-sm text-center text-warning-foreground">
          {t('tieRound')}
        </div>
      )}

      {/* Players list */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {players.map((p) => {
          const info: PlayerInfo | undefined = state.players.find((sp) => sp.id === p.id);
          const isSpeaker = state.phase === 'describe' && state.currentSpeaker === p.id;
          const isEliminated = info ? !info.alive : false;
          return (
            <div
              key={p.id}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                isSpeaker ? 'bg-primary/20 ring-1 ring-primary' : 'bg-card/40'
              } ${isEliminated ? 'opacity-50' : ''}`}
            >
              <PlayerBadge
                player={p}
                isCurrentTurn={isSpeaker}
                isMe={p.id === myId}
              />
              <div className="text-[10px] text-muted-foreground text-center">
                {isEliminated ? (
                  <span className="text-destructive">
                    {t('eliminated')}
                    {info?.role ? ` (${t(info.role)})` : ''}
                  </span>
                ) : isSpeaker ? (
                  <span className="text-primary">{t('currentSpeaker', { name: '' }).replace(': ', '')}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Descriptions this round */}
      <div className="bg-card/60 rounded-xl ring-1 ring-foreground/15 p-3">
        <div className="text-xs font-medium text-muted-foreground mb-2">{t('descriptions')}</div>
        {state.descriptions.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 text-center py-2">{t('noDescriptions')}</div>
        ) : (
          <div className="space-y-1.5">
            {state.descriptions.map((d, i) => (
              <div key={i} className="text-xs flex items-start gap-2">
                <span className="font-semibold shrink-0 text-muted-foreground">
                  {playerNames[d.playerId] ?? d.playerId}:
                </span>
                <span>{d.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Describe input */}
      {isMyTurnDescribe && (
        <div className="bg-card/60 rounded-xl ring-1 ring-foreground/15 p-3 flex flex-col gap-2">
          <div className="text-sm font-medium">{t('yourTurnDescribe')}</div>
          <div className="text-xs text-muted-foreground">{t('describeHint')}</div>
          <input
            type="text"
            value={descText}
            onChange={(e) => setDescText(e.target.value.slice(0, 50))}
            onKeyDown={(e) => e.key === 'Enter' && handleDescribe()}
            placeholder={t('describeInputPlaceholder')}
            className="bg-background border border-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            maxLength={50}
          />
          <button
            type="button"
            onClick={handleDescribe}
            disabled={!descText.trim() || isSending}
            className="py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('describeButton')}
          </button>
        </div>
      )}

      {/* Waiting for describe */}
      {state.phase === 'describe' && !isMyTurnDescribe && state.myAlive && state.currentSpeaker && (
        <div className="text-center text-sm text-muted-foreground">
          {t('waitingForDescribe', { name: playerNames[state.currentSpeaker] ?? state.currentSpeaker })}
        </div>
      )}

      {/* Eliminated player waiting */}
      {!state.myAlive && !gameOver && (
        <div className="text-center text-sm text-muted-foreground bg-card/60 rounded-xl ring-1 ring-foreground/15 p-3">
          {t('observing')}
        </div>
      )}

      {/* Vote phase */}
      {state.phase === 'vote' && (
        <div className="bg-card/60 rounded-xl ring-1 ring-foreground/15 p-3">
          <div className="text-sm font-medium mb-2">{t('voteTitle')}</div>
          {canVote ? (
            <div className="grid grid-cols-2 gap-2">
              {state.players
                .filter((p) => p.alive && p.id !== myId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleVote(p.id)}
                    disabled={isSending}
                    className="py-2 px-3 rounded-lg text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-all"
                  >
                    {t('voteFor', { name: playerNames[p.id] ?? p.id })}
                  </button>
                ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center">
              {state.myAlive
                ? t('waitingForVotes')
                : t('observing')}
            </div>
          )}

          {/* Show votes after all voted */}
          {state.votes.length > 0 && (
            <div className="mt-3 space-y-1">
              {state.votes.map((v, i) => (
                <div key={i} className="text-xs text-muted-foreground flex gap-1">
                  <span className="font-medium">{playerNames[v.voterId] ?? v.voterId}</span>
                  <span>→</span>
                  <span>{playerNames[v.targetId] ?? v.targetId}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {lastReject && (
        <div className="text-center text-sm text-destructive">{lastReject}</div>
      )}

      {/* Game Over */}
      {gameOver && (
        <GameOverModal
          rankings={state.rankings}
          playerNames={playerNames}
          myId={myId}
        />
      )}
    </div>
  );
}
