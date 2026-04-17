import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import enGameUi from './locales/en/game-ui.json';
import zhCommon from './locales/zh/common.json';
import zhGameUi from './locales/zh/game-ui.json';

// Auto-discover per-game i18n files at build time. The path is relative to
// this file; if you move this file, update the glob accordingly. Vite resolves
// the glob at build time and inlines all matched JSON as eager imports.
const gameI18n = import.meta.glob<{ default: Record<string, unknown> }>(
  '../../../../games/*/i18n/*.json',
  { eager: true },
);

const resources: Record<string, Record<string, Record<string, unknown>>> = {
  zh: { common: zhCommon, 'game-ui': zhGameUi },
  en: { common: enCommon, 'game-ui': enGameUi },
};

for (const [path, mod] of Object.entries(gameI18n)) {
  const match = path.match(/\/games\/([^/]+)\/i18n\/([a-z]+)\.json$/);
  if (!match) continue;
  const gameId = match[1];
  const lang = match[2];
  if (!gameId || !lang || gameId.startsWith('_')) continue;
  resources[lang] ??= {};
  resources[lang][gameId] = mod.default;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh',
    defaultNS: 'common',
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'tablecraft:locale',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
