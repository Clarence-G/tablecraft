import { useEffect, useRef, useState } from 'react';
import { useGame } from './hooks/useGame';
import { useIdentity } from './hooks/useIdentity';
import { useRoom } from './hooks/useRoom';
import { useSession } from './hooks/useSession';
import { useSocket } from './hooks/useSocket';
import { Game } from './pages/Game';
import { Lobby } from './pages/Lobby';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Room } from './pages/Room';

type Page = 'lobby' | 'room' | 'game' | 'login' | 'register';

export function App() {
  const { userId, userName, rename } = useIdentity();
  const session = useSession();
  // `isGuest` must flip atomically when the session loads so the socket
  // reconnects with a verifiable identity. Treat session.isPending as guest —
  // the socket will reconnect once the session resolves.
  const actorUserId = session.data?.user?.id ?? userId;
  const actorUserName = session.data?.user?.name ?? userName;
  const isGuest = !session.data?.user;
  const { socket } = useSocket(actorUserId, actorUserName, isGuest);
  const [page, setPage] = useState<Page>('lobby');
  const [roomId, setRoomId] = useState<string | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const roomCtx = useRoom(socket);
  const game = useGame(socket);

  // Navigate based on room status changes
  const roomStatus = roomCtx.room?.status;
  useEffect(() => {
    if (roomStatus === 'playing' && pageRef.current === 'room') {
      setPage('game');
    }
    if (roomStatus === 'waiting' && pageRef.current === 'game') {
      setPage('room');
    }
  }, [roomStatus]);

  // Reconnection: if we receive room:state while on lobby, auto-navigate
  useEffect(() => {
    if (!roomCtx.room || pageRef.current !== 'lobby') return;
    setRoomId(roomCtx.room.roomId);
    if (roomCtx.room.status === 'waiting') {
      setPage('room');
    } else {
      setPage('game');
    }
  }, [roomCtx.room]);

  if (page === 'login') {
    return (
      <Login
        onSuccess={() => setPage('lobby')}
        onGoToRegister={() => setPage('register')}
        onBack={() => setPage('lobby')}
      />
    );
  }

  if (page === 'register') {
    return (
      <Register
        onSuccess={() => setPage('lobby')}
        onGoToLogin={() => setPage('login')}
        onBack={() => setPage('lobby')}
      />
    );
  }

  if (page === 'lobby') {
    return (
      <Lobby
        socket={socket}
        userName={actorUserName}
        rename={rename}
        roomCtx={roomCtx}
        onGoToLogin={() => setPage('login')}
        onRoomCreated={(id) => {
          setRoomId(id);
          setPage('room');
        }}
        onRoomJoined={(id) => {
          setRoomId(id);
          setPage('room');
        }}
      />
    );
  }

  if (page === 'room' && roomId) {
    return (
      <Room
        roomId={roomId}
        userId={actorUserId}
        roomCtx={roomCtx}
        onGameStart={() => setPage('game')}
        onLeave={() => {
          setRoomId(null);
          setPage('lobby');
        }}
      />
    );
  }

  if (page === 'game') {
    return (
      <Game
        userId={actorUserId}
        room={roomCtx.room}
        game={game}
        onReturnToLobby={() => {
          roomCtx.leave();
          setRoomId(null);
          setPage('lobby');
        }}
      />
    );
  }

  return null;
}
