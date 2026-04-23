import type { ChatMessage, ClientEvents, ServerEvents } from '@repo/shared';
import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

type AppSocket = Socket<ServerEvents, ClientEvents>;

export function useChat(socket: AppSocket | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    const onHistory = (history: ChatMessage[]) => {
      setMessages(history);
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:history', onHistory);

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:history', onHistory);
    };
  }, [socket]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !socket) return;
      socket.emit('chat:send', trimmed);
    },
    [socket],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, send, clear };
}
