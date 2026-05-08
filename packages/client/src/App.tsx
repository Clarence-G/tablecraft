import { GameChatProvider } from '@repo/game-ui/chat';
import type { ClientEvents, ServerEvents } from '@repo/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { useChat } from './hooks/useChat';
import { useGame } from './hooks/useGame';
import { useIdentity } from './hooks/useIdentity';
import { useRoom } from './hooks/useRoom';
import { useSession } from './hooks/useSession';
import { useSocket } from './hooks/useSocket';
import { ForgotPassword } from './pages/ForgotPassword';
import { Game } from './pages/Game';
import { GamesAll } from './pages/GamesAll';
import { Leaderboard } from './pages/Leaderboard';
import { Lobby } from './pages/Lobby';
import { Login } from './pages/Login';
import { Me } from './pages/Me';
import { Register } from './pages/Register';
import { ResetPassword } from './pages/ResetPassword';
import { Room } from './pages/Room';
import { RoomsAll } from './pages/RoomsAll';
import { SpectatorView } from './pages/SpectatorView';

type UseRoomRet = ReturnType<typeof useRoom>;
type UseGameRet = ReturnType<typeof useGame>;

// How long to wait for server auto-rejoin to push room:state after a refresh
// before we optimistically try to join the URL room ourselves.
const AUTO_REJOIN_GRACE_MS = 800;

export function App() {
  const { userId, userName, rename } = useIdentity();
  const session = useSession();
  const actorUserId = session.data?.user?.id ?? userId;
  const actorUserName = session.data?.user?.name ?? userName;
  const isGuest = !session.data?.user;
  const { socket, connected } = useSocket(actorUserId, actorUserName, isGuest);
  const { t } = useTranslation('common');

  const game = useGame(socket);
  const roomCtx = useRoom(socket, game.resetForRoom);
  const chat = useChat(socket);

  const navigate = useNavigate();
  const location = useLocation();

  // Resume banner: shown when socket reconnects and user has an active room
  // but they're currently on the lobby (not already in a room route).
  const [resumeRoomId, setResumeRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => {
      socket.emit('room:resume', (result) => {
        if (!result.ok || !result.data) return;
        const { roomId } = result.data;
        if (!window.location.pathname.startsWith(`/rooms/${roomId}`)) {
          setResumeRoomId(roomId);
        }
      });
    };
    socket.on('connect', handleConnect);
    if (socket.connected) handleConnect();
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [socket]);

  // Keep the URL in sync with server-driven room status changes for users
  // already inside a room route:
  //   - waiting → playing: /rooms/:id → /rooms/:id/play
  //   - playing → waiting: /rooms/:id/play → /rooms/:id
  // Auto-entering a room from the lobby is intentionally NOT handled here —
  // RoomRoute's useAutoJoinRoom drives URL → room, not the other way around.
  // Letting room state pull users into /rooms/:id from anywhere would race
  // with `leave()` + navigate('/') (stale room state bounces them back).
  // The `/watch` spectator route is NOT a player seat, so it MUST be excluded
  // from this URL-sync effect — otherwise a spectator would be yanked to
  // /rooms/:id/play the moment roomCtx picks up any room state.
  const roomId = roomCtx.room?.roomId ?? null;
  const roomStatus = roomCtx.room?.status ?? null;
  useEffect(() => {
    if (!roomId || !roomStatus) return;
    const path = location.pathname;
    if (!path.startsWith(`/rooms/${roomId}`)) return;
    if (path.endsWith('/watch')) return; // spectator route — leave it alone
    const target = roomStatus === 'playing' ? `/rooms/${roomId}/play` : `/rooms/${roomId}`;
    if (path !== target) navigate(target, { replace: true });
  }, [roomId, roomStatus, location.pathname, navigate]);

  return (
    <GameChatProvider
      value={{
        messages: chat.messages,
        send: chat.send,
        myId: actorUserId,
        players: roomCtx.room?.players ?? [],
      }}
    >
      {/* Resume banner: shows on lobby when socket reconnects with an active room */}
      {resumeRoomId && location.pathname === '/' && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center px-4 pt-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 bg-card border-2 border-foreground rounded-[12px] shadow-card px-4 py-2.5 max-w-sm w-full">
            <span className="text-sm font-semibold flex-1">{t('room.resumeBanner.title')}</span>
            <button
              type="button"
              onClick={() => {
                navigate(`/rooms/${resumeRoomId}`);
                setResumeRoomId(null);
              }}
              className="text-xs font-bold border-2 border-foreground bg-foreground text-background rounded-[8px] px-3 py-1 hover:-translate-y-0.5 transition-all"
            >
              {t('room.resumeBanner.cta')}
            </button>
            <button
              type="button"
              onClick={() => setResumeRoomId(null)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('room.resumeBanner.dismiss')}
            </button>
          </div>
        </div>
      )}
      <Routes>
        <Route
          path="/"
          element={
            <Lobby
              socket={socket}
              socketReady={connected}
              userName={actorUserName}
              rename={rename}
              roomCtx={roomCtx}
              onGoToLogin={() => navigate('/login')}
              onGoToRegister={() => navigate('/register')}
              onGoToAllRooms={() => navigate('/rooms')}
              onGoToLeaderboard={() => navigate('/leaderboard')}
              onGoToMe={() => navigate('/me')}
              onRoomCreated={(id) => navigate(`/rooms/${id}`)}
              onRoomJoined={(id) => navigate(`/rooms/${id}`)}
              onRoomSpectated={(id) => navigate(`/rooms/${id}/watch`)}
            />
          }
        />
        <Route
          path="/login"
          element={
            <Login
              onSuccess={() => navigate('/')}
              onGoToRegister={() => navigate('/register')}
              onBack={() => navigate('/')}
            />
          }
        />
        <Route
          path="/register"
          element={
            <Register
              onSuccess={() => navigate('/')}
              onGoToLogin={() => navigate('/login')}
              onBack={() => navigate('/')}
            />
          }
        />
        <Route
          path="/forgot-password"
          element={<ForgotPassword onBack={() => navigate('/login')} />}
        />
        <Route
          path="/reset-password"
          element={
            <ResetPassword onSuccess={() => navigate('/login')} onBack={() => navigate('/login')} />
          }
        />
        <Route
          path="/me"
          element={<Me onBack={() => navigate('/')} onSignedOut={() => navigate('/')} />}
        />
        <Route
          path="/games"
          element={
            <GamesAll
              userName={actorUserName}
              onBack={() => navigate('/')}
              onCreateRoom={async (gameId) => {
                const { roomId: newRoomId } = await roomCtx.create(gameId, actorUserName);
                navigate(`/rooms/${newRoomId}`);
              }}
            />
          }
        />
        <Route
          path="/rooms"
          element={
            <RoomsAll
              socket={socket}
              listRooms={roomCtx.listRooms}
              onBack={() => navigate('/')}
              onGoToAllGames={() => navigate('/games')}
              onJoinRoom={async (targetRoomId) => {
                await roomCtx.join(targetRoomId, actorUserName);
                navigate(`/rooms/${targetRoomId}`);
              }}
              onSpectateRoom={(targetRoomId) => navigate(`/rooms/${targetRoomId}/watch`)}
            />
          }
        />
        <Route path="/leaderboard" element={<Leaderboard onBack={() => navigate('/')} />} />
        <Route
          path="/rooms/:roomId"
          element={
            <RoomRoute
              userId={actorUserId}
              userName={actorUserName}
              roomCtx={roomCtx}
              socketReady={connected}
            />
          }
        />
        <Route
          path="/rooms/:roomId/play"
          element={
            <GameRoute
              userId={actorUserId}
              userName={actorUserName}
              roomCtx={roomCtx}
              game={game}
              socketReady={connected}
            />
          }
        />
        <Route
          path="/rooms/:roomId/watch"
          element={
            <SpectatorRoute userId={actorUserId} socket={socket} onLeave={() => navigate('/')} />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </GameChatProvider>
  );
}

/**
 * URL-driven entry for waiting rooms. Handles three refresh/entry scenarios:
 *   1. Server auto-rejoin pushes matching room:state → just render Room.
 *   2. Fresh entry to a room the user isn't in yet → wait for socket, then join.
 *   3. Stale URL (room closed / kicked) → join fails → send home.
 */
function RoomRoute({
  userId,
  userName,
  roomCtx,
  socketReady,
}: {
  userId: string;
  userName: string;
  roomCtx: UseRoomRet;
  socketReady: boolean;
}) {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  useAutoJoinRoom(roomId, userName, roomCtx, socketReady);

  if (!roomId) return <Navigate to="/" replace />;

  return (
    <Room
      roomId={roomId}
      userId={userId}
      roomCtx={roomCtx}
      onGameStart={() => navigate(`/rooms/${roomId}/play`)}
      onLeave={() => navigate('/')}
    />
  );
}

function GameRoute({
  userId,
  userName,
  roomCtx,
  game,
  socketReady,
}: {
  userId: string;
  userName: string;
  roomCtx: UseRoomRet;
  game: UseGameRet;
  socketReady: boolean;
}) {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  useAutoJoinRoom(roomId, userName, roomCtx, socketReady);

  if (!roomId) return <Navigate to="/" replace />;

  return (
    <Game
      userId={userId}
      room={roomCtx.room}
      game={game}
      onReturnToLobby={() => {
        roomCtx.leave();
        navigate('/');
      }}
    />
  );
}

function SpectatorRoute({
  userId,
  socket,
  onLeave,
}: {
  userId: string;
  socket: Socket<ServerEvents, ClientEvents> | null;
  onLeave: () => void;
}) {
  const { roomId } = useParams<{ roomId: string }>();
  if (!roomId) return <Navigate to="/" replace />;
  return <SpectatorView socket={socket} userId={userId} roomId={roomId} onLeave={onLeave} />;
}

/**
 * After socket connects, wait a short grace period for server auto-rejoin to
 * push room:state. If by then we still aren't tracking the URL room, try to
 * join it explicitly. Failed joins drop us back to the lobby.
 */
function useAutoJoinRoom(
  roomId: string | undefined,
  userName: string,
  roomCtx: UseRoomRet,
  socketReady: boolean,
) {
  const navigate = useNavigate();
  const currentRoomId = roomCtx.room?.roomId ?? null;
  const [didAttemptJoin, setDidAttemptJoin] = useState(false);

  useEffect(() => {
    if (!roomId || !socketReady) return;
    if (currentRoomId === roomId) return;
    if (didAttemptJoin) return;
    const timer = setTimeout(() => {
      if (roomCtx.room?.roomId === roomId) return;
      setDidAttemptJoin(true);
      roomCtx.join(roomId, userName).catch(() => {
        navigate('/', { replace: true });
      });
    }, AUTO_REJOIN_GRACE_MS);
    return () => clearTimeout(timer);
  }, [roomId, socketReady, currentRoomId, didAttemptJoin, userName, roomCtx, navigate]);
}
