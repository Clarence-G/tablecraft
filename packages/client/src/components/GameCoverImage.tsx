import { useState } from 'react';
import { GameIcon } from './GameIcon';

interface GameCoverImageProps {
  gameId: string;
  fallbackIcon: string;
  className?: string;
}

/**
 * Square 1:1 cover image for a game, displayed at the top of lobby game cards.
 *
 * Looks for `/game-covers/<gameId>.png` in the public folder. If the image
 * fails to load (not yet generated for that game), falls back to a gradient
 * placeholder with the game's icon — so new games don't break the layout.
 */
export function GameCoverImage({ gameId, fallbackIcon, className }: GameCoverImageProps) {
  const [errored, setErrored] = useState(false);
  const src = `/game-covers/${gameId}.png`;

  if (errored) {
    return (
      <div
        className={`aspect-[16/10] bg-gradient-to-br from-[#f4e9d0] to-[#e6d4a8] border-b-2 border-foreground flex items-center justify-center ${className ?? ''}`}
      >
        <GameIcon name={fallbackIcon} className="size-12 text-[#8a6e3a] opacity-70" />
      </div>
    );
  }

  return (
    <div
      className={`aspect-[16/10] bg-secondary border-b-2 border-foreground overflow-hidden ${className ?? ''}`}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setErrored(true)}
        className="size-full object-cover"
      />
    </div>
  );
}
