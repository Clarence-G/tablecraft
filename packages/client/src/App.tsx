import { GameChatProvider } from '@repo/game-ui/chat';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useChat } from './hooks/useChat';
import { useGame } from './hooks/useGame';
import { useIdentity } from './hooks/useIdentity';
import { useRoom } from './hooks/useRoom';
import { useSession } from './hooks/useSession';
import { useSocket } from './hooks/useSocket';
import { Game } from './pages/Game';
import { GamesAll } from './pages/GamesAll';
import { Leaderboard } from './pages/Leaderboard';
import { Lobby } from './pages/Lobby';
import { Login } from './pages/Login';
import { Me } from './pages/Me';
import { Register } from './pages/Register';
import { Room } from './pages/Room';
import { RoomsAll } from './pages/RoomsAll';

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

  const roomCtx = useRoom(socket);
  const game = useGame(socket);
  const chat = useChat(socket);

  const navigate = useNavigate();
  const location = useLocation();

  // Keep the URL in sync with server-driven room status changes for users
  // already inside a room route:
  //   - waiting → playing: /rooms/:id → /rooms/:id/play
  //   - playing → waiting: /rooms/:id/play → /rooms/:id
  // Auto-entering a room from the lobby is intentionally NOT handled here —
  // RoomRoute's useAutoJoinRoom drives URL → room, not the other way around.
  // Letting room state pull users into /rooms/:id from anywhere would race
  // with `leave()` + navigate('/') (stale room state bounces them back).
  const roomId = roomCtx.room?.roomId ?? null;
  const roomStatus = roomCtx.room?.status ?? null;
  useEffect(() => {
    if (!roomId || !roomStatus) return;
    const path = location.pathname;
    if (!path.startsWith(`/rooms/${roomId}`)) return;
    const target = roomStatus === 'playing' ? `/rooms/${roomId}/play` : `/rooms/${roomId}`;
    if (path !== target) navigate(target, { replace: true });
  }, [roomId, roomStatus, location.pathname, navigate]);

  return (
    <GameChatProvider value={{ messages: chat.messages, send: chat.send, myId: actorUserId }}>
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
