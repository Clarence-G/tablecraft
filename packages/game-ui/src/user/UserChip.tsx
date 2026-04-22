import Avatar from 'boring-avatars';
import { LogIn } from 'lucide-react';

interface UserChipProps {
  /** When signed in: the display name. When signed out: undefined. */
  userName?: string;
  /** Email or user id used to seed the avatar. */
  avatarSeed?: string;
  /** Total points to display. Only rendered when signed in. */
  points?: number;
  /** Label to show when signed out (e.g. "Sign in"). */
  guestLabel?: string;
  /** Clicked when signed out (e.g. open login). */
  onSignInClick?: () => void;
  /** Clicked when signed in (e.g. open /me menu). Optional. */
  onClick?: () => void;
}

export function UserChip({
  userName,
  avatarSeed,
  points,
  guestLabel = 'Sign in',
  onSignInClick,
  onClick,
}: UserChipProps) {
  const signedIn = Boolean(userName);

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={onSignInClick}
        className="inline-flex items-center gap-1.5 text-xs font-semibold border-2 border-border bg-card rounded-full px-2.5 py-1 hover:border-foreground hover:-translate-y-0.5 transition-all"
        aria-label={guestLabel}
      >
        <LogIn className="size-3.5" />
        <span>{guestLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-xs font-semibold border-2 border-border bg-card rounded-full pl-1 pr-2.5 py-0.5 hover:border-foreground hover:-translate-y-0.5 transition-all"
      aria-label={userName}
    >
      <Avatar size={20} name={avatarSeed ?? userName ?? ''} variant="beam" />
      <span className="max-w-[8rem] truncate">{userName}</span>
      {typeof points === 'number' && (
        <span className="border-l border-border pl-2 text-muted-foreground">{points} pts</span>
      )}
    </button>
  );
}
