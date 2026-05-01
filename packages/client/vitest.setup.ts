import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
// Initialize i18n once per test run so components that call useTranslation()
// resolve real locale strings (not raw keys). Without this, tests that assert
// against localized text fall back to matching the key string itself, which
// silently passes only when components also supply a `defaultValue:` fallback.
import i18n from './src/i18n';

// Existing tests were written assuming English labels (e.g. /leave|exit/i
// regexes). The app's runtime default is zh, but for the test env we force en
// so legacy assertions keep passing; individual tests can still call
// i18n.changeLanguage('zh') when specifically testing zh rendering.
beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  cleanup();
});
