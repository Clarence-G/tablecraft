import { logger } from './logger.js';

const BANNED_WORDS_CN: string[] = [
  '傻逼', '操你', '草你', '妈的', '白痴', '滚蛋', '垃圾', '弱智', '智障',
  '婊子', '贱人', '狗屁', '滚开', '去死', '死全家', '日你', '你妈',
  '他妈', '狗日', '混蛋', '废物', '蠢货', '死妈', '臭逼', '屌丝',
  '傻瓜', '猪头', '咸鱼', '滚你', '臭鸡', '烂货',
];

const BANNED_WORDS_EN: string[] = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'faggot', 'nigger', 'retard',
];

export interface ModerationResult {
  ok: boolean;
  reason?: 'banned_word';
  filteredText?: string;
  match?: string;
}

export function moderateChat(text: string): ModerationResult {
  for (const w of BANNED_WORDS_CN) {
    if (text.includes(w)) {
      logger.debug({ match: w, mod: 'moderation' }, 'cn banned word hit');
      return { ok: false, reason: 'banned_word', match: w, filteredText: mask(text, w) };
    }
  }
  const lowered = text.toLowerCase();
  for (const w of BANNED_WORDS_EN) {
    const re = new RegExp(`\\b${w}\\b`, 'i');
    if (re.test(lowered)) {
      return { ok: false, reason: 'banned_word', match: w, filteredText: text.replace(re, '***') };
    }
  }
  return { ok: true };
}

function mask(text: string, word: string): string {
  return text.split(word).join('***');
}
