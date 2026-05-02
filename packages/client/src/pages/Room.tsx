import { Button } from '@/components/ui/button';
import { GameCoverImage } from '@/components/GameCoverImage';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Check, Clock, Copy, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { useRoom } from '../hooks/useRoom';
import { clientRegistry } from '../../../../games/client-registry';
import { TAG_COLORS } from '../lib/tags';

type RoomCtx = ReturnType<typeof useRoom>;

interface RoomPageProps {
  roomId: string;
  userId: string;
  roomCtx: RoomCtx;
  onGameStart: () => void;
  onLeave: () => void;
}

export function Room({ roomId, userId, roomCtx, onGameStart: _onGameStart, onLeave }: RoomPageProps) {
  const { t, i18n } = useTranslation('common');
  // Per-game i18n namespace (each game registers its own ns = gameId).
  const gt = (ns: string, key: string, fallback?: string) => {
    const val = i18n.t(key, { ns, defaultValue: fallback ?? '' });
    return typeof val === 'string' ? val : fallback ?? '';
  };
  const { room, ready, start, leave, restart } = roomCtx;

  const [copied, setCopied] = useState(false);
  const handleCopyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail on http: origins or in sandboxed iframes —
      // fall back silently; the code is still visible next to the button.
    }
  };

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">{t('room.connecting')}</div>
      </div>
    );
  }

  const me = room.players.find((p) => p.id === userId);
  const isHost = room.hostId === userId;
  const hasEnoughPlayers = room.players.length >= room.minPlayers;
  const allReady = hasEnoughPlayers && room.players.every((p) => p.ready);

  const gamePlugin = clientRegistry[room.gameId];
  const meta = gamePlugin?.meta;
  const gameName = meta ? (gt(meta.id, 'name', meta.name) || meta.name) : room.gameId;
  const gameDescription = meta
    ? gt(meta.id, 'description', meta.description ?? '') || meta.description
    : '';
  const gameRules = meta
    ? gt(meta.id, 'rules', meta.rules ?? '') || meta.rules
    : '';
  const durationMinutes = meta?.estimatedMinutes;
  const tags = meta?.tags ?? [];

  // Fill empty seats up to maxPlayers with ghost placeholders so the list
  // visually telegraphs "we're waiting for more".
  const emptySlots = Math.max(0, room.maxPlayers - room.players.length);

  return (
    <div
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      data-testid="room-page"
      data-room-status={room.status === 'finished' ? 'ended' : 'waiting'}
    >
      <div className="max-w-6xl mx-auto">
        {/* Top bar: title + room code with copy button */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1108]">{t('room.waitingRoom')}</h1>
          <button
            type="button"
            data-testid="room-code"
            onClick={handleCopyRoomCode}
            aria-label={t('room.copyRoomCode', { defaultValue: '复制房间码' })}
            title={t('room.copyRoomCode', { defaultValue: '复制房间码' })}
            className="group inline-flex items-center gap-2 bg-card border-2 border-foreground rounded-[10px] px-3 py-1.5 sm:px-4 sm:py-2 font-mono tracking-widest text-sm sm:text-lg shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active transition-transform"
          >
            <span>{roomId}</span>
            {copied ? (
              <Check className="w-4 h-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Two-column grid: game presentation | player + actions. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-5 lg:gap-6">
          {/* ═════ LEFT: Game cover + meta ═════ */}
          <section className="flex flex-col gap-4">
            {/* Cover card */}
            <div className="bg-card border-thick border-foreground rounded-[20px] overflow-hidden shadow-card">
              {meta ? (
                <div className="aspect-[5/3] sm:aspect-[4/3] lg:aspect-square relative">
                  <GameCoverImage
                    gameId={meta.id}
                    fallbackIcon={meta.icon ?? 'stack'}
                    className="!aspect-auto !border-b-0 absolute inset-0 [&_img]:object-cover"
                  />
                  {/* Gradient scrim + title badge over the cover */}
                  <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 bg-gradient-to-t from-black/75 via-black/30 to-transparent">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
                      {gameName}
                    </h2>
                    {gameDescription && (
                      <p className="text-sm sm:text-base text-white/90 mt-1 line-clamp-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                        {gameDescription}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground">{room.gameId}</div>
              )}
            </div>

            {/* Meta chips: players / duration / tags */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-card border-2 border-foreground rounded-full px-3 py-1 text-sm font-medium shadow-[#3d2e1e_-2px_2px_0px]">
                <Users className="w-3.5 h-3.5" />
                {room.minPlayers === room.maxPlayers
                  ? t('room.playerCountExact', { n: room.minPlayers, defaultValue: `${room.minPlayers} 人` })
                  : t('room.playerCountRange', {
                      min: room.minPlayers,
                      max: room.maxPlayers,
                      defaultValue: `${room.minPlayers}-${room.maxPlayers} 人`,
                    })}
              </span>
              {typeof durationMinutes === 'number' && durationMinutes > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-card border-2 border-foreground rounded-full px-3 py-1 text-sm font-medium shadow-[#3d2e1e_-2px_2px_0px]">
                  <Clock className="w-3.5 h-3.5" />
                  {t('room.durationMinutes', {
                    n: durationMinutes,
                    defaultValue: `约 ${durationMinutes} 分钟`,
                  })}
                </span>
              )}
              {tags.map((tag) => {
                const paletteCls =
                  TAG_COLORS[tag] ?? 'bg-[#f4e1b8] text-[#2a1810] border-[#2a1810]';
                const label = i18n.t(`tags.${tag}`, { defaultValue: tag });
                return (
                  <span
                    key={tag}
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border-2 ${paletteCls}`}
                  >
                    {String(label)}
                  </span>
                );
              })}
            </div>

            {/* Rules card */}
            {gameRules && (
              <div className="bg-card border-thick border-foreground rounded-[16px] p-5 shadow-card">
                <h3 className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                  {t('room.howToPlay', { defaultValue: '如何游玩' })}
                </h3>
                <p className="text-sm sm:text-base leading-relaxed text-[#1a1108] whitespace-pre-line">
                  {gameRules}
                </p>
              </div>
            )}
          </section>

          {/* ═════ RIGHT: Players + actions ═════ */}
          <section className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            {/* Players card */}
            <div className="bg-card border-thick border-foreground rounded-[16px] p-5 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                  {t('room.playerList')}
                </h3>
                <span className="text-xs font-semibold text-[#3d2e1e] bg-[#f4e1b8] border border-foreground rounded-full px-2.5 py-0.5 shadow-[#3d2e1e_-1px_1px_0px]">
                  {room.players.length}/{room.maxPlayers}
                </span>
              </div>
              <div className="space-y-2" data-testid="player-list">
                {room.players.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-[#fdf4dc]/60 transition-colors"
                    data-testid={`player-${index}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex-shrink-0">
                        <PlayerAvatar name={player.name} size={32} />
                        {/* Connection status dot, bottom-right of avatar */}
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card translate-x-0.5 translate-y-0.5 ${
                            player.connected ? 'bg-success' : 'bg-[#9c8b78]'
                          }`}
                          aria-label={player.connected ? 'online' : 'offline'}
                        />
                      </div>
                      <span className="font-medium truncate">{player.name}</span>
                      {player.id === room.hostId && (
                        <span className="text-xs text-warning font-semibold bg-[#fef3e0] border border-warning rounded-full px-2 py-0.5 flex-shrink-0">
                          {t('room.host')}
                        </span>
                      )}
                    </div>
                    {player.id === room.hostId ? null : (
                      <span
                        className={`text-sm font-medium flex-shrink-0 ${
                          player.ready ? 'text-success' : 'text-muted-foreground'
                        }`}
                      >
                        {player.ready ? t('room.ready') : t('room.notReady')}
                      </span>
                    )}
                  </div>
                ))}
                {/* Empty seat placeholders — soft cream outline, not warning/amber */}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg border-2 border-dashed border-[#d9c9a8] bg-[#fdf4dc]/30"
                    aria-hidden="true"
                  >
                    {/* Empty avatar slot */}
                    <div className="w-8 h-8 rounded-full border-2 border-dashed border-[#d9c9a8] bg-[#fdf4dc]/60 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground italic">
                      {t('room.waitingForPlayer', { defaultValue: '等待玩家加入…' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              {!isHost && !me?.ready && (
                <Button
                  onClick={ready}
                  data-testid="ready-btn"
                  className="w-full py-3 bg-jade border-2 border-[#0a5c2a] text-white shadow-[#0a5c2a_-4px_4px_0px] hover:-translate-y-0.5 hover:shadow-[#0a5c2a_-5px_6px_0px] active:translate-y-px active:shadow-[#0a5c2a_-2px_2px_0px] rounded-[12px] font-semibold"
                  size="lg"
                >
                  {t('room.readyBtn')}
                </Button>
              )}

              {isHost && (
                <Button
                  onClick={start}
                  disabled={!allReady}
                  data-testid="start-btn"
                  className="w-full py-3 shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] font-semibold"
                  size="lg"
                >
                  {!hasEnoughPlayers
                    ? t('room.needPlayers', { count: room.minPlayers })
                    : !allReady
                      ? t('room.waitingReady', { defaultValue: '等待玩家准备…' })
                      : t('room.startGame')}
                </Button>
              )}

              {room.status === 'finished' && (
                <Button
                  onClick={restart}
                  className="w-full py-3 shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active border-2 border-[#1a1108] rounded-[12px] font-semibold"
                  size="lg"
                >
                  {t('room.playAgain')}
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => {
                  leave();
                  onLeave();
                }}
                data-testid="leave-btn"
                className="w-full py-3 bg-card border-2 border-foreground shadow-[#3d2e1e_-4px_4px_0px] hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-[#3d2e1e_-2px_2px_0px] rounded-[12px] font-semibold"
                size="lg"
              >
                {t('room.leave')}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
