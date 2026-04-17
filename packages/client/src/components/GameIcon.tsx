import { SVG_ICON_NAMES } from '@/generated/game-icons';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const DefaultIcon = LucideIcons.Gamepad2;
const iconMap = LucideIcons as unknown as Record<string, LucideIcon | undefined>;

interface GameIconProps {
  name?: string;
  className?: string;
}

export function GameIcon({ name, className }: GameIconProps) {
  if (!name) return <DefaultIcon className={className} />;
  if (SVG_ICON_NAMES.has(name)) {
    return <img src={`/game-icons/${name}.svg`} alt="" className={className} />;
  }
  const Matched = iconMap[name];
  if (Matched) return <Matched className={className} />;
  return <DefaultIcon className={className} />;
}
