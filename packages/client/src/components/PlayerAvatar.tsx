/**
 * Identicon-style avatar generated purely from a player's display name.
 *
 * No server changes required — we deterministically hash the name into a
 * warm amber/ochre gradient pair and render the first glyph on top. This
 * keeps the waiting-room player list visually alive even before real
 * user avatars are plumbed through `PlayerInfo`.
 */
interface PlayerAvatarProps {
  name: string;
  size?: number; // px
  className?: string;
}

// 12 warm, skeuomorphic-friendly gradient pairs. All stay within the project's
// cream/amber/ochre/jade/rose palette so avatars harmonize with the lobby.
const GRADIENTS: Array<[string, string]> = [
  ['#d97706', '#92400e'], // amber → bronze
  ['#b45309', '#78350f'], // ochre → chocolate
  ['#dc2626', '#7f1d1d'], // warm red
  ['#0f766e', '#134e4a'], // teal
  ['#15803d', '#14532d'], // jade
  ['#7c3aed', '#4c1d95'], // violet
  ['#be185d', '#831843'], // rose
  ['#0369a1', '#0c4a6e'], // deep blue
  ['#ca8a04', '#713f12'], // gold
  ['#ea580c', '#7c2d12'], // orange
  ['#4d7c0f', '#365314'], // olive
  ['#9333ea', '#581c87'], // purple
];

function hashString(s: string): number {
  // djb2 — plenty for 12-bucket distribution
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initialOf(name: string): string {
  // Strip common suffix tags (e.g. " #XJU") and surrogate-safely take the
  // first grapheme so CJK names show their full first character.
  const core = name.replace(/\s*#[A-Z0-9]+\s*$/i, '').trim() || name;
  // Use Intl.Segmenter when available for grapheme-cluster safety, otherwise
  // fall back to the first codepoint (codePointAt handles surrogate pairs).
  const Seg = (globalThis as unknown as { Intl: { Segmenter?: typeof Intl.Segmenter } }).Intl
    .Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: 'grapheme' });
    const first = seg.segment(core)[Symbol.iterator]().next().value as
      | { segment: string }
      | undefined;
    if (first) return first.segment.toUpperCase();
  }
  const cp = core.codePointAt(0);
  return cp ? String.fromCodePoint(cp).toUpperCase() : '?';
}

export function PlayerAvatar({ name, size = 32, className }: PlayerAvatarProps) {
  const [from, to] = GRADIENTS[hashString(name) % GRADIENTS.length];
  const initial = initialOf(name);
  // Font size scales with avatar; clamp so CJK glyphs don't overflow
  const fontSize = Math.round(size * 0.44);

  return (
    <div
      aria-hidden="true"
      className={`relative inline-flex items-center justify-center rounded-full border-2 border-[#1a1108] shadow-[#3d2e1e_-2px_2px_0px] flex-shrink-0 ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      }}
    >
      {/* top-inner amber highlight for skeuomorphic depth */}
      <span
        className="absolute inset-x-1 top-0.5 rounded-full opacity-60"
        style={{
          height: Math.max(2, Math.round(size * 0.14)),
          background: 'linear-gradient(to bottom, rgba(255,243,200,0.85), transparent)',
        }}
      />
      <span
        className="font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] select-none leading-none"
        style={{ fontSize }}
      >
        {initial}
      </span>
    </div>
  );
}
