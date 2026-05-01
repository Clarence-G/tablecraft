# Splendor Board i18n migration — fix report

## Background

The Stage-3 security+i18n audit (`docs/ISSUE_review_security_i18n.md` finding
P0-I18N-1) flagged `games/splendor/Board.tsx` as having **zero** `useTranslation`
calls with ~38 hardcoded Chinese strings scattered across 921 lines. English
users saw a fully Chinese Splendor board.

## Changes

- **`games/splendor/Board.tsx`**: added `import { useTranslation, Trans } from
  'react-i18next'`; added `const { t } = useTranslation('splendor')` inside each
  rendering subcomponent (`GemToken`, `CostRow`, `CardBack`, `CardDialog`,
  `Board`); deleted the `GEM_LABEL` hard-coded mapping and replaced call sites
  with `t(\`gem.${color}\`)`. Every user-facing literal — card tier labels,
  cost/discount/shortfall strings, action buttons (Buy / Reserve / Confirm /
  Clear), status banners (Your Turn / Waiting for X / Last round / Winner),
  section headers (Gem supply / Nobles / My tableau / Opponent), overflow
  prompt, opponent stats — now goes through `t()`. One spot uses `<Trans>` to
  embed a colored `<span>` mid-sentence inside `card.discount` so zh/en keep
  identical structure.
- **`games/splendor/i18n/zh.json`**: 6 meta keys → **50** keys (added `gem.*`,
  `card.*`, `action.*`, `status.*`, `section.*`, `label.*` groups). File size
  14 → 66 lines.
- **`games/splendor/i18n/en.json`**: parallel 50 keys with natural English
  translations using board-game terminology (*Tier, Development card, prestige,
  Buy, Reserve, Noble, Gem supply, My tableau, Last round, First to 15*).

## Verification

- `pnpm typecheck` — green.
- `pnpm --filter @games/splendor test` — 33/33 passed.
- `rg '[\u4e00-\u9fff]+' games/splendor/Board.tsx` — **1 match**, a code
  comment on line 25 (`matches DESIGN.md 六色 where possible`). Zero user-facing
  CJK remaining.
- A one-shot script (`/tmp/splendor-i18n-check.mjs`, scratch-only) iterated
  every `t('…')` call in Board.tsx and confirmed each resolves in both
  `zh.json` and `en.json` — no raw `splendor.xxx.yyy` keys will leak through
  to users.

## Judgment calls worth flagging

1. **`card.discount` uses `<Trans>`**. The original Chinese was
   "提供 **白** 折扣" with the gem-color character inside a colored `<span>`.
   Rebuilding that with plain `t()` would require splitting into three
   fragments; `<Trans>` + `components={{ g: <span …/> }}` preserves the
   inline styling and lets translators keep full control over word order.
2. **Parenthesis style**. The Chinese source uses full-width parens `（…）`
   for `预订（${n}/${max}）`. I moved the whole bracketed form into one
   locale key (`label.cartSummary`) so the English locale can use regular
   `(…)` without code branches.
3. **No `defaultValue:` anywhere**, per the strict project rule.
4. **Shadowed variable renames**. A couple of `.map((t) => …)` callbacks
   collided with the new `t()` translator; renamed their params to `tok`
   (one-letter rename, no logic change).
5. Comment on line 25 left as-is — code comment, not user-facing; removing
   it would be out-of-scope polish.

## Residual risk

- Visual verification in a live 2-player Splendor match was not performed
  (requires two browser sessions). The scripted key-presence check gives
  equivalent coverage for the "does every `t()` resolve" question; only a
  human eye can catch subtle wording issues ("My tableau" vs "My holdings"
  etc.), so treat the English strings as a first pass and refine if a
  native speaker flags awkward phrasing.
