# Worker W4 — Splendor overflow affordance + Texas action-bar + community slot labels

Three fixes in two files. All related to mobile readability/usability.

## Scope (HARD fence)

**Edit ONLY these files**:
- `games/splendor/Board.tsx`
- `games/texas-holdem/Board.tsx`

**DO NOT touch**:
- Any other game
- Any `packages/**` (if you need a fade utility, inline it with Tailwind classes)
- Tests (unless typecheck forces you)

**COORDINATION**: Worker W1 may be editing `games/texas-holdem/Board.tsx` to widen `max-w-2xl` → `max-w-3xl lg:max-w-5xl` at ~line 357. Your texas edits are at `btnBase` definition (around line 247) and community-card slot rendering (search for `FLOP` or empty-slot JSX). Different regions — should merge cleanly. Always `git diff` before overwriting.

## Tasks

### SPL-01 — Splendor mobile tier-row overflow affordance

At `games/splendor/Board.tsx:~789` each tier row is `flex gap-2 items-center overflow-x-auto`. 4 cards per tier at 375px don't fit; the 2nd+ cards are hidden with no scroll affordance (no fade, no chevron, no scroll shadow).

**Fix**: wrap the overflow-x-auto row in a relative container with a right-edge fade gradient and (optionally) a `ChevronRight` icon that appears only when scrolled content exists.

Minimal Tailwind-only approach:

```tsx
<div className="relative">
  <div className="flex gap-2 items-center overflow-x-auto">
    {/* ... existing tier cards ... */}
  </div>
  {/* Fade gradient hint */}
  <div
    aria-hidden="true"
    className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-[var(--scene-bg,theme(colors.card))] to-transparent"
  />
</div>
```

The `--scene-bg` fallback var: look at the surrounding scene container for what bg color this tier is on (probably `bg-card` or a scene ambience token). If unsure, use `bg-gradient-to-l from-card to-transparent` — that's usually correct for splendor's board.

Even better: import `ChevronRight` from `lucide-react` and add a tiny floating chevron on the right edge that shows only when the row has overflow. But that requires a ResizeObserver / scroll listener. **For this task, just the gradient fade is sufficient** — it's the documented industry convention for "scrollable content this way".

Apply to each of the 3 tier rows (levels 1, 2, 3). If they share a mapping, wrap the rendered row template.

### TEX-02 — Texas action-bar cramped at 351px mobile

At `games/texas-holdem/Board.tsx:~247` `btnBase` is `py-3 rounded-[8px]` (roughly). At 351px content width with 4-5 `flex-1` buttons, the rightmost button (全下) hugs the viewport edge and labels have no breathing room.

**Fix**:
1. Add `px-2` to btnBase so buttons have horizontal padding.
2. Ensure the action-row container uses `flex flex-wrap gap-2` so that when 5 buttons appear (call scenario), they wrap instead of squeezing. If it's currently `flex gap-2` add the `flex-wrap`.

### TEX-03 — Community-card slot positional labels

The 5 empty community-card placeholders pre-flop have no indicator of which will reveal when. Find the empty-slot rendering (search for the placeholder JSX — likely a grid of 5 `<div>`s with a muted background).

**Fix**: when the slot is empty, render tiny tracking-wider text below/inside:
- Slot 0: `翻牌1` / en: `FLOP 1`
- Slot 1: `翻牌2` / en: `FLOP 2`
- Slot 2: `翻牌3` / en: `FLOP 3`
- Slot 3: `转牌` / en: `TURN`
- Slot 4: `河牌` / en: `RIVER`

Use the existing `useTranslation('texas-holdem')` hook and add i18n keys `flop1`, `flop2`, `flop3`, `turn`, `river` to BOTH `games/texas-holdem/i18n/zh.json` AND `games/texas-holdem/i18n/en.json`. Reference them via `t('flop1')` etc.

Use Tailwind `text-[10px] tracking-widest text-muted-foreground opacity-60 uppercase` for the label so it stays subtle.

## Verification — MANDATORY

1. `pnpm typecheck` → exit 0
2. `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft/games/splendor && pnpm exec vitest run 2>&1' | tail -10` — pass
3. `zsh -c 'source ~/.zshenv && cd /Users/bytedance/Projects/tablecraft/games/texas-holdem && pnpm exec vitest run 2>&1' | tail -10` — pass
4. `git status -s` — expected files only
5. **i18n sanity**: `cd /Users/bytedance/Projects/tablecraft && rg '[\u4e00-\u9fff]' games/texas-holdem/Board.tsx` — zero Chinese hardcoded (all should be `t('key')`)

## Anti-patterns

- Do NOT invent a new shared `<FadeOverlay>` component. Inline Tailwind.
- Do NOT add scroll indicators that require JS listeners — gradient only this round.
- Do NOT change the splendor Board layout itself (grid vs row). We are only adding the fade overlay affordance.
- Do NOT hardcode Chinese/English strings in .tsx — go through i18n.

## Done criteria

Append resolution note to `docs/UI_REVIEW_ROUND2_FINDINGS.md` under `## W4 resolution`. Print `git status -s` and exit.

DO NOT commit. Orchestrator does commits.

Begin now.
