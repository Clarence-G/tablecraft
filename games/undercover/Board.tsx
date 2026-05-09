import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Action, PlayerInfo, PlayerView } from './shared';

interface RevealState {
  name: string;
  role: 'civilian' | 'undercover';
  roleLabel: string;
}

export function Board({
  state,
  myId,
  players,
  sendAction,
  isSending,
  lastReject,
  pointsDelta,
  ties,
  onReturnToRoom,
  canReturnToRoom,
  onReturnToLobby,
}: BoardProps<PlayerView, Action>) {
  const { t } = useTranslation('undercover');
  const [descText, setDescText] = useState('');
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [revealFlipped, setRevealFlipped] = useState(false);
  const prevElimCount = useRef(state.players.filter((p) => !p.alive).length);

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const safeSend = isSending ? () => {} : sendAction;

  // Show reveal card when a new player gets eliminated (card flip + 3s hold)
  useEffect(() => {
    const elimCount = state.players.filter((p) => !p.alive).length;
    if (elimCount > prevElimCount.current) {
      const justEliminated = [...state.players].filter((p) => !p.alive && p.role !== null).at(-1);
      if (justEliminated?.role) {
        setReveal({
          name: playerNames[justEliminated.id] ?? justEliminated.id,
          role: justEliminated.role,
          roleLabel: t(justEliminated.role),
        });
        setRevealFlipped(false);
        const flipTimer = setTimeout(() => setRevealFlipped(true), 80);
        const hideTimer = setTimeout(() => setReveal(null), 3000);
        prevElimCount.current = elimCount;
        return () => {
          clearTimeout(flipTimer);
          clearTimeout(hideTimer);
        };
      }
    }
    prevElimCount.current = elimCount;
  }, [state.players, playerNames, t]);

  const isMyTurnDescribe =
    state.phase === 'describe' && state.currentSpeaker === myId && state.myAlive;

  const canVote =
    state.phase === 'vote' && state.myAlive && !state.players.find((p) => p.id === myId)?.hasVoted;

  // Live vote tally per candidate
  const voteTally = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of state.votes) {
      counts[v.targetId] = (counts[v.targetId] ?? 0) + 1;
    }
    const totalAlive = state.players.filter((p) => p.alive).length;
    return state.players
      .filter((p) => p.alive)
      .map((p) => ({
        id: p.id,
        count: counts[p.id] ?? 0,
        pct: totalAlive > 0 ? ((counts[p.id] ?? 0) / totalAlive) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [state.votes, state.players]);

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
      {/* Reveal card (centered with flip animation) */}
      {reveal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none"
          aria-live="polite"
          aria-label={t('eliminatedWithRole', { name: reveal.name, role: reveal.roleLabel })}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-44 h-60 sm:w-52 sm:h-72" style={{ perspective: '1200px' }}>
              <div
                className="relative w-full h-full transition-transform duration-700 ease-in-out"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: revealFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* Card back */}
                <div
                  className="absolute inset-0 rounded-2xl bg-card border-4 border-ring/50 flex items-center justify-center shadow-2xl"
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  <span className="text-6xl font-bold text-muted-foreground">?</span>
                </div>
                {/* Card front (role revealed) */}
                <div
                  className={`absolute inset-0 rounded-2xl border-4 flex flex-col items-center justify-center gap-2 shadow-2xl ${
                    reveal.role === 'undercover'
                      ? 'bg-destructive text-destructive-foreground border-destructive'
                      : 'bg-primary text-primary-foreground border-primary'
                  }`}
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <span className="text-xs uppercase tracking-widest opacity-80">
                    {reveal.roleLabel}
                  </span>
                  <span className="text-2xl font-bold text-center px-2">{reveal.name}</span>
                  <span className="text-xs opacity-80 mt-1">{t('eliminated')}</span>
                </div>
              </div>
            </div>
          </div>
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {state.phase === 'describe'
            ? t('phase_describe')
            : state.phase === 'vote'
              ? t('phase_vote')
              : t('gameOver')}
        </span>
        <span
          className="inline-flex items-center px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 text-xs font-semibold tracking-wide"
          aria-label={t('round', { round: state.round })}
        >
          {t('round', { round: state.round })}
        </span>
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
                isSpeaker
                  ? 'bg-primary/25 ring-2 ring-primary shadow-md animate-pulse'
                  : 'bg-card/40'
              } ${isEliminated ? 'opacity-50' : ''}`}
            >
              <PlayerBadge player={p} isCurrentTurn={isSpeaker} isMe={p.id === myId} />
              <div className="text-[10px] text-muted-foreground text-center">
                {isEliminated ? (
                  <span className="text-destructive">
                    {t('eliminated')}
                    {info?.role ? ` (${t(info.role)})` : ''}
                  </span>
                ) : isSpeaker ? (
                  <span className="text-primary font-semibold">
                    {t('currentSpeaker', { name: '' }).replace(': ', '')}
                  </span>
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
          <div className="text-xs text-muted-foreground/60 text-center py-2">
            {t('noDescriptions')}
          </div>
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
          {t('waitingForDescribe', {
            name: playerNames[state.currentSpeaker] ?? state.currentSpeaker,
          })}
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
        <div className="bg-card/60 rounded-xl ring-1 ring-foreground/15 p-3 flex flex-col gap-3">
          <div className="text-sm font-medium">{t('voteTitle')}</div>

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
              {state.myAlive ? t('waitingForVotes') : t('observing')}
            </div>
          )}

          {/* Live vote tally bar */}
          {voteTally.some((v) => v.count > 0) && (
            <div className="space-y-1.5" aria-label={t('voteTitle')} data-testid="vote-tally">
              {voteTally.map((v) => (
                <div key={v.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 sm:w-24 truncate shrink-0">
                    {playerNames[v.id] ?? v.id}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-background/60 border border-foreground/10 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${v.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                    {v.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {lastReject && <div className="text-center text-sm text-destructive">{lastReject}</div>}

      {/* Game Over */}
      {gameOver && (
        <GameOverModal
          rankings={state.rankings}
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
