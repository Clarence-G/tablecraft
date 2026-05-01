import { nanoid } from 'nanoid';
import { useState } from 'react';
import i18n from '../i18n';
import { useSession } from './useSession';

/**
 * Locale-aware random guest name. Combines a locale-specific adjective and
 * animal from `guest.adjectivePool` / `guest.animalPool`, separated by `#`
 * plus a 3-char crockford-ish suffix (A–Z minus I/O, 2–9 minus 0/1) so the
 * display shape is e.g. "神秘熊猫 #A7K" / "Mystic Panda #A7K". zh omits the
 * space between adjective and animal (Chinese has no inter-word break); en
 * uses a normal space. Name is generated once and persisted to localStorage,
 * so switching locale later doesn't rename the identity.
 */
const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomSuffix(len = 3) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return out;
}

function randomGuestName() {
  const adjectives = i18n.t('guest.adjectivePool', {
    returnObjects: true,
    defaultValue: [],
  }) as string[];
  const animals = i18n.t('guest.animalPool', {
    returnObjects: true,
    defaultValue: ['Guest'],
  }) as string[];
  const safeAnimals = Array.isArray(animals) && animals.length > 0 ? animals : ['Guest'];
  const safeAdj = Array.isArray(adjectives) && adjectives.length > 0 ? adjectives : null;
  const animal = safeAnimals[Math.floor(Math.random() * safeAnimals.length)];
  const suffix = randomSuffix(3);
  if (!safeAdj) {
    // Fallback when pool missing (shouldn't happen with bundled locales).
    return `${animal} #${suffix}`;
  }
  const adj = safeAdj[Math.floor(Math.random() * safeAdj.length)];
  // zh (CJK) joins without space; latin locales use a space. Detect by
  // presence of a CJK codepoint in the chosen animal.
  const cjk = /[\u4e00-\u9fff]/.test(animal);
  const core = cjk ? `${adj}${animal}` : `${adj} ${animal}`;
  return `${core} #${suffix}`;
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
    const id: Identity = { userId: nanoid(), userName: randomGuestName() };
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
