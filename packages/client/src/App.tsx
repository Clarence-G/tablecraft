import { useEffect, useRef, useState } from 'react';
import { useGame } from './hooks/useGame';
import { useIdentity } from './hooks/useIdentity';
import { useRoom } from './hooks/useRoom';
import { useSocket } from './hooks/useSocket';
import { Game } from './pages/Game';
import { Lobby } from './pages/Lobby';
import { Room } from './pages/Room';

type Page = 'lobby' | 'room' | 'game';

export function App() {
  const { userId, userName } = useIdentity();
  const { socket } = useSocket(userId, userName);
  const [page, setPage] = useState<Page>('lobby');
  const [roomId, setRoomId] = useState<string | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  // Hoist both hooks so they always subscribe — avoids race conditions
  // where game:state / room:state events fire before child components mount.
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

  if (page === 'lobby') {
    return (
      <Lobby
        socket={socket}
        userName={userName}
        roomCtx={roomCtx}
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
        userId={userId}
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
    return <Game userId={userId} room={roomCtx.room} game={game} />;
  }

  return null;
}
