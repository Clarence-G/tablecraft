import { nanoid } from 'nanoid';
import { useState } from 'react';
import i18n from '../i18n';
import { useSession } from './useSession';

/**
 * Locale-aware random guest name. Reads the current locale's `guest.animalPool`
 * string array (zh: "熊猫/狐狸/…", en: "Panda/Fox/…") and appends a 4-char
 * nanoid for uniqueness. Name is generated once and persisted to localStorage,
 * so switching locale later doesn't rename the identity.
 */
function randomAnimal() {
  const pool = i18n.t('guest.animalPool', {
    returnObjects: true,
    defaultValue: ['Guest'],
  }) as string[];
  const safe = Array.isArray(pool) && pool.length > 0 ? pool : ['Guest'];
  return safe[Math.floor(Math.random() * safe.length)] + nanoid(4);
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
