import type { ReactNode } from 'react';

export type CardAccent = 'default' | 'red' | 'blue' | 'purple' | 'green' | 'amber' | 'dark';
export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

export interface PlayingCardProps {
  /** Top-left rank/value marker. Also mirrored rotated in bottom-right. */
  corner?: ReactNode;
  /** Small glyph shown under the corner rank. */
  cornerIcon?: ReactNode;
  /** Large centered content: suit glyph, character label, number, etc. */
  center?: ReactNode;
  /** Optional subtitle below the center glyph (e.g., role name or short description). */
  subtitle?: ReactNode;
  /** Face-down card (shows a solid back with "?" pattern). */
  faceDown?: boolean;
  /** Accent tint for corners + border. Ignored when backgroundClass is set. */
  accent?: CardAccent;
  /** Custom Tailwind background class. Overrides accent-driven bg. */
  backgroundClass?: string;
  /** Selected = lifts upward + ring. */
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: CardSize;
  className?: string;
  /** Inline style, useful for gradient backgrounds (e.g., UNO wild cards). */
  style?: React.CSSProperties;
  /** Forces card to render as a button. Defaults to true when onClick is provided. */
  interactive?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
}

const SIZE: Record<CardSize, string> = {
  xs: 'w-8 h-11 rounded-[6px] text-[10px]',
  sm: 'w-10 h-14 rounded-[8px] text-xs',
  md: 'w-14 h-20 rounded-[10px] text-sm',
  lg: 'w-20 h-28 sm:w-24 sm:h-32 rounded-[12px] text-base',
};

const CORNER_SIZE: Record<CardSize, string> = {
  xs: 'text-[9px] leading-none',
  sm: 'text-xs leading-none',
  md: 'text-sm leading-none',
  lg: 'text-base leading-none',
};

const CENTER_SIZE: Record<CardSize, string> = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-2xl',
  lg: 'text-3xl sm:text-4xl',
};

const ACCENT_TEXT: Record<CardAccent, string> = {
  default: 'text-foreground',
  red: 'text-[#d94040]',
  blue: 'text-[#2563eb]',
  purple: 'text-[#7c3aed]',
  green: 'text-[#16a34a]',
  amber: 'text-[#d97706]',
  dark: 'text-foreground',
};

const ACCENT_BORDER: Record<CardAccent, string> = {
  default: 'border-foreground',
  red: 'border-[#d94040]',
  blue: 'border-[#2563eb]',
  purple: 'border-[#7c3aed]',
  green: 'border-[#16a34a]',
  amber: 'border-[#d97706]',
  dark: 'border-foreground',
};

export function PlayingCard({
  corner,
  cornerIcon,
  center,
  subtitle,
  faceDown,
  accent = 'default',
  backgroundClass,
  selected,
  disabled,
  onClick,
  size = 'md',
  className,
  style,
  interactive,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: PlayingCardProps) {
  const isButton = interactive ?? !!onClick;

  const base = [
    SIZE[size],
    'relative shrink-0 border-2 shadow-button transition-all',
    'flex flex-col items-stretch justify-between',
    faceDown ? 'bg-primary border-[#1a1108]' : backgroundClass ?? 'bg-card',
    faceDown ? '' : ACCENT_BORDER[accent],
    isButton && !disabled
      ? 'hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active'
      : '',
    disabled ? 'opacity-40 cursor-not-allowed' : '',
    selected ? '-translate-y-2 shadow-button-hover ring-2 ring-warning' : '',
  ].join(' ');

  const inner = faceDown ? (
    <div className="flex-1 flex items-center justify-center text-primary-foreground font-bold">
      ?
    </div>
  ) : (
    <>
      {corner !== undefined && (
        <div
          aria-hidden="true"
          className={`absolute top-1 left-1 flex flex-col items-center leading-none ${CORNER_SIZE[size]} font-bold ${ACCENT_TEXT[accent]}`}
        >
          <span>{corner}</span>
          {cornerIcon && <span className="mt-0.5">{cornerIcon}</span>}
        </div>
      )}
      {corner !== undefined && (
        <div
          aria-hidden="true"
          className={`absolute bottom-1 right-1 rotate-180 flex flex-col items-center leading-none ${CORNER_SIZE[size]} font-bold ${ACCENT_TEXT[accent]}`}
        >
          <span>{corner}</span>
          {cornerIcon && <span className="mt-0.5">{cornerIcon}</span>}
        </div>
      )}
      <div
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-1 ${CENTER_SIZE[size]} ${ACCENT_TEXT[accent]}`}
      >
        {center !== undefined && <div className="font-bold">{center}</div>}
        {subtitle !== undefined && (
          <div className={`text-[10px] font-medium opacity-80 ${size === 'lg' ? 'sm:text-xs' : ''}`}>
            {subtitle}
          </div>
        )}
      </div>
    </>
  );

  if (isButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${base} ${className ?? ''}`}
        style={style}
        aria-label={ariaLabel}
        data-testid={testId}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      className={`${base} ${className ?? ''}`}
      style={style}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {inner}
    </div>
  );
}
