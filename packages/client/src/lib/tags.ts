import type { i18n as I18n } from 'i18next';
import { clientRegistry } from '../../../../games/client-registry';

/**
 * Chinese tag → tailwind classes. The source of truth is the Chinese tag name
 * in each game's `meta.tags`; translations are layered on top per locale via
 * `buildTagTranslation`. Both Lobby and GamesAll consume this map.
 */
export const TAG_COLORS: Record<string, string> = {
  策略: 'bg-[#e8f0fe] text-[#1a3a8a] border-[#2563eb]',
  棋类: 'bg-[#e8f8ee] text-[#0a5c2a] border-[#16a34a]',
  推理: 'bg-[#f0e8fe] text-[#4a1a8a] border-[#7c3aed]',
  卡牌: 'bg-[#fef3e0] text-[#7a4006] border-[#d97706]',
  派对: 'bg-[#fde8ec] text-[#8a1a30] border-[#e8556d]',
  休闲: 'bg-[#fde8e8] text-[#7a1a1a] border-[#d94040]',
  骰子: 'bg-[#fde8e8] text-[#7a1a1a] border-[#d94040]',
};

/** Build a map of Chinese tag → localized tag based on each game's i18n `tags` array. */
export function buildTagTranslation(i18nInstance: I18n): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of Object.values(clientRegistry)) {
    const zhTags: string[] = g.meta.tags ?? [];
    const translatedTags: string[] =
      (i18nInstance.t('tags', { ns: g.meta.id, returnObjects: true }) as string[]) ?? [];
    zhTags.forEach((zh, i) => {
      if (translatedTags[i]) map.set(zh, translatedTags[i]);
    });
  }
  return map;
}

/** Distinct Chinese tags across all registered games. */
export function allTags(): string[] {
  return Array.from(new Set(Object.values(clientRegistry).flatMap((g) => g.meta.tags ?? [])));
}
