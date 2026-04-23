import { nanoid } from 'nanoid';
import { useState } from 'react';
import { useSession } from './useSession';

const ANIMALS = ['熊猫', '狐狸', '兔子', '老虎', '猫咪', '企鹅', '狼', '鹿', '猫头鹰', '龙'];

function randomAnimal() {
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)] + nanoid(4);
}

interface Identity {
  userId: string;
  userName: string;
}

/**
 * Identity hook. Returns both the persistent guest identity (kept in
 * localStorage so a signed-out tab has a stable nanoid) and the signed-in
 * user derived from the BetterAuth session.
 *
 * Backward-compatible keys `userId` / `userName` continue to expose the
 * guest identity so existing callers (App, useSocket) don't break. New
 * callers should prefer `actorId` / `displayName` / `isGuest` which reflect
 * the *effective* identity (user when signed in, guest when not).
 */
export function useIdentity() {
  const session = useSession();

  const [identity, setIdentity] = useState<Identity>(() => {
    const stored = localStorage.getItem('tabletop:identity');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {}
    }
    const id: Identity = { userId: nanoid(), userName: randomAnimal() };
    localStorage.setItem('tabletop:identity', JSON.stringify(id));
    return id;
  });

  function rename(newName: string) {
    // No-op when signed in — guest name is only meaningful in guest mode.
    // Lobby already hides the rename affordance for signed-in users, but
    // guarding here keeps the invariant "guest localStorage is stable
    // identity" even if a future caller slips.
    if (session.data?.user) return;
    const updated = { ...identity, userName: newName };
    localStorage.setItem('tabletop:identity', JSON.stringify(updated));
    setIdentity(updated);
  }

  const authedUser = session.data?.user ?? null;

  return {
    // Backward-compat shape. `userId` and `userName` remain the *guest*
    // identity so App.tsx and useSocket keep working as the hook is
    // extended. New code should consume the richer fields below.
    userId: identity.userId,
    userName: identity.userName,
    rename,

    // New fields.
    guestId: identity.userId,
    guestName: identity.userName,
    linkedUserId: authedUser?.id ?? null,
    displayName: authedUser?.name ?? identity.userName,
    actorId: authedUser?.id ?? identity.userId,
    isGuest: !authedUser,
  };
}
