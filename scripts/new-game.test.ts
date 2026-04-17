import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldGame } from './new-game';

const root = resolve(__dirname, '..');
const gamesRoot = resolve(root, 'games');

describe('scaffoldGame', () => {
  const testIds: string[] = [];

  afterEach(() => {
    for (const id of testIds) {
      const dir = join(gamesRoot, id);
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
    testIds.length = 0;
  });

  function scaffold(id: string) {
    testIds.push(id);
    return scaffoldGame(id, { skipRegistry: true });
  }

  it('creates games/<id>/ from the template', () => {
    const dir = scaffold('zzz-test-alpha');
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, 'shared.ts'))).toBe(true);
    expect(existsSync(join(dir, 'logic.ts'))).toBe(true);
    expect(existsSync(join(dir, 'Board.tsx'))).toBe(true);
    expect(existsSync(join(dir, 'logic.test.ts'))).toBe(true);
    expect(existsSync(join(dir, 'i18n/en.json'))).toBe(true);
    expect(existsSync(join(dir, 'i18n/zh.json'))).toBe(true);
  });

  it('rewrites package.json name to @games/<id>', () => {
    const dir = scaffold('zzz-test-bravo');
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('@games/zzz-test-bravo');
  });

  it('rewrites vitest.config.ts test name', () => {
    const dir = scaffold('zzz-test-charlie');
    const content = readFileSync(join(dir, 'vitest.config.ts'), 'utf-8');
    expect(content).toContain(`name: 'zzz-test-charlie'`);
    expect(content).not.toContain(`name: 'template'`);
  });

  it('rewrites shared.ts meta.id', () => {
    const dir = scaffold('zzz-test-delta');
    const content = readFileSync(join(dir, 'shared.ts'), 'utf-8');
    expect(content).toContain(`id: 'zzz-test-delta'`);
    expect(content).not.toContain(`id: 'template'`);
  });

  it('produces valid JSON for i18n skeletons', () => {
    const dir = scaffold('zzz-test-echo');
    for (const lang of ['en', 'zh']) {
      const parsed = JSON.parse(readFileSync(join(dir, `i18n/${lang}.json`), 'utf-8'));
      expect(parsed).toEqual({ name: '', description: '', tags: [], rules: '' });
    }
  });

  it('rejects invalid ids', () => {
    expect(() => scaffold('ZZZ-Upper')).toThrow(/Invalid game id/);
    expect(() => scaffold('1-number-first')).toThrow(/Invalid game id/);
    expect(() => scaffold('has_underscore')).toThrow(/Invalid game id/);
    expect(() => scaffold('has space')).toThrow(/Invalid game id/);
  });

  it('refuses to overwrite existing dir without force', () => {
    scaffold('zzz-test-foxtrot');
    expect(() => scaffoldGame('zzz-test-foxtrot', { skipRegistry: true })).toThrow(
      /already exists/,
    );
  });

  it('overwrites with force', () => {
    scaffold('zzz-test-golf');
    expect(() => scaffoldGame('zzz-test-golf', { skipRegistry: true, force: true })).not.toThrow();
  });
});
