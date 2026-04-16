import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import enBattleship from '../../../../games/battleship/i18n/en.json';
import zhBattleship from '../../../../games/battleship/i18n/zh.json';
import enBlackjack from '../../../../games/blackjack/i18n/en.json';
import zhBlackjack from '../../../../games/blackjack/i18n/zh.json';
import enConnectFour from '../../../../games/connect-four/i18n/en.json';
import zhConnectFour from '../../../../games/connect-four/i18n/zh.json';
import enGomoku from '../../../../games/gomoku/i18n/en.json';
import zhGomoku from '../../../../games/gomoku/i18n/zh.json';
import enHive from '../../../../games/hive/i18n/en.json';
import zhHive from '../../../../games/hive/i18n/zh.json';
import enLiarBar from '../../../../games/liar-bar/i18n/en.json';
import zhLiarBar from '../../../../games/liar-bar/i18n/zh.json';
import enLoveLetter from '../../../../games/love-letter/i18n/en.json';
import zhLoveLetter from '../../../../games/love-letter/i18n/zh.json';
import enTexasHoldem from '../../../../games/texas-holdem/i18n/en.json';
import zhTexasHoldem from '../../../../games/texas-holdem/i18n/zh.json';
import enUno from '../../../../games/uno/i18n/en.json';
import zhUno from '../../../../games/uno/i18n/zh.json';
import enYahtzee from '../../../../games/yahtzee/i18n/en.json';
import zhYahtzee from '../../../../games/yahtzee/i18n/zh.json';
import enCommon from './locales/en/common.json';
import enGameUi from './locales/en/game-ui.json';
import zhCommon from './locales/zh/common.json';
import zhGameUi from './locales/zh/game-ui.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: {
        common: zhCommon,
        'game-ui': zhGameUi,
        gomoku: zhGomoku,
        'connect-four': zhConnectFour,
        hive: zhHive,
        uno: zhUno,
        battleship: zhBattleship,
        blackjack: zhBlackjack,
        'texas-holdem': zhTexasHoldem,
        yahtzee: zhYahtzee,
        'love-letter': zhLoveLetter,
        'liar-bar': zhLiarBar,
      },
      en: {
        common: enCommon,
        'game-ui': enGameUi,
        gomoku: enGomoku,
        'connect-four': enConnectFour,
        hive: enHive,
        uno: enUno,
        battleship: enBattleship,
        blackjack: enBlackjack,
        'texas-holdem': enTexasHoldem,
        yahtzee: enYahtzee,
        'love-letter': enLoveLetter,
        'liar-bar': enLiarBar,
      },
    },
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
