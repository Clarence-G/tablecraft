import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';

const ANIMALS = ['熊猫', '狐狸', '兔子', '老虎', '猫咪', '企鹅', '狼', '鹿', '猫头鹰', '龙'];

function randomAnimal() {
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)] + nanoid(4);
}

interface Identity {
  userId: string;
  userName: string;
}

export function useIdentity() {
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
    const updated = { ...identity, userName: newName };
    localStorage.setItem('tabletop:identity', JSON.stringify(updated));
    setIdentity(updated);
  }

  return { ...identity, rename };
}
