import { describe, expect, it } from 'vitest';
import { moderateChat } from './moderation.js';

describe('moderateChat', () => {
  it('passes clean text', () => {
    expect(moderateChat('hello world').ok).toBe(true);
    expect(moderateChat('你好，大家').ok).toBe(true);
  });

  it('blocks CN slur', () => {
    const result = moderateChat('你真的是傻逼啊');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('banned_word');
    expect(result.match).toBe('傻逼');
    expect(result.filteredText).toContain('***');
  });

  it('blocks EN profanity (whole-word)', () => {
    const result = moderateChat('that was total shit');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('banned_word');
    expect(result.match).toBe('shit');
  });

  it('does not trip "ass" inside "assistant"', () => {
    expect(moderateChat("I'm your assistant").ok).toBe(true);
    expect(moderateChat('class assignment').ok).toBe(true);
  });

  it('is case-insensitive for EN words', () => {
    expect(moderateChat('This is SHIT').ok).toBe(false);
    expect(moderateChat('What The Fuck').ok).toBe(false);
  });

  it('blocks standalone EN slur', () => {
    const result = moderateChat('go fuck yourself');
    expect(result.ok).toBe(false);
    expect(result.match).toBe('fuck');
  });

  it('masks all occurrences of CN word', () => {
    const result = moderateChat('垃圾垃圾真的垃圾');
    expect(result.ok).toBe(false);
    expect(result.filteredText).toBe('******真的***');
  });

  it('returns ok:true for borderline words that are not in list', () => {
    expect(moderateChat('assiduous worker').ok).toBe(true);
  });
});
